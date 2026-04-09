import * as vscode from 'vscode';
import * as path from 'path';
import { SSHConnectionManager } from '../connection/SSHConnectionManager';
import { SSHFileSystemProvider } from '../filesystem/SSHFileSystemProvider';
import { RemoteFileTreeProvider } from '../tree/RemoteFileTreeProvider';
import { RemoteFileItem } from '../tree/RemoteFileItem';
import { makeUri, parseUri } from '../filesystem/fileUtils';
import { log } from '../util/logger';

export function registerFileCommands(
  context: vscode.ExtensionContext,
  manager: SSHConnectionManager,
  fsProvider: SSHFileSystemProvider,
  treeProvider: RemoteFileTreeProvider,
): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('sshBrowse.refreshTree', () => {
      treeProvider.refresh();
    }),

    vscode.commands.registerCommand('sshBrowse.goToPath', async (item?: RemoteFileItem) => {
      let connectionName: string | undefined;

      if (item) {
        connectionName = item.connectionName;
      } else {
        const names = manager.getConnectionNames();
        if (names.length === 0) return;
        if (names.length === 1) {
          connectionName = names[0];
        } else {
          const pick = await vscode.window.showQuickPick(
            names.map((n) => ({ label: n })),
            { placeHolder: 'Select connection' },
          );
          connectionName = pick?.label;
        }
      }
      if (!connectionName) return;

      const currentPath = treeProvider.getRootPath(connectionName);
      const newPath = await vscode.window.showInputBox({
        prompt: 'Remote path to browse',
        value: currentPath,
      });
      if (newPath === undefined) return;

      treeProvider.setRootPath(connectionName, newPath || '/');
    }),

    vscode.commands.registerCommand('sshBrowse.createFile', async (item: RemoteFileItem) => {
      if (!item || item.fileType !== vscode.FileType.Directory) return;

      const name = await vscode.window.showInputBox({ prompt: 'New file name' });
      if (!name) return;

      const uri = makeUri(item.connectionName, path.posix.join(item.remotePath, name));
      try {
        await fsProvider.writeFile(uri, new Uint8Array(0), { create: true, overwrite: false });
        treeProvider.refresh(item);
        const doc = await vscode.workspace.openTextDocument(uri);
        await vscode.window.showTextDocument(doc);
      } catch (err: any) {
        vscode.window.showErrorMessage(`Failed to create file: ${err.message}`);
      }
    }),

    vscode.commands.registerCommand('sshBrowse.createFolder', async (item: RemoteFileItem) => {
      if (!item || item.fileType !== vscode.FileType.Directory) return;

      const name = await vscode.window.showInputBox({ prompt: 'New folder name' });
      if (!name) return;

      const uri = makeUri(item.connectionName, path.posix.join(item.remotePath, name));
      try {
        await fsProvider.createDirectory(uri);
        treeProvider.refresh(item);
      } catch (err: any) {
        vscode.window.showErrorMessage(`Failed to create folder: ${err.message}`);
      }
    }),

    vscode.commands.registerCommand('sshBrowse.rename', async (item: RemoteFileItem) => {
      if (!item) return;

      const oldName = path.posix.basename(item.remotePath);
      const newName = await vscode.window.showInputBox({
        prompt: 'New name',
        value: oldName,
      });
      if (!newName || newName === oldName) return;

      const parentPath = path.posix.dirname(item.remotePath);
      const oldUri = makeUri(item.connectionName, item.remotePath);
      const newUri = makeUri(item.connectionName, path.posix.join(parentPath, newName));

      try {
        await fsProvider.rename(oldUri, newUri, { overwrite: false });
        treeProvider.refresh();
      } catch (err: any) {
        vscode.window.showErrorMessage(`Failed to rename: ${err.message}`);
      }
    }),

    vscode.commands.registerCommand('sshBrowse.delete', async (item: RemoteFileItem) => {
      if (!item) return;

      const name = path.posix.basename(item.remotePath);
      const confirm = await vscode.window.showWarningMessage(
        `Delete "${name}"?`,
        { modal: true },
        'Delete',
      );
      if (confirm !== 'Delete') return;

      try {
        const uri = makeUri(item.connectionName, item.remotePath);
        await fsProvider.delete(uri);
        treeProvider.refresh();
      } catch (err: any) {
        vscode.window.showErrorMessage(`Failed to delete: ${err.message}`);
      }
    }),

    vscode.commands.registerCommand('sshBrowse.copyPath', async (item: RemoteFileItem) => {
      if (!item) return;
      await vscode.env.clipboard.writeText(item.remotePath);
      vscode.window.showInformationMessage(`Copied: ${item.remotePath}`);
    }),

    vscode.commands.registerCommand('sshBrowse.download', async (item: RemoteFileItem) => {
      if (!item || item.fileType === vscode.FileType.Directory) return;

      const defaultName = path.posix.basename(item.remotePath);
      const saveUri = await vscode.window.showSaveDialog({
        defaultUri: vscode.Uri.file(defaultName),
        title: 'Download to...',
      });
      if (!saveUri) return;

      try {
        const sftp = manager.getSFTP(item.connectionName);
        await new Promise<void>((resolve, reject) => {
          sftp.fastGet(item.remotePath, saveUri.fsPath, (err) => {
            if (err) reject(err);
            else resolve();
          });
        });
        vscode.window.showInformationMessage(`Downloaded to ${saveUri.fsPath}`);
      } catch (err: any) {
        log(`Download failed: ${err.message}`);
        vscode.window.showErrorMessage(`Download failed: ${err.message}`);
      }
    }),
  );
}
