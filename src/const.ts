/** 注入到 workbench.html 的标记, 用于幂等替换/移除. */
export const MARKER_START = '/* == emoji-patch:start (auto-generated, do not edit) == */';
export const MARKER_END = '/* == emoji-patch:end == */';

/** MPE 预览 shell 的特征 (它带一个 `<meta id="crossnote-data">`). */
export const MPE_PREVIEW_MARKER = 'crossnote-data';
/** VSCode 自带 markdown 预览 shell 的特征 (`<meta id="vscode-markdown-preview-data">`). */
export const VSCODE_PREVIEW_MARKER = 'vscode-markdown-preview-data';
/** 注入自带预览时用的临时族名: 只覆盖 emoji 码点, 其余字符继续落到预览自己的字体. */
export const PREVIEW_FAMILY = 'EmojiPatchPreview';
/** 借 webview 原型时用的临时面板 viewType (只为拿类, 建完立刻 dispose). */
export const PREVIEW_PROBE_VIEW_TYPE = 'emojiPatchProbe';

/** markdowntable 扩展. */
export const MDT_EXT_ID = 'takumii.markdowntable';
export const MDT_HELPER_REL = 'out/markdownTableDataHelper.js';

/** 额外补进 unicode-range 的 CJK 全角字符 (MiSans 缺字, oxfmt 也算 2 格). */
export const EXTRA_CODEPOINTS: readonly number[] = [0x3030, 0x303d, 0x3297, 0x3299, 0x1f202, 0x1f237];

/** MPE (Markdown Preview Enhanced) 扩展 id. */
export const MPE_EXT_ID = 'shd101wyy.markdown-preview-enhanced';

export const EMOJI_SEQUENCES_URL = 'https://www.unicode.org/Public/emoji/latest/emoji-sequences.txt';

/** VS Code app 根目录下的相对路径. */
export const WORKBENCH_REL = 'out/vs/code/electron-browser/workbench/workbench.html';
export const PRODUCT_REL = 'product.json';
/** product.json 里对应 workbench.html 的 checksum key. */
export const CHECKSUM_KEY = 'vs/code/electron-browser/workbench/workbench.html';
