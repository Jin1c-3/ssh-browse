import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import SSHConfig from 'ssh-config';
import type { SSHHostConfig } from './connectionConfig';

export function parseSSHConfig(): SSHHostConfig[] {
  const configPath = path.join(os.homedir(), '.ssh', 'config');
  if (!fs.existsSync(configPath)) {
    return [];
  }

  const raw = fs.readFileSync(configPath, 'utf-8');
  const parsed = SSHConfig.parse(raw);
  const hosts: SSHHostConfig[] = [];

  for (const section of parsed) {
    if (section.type !== SSHConfig.DIRECTIVE || section.param !== 'Host') {
      continue;
    }
    const hostPattern = section.value as string;
    if (hostPattern.includes('*') || hostPattern.includes('?')) {
      continue;
    }

    const computed = parsed.compute(hostPattern) as Record<string, string | string[] | undefined>;
    const hostname = String(computed.HostName || hostPattern);
    const user = String(computed.User || os.userInfo().username);
    const portVal = computed.Port;
    const port = portVal ? parseInt(String(portVal), 10) : 22;
    const identityFiles = computed.IdentityFile;
    const identityFile = Array.isArray(identityFiles) ? identityFiles[0] : identityFiles;

    hosts.push({
      name: hostPattern,
      host: hostname,
      port,
      username: user,
      authMethod: identityFile ? 'key' : 'sshConfig',
      privateKeyPath: identityFile ? resolveKeyPath(identityFile) : undefined,
      initialPath: '/',
    });
  }

  return hosts;
}

function resolveKeyPath(keyPath: string): string {
  if (keyPath.startsWith('~')) {
    return path.join(os.homedir(), keyPath.slice(1));
  }
  return keyPath;
}
