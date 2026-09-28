import * as vscode from 'vscode';
import { MPE_PREVIEW_MARKER, PREVIEW_PROBE_VIEW_TYPE } from './const';

/** webview 的 html 访问器 (定义在 webview 类的原型上). */
interface HtmlAccessor {
  owner: object;
  descriptor: PropertyDescriptor;
}

export interface PreviewResult {
  installed: boolean;
  message: string;
}

/**
 * 把 emoji 的 `@font-face` 块插进 MPE 预览 HTML 的 head (纯字符串变换, 供测试).
 *
 * 只认 MPE 的预览 shell: 它带 `<meta id="crossnote-data">`, 正文由 webview 端用 innerHTML
 * 渲染进同一个 document, 所以往 head 里插 `<style>` 就能生效 (`style.less` 走的也是这条通道).
 * 命中不了就返回 undefined, 表示"这段 HTML 不归我们管".
 */
export function injectPreviewCss(html: string, block: string): string | undefined {
  if (!html.includes(MPE_PREVIEW_MARKER) || !html.includes('</head>')) {
    return undefined;
  }
  if (html.includes(block)) {
    return undefined;
  }
  return html.replace('</head>', `<style>\n${block}\n</style>\n</head>`);
}

function findHtmlAccessor(start: object): HtmlAccessor | undefined {
  for (let p: object | null = start; p && p !== Object.prototype; p = Object.getPrototypeOf(p) as object | null) {
    const descriptor = Object.getOwnPropertyDescriptor(p, 'html');
    if (descriptor && typeof descriptor.get === 'function' && typeof descriptor.set === 'function') {
      return { owner: p, descriptor };
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
 * 在内存里劫持 webview 的 html 赋值: 只要赋的是 MPE 预览 HTML, 就顺手把 emoji 字体块插进 head.
 *
 * 为什么劫原型而不是包 `registerCustomEditorProvider`: 实测 MPE 在扩展宿主启动 ~0.9s 前就
 * 注册完了 provider (两种激活场景都是), 包装注册函数会整个错过; 原型级的包装跟激活顺序无关.
 * 不改磁盘: 还原函数随时可以装回原访问器.
 */
export function installPreviewPatch(block: string): PreviewResult {
  if (restoreAccessor) {
    return { installed: true, message: '已生效' };
  }
  let proto: object;
  try {
    proto = borrowWebviewPrototype();
  } catch (err) {
    return { installed: false, message: `取 webview 原型失败: ${err instanceof Error ? err.message : String(err)}` };
  }
  const found = findHtmlAccessor(proto);
  if (!found) {
    return { installed: false, message: 'webview 上找不到 html 访问器' };
  }
  const { owner, descriptor } = found;
  const origGet = descriptor.get as () => string;
  const origSet = descriptor.set as (value: string) => void;
  Object.defineProperty(owner, 'html', {
    configurable: descriptor.configurable,
    enumerable: descriptor.enumerable,
    get(this: unknown): string {
      return origGet.call(this) as string;
    },
    set(this: unknown, value: string): void {
      const injected = typeof value === 'string' ? injectPreviewCss(value, block) : undefined;
      origSet.call(this, injected ?? value);
    },
  });
  restoreAccessor = () => {
    if (restoreAccessor) {
      Object.defineProperty(owner, 'html', descriptor);
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
