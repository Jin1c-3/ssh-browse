import * as vscode from 'vscode';
import { SSHConnectionManager } from '../connection/SSHConnectionManager';
import { SSHPseudoterminal } from './SSHPseudoterminal';

export class SSHTerminalService {
  constructor(private readonly manager: SSHConnectionManager) {}

  createTerminal(connectionName: string, cwd?: string): vscode.Terminal {
    const client = this.manager.getClient(connectionName);
    const pty = new SSHPseudoterminal(client, connectionName, cwd);
    return vscode.window.createTerminal({
      name: `SSH: ${connectionName}`,
      pty,
    });
  }
}
