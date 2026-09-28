import { createHash } from 'node:crypto';
import { MARKER_END, MARKER_START } from './const';

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const SPAN_SRC = `${escapeRe(MARKER_START)}[\\s\\S]*?${escapeRe(MARKER_END)}`;
/** 我们插入的整个 `<style>` 块 (含外层缩进与换行). */
const WRAP_RE = new RegExp(`[ \\t]*<style>\\s*${SPAN_SRC}\\s*</style>\\n?`, 'g');
/** 早期手工 patch 留下的、含 EmojiPatch 的 `<style>` 块. */
const LEGACY_RE = /[ \t]*<style>\s*@font-face[\s\S]*?EmojiPatch[\s\S]*?<\/style>\n?/g;

/** 是否已注入. */
export function hasBlock(html: string): boolean {
  return html.includes(MARKER_START) && html.includes(MARKER_END);
}

/**
 * 把 CSS 内容注入 head 末尾.
 * - 已有标记: 只替换标记之间 (幂等)
 * - 没有标记: 在 `</head>` 之前插入一个新的 `<style>` 块
 */
export function injectBlock(html: string, inner: string): string {
  const span = `${MARKER_START}\n${inner}\n${MARKER_END}`;
  const start = html.indexOf(MARKER_START);
  const end = html.indexOf(MARKER_END);
  if (start >= 0 && end > start) {
    return html.slice(0, start) + span + html.slice(end + MARKER_END.length);
  }
  const anchor = html.indexOf('</head>');
  if (anchor < 0) {
    throw new Error('workbench.html 里找不到 </head>');
  }
  const lineStart = html.lastIndexOf('\n', anchor) + 1;
  const indent = html.slice(lineStart, anchor);
  return `${html.slice(0, lineStart)}${indent}<style>\n${span}\n${indent}</style>\n${html.slice(lineStart)}`;
}

/** 去掉注入块与早期手工块, 能逐字节还原. */
export function stripBlock(html: string): string {
  let out = html.replace(WRAP_RE, '');
  out = out.replace(new RegExp(SPAN_SRC, 'g'), '');
  out = out.replace(LEGACY_RE, '');
  return out;
}

/** base64(sha256(buf)) 去掉尾部 `=` —— VS Code product.json 用的就是这种表示. */
export function sha256Base64(buf: Buffer): string {
  return createHash('sha256').update(buf).digest('base64').replace(/=+$/, '');
}

/** 只改 product.json 里那一个 checksum, 其余内容一字节不动. */
export function updateChecksum(productJson: string, checksum: string): string {
  const re = /("vs\/code\/electron-browser\/workbench\/workbench\.html"\s*:\s*")[^"]*(")/;
  if (!re.test(productJson)) {
    throw new Error('product.json 里找不到 workbench.html 的 checksum key');
  }
  return productJson.replace(re, `$1${checksum}$2`);
}
