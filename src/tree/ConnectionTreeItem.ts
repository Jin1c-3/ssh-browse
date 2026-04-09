import * as vscode from 'vscode';
import type { SSHHostConfig } from '../connection/connectionConfig';

export class ConnectionTreeItem extends vscode.TreeItem {
  constructor(
    public readonly config: SSHHostConfig,
    public readonly connected: boolean,
  ) {
    super(config.name, vscode.TreeItemCollapsibleState.None);
    this.description = `${config.username}@${config.host}:${config.port}`;
    this.contextValue = connected ? 'connectedHost' : 'disconnectedHost';
    this.iconPath = new vscode.ThemeIcon(connected ? 'vm-active' : 'vm-outline');
    this.tooltip = `${config.username}@${config.host}:${config.port} (${connected ? 'Connected' : 'Disconnected'})`;
  }
}
