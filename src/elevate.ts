import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export interface PrivilegedWrite {
  /** 目标绝对路径 (root 可写). */
  dest: string;
  content: Buffer;
}

export interface ElevateResult {
  ok: boolean;
  /** 失败时保留的脚本路径, 供用户手动 sudo 执行. */
  scriptPath?: string;
  message: string;
}

/** 把目标路径转成安全的临时文件名. */
function safeName(dest: string): string {
  return dest.replace(/[^\w.-]+/g, '_');
}

/** 准备临时目录: 待写入的文件 + 一段只做 cp 的脚本. 不涉及提权. */
export function preparePrivilegedDir(writes: PrivilegedWrite[]): {
  dir: string;
  scriptPath: string;
} {
  const dir = mkdtempSync(join(tmpdir(), 'emoji-patch-'));
  const pairs: Array<[string, string]> = [];
  for (const w of writes) {
    const src = join(dir, safeName(w.dest));
    writeFileSync(src, w.content);
    pairs.push([src, w.dest]);
  }
  const lines = [
    '#!/bin/bash',
    'set -euo pipefail',
    ...pairs.map(([src, dest]) => `cp -f ${JSON.stringify(src)} ${JSON.stringify(dest)}`),
  ];
  const scriptPath = join(dir, 'apply.sh');
  writeFileSync(scriptPath, `${lines.join('\n')}\n`, { mode: 0o755 });
  return { dir, scriptPath };
}

/**
 * `pkexec` 提权写入: 扩展算好内容 -> 写临时目录 -> root 只做 cp -> 成功即删临时目录.
 * 不产生任何持久数据目录.
 */
export function writeAsRoot(writes: PrivilegedWrite[]): ElevateResult {
  const { dir, scriptPath } = preparePrivilegedDir(writes);
  const r = spawnSync('pkexec', ['/bin/bash', scriptPath], { encoding: 'utf8' });
  if (r.error) {
    return { ok: false, scriptPath, message: `无法执行 pkexec: ${r.error.message}` };
  }
  if (r.status !== 0) {
    const detail = (r.stderr || r.stdout || '').trim();
    return {
      ok: false,
      scriptPath,
      message: `pkexec 失败 (退出码 ${r.status})${detail ? `: ${detail}` : ''}`,
    };
  }
  rmSync(dir, { recursive: true, force: true });
  return { ok: true, message: 'ok' };
}
