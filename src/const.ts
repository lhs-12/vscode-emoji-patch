/** 注入到 workbench.html 的标记, 用于幂等替换/移除. */
export const MARKER_START = '/* == emoji-patch:start (auto-generated, do not edit) == */';
export const MARKER_END = '/* == emoji-patch:end == */';

/** markdowntable 扩展. */
export const MDT_EXT_ID = 'takumii.markdowntable';
export const MDT_HELPER_REL = 'out/markdownTableDataHelper.js';

/**
 * 额外补进 unicode-range 的码点.
 *
 * 高频 VS16 字符: 这批基码默认是文字呈现 (EP=No), 本来被排除在 range 外;
 * 但 AI 输出里几乎总是带 VS16 写 (`⚠️` 而不是 `⚠`), 而带上 VS16 时会落到未缩放的
 * Noto Color Emoji 上 (2.50 格), 表格里就偏宽半格.
 *
 * unicode-range 逐码点生效, 无法区分带不带 VS16, 所以基码收进来之后两种写法都会变
 * 2.00 格彩色 (裸写法也因此不再是 1 格黑白). 取舍分析见
 * `.temp/vscode-emoji-sample.md` 的"特殊补充"章节.
 *
 * 下面四组分开写: 想临时关掉某一组, 把那一组整段注释掉即可.
 */

/** A 组: AI 输出高频 (`⚠️` `❤️` `✔️` `✖️` `☑️` `⚙️` …). */
const HIGH_FREQ_A: readonly number[] = [
  0x26a0, 0x2764, 0x2714, 0x2716, 0x2611, 0x2699, 0x2702, 0x2708, 0x2709, 0x270f, 0x2600, 0x2601, 0x2602, 0x2603,
  0x2744, 0x2747, 0x267b, 0x267e, 0x2763, 0x260e, 0x2692,
];

/** B 组: 箭头 / 播放控制 / 几何符号 (`➡️` `⬆️` `⏸️` `▪️` …). */
const HIGH_FREQ_B: readonly number[] = [
  0x27a1, 0x2b05, 0x2b06, 0x2b07, 0x2194, 0x2195, 0x2196, 0x2197, 0x2198, 0x2199, 0x21a9, 0x21aa, 0x2934, 0x2935,
  0x25b6, 0x25c0, 0x25aa, 0x25ab, 0x25fb, 0x25fc, 0x23cf, 0x23ed, 0x23ee, 0x23ef, 0x23f1, 0x23f2, 0x23f8, 0x23f9,
  0x23fa, 0x2328, 0x24c2,
];

/** C 组: 工具 / 设备类 (`🖥️` `🖨️` `🗑️` `🛠️` `🏔️` …). 裸写法现在还落在 Noto 上, 加进来是净改善. */
const HIGH_FREQ_C: readonly number[] = [
  0x1f5a5, 0x1f5a8, 0x1f5b1, 0x1f5d1, 0x1f5d2, 0x1f5fa, 0x1f5e3, 0x1f6e0, 0x1f3f3, 0x1f3f7, 0x1f3d4, 0x1f441, 0x1f321,
  0x1f58a, 0x1f5bc, 0x1f4fd, 0x1f5ef, 0x1f5e8, 0x1f39e, 0x1f3ce,
];

/** D 组: 裸写法就是正常正文符号 (`©` `®` `™` `‼` `♀` `♠` `☺` …), 取舍和前三组不同. */
const HIGH_FREQ_D: readonly number[] = [
  0x00a9, 0x00ae, 0x2122, 0x203c, 0x2049, 0x2139, 0x2640, 0x2642, 0x2660, 0x2665, 0x263a, 0x2712, 0x2618, 0x2620,
  0x26a7, 0x2696,
];

/** CJK 全角字符: MiSans 缺字, oxfmt 也算 2 格. */
const CJK_WIDE: readonly number[] = [0x3030, 0x303d, 0x3297, 0x3299, 0x1f202, 0x1f237];

/** 一次性并进 buildUnicodeRange 的补充码点. */
export const EXTRA_CODEPOINTS: readonly number[] = [
  ...CJK_WIDE,
  ...HIGH_FREQ_A,
  ...HIGH_FREQ_B,
  ...HIGH_FREQ_C,
  ...HIGH_FREQ_D,
];

export const EMOJI_SEQUENCES_URL = 'https://www.unicode.org/Public/emoji/latest/emoji-sequences.txt';

/** VS Code app 根目录下的相对路径. */
export const WORKBENCH_REL = 'out/vs/code/electron-browser/workbench/workbench.html';
export const PRODUCT_REL = 'product.json';
/** product.json 里对应 workbench.html 的 checksum key. */
export const CHECKSUM_KEY = 'vs/code/electron-browser/workbench/workbench.html';
