export type AuthMethod = 'password' | 'key' | 'agent' | 'sshConfig';

export interface SSHHostConfig {
  name: string;
  host: string;
  port: number;
  username: string;
  authMethod: AuthMethod;
  privateKeyPath?: string;
  initialPath: string;
}

export interface ActiveConnection {
  config: SSHHostConfig;
  client: import('ssh2').Client;
  sftp: import('ssh2').SFTPWrapper;
}
