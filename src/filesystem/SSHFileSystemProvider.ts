import * as vscode from 'vscode';
import type { Stats } from 'ssh2';
import { SSHConnectionManager } from '../connection/SSHConnectionManager';
import { parseUri, SCHEME } from './fileUtils';

export class SSHFileSystemProvider implements vscode.FileSystemProvider {
  private _onDidChangeFile = new vscode.EventEmitter<vscode.FileChangeEvent[]>();
  readonly onDidChangeFile = this._onDidChangeFile.event;

  private pendingEvents: vscode.FileChangeEvent[] = [];
  private fireTimeout: ReturnType<typeof setTimeout> | undefined;

  constructor(private readonly manager: SSHConnectionManager) {}

  watch(): vscode.Disposable {
    return new vscode.Disposable(() => {});
  }

  async stat(uri: vscode.Uri): Promise<vscode.FileStat> {
    const { connectionName, remotePath } = parseUri(uri);
    const sftp = this.manager.getSFTP(connectionName);

    return new Promise<vscode.FileStat>((resolve, reject) => {
      sftp.stat(remotePath, (err, stats) => {
        if (err) {
          reject(vscode.FileSystemError.FileNotFound(uri));
          return;
        }
        resolve({
          type: this.getFileType(stats),
          ctime: (stats.mtime || 0) * 1000,
          mtime: (stats.mtime || 0) * 1000,
          size: stats.size,
        });
      });
    });
  }

  async readDirectory(uri: vscode.Uri): Promise<[string, vscode.FileType][]> {
    const { connectionName, remotePath } = parseUri(uri);
    const sftp = this.manager.getSFTP(connectionName);

    return new Promise((resolve, reject) => {
      sftp.readdir(remotePath, (err, list) => {
        if (err) {
          reject(vscode.FileSystemError.FileNotFound(uri));
          return;
        }
        const entries: [string, vscode.FileType][] = list.map((item) => [
          item.filename,
          this.getFileType(item.attrs),
        ]);
        entries.sort((a, b) => {
          if (a[1] === b[1]) return a[0].localeCompare(b[0]);
          return a[1] === vscode.FileType.Directory ? -1 : 1;
        });
        resolve(entries);
      });
    });
  }

  async readFile(uri: vscode.Uri): Promise<Uint8Array> {
    const { connectionName, remotePath } = parseUri(uri);
    const sftp = this.manager.getSFTP(connectionName);

    return new Promise((resolve, reject) => {
      sftp.readFile(remotePath, (err, data) => {
        if (err) {
          reject(vscode.FileSystemError.FileNotFound(uri));
          return;
        }
        resolve(new Uint8Array(data));
      });
    });
  }

  async writeFile(
    uri: vscode.Uri,
    content: Uint8Array,
    options: { create: boolean; overwrite: boolean },
  ): Promise<void> {
    const { connectionName, remotePath } = parseUri(uri);
    const sftp = this.manager.getSFTP(connectionName);

    if (!options.overwrite) {
      const exists = await this.exists(uri);
      if (exists && !options.overwrite) {
        throw vscode.FileSystemError.FileExists(uri);
      }
      if (!exists && !options.create) {
        throw vscode.FileSystemError.FileNotFound(uri);
      }
    }

    return new Promise((resolve, reject) => {
      sftp.writeFile(remotePath, Buffer.from(content), (err) => {
        if (err) {
          reject(err);
          return;
        }
        this.fireSoon({ type: vscode.FileChangeType.Changed, uri });
        resolve();
      });
    });
  }

  async rename(
    oldUri: vscode.Uri,
    newUri: vscode.Uri,
    options: { overwrite: boolean },
  ): Promise<void> {
    const { connectionName, remotePath: oldPath } = parseUri(oldUri);
    const { remotePath: newPath } = parseUri(newUri);
    const sftp = this.manager.getSFTP(connectionName);

    if (!options.overwrite) {
      const exists = await this.exists(newUri);
      if (exists) {
        throw vscode.FileSystemError.FileExists(newUri);
      }
    }

    return new Promise((resolve, reject) => {
      sftp.rename(oldPath, newPath, (err) => {
        if (err) {
          reject(err);
          return;
        }
        this.fireSoon(
          { type: vscode.FileChangeType.Deleted, uri: oldUri },
          { type: vscode.FileChangeType.Created, uri: newUri },
        );
        resolve();
      });
    });
  }

  async delete(uri: vscode.Uri): Promise<void> {
    const { connectionName, remotePath } = parseUri(uri);
    const sftp = this.manager.getSFTP(connectionName);
    const stat = await this.stat(uri);

    return new Promise((resolve, reject) => {
      const cb = (err: any) => {
        if (err) {
          reject(err);
          return;
        }
        this.fireSoon({ type: vscode.FileChangeType.Deleted, uri });
        resolve();
      };

      if (stat.type === vscode.FileType.Directory) {
        sftp.rmdir(remotePath, cb);
      } else {
        sftp.unlink(remotePath, cb);
      }
    });
  }

  async createDirectory(uri: vscode.Uri): Promise<void> {
    const { connectionName, remotePath } = parseUri(uri);
    const sftp = this.manager.getSFTP(connectionName);

    return new Promise((resolve, reject) => {
      sftp.mkdir(remotePath, (err) => {
        if (err) {
          reject(err);
          return;
        }
        this.fireSoon({ type: vscode.FileChangeType.Created, uri });
        resolve();
      });
    });
  }

  private async exists(uri: vscode.Uri): Promise<boolean> {
    try {
      await this.stat(uri);
      return true;
    } catch {
      return false;
    }
  }

  private getFileType(stats: Stats): vscode.FileType {
    if (stats.isDirectory()) return vscode.FileType.Directory;
    if (stats.isSymbolicLink()) return vscode.FileType.SymbolicLink;
    return vscode.FileType.File;
  }

  private fireSoon(...events: vscode.FileChangeEvent[]): void {
    this.pendingEvents.push(...events);
    if (this.fireTimeout) {
      clearTimeout(this.fireTimeout);
    }
    this.fireTimeout = setTimeout(() => {
      this._onDidChangeFile.fire(this.pendingEvents);
      this.pendingEvents = [];
    }, 5);
  }
}
