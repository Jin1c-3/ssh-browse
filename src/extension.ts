import * as vscode from 'vscode';
import { SSHConnectionManager } from './connection/SSHConnectionManager';
import { SSHFileSystemProvider } from './filesystem/SSHFileSystemProvider';
import { SCHEME } from './filesystem/fileUtils';
import { ConnectionsTreeProvider } from './tree/ConnectionsTreeProvider';
import { RemoteFileTreeProvider } from './tree/RemoteFileTreeProvider';
import { SSHTerminalService } from './terminal/SSHTerminalService';
import { registerConnectionCommands } from './commands/connectionCommands';
import { registerFileCommands } from './commands/fileCommands';
import { registerTerminalCommands } from './commands/terminalCommands';
import { log } from './util/logger';

export function activate(context: vscode.ExtensionContext): void {
  log('SSH Browse activating...');

  // Core services
  const manager = new SSHConnectionManager(context.secrets);
  const fsProvider = new SSHFileSystemProvider(manager);
  const terminalService = new SSHTerminalService(manager);

  // Register filesystem provider
  context.subscriptions.push(
    vscode.workspace.registerFileSystemProvider(SCHEME, fsProvider, { isCaseSensitive: true }),
  );

  // Tree views
  const connectionsTree = new ConnectionsTreeProvider(manager);
  const fileTreeProvider = new RemoteFileTreeProvider(manager, fsProvider);

  context.subscriptions.push(
    vscode.window.createTreeView('sshBrowse.connections', {
      treeDataProvider: connectionsTree,
      showCollapseAll: false,
    }),
    vscode.window.createTreeView('sshBrowse.fileExplorer', {
      treeDataProvider: fileTreeProvider,
      showCollapseAll: true,
    }),
  );

  // Register commands
  registerConnectionCommands(context, manager);
  registerFileCommands(context, manager, fsProvider, fileTreeProvider);
  registerTerminalCommands(context, manager, terminalService);

  // Cleanup
  context.subscriptions.push(manager);

  log('SSH Browse activated.');
}

export function deactivate(): void {
  log('SSH Browse deactivated.');
}
