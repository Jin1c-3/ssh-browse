import * as vscode from 'vscode';
import * as path from 'path';
import { SSHConnectionManager } from '../connection/SSHConnectionManager';
import { SSHFileSystemProvider } from '../filesystem/SSHFileSystemProvider';
import { makeUri } from '../filesystem/fileUtils';
import { RemoteFileItem } from './RemoteFileItem';

export class RemoteFileTreeProvider implements vscode.TreeDataProvider<RemoteFileItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<RemoteFileItem | undefined>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  // Track the current browsing root per connection
  private rootPaths = new Map<string, string>();

  constructor(
    private readonly manager: SSHConnectionManager,
    private readonly fsProvider: SSHFileSystemProvider,
  ) {
    manager.onDidChangeConnections(() => {
      this.refresh();
    });
  }

  refresh(item?: RemoteFileItem): void {
    this._onDidChangeTreeData.fire(item);
  }

  setRootPath(connectionName: string, rootPath: string): void {
    this.rootPaths.set(connectionName, rootPath);
    this.refresh();
  }

  getRootPath(connectionName: string): string {
    return this.rootPaths.get(connectionName) || '/';
  }

  getTreeItem(element: RemoteFileItem): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: RemoteFileItem): Promise<RemoteFileItem[]> {
    if (!element) {
      // Root level: one entry per connected host showing its root path
      const items: RemoteFileItem[] = [];
      for (const name of this.manager.getConnectionNames()) {
        const conn = this.manager.getConnection(name);
        if (!conn) continue;
        const rootPath = this.rootPaths.get(name) || conn.config.initialPath || '/';
        this.rootPaths.set(name, rootPath);

        const item = new RemoteFileItem(name, rootPath, vscode.FileType.Directory);
        item.label = `${name}: ${rootPath}`;
        item.collapsibleState = vscode.TreeItemCollapsibleState.Expanded;
        item.contextValue = 'directory';
        items.push(item);
      }
      return items;
    }

    // Children of a directory
    const uri = makeUri(element.connectionName, element.remotePath);
    try {
      const entries = await this.fsProvider.readDirectory(uri);
      return entries.map(([name, type]) => {
        const childPath = path.posix.join(element.remotePath, name);
        return new RemoteFileItem(element.connectionName, childPath, type);
      });
    } catch {
      return [];
    }
  }

  getParent(element: RemoteFileItem): RemoteFileItem | undefined {
    const parentPath = path.posix.dirname(element.remotePath);
    if (parentPath === element.remotePath) return undefined;
    return new RemoteFileItem(
      element.connectionName,
      parentPath,
      vscode.FileType.Directory,
    );
  }
}
