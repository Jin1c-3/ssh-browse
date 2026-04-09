import * as vscode from 'vscode';
import { SSHConnectionManager } from '../connection/SSHConnectionManager';
import { parseSSHConfig } from '../connection/sshConfigParser';
import type { SSHHostConfig, AuthMethod } from '../connection/connectionConfig';
import { ConnectionTreeItem } from '../tree/ConnectionTreeItem';
import { log } from '../util/logger';

export function registerConnectionCommands(
  context: vscode.ExtensionContext,
  manager: SSHConnectionManager,
): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('sshBrowse.addConnection', async () => {
      const name = await vscode.window.showInputBox({ prompt: 'Connection name', placeHolder: 'my-server' });
      if (!name) return;

      const host = await vscode.window.showInputBox({ prompt: 'Host', placeHolder: '192.168.1.100' });
      if (!host) return;

      const portStr = await vscode.window.showInputBox({ prompt: 'Port', value: '22' });
      if (!portStr) return;
      const port = parseInt(portStr, 10) || 22;

      const username = await vscode.window.showInputBox({ prompt: 'Username', placeHolder: 'root' });
      if (!username) return;

      const authMethod = await vscode.window.showQuickPick(
        [
          { label: 'Private Key', value: 'key' as AuthMethod },
          { label: 'Password', value: 'password' as AuthMethod },
          { label: 'SSH Agent', value: 'agent' as AuthMethod },
        ],
        { placeHolder: 'Authentication method' },
      );
      if (!authMethod) return;

      let privateKeyPath: string | undefined;
      if (authMethod.value === 'key') {
        const uris = await vscode.window.showOpenDialog({
          canSelectFiles: true,
          canSelectMany: false,
          title: 'Select private key file',
          openLabel: 'Select Key',
        });
        privateKeyPath = uris?.[0]?.fsPath;
        if (!privateKeyPath) return;
      }

      const initialPath = await vscode.window.showInputBox({
        prompt: 'Initial remote path',
        value: '/',
      }) || '/';

      const config: SSHHostConfig = {
        name,
        host,
        port,
        username,
        authMethod: authMethod.value,
        privateKeyPath,
        initialPath,
      };

      await manager.saveConnection(config);
      vscode.window.showInformationMessage(`Connection "${name}" saved.`);
    }),

    vscode.commands.registerCommand('sshBrowse.editConnection', async (item?: ConnectionTreeItem) => {
      const configs = manager.getSavedConnections();
      let config: SSHHostConfig | undefined;

      if (item) {
        config = configs.find((c) => c.name === item.config.name);
      } else {
        const pick = await vscode.window.showQuickPick(
          configs.map((c) => ({ label: c.name, description: `${c.username}@${c.host}` })),
          { placeHolder: 'Select connection to edit' },
        );
        if (!pick) return;
        config = configs.find((c) => c.name === pick.label);
      }
      if (!config) return;

      const host = await vscode.window.showInputBox({ prompt: 'Host', value: config.host });
      if (!host) return;
      config.host = host;

      const portStr = await vscode.window.showInputBox({ prompt: 'Port', value: String(config.port) });
      if (!portStr) return;
      config.port = parseInt(portStr, 10) || 22;

      const username = await vscode.window.showInputBox({ prompt: 'Username', value: config.username });
      if (!username) return;
      config.username = username;

      const initialPath = await vscode.window.showInputBox({ prompt: 'Initial path', value: config.initialPath });
      if (initialPath !== undefined) config.initialPath = initialPath || '/';

      await manager.saveConnection(config);
      vscode.window.showInformationMessage(`Connection "${config.name}" updated.`);
    }),

    vscode.commands.registerCommand('sshBrowse.removeConnection', async (item?: ConnectionTreeItem) => {
      const name = item?.config.name || (await pickConnection(manager));
      if (!name) return;

      const confirm = await vscode.window.showWarningMessage(
        `Remove connection "${name}"?`,
        { modal: true },
        'Remove',
      );
      if (confirm !== 'Remove') return;

      if (manager.isConnected(name)) {
        manager.disconnect(name);
      }
      await manager.removeConnectionConfig(name);
      vscode.window.showInformationMessage(`Connection "${name}" removed.`);
    }),

    vscode.commands.registerCommand('sshBrowse.connect', async (item?: ConnectionTreeItem) => {
      let config: SSHHostConfig | undefined;

      if (item) {
        config = item.config;
      } else {
        const name = await pickConnection(manager);
        if (!name) return;
        config = manager.getSavedConnections().find((c) => c.name === name);
      }
      if (!config) return;

      try {
        await vscode.window.withProgress(
          { location: vscode.ProgressLocation.Notification, title: `Connecting to ${config.name}...` },
          () => manager.connect(config),
        );
        vscode.window.showInformationMessage(`Connected to ${config.name}`);
      } catch (err: any) {
        log(`Connection failed: ${err.message}`);
        vscode.window.showErrorMessage(`Failed to connect: ${err.message}`);
      }
    }),

    vscode.commands.registerCommand('sshBrowse.disconnect', async (item?: ConnectionTreeItem) => {
      const name = item?.config.name || (await pickConnectedHost(manager));
      if (!name) return;
      manager.disconnect(name);
      vscode.window.showInformationMessage(`Disconnected from ${name}`);
    }),

    vscode.commands.registerCommand('sshBrowse.importSSHConfig', async () => {
      try {
        const hosts = parseSSHConfig();
        if (hosts.length === 0) {
          vscode.window.showInformationMessage('No hosts found in ~/.ssh/config');
          return;
        }

        const picks = await vscode.window.showQuickPick(
          hosts.map((h) => ({
            label: h.name,
            description: `${h.username}@${h.host}:${h.port}`,
            picked: true,
            config: h,
          })),
          { canPickMany: true, placeHolder: 'Select hosts to import' },
        );
        if (!picks || picks.length === 0) return;

        for (const pick of picks) {
          await manager.saveConnection(pick.config);
        }
        vscode.window.showInformationMessage(`Imported ${picks.length} connection(s) from SSH config.`);
      } catch (err: any) {
        vscode.window.showErrorMessage(`Failed to parse SSH config: ${err.message}`);
      }
    }),
  );
}

async function pickConnection(manager: SSHConnectionManager): Promise<string | undefined> {
  const configs = manager.getSavedConnections();
  if (configs.length === 0) {
    vscode.window.showInformationMessage('No saved connections. Add one first.');
    return undefined;
  }
  const pick = await vscode.window.showQuickPick(
    configs.map((c) => ({ label: c.name, description: `${c.username}@${c.host}` })),
    { placeHolder: 'Select connection' },
  );
  return pick?.label;
}

async function pickConnectedHost(manager: SSHConnectionManager): Promise<string | undefined> {
  const names = manager.getConnectionNames();
  if (names.length === 0) {
    vscode.window.showInformationMessage('No active connections.');
    return undefined;
  }
  if (names.length === 1) return names[0];
  const pick = await vscode.window.showQuickPick(
    names.map((n) => ({ label: n })),
    { placeHolder: 'Select connection' },
  );
  return pick?.label;
}
