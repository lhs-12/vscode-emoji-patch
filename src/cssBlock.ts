/**
 * 生成注入用的 CSS 内容 (不含 <style> 包裹, 只含两个 @font-face).
 *
 * 原理: 抢用编辑器字体链第一个族的名字, 再用 local() 把真字体引回来.
 * - ① 让该族仍覆盖原字体 (fontconfig 按字重/斜体取对应字面)
 * - ② 在同一族名下只对 emoji 码点插入 Noto Color Emoji
 * 顺序敏感: 后写的 @font-face 生效, 所以 ② 必须在 ① 之后.
 */
export function buildCssBlock(opts: {
  codeFont: string;
  notoFamily: string;
  sizeAdjust: string;
  unicodeRange: string;
}): string {
  const font = opts.codeFont;
  return [
    `@font-face { font-family: "${font}"; src: local("${font}"); }`,
    `@font-face { font-family: "${font}"; src: local("${opts.notoFamily}"); size-adjust: ${opts.sizeAdjust}; unicode-range: ${opts.unicodeRange}; }`,
  ].join('\n');
}
