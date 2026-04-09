import * as vscode from 'vscode';
import type { Client, ClientChannel } from 'ssh2';
import { log } from '../util/logger';

export class SSHPseudoterminal implements vscode.Pseudoterminal {
  private writeEmitter = new vscode.EventEmitter<string>();
  private closeEmitter = new vscode.EventEmitter<number | void>();
  private stream: ClientChannel | undefined;

  onDidWrite = this.writeEmitter.event;
  onDidClose = this.closeEmitter.event;

  constructor(
    private readonly client: Client,
    private readonly connectionName: string,
    private readonly initialCwd?: string,
  ) {}

  open(initialDimensions: vscode.TerminalDimensions | undefined): void {
    const rows = initialDimensions?.rows || 24;
    const cols = initialDimensions?.columns || 80;

    this.client.shell(
      { rows, cols, term: 'xterm-256color' },
      (err, stream) => {
        if (err) {
          this.writeEmitter.fire(`\r\nFailed to open shell: ${err.message}\r\n`);
          this.closeEmitter.fire(1);
          return;
        }

        this.stream = stream;

        stream.on('data', (data: Buffer) => {
          this.writeEmitter.fire(data.toString('utf-8'));
        });

        stream.stderr.on('data', (data: Buffer) => {
          this.writeEmitter.fire(data.toString('utf-8'));
        });

        stream.on('close', () => {
          log(`Shell closed for ${this.connectionName}`);
          this.closeEmitter.fire(0);
        });

        if (this.initialCwd) {
          stream.write(`cd ${this.shellEscape(this.initialCwd)}\n`);
        }
      },
    );
  }

  close(): void {
    if (this.stream) {
      this.stream.close();
      this.stream = undefined;
    }
  }

  handleInput(data: string): void {
    this.stream?.write(data);
  }

  setDimensions(dimensions: vscode.TerminalDimensions): void {
    this.stream?.setWindow(dimensions.rows, dimensions.columns, 0, 0);
  }

  private shellEscape(s: string): string {
    return "'" + s.replace(/'/g, "'\\''") + "'";
  }
}
