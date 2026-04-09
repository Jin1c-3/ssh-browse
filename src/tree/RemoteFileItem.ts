import * as vscode from 'vscode';
import * as path from 'path';
import { makeUri } from '../filesystem/fileUtils';

export class RemoteFileItem extends vscode.TreeItem {
  constructor(
    public readonly connectionName: string,
    public readonly remotePath: string,
    public readonly fileType: vscode.FileType,
  ) {
    const name = path.posix.basename(remotePath) || '/';
    const isDir = fileType === vscode.FileType.Directory;

    super(
      name,
      isDir
        ? vscode.TreeItemCollapsibleState.Collapsed
        : vscode.TreeItemCollapsibleState.None,
    );

    const uri = makeUri(connectionName, remotePath);
    this.resourceUri = uri;
    this.contextValue = isDir ? 'directory' : 'file';

    if (isDir) {
      this.iconPath = vscode.ThemeIcon.Folder;
    } else {
      this.iconPath = vscode.ThemeIcon.File;
      this.command = {
        command: 'vscode.open',
        title: 'Open',
        arguments: [uri],
      };
    }

    this.tooltip = remotePath;
  }
}
