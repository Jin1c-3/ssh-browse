# SSH Browse

A VS Code extension for browsing files and running commands on remote SSH hosts — without opening a folder.

Inspired by [Wave Terminal](https://waveterm.dev). Connect to any SSH server, browse the entire filesystem from a sidebar, edit files in place, and open interactive terminals.

## Features

- **File Browser** — Navigate remote filesystems from the sidebar. Jump to any path with "Go to Path".
- **File Editing** — Click a file to open it in VS Code. Save writes back to the remote host.
- **SSH Terminal** — Open interactive shell sessions in VS Code's terminal panel.
- **Multi-Connection** — Connect to multiple hosts at once, each with its own file tree and terminals.
- **SSH Config Import** — Import hosts from your `~/.ssh/config` file.
- **File Operations** — Create, rename, delete, download files and folders via right-click context menu.

## Getting Started

1. Install the extension
2. Click the **SSH Browse** icon in the Activity Bar
3. Click **+** to add a connection (or import from SSH config)
4. Click the plug icon to connect
5. Browse files, open editors, and launch terminals

## Authentication

Supports private key, password, and SSH agent authentication. Passwords are stored securely using VS Code's SecretStorage — never in settings files.

## Requirements

- VS Code 1.85+
- SSH server with SFTP enabled (most are by default)
