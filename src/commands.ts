import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as vscode from 'vscode';
import { MDT_EXT_ID, PRODUCT_REL, WORKBENCH_REL } from './const';
import { buildCssBlock, parseCssBlock } from './cssBlock';
import { writeAsRoot, type PrivilegedWrite } from './elevate';
import { hijackTableFormatter, type HijackResult } from './hijack';
import { resolveOxfmt } from './oxfmtPath';
import {
  installPreviewPatch,
  mpePreviewRule,
  uninstallPreviewPatch,
  vscodePreviewRule,
  type PreviewResult,
} from './preview';
import { buildUnicodeRange, extractRangeFromHtml, fetchEmojiSequences } from './range';
import { extractBlock, hasBlock, injectBlock, sha256Base64, stripBlock, updateChecksum } from './workbench';

function conf<T>(key: string): T {
  return vscode.workspace.getConfiguration('emojiPatch').get<T>(key) as T;
}

/** 要顶替的字体族: 配置优先, 否则取 editor.fontFamily 的第一个族. */
function resolveCodeFont(): string {
  const configured = conf<string>('codeFont').trim();
  if (configured) {
    return configured;
  }
  const raw = vscode.workspace.getConfiguration('editor').get<string>('fontFamily') ?? '';
  const families = raw
    .split(',')
    .map((f) => f.trim().replace(/^['"]|['"]$/g, ''))
    .filter(Boolean)
    // 跳过早期手工 patch 用的名字 (它本就不存在, 跳过才能顶替到真字体族)
    .filter((f) => f !== 'EmojiPatch');
  return families[0] ?? 'Iosevka Term';
}

/** 生成 CSS 块并写好两个待替换文件; 内容没变化时返回 undefined. */
async function computeEnable(): Promise<{ writes: PrivilegedWrite[]; summary: string } | undefined> {
  const root = conf<string>('codeRoot');
  const workbenchPath = join(root, WORKBENCH_REL);
  const productPath = join(root, PRODUCT_REL);
  const html = readFileSync(workbenchPath, 'utf8');
  const product = readFileSync(productPath, 'utf8');

  let range: string;
  let count = 0;
  let source = 'unicode.org';
  try {
    const built = buildUnicodeRange(await fetchEmojiSequences());
    range = built.range;
    count = built.count;
  } catch (err) {
    const existing = extractRangeFromHtml(html);
    if (!existing) {
      throw new Error('下载 emoji-sequences.txt 失败, 且本地没有可复用的 unicode-range', { cause: err });
    }
    range = existing;
    source = '本地缓存';
  }

  const codeFont = resolveCodeFont();
  const inner = buildCssBlock({
    codeFont,
    notoFamily: conf<string>('notoFamily'),
    sizeAdjust: conf<string>('sizeAdjust'),
    unicodeRange: range,
  });

  const patched = injectBlock(stripBlock(html), inner);
  const patchedBuf = Buffer.from(patched, 'utf8');
  const patchedProduct = updateChecksum(product, sha256Base64(patchedBuf));
  if (patched === html && patchedProduct === product) {
    return undefined;
  }
  return {
    writes: [
      { dest: workbenchPath, content: patchedBuf },
      { dest: productPath, content: Buffer.from(patchedProduct, 'utf8') },
    ],
    summary: `族名 "${codeFont}", ${count > 0 ? `${count} 个码点 (来源 ${source})` : '沿用已有 range'}`,
  };
}

/** 去掉我们注入的块 (以及早期手工块); 没变化时返回 undefined. */
function computeDisable(): { writes: PrivilegedWrite[] } | undefined {
  const root = conf<string>('codeRoot');
  const workbenchPath = join(root, WORKBENCH_REL);
  const productPath = join(root, PRODUCT_REL);
  const html = readFileSync(workbenchPath, 'utf8');
  const stripped = stripBlock(html);
  if (stripped === html) {
    return undefined;
  }
  const strippedBuf = Buffer.from(stripped, 'utf8');
  const product = updateChecksum(readFileSync(productPath, 'utf8'), sha256Base64(strippedBuf));
  return {
    writes: [
      { dest: workbenchPath, content: strippedBuf },
      { dest: productPath, content: Buffer.from(product, 'utf8') },
    ],
  };
}

/** 包装 markdowntable 的格式化 (仅内存). */
export function setupTableHijack(): HijackResult | undefined {
  if (!conf<boolean>('patchMarkdownTable')) {
    return undefined;
  }
  const ext = vscode.extensions.getExtension(MDT_EXT_ID);
  if (!ext) {
    return { wrapped: false, message: `未安装 ${MDT_EXT_ID}` };
  }
  const oxfmt = resolveOxfmt(conf<string>('oxfmtPath'));
  if (!oxfmt) {
    return { wrapped: false, message: '找不到 oxfmt 可执行文件' };
  }
  return hijackTableFormatter(ext.extensionPath, oxfmt);
}

/**
 * 内存包装: 拦住 webview 的 html 赋值, 给各家的 markdown 预览注入 emoji 字体 (不落盘).
 *
 * - MPE: 顶替它字体链的第一个族, 直接复用 workbench.html 里那份块 → 与编辑器必然一致.
 * - VSCode 自带: 它的字体走 `var(--markdown-font-family)`, 顶替族名没意义, 改成前插一个只覆盖
 *   emoji 码点的族 (参数从上面那份块里解析出来).
 */
export function setupPreviewPatch(): PreviewResult | undefined {
  if (!conf<boolean>('patchPreview')) {
    return undefined;
  }
  let inner: string | undefined;
  try {
    inner = extractBlock(readFileSync(join(conf<string>('codeRoot'), WORKBENCH_REL), 'utf8'));
  } catch {
    inner = undefined;
  }
  if (!inner) {
    return { installed: false, message: 'workbench 未注入' };
  }
  const face = parseCssBlock(inner);
  if (!face) {
    return { installed: false, message: 'workbench 字体块解析失败' };
  }
  return installPreviewPatch([mpePreviewRule(inner), vscodePreviewRule(face)]);
}

/** 跑一条内存包装的状态文案. */
function describeHijack(): string {
  const hijack = setupTableHijack();
  if (!hijack) {
    return '未启用';
  }
  return hijack.wrapped ? 'oxfmt' : `未生效 (${hijack.message})`;
}

function describePreview(): string {
  const preview = setupPreviewPatch();
  if (!preview) {
    return '未启用';
  }
  return preview.installed ? '已注入' : `未注入 (${preview.message})`;
}

async function afterWrite(message: string): Promise<void> {
  const tail = `\n表格格式化: ${describeHijack()}\n预览: ${describePreview()}`;
  const pick = await vscode.window.showInformationMessage(`${message}${tail}`, '重新加载窗口');
  if (pick === '重新加载窗口') {
    await vscode.commands.executeCommand('workbench.action.reloadWindow');
  }
}

export async function enable(): Promise<void> {
  try {
    const plan = await computeEnable();
    if (!plan) {
      vscode.window.showInformationMessage('Emoji Patch 已生效, 无需变更.');
      return;
    }
    const result = writeAsRoot(plan.writes);
    if (!result.ok) {
      const pick = await vscode.window.showErrorMessage(
        `Emoji Patch 生效失败: ${result.message}`,
        ...(result.scriptPath ? ['复制脚本路径'] : []),
      );
      if (pick === '复制脚本路径' && result.scriptPath) {
        await vscode.env.clipboard.writeText(`sudo bash ${result.scriptPath}`);
      }
      return;
    }
    await afterWrite(`Emoji Patch 已生效 (${plan.summary}).`);
  } catch (err) {
    vscode.window.showErrorMessage(`Emoji Patch 生效失败: ${err instanceof Error ? err.message : String(err)}`);
  }
}

export async function disable(): Promise<void> {
  try {
    const plan = computeDisable();
    if (!plan) {
      uninstallPreviewPatch();
      vscode.window.showInformationMessage('Emoji Patch 当前未生效, 无需变更.');
      return;
    }
    const result = writeAsRoot(plan.writes);
    if (!result.ok) {
      const pick = await vscode.window.showErrorMessage(
        `Emoji Patch 失效失败: ${result.message}`,
        ...(result.scriptPath ? ['复制脚本路径'] : []),
      );
      if (pick === '复制脚本路径' && result.scriptPath) {
        await vscode.env.clipboard.writeText(`sudo bash ${result.scriptPath}`);
      }
      return;
    }
    uninstallPreviewPatch();
    await afterWrite('Emoji Patch 已失效.');
  } catch (err) {
    vscode.window.showErrorMessage(`Emoji Patch 失效失败: ${err instanceof Error ? err.message : String(err)}`);
  }
}

/** 供扩展激活时打印一行状态. */
export function describeState(): string {
  const root = conf<string>('codeRoot');
  let patched = false;
  try {
    patched = hasBlock(readFileSync(join(root, WORKBENCH_REL), 'utf8'));
  } catch {
    patched = false;
  }
  // 注意: 这两个 describe 会顺手把两条内存包装装上 (激活时即生效).
  return `workbench: ${patched ? '已注入' : '未注入'}; 表格格式化: ${describeHijack()}; 预览: ${describePreview()}`;
}
