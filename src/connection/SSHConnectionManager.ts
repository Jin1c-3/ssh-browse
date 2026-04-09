import * as vscode from 'vscode';
import * as fs from 'fs';
import { Client, SFTPWrapper } from 'ssh2';
import type { SSHHostConfig, ActiveConnection } from './connectionConfig';
import { log } from '../util/logger';

export class SSHConnectionManager implements vscode.Disposable {
  private connections = new Map<string, ActiveConnection>();
  private _onDidChangeConnections = new vscode.EventEmitter<void>();
  readonly onDidChangeConnections = this._onDidChangeConnections.event;

  constructor(private readonly secrets: vscode.SecretStorage) {}

  getConnectionNames(): string[] {
    return Array.from(this.connections.keys());
  }

  isConnected(name: string): boolean {
    return this.connections.has(name);
  }

  getConnection(name: string): ActiveConnection | undefined {
    return this.connections.get(name);
  }

  getSFTP(name: string): SFTPWrapper {
    const conn = this.connections.get(name);
    if (!conn) {
      throw new Error(`Not connected to ${name}`);
    }
    return conn.sftp;
  }

  getClient(name: string): Client {
    const conn = this.connections.get(name);
    if (!conn) {
      throw new Error(`Not connected to ${name}`);
    }
    return conn.client;
  }

  async connect(config: SSHHostConfig): Promise<void> {
    if (this.connections.has(config.name)) {
      return;
    }

    const client = new Client();

    const connectConfig: any = {
      host: config.host,
      port: config.port,
      username: config.username,
      readyTimeout: 10000,
    };

    switch (config.authMethod) {
      case 'key': {
        const keyPath = config.privateKeyPath;
        if (!keyPath) {
          throw new Error('Private key path not configured');
        }
        const keyData = fs.readFileSync(keyPath);
        connectConfig.privateKey = keyData;

        const keyStr = keyData.toString();
        if (keyStr.includes('ENCRYPTED')) {
          const passphrase = await vscode.window.showInputBox({
            prompt: `Passphrase for ${keyPath}`,
            password: true,
          });
          if (passphrase === undefined) {
            throw new Error('Passphrase entry cancelled');
          }
          connectConfig.passphrase = passphrase;
        }
        break;
      }
      case 'password': {
        let password = await this.secrets.get(`sshBrowse.password.${config.name}`);
        if (!password) {
          password = await vscode.window.showInputBox({
            prompt: `Password for ${config.username}@${config.host}`,
            password: true,
          });
          if (password === undefined) {
            throw new Error('Password entry cancelled');
          }
          await this.secrets.store(`sshBrowse.password.${config.name}`, password);
        }
        connectConfig.password = password;
        break;
      }
      case 'agent': {
        connectConfig.agent = process.env.SSH_AUTH_SOCK
          || (process.platform === 'win32' ? '\\\\.\\pipe\\openssh-ssh-agent' : undefined);
        if (!connectConfig.agent) {
          throw new Error('SSH agent socket not found');
        }
        break;
      }
      case 'sshConfig': {
        // ssh2 will use defaults; if key path was resolved from config, use it
        if (config.privateKeyPath) {
          connectConfig.privateKey = fs.readFileSync(config.privateKeyPath);
        } else {
          connectConfig.agent = process.env.SSH_AUTH_SOCK
            || (process.platform === 'win32' ? '\\\\.\\pipe\\openssh-ssh-agent' : undefined);
        }
        break;
      }
    }

    return new Promise<void>((resolve, reject) => {
      client.on('ready', () => {
        log(`Connected to ${config.name}`);
        client.sftp((err, sftp) => {
          if (err) {
            client.end();
            reject(err);
            return;
          }
          this.connections.set(config.name, { config, client, sftp });
          vscode.commands.executeCommand('setContext', 'sshBrowse.hasActiveConnection', true);
          this._onDidChangeConnections.fire();
          resolve();
        });
      });

      client.on('error', (err) => {
        log(`Connection error for ${config.name}: ${err.message}`);
        this.handleDisconnect(config.name);
        reject(err);
      });

      client.on('close', () => {
        log(`Connection closed: ${config.name}`);
        this.handleDisconnect(config.name);
      });

      client.connect(connectConfig);
    });
  }

  private handleDisconnect(name: string): void {
    if (this.connections.delete(name)) {
      if (this.connections.size === 0) {
        vscode.commands.executeCommand('setContext', 'sshBrowse.hasActiveConnection', false);
      }
      this._onDidChangeConnections.fire();
    }
  }

  disconnect(name: string): void {
    const conn = this.connections.get(name);
    if (conn) {
      conn.client.end();
      this.connections.delete(name);
      if (this.connections.size === 0) {
        vscode.commands.executeCommand('setContext', 'sshBrowse.hasActiveConnection', false);
      }
      this._onDidChangeConnections.fire();
      log(`Disconnected from ${name}`);
    }
  }

  disconnectAll(): void {
    for (const [name, conn] of this.connections) {
      conn.client.end();
      log(`Disconnected from ${name}`);
    }
    this.connections.clear();
    vscode.commands.executeCommand('setContext', 'sshBrowse.hasActiveConnection', false);
    this._onDidChangeConnections.fire();
  }

  getSavedConnections(): SSHHostConfig[] {
    const config = vscode.workspace.getConfiguration('sshBrowse');
    const connections = config.get<SSHHostConfig[]>('connections', []);
    return connections.map((c) => ({
      ...c,
      port: c.port || 22,
      initialPath: c.initialPath || '/',
      authMethod: c.authMethod || 'key',
    }));
  }

  async saveConnection(hostConfig: SSHHostConfig): Promise<void> {
    const config = vscode.workspace.getConfiguration('sshBrowse');
    const connections = [...this.getSavedConnections()];
    const idx = connections.findIndex((c) => c.name === hostConfig.name);
    if (idx >= 0) {
      connections[idx] = hostConfig;
    } else {
      connections.push(hostConfig);
    }
    await config.update('connections', connections, vscode.ConfigurationTarget.Global);
  }

  async removeConnectionConfig(name: string): Promise<void> {
    const config = vscode.workspace.getConfiguration('sshBrowse');
    const connections = this.getSavedConnections().filter((c) => c.name !== name);
    await config.update('connections', connections, vscode.ConfigurationTarget.Global);
    await this.secrets.delete(`sshBrowse.password.${name}`);
  }

  dispose(): void {
    this.disconnectAll();
    this._onDidChangeConnections.dispose();
  }
}
