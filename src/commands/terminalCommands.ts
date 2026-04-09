import * as vscode from 'vscode';
import { SSHConnectionManager } from '../connection/SSHConnectionManager';
import { SSHTerminalService } from '../terminal/SSHTerminalService';
import { ConnectionTreeItem } from '../tree/ConnectionTreeItem';
import { RemoteFileItem } from '../tree/RemoteFileItem';

export function registerTerminalCommands(
  context: vscode.ExtensionContext,
  manager: SSHConnectionManager,
  terminalService: SSHTerminalService,
): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('sshBrowse.openTerminal', async (item?: ConnectionTreeItem | RemoteFileItem) => {
      let connectionName: string | undefined;
      let cwd: string | undefined;

      if (item instanceof ConnectionTreeItem) {
        connectionName = item.config.name;
      } else if (item instanceof RemoteFileItem) {
        connectionName = item.connectionName;
        cwd = item.fileType === vscode.FileType.Directory
          ? item.remotePath
          : undefined;
      }

      if (!connectionName) {
        const names = manager.getConnectionNames();
        if (names.length === 0) {
          vscode.window.showInformationMessage('No active connections.');
          return;
        }
        if (names.length === 1) {
          connectionName = names[0];
        } else {
          const pick = await vscode.window.showQuickPick(
            names.map((n) => ({ label: n })),
            { placeHolder: 'Select connection for terminal' },
          );
          connectionName = pick?.label;
        }
      }

      if (!connectionName || !manager.isConnected(connectionName)) {
        vscode.window.showErrorMessage('Not connected to this host.');
        return;
      }

      const terminal = terminalService.createTerminal(connectionName, cwd);
      terminal.show();
    }),
  );
}
