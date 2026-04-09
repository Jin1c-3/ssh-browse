import * as vscode from 'vscode';

export const SCHEME = 'ssh-browse';

export function makeUri(connectionName: string, remotePath: string): vscode.Uri {
  return vscode.Uri.parse(`${SCHEME}://${encodeURIComponent(connectionName)}${remotePath}`);
}

export function parseUri(uri: vscode.Uri): { connectionName: string; remotePath: string } {
  return {
    connectionName: decodeURIComponent(uri.authority),
    remotePath: uri.path || '/',
  };
}
