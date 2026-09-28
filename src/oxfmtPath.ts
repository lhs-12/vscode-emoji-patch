import { existsSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { delimiter, join } from 'node:path';

/** 探测 oxfmt 可执行文件: 配置 > PATH > mise 安装目录. */
export function resolveOxfmt(configured: string): string | undefined {
  if (configured) {
    return existsSync(configured) ? configured : undefined;
  }
  for (const dir of (process.env.PATH ?? '').split(delimiter)) {
    if (!dir) {
      continue;
    }
    const p = join(dir, 'oxfmt');
    if (existsSync(p)) {
      return p;
    }
  }
  const installs = join(homedir(), '.local', 'share', 'mise', 'installs', 'oxfmt');
  if (existsSync(installs)) {
    for (const version of readdirSync(installs)) {
      const p = join(installs, version, 'node_modules', '.bin', 'oxfmt');
      if (existsSync(p)) {
        return p;
      }
    }
  }
  return undefined;
}
