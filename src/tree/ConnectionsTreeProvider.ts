import * as vscode from 'vscode';
import { SSHConnectionManager } from '../connection/SSHConnectionManager';
import { ConnectionTreeItem } from './ConnectionTreeItem';

export class ConnectionsTreeProvider implements vscode.TreeDataProvider<ConnectionTreeItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  constructor(private readonly manager: SSHConnectionManager) {
    manager.onDidChangeConnections(() => this.refresh());
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('sshBrowse.connections')) {
        this.refresh();
      }
    });
  }

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: ConnectionTreeItem): vscode.TreeItem {
    return element;
  }

  async getChildren(): Promise<ConnectionTreeItem[]> {
    const saved = this.manager.getSavedConnections();
    return saved.map(
      (config) => new ConnectionTreeItem(config, this.manager.isConnected(config.name)),
    );
  }
}
