import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { MDT_HELPER_REL } from './const';

export interface HijackResult {
  wrapped: boolean;
  message: string;
}

interface MarkdownTableHelper {
  toFormatTableStr?: (tableData: unknown) => string;
  __emojiPatchWrapped?: boolean;
}

/**
 * 在内存里包装 markdowntable 的 toFormatTableStr (唯一格式化出口), 让它走 oxfmt.
 *
 * 不改磁盘文件: 两个扩展在同一个 extension host 进程里, VS Code 用标准 Node `require`
 * 加载扩展, 所以这里 require 到的是**同一个模块对象**; markdowntable 的 commands.js
 * 调用处是 `mtdh.toFormatTableStr(...)` (属性访问), 改属性即对它生效.
 */
export function hijackTableFormatter(extensionPath: string, oxfmt: string): HijackResult {
  const helperPath = join(extensionPath, MDT_HELPER_REL);
  if (!existsSync(helperPath)) {
    return { wrapped: false, message: `找不到 ${helperPath}` };
  }
  const helper = require(helperPath) as MarkdownTableHelper;
  if (helper.__emojiPatchWrapped === true) {
    return { wrapped: true, message: '已包装' };
  }
  const orig = helper.toFormatTableStr;
  if (typeof orig !== 'function') {
    return { wrapped: false, message: 'toFormatTableStr 不是函数' };
  }
  helper.toFormatTableStr = (tableData: unknown): string => {
    const md = orig(tableData);
    try {
      const r = spawnSync(oxfmt, ['--stdin-filepath', 'table.md'], { input: md, encoding: 'utf8' });
      if (r.status === 0 && typeof r.stdout === 'string' && r.stdout.trim() !== '') {
        return r.stdout.replace(/[\r\n]+$/, '');
      }
    } catch {
      // 出错就退回原样
    }
    return md;
  };
  Object.defineProperty(helper, '__emojiPatchWrapped', { value: true, enumerable: false });
  return { wrapped: true, message: '已包装' };
}
