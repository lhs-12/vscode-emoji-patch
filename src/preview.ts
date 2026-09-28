import * as vscode from 'vscode';
import { MPE_PREVIEW_MARKER, PREVIEW_FAMILY, PREVIEW_PROBE_VIEW_TYPE, VSCODE_PREVIEW_MARKER } from './const';
import type { EmojiFace } from './cssBlock';

/** 一种预览 shell: HTML 里出现 `marker` 就把 `css` 插进它的 head. */
export interface PreviewRule {
  marker: string;
  css: string;
}

export interface PreviewResult {
  installed: boolean;
  message: string;
}

/**
 * MPE 预览: 顶替它字体链的第一个族 —— 和编辑器同一个手法, 所以直接复用 workbench 那份块.
 */
export function mpePreviewRule(block: string): PreviewRule {
  return { marker: MPE_PREVIEW_MARKER, css: block };
}

/**
 * VSCode 自带预览: 它的字体来自 `var(--markdown-font-family)`, 顶替族名没意义.
 * 改成**前插**一个只覆盖 emoji 码点的族: 范围内的字符走缩放过的 Noto, 其余字符因为该族没有
 * 对应字形, 照旧落到预览自己的字体 —— 预览的字号/字体设置都不受影响.
 */
export function vscodePreviewRule(face: EmojiFace): PreviewRule {
  return {
    marker: VSCODE_PREVIEW_MARKER,
    css: [
      `@font-face { font-family: "${PREVIEW_FAMILY}"; src: local("${face.notoFamily}"); size-adjust: ${face.sizeAdjust}; unicode-range: ${face.unicodeRange}; }`,
      `html, body { font-family: "${PREVIEW_FAMILY}", var(--markdown-font-family, sans-serif); }`,
      `code { font-family: "${PREVIEW_FAMILY}", var(--vscode-editor-font-family, monospace); }`,
    ].join('\n'),
  };
}

/**
 * 纯字符串变换 (供测试): 命中某条规则就把它的 css 插到 `</head>` 之前; 都不命中返回 undefined.
 *
 * 预览正文是 webview 端用 innerHTML / append 渲染进**同一个** document 的, 所以往 head 里插
 * `<style>` 就能生效 (MPE 的 `style.less` 走的也正是这条通道).
 */
export function injectPreviewCss(html: string, rules: readonly PreviewRule[]): string | undefined {
  if (!html.includes('</head>')) {
    return undefined;
  }
  for (const rule of rules) {
    if (!html.includes(rule.marker) || html.includes(rule.css)) {
      continue;
    }
    return html.replace('</head>', `<style>\n${rule.css}\n</style>\n</head>`);
  }
  return undefined;
}

function findHtmlAccessor(start: object): PropertyDescriptor | undefined {
  for (let p: object | null = start; p && p !== Object.prototype; p = Object.getPrototypeOf(p) as object | null) {
    const descriptor = Object.getOwnPropertyDescriptor(p, 'html');
    if (descriptor && typeof descriptor.get === 'function' && typeof descriptor.set === 'function') {
      return descriptor;
    }
  }
  return undefined;
}

/**
 * 借一个临时 webview 取到 webview 类的原型: 别的扩展的 webview 拿不到, API 也没有暴露类.
 * 建完立刻 dispose, 不留在界面上.
 */
function borrowWebviewPrototype(): object {
  const panel = vscode.window.createWebviewPanel(PREVIEW_PROBE_VIEW_TYPE, 'emoji-patch', vscode.ViewColumn.Active, {});
  try {
    return Object.getPrototypeOf(panel.webview) as object;
  } finally {
    panel.dispose();
  }
}

let restoreAccessor: (() => void) | undefined;

/** 是否已装上 (仅内存). */
export function isPreviewPatched(): boolean {
  return restoreAccessor !== undefined;
}

/**
 * 在内存里劫持 webview 的 html 赋值: 命中任一预览规则就顺手把对应 CSS 插进那份 HTML 的 head.
 *
 * 为什么劫原型而不是包 `registerCustomEditorProvider`: 实测 MPE / 自带预览都抢不到 —— 扩展宿主
 * 启动 ~0.9s 内它们就注册完了 provider, 任何激活事件都晚于它; 原型级包装则与激活顺序无关.
 * 不改磁盘: 还原函数随时可以把原访问器装回去.
 */
export function installPreviewPatch(rules: readonly PreviewRule[]): PreviewResult {
  if (restoreAccessor) {
    return { installed: true, message: '已生效' };
  }
  let proto: object;
  try {
    proto = borrowWebviewPrototype();
  } catch (err) {
    return { installed: false, message: `取 webview 原型失败: ${err instanceof Error ? err.message : String(err)}` };
  }
  const descriptor = findHtmlAccessor(proto);
  if (!descriptor) {
    return { installed: false, message: 'webview 上找不到 html 访问器' };
  }
  const origGet = descriptor.get as () => string;
  const origSet = descriptor.set as (value: string) => void;
  try {
    Object.defineProperty(proto, 'html', {
      configurable: descriptor.configurable,
      enumerable: descriptor.enumerable,
      get(this: unknown): string {
        return origGet.call(this) as string;
      },
      set(this: unknown, value: string): void {
        const injected = typeof value === 'string' ? injectPreviewCss(value, rules) : undefined;
        origSet.call(this, injected ?? value);
      },
    });
  } catch (err) {
    return { installed: false, message: `包装 html 访问器失败: ${err instanceof Error ? err.message : String(err)}` };
  }
  restoreAccessor = () => {
    if (restoreAccessor) {
      Object.defineProperty(proto, 'html', descriptor);
      restoreAccessor = undefined;
    }
  };
  return { installed: true, message: '已生效' };
}

/** 卸掉内存包装 (已经渲染出来的预览要重新打开才会恢复原样). */
export function uninstallPreviewPatch(): boolean {
  if (!restoreAccessor) {
    return false;
  }
  restoreAccessor();
  return true;
}
