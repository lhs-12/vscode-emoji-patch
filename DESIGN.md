<h1><center>VSCode Emoji Patch (设计 + 参考)</center></h1>

插件 id: `lhs-12.emoji-patch`  
项目目录: `~/MyProjects/vscode-emoji-patch`

个人专用扩展: 让 VSCode 的 emoji 与 kitty 表现一致 (彩色 + 严格 2 格宽), 并让 markdowntable 的表格格式化改走 oxfmt.  
不含任何通用性设计, 不考虑发布 Marketplace.

---

# 目的

## 背景

VSCode (Electron/Chromium) 按 `editor.fontFamily` 列表逐字符取**第一个含该字形的字体**.  
Iosevka Term 自带 `✅❌` 字形, 所以显示为单色窄体; Chromium 没有 kitty 那种"按 emoji presentation 强制换字体"的逻辑, fontconfig 规则也无效 (它只带 family, 不带 charset).

要按码点分流, 只能用 **`@font-face` + `unicode-range`**.

之前是手工 patch: 改 `workbench.html` 注入 `<style>`, 同步 `product.json` 的 checksum, 并在 `editor.fontFamily` 最前加一个 patch 专用名字. 痛点:

- 要改好几处, 容易漏; 每次 VSCode 升级 `workbench.html` 被覆盖, 全部重来.
- Unicode 发布新 emoji 后要重新生成 `unicode-range`.
- patch 专用名字写进了 dotfiles 仓库里的 `settings.json`, 不想留.

## 目标

把上述流程收进一个个人专用扩展.

## 需求清单

| #   | 需求                        | 说明                                                              |
| --- | --------------------------- | ----------------------------------------------------------------- |
| 1   | 覆盖 style                  | 能往 workbench 注入 `@font-face` CSS (扩展 API 做不到, 见下)      |
| 2   | 隐式替换字体族              | 配置里不出现任何 patch 名字, 但运行时 emoji 走 Noto Color Emoji   |
| 3   | 升级后重新生效              | VSCode 升级后, 一条命令恢复 patch                                 |
| 4   | 更新 `unicode-range`        | 不升级 VSCode 也能刷新 emoji 码点集合                             |
| 5   | 劫持 markdowntable 的格式化 | 该插件所有会重排表格的操作都改走 oxfmt                            |

## 约束

- 幂等: 命令可重复执行, 结果只有一份配置.
- 不改 dotfiles 仓库里的 `settings.json`.
- VSCode 由 AUR 安装 (`visual-studio-code-bin`, 根目录属 root), 不能改成用户可写安装.

---

# 背景知识

## 为什么必须改 workbench.html

扩展运行在 extension host (Node 进程), 拿不到 workbench 的 DOM, 也**没有注入 CSS 的扩展 API**. 唯一能按码点改 editor 字体匹配的机制是**文档级 `@font-face` + `unicode-range`**, 而 `@font-face` 必须存在于 workbench 页面里.

"桥接字体"替代方案也走不通:

- 把 Noto Color Emoji 子集化成独立族名 → 就必须把这个族名写进 `editor.fontFamily` (与需求 2 冲突).
- 让桥接字体**冒用**代码字体的族名 (`Iosevka Term`) → 也不行: Chromium 向 fontconfig 请求一个族时只取**一个**字体, 且请求里不带 charset, 不会把同名的第二个字体并入该族. 结果要么抢不到 `U+2705`, 要么连普通字符一起坏掉.
- 顺带实测: `pyftsubset` 也处理不了 Noto 的 CBDT/CBLC 位图彩色表 (报 `Data must be consecutive in indexSubTable offset formats`), 子集化本身开箱即用不可行.

所以**改 `workbench.html` 是唯一路径**. 代价已压到最小: 只加一个带标记的 `<style>` 块, 可一键移除, 且 VSCode 升级会自动清除.

## `@font-face` 的能力边界

- `@font-face` 只是**定义**, 不被字体链引用就不生效 (手工方案靠 `editor.fontFamily` 里加名字; 本插件靠"族名顶替", 见下).
- **只按单码点匹配, 无法表达"必须带 VS16"**. 例如把 `U+2764` 放进 range, 单独的 `❤` 也会跟着变彩色.
- `unicode-range` 只限制**候选字体**; 字体缺字形会自动往后回落, 范围略宽不会强行换字形.
- 命中字符会从"单色单宽"变成"彩色双宽", 列对齐随之变化 —— 所以必须同时管住格式化工具的宽度口径 (见 [表格对齐](#表格对齐)).

## `size-adjust` 与"2 格"不变量

- Noto Color Emoji: upem 2048, advance 2550 = 1.2451em.
- 一个单元格 = 0.5em, 2 格 = 1.0em.
- `1.2451 × 0.803 ≈ 1.0`, 所以 `size-adjust: 80.3%` 让 emoji 恰好 2 格.
- 真正的对齐不变量是 **`advance == 整数倍单元格宽度`**; 不加 `size-adjust` 的话每个 emoji 比 2 格宽约 0.49 格, 表格末尾 `|` 会右偏.
- 代价: emoji 视觉缩小约 20%.

## `unicode-range` 的码点集合

取 kitty 的 `wide_emoji` 语义: **默认 emoji 呈现** (`Emoji_Presentation=Yes`) + 9 个修饰符基码.

规则 (由 UCD `emoji-sequences.txt` 生成):

- `Basic_Emoji`: 只取单码点项 (`len(tokens) < 2`), 即带 VS16 的项跳过.
- `RGI_Emoji_Flag_Sequence`: 取两个 regional indicator.
- `RGI_Emoji_Tag_Sequence`: 取首个码点 (`U+1F3F4`).
- `RGI_Emoji_Modifier_Sequence`: 取首个码点 (即那 9 个基码).
- 再把 6 个 CJK 全角字符并入集合: `U+3030` `U+303D` `U+3297` `U+3299` `U+1F202` `U+1F237`.

结果: **1243 个码点, 86 段** (相邻码点统一合并; 6 个 CJK 全角中有 4 个并入了相邻区间). 完整列表见 [附录](#附录-unicode-range-参考).

几个刻意的取舍:

- **不要**用完整的 Unicode `Emoji` 属性集合: 它含 keycap 基码 `0-9 # *`, 而 Noto 有这些字形 → 正文数字会全变彩色. 上面这份已排除.
- 末尾那 6 个 CJK 全角字符**不是** emoji, 但 MiSans 没有它们, 不补就会落到 `Noto Color Emoji` 渲染成 ~2.5 格; oxfmt 对它们按 2 格算 (全角), 所以补进 range (结果是彩色 2 格).
- 与 oxfmt (`unicode-width`) 的"2 格"集合相比只有 35 个已知差异, 均属有意保留:
  - 26 个单个 regional indicator: 国旗由两个 RI 组成, 两个都必须在 range 内才能触发 Noto 连字; 单个 RI 是边角.
  - 9 个 Emoji 18 新码点: oxfmt 内置 `unicode-width 0.2.2` 数据落后, 更新后即一致.
- `unicode-range` 之外还有 204 个窄 emoji (text presentation) 刻意排除, 以免把数字/键帽/普通符号染成彩色. 它们照旧回落到符号字体.

## oxfmt 的宽度口径

oxfmt 的单元格宽度以 Rust `unicode-width` 为准. 实测:

- `✅` = 2 格; `❤` = 1 格 / `❤️` = 2 格; `🏔` = 1 格 / `🏔️` = 2 格.

表格对齐的正确做法就是"让渲染宽度等于 oxfmt 的宽度", 这也是本插件把 markdowntable 的渲染出口接到 oxfmt 的原因.

---

# 整体方案

```
┌─────────────────────────── lhs-12.emoji-patch ───────────────────────────┐
│                                                                          │
│  A. 字体分流 (需求 2)                                                    │
│     生成两行 @font-face, 用"族名顶替"把 emoji 塞进现有字体链             │
│     —— 不改 settings.json                                                │
│                                                                          │
│  B. 注入 CSS (需求 1/3/4)                                                │
│     把 A 的 CSS 写入 workbench.html 的标记块                             │
│     + 重算 product.json checksum                                         │
│     + 重新加载窗口                                                       │
│     —— 通过 pkexec 提权                                                  │
│                                                                          │
│  C. 劫持表格格式化 (需求 5)                                              │
│     在内存里包装 markdowntable 的 toFormatTableStr, 走 oxfmt             │
│     —— 不改它的磁盘文件                                                  │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘
```

## A. 字体分流: 族名顶替

不新增字体族名, 而是**抢用**字体链里第一个族的名字, 再把真字体用 `local()` 引回来.

```css
/* ① 把 "Iosevka Term" 整个交还给系统 (fontconfig 会按字重/斜体取对应字面) */
@font-face { font-family: "Iosevka Term"; src: local("Iosevka Term"); }

/* ② 在同一族名下, 只对 emoji 码点插入 Noto Color Emoji —— 必须写在 ① 之后 */
@font-face {
  font-family: "Iosevka Term";
  src: local("Noto Color Emoji");
  size-adjust: 80.3%;
  unicode-range: <全部 emoji>;
}
```

于是 `editor.fontFamily` 保持纯字体列表, 仓库里不需要任何 patch 痕迹:

```jsonc
"editor.fontFamily": "'Iosevka Term', 'MiSans', 'MiSans L3','Symbols Nerd Font Mono','Noto Color Emoji'"
```

族名从 `editor.fontFamily` 的第一个族动态取得 (默认 `Iosevka Term`). 自动探测时会跳过早期手工方案用的 `EmojiPatch` 这个名字, 所以即使 dotfile 暂时没清干净也能正确顶替到真字体族.

### 实测依据 (本地 Edge / Chromium, 100px)

| 场景                                          | 实测宽度      | 结论                                       |
| --------------------------------------------- | ------------- | ------------------------------------------ |
| `✅` in `'Iosevka Term'`, 只写 ②               | 100.19        | `@font-face` 赢, 期望 1.245em × 80.3% = 100 |
| `X` in `'Iosevka Term'`, 只写 ②                | 72.22         | 系统 Iosevka 被整体顶替, 掉到兜底字体      |
| `X` in `'Iosevka Term'`, 写 ①+②                | 50            | 真 Iosevka 回归                            |
| `✅`, 写 ①+②                                   | 100.19        | emoji 仍走 Noto                            |
| 把 ② 写在 ① 之前                              | `✅` = 50     | 顺序敏感, **后写的 `@font-face` 生效**     |
| `local("DejaVu Sans")` 单条, 400 vs 700       | 388.92 → 416.52 | 真粗体被 fontconfig 取到                 |
| 无粗体字面的字体 (Century 等), 400 vs 700     | 相同          | 证明上一条不是伪粗体                       |

要点:

- ① **必须**写; 否则同族名被整体顶替, 普通字符会掉到兜底字体.
- ① 一条即可覆盖该族所有字重/斜体.
- ② 的 `unicode-range` 之外的字符 → 该族没有字形 → 照旧往后回落. 行为与手工 patch 时完全一致.

## B. 注入 CSS: 标记块 + checksum + pkexec

### 写入内容

在 `workbench.html` 的 `</head>` 之前插入带标记的块 (按该行缩进对齐):

```html
<style>
/* == emoji-patch:start (auto-generated, do not edit) == */
@font-face { font-family: "Iosevka Term"; src: local("Iosevka Term"); }
@font-face { font-family: "Iosevka Term"; src: local("Noto Color Emoji"); size-adjust: 80.3%; unicode-range: ...; }
/* == emoji-patch:end == */
</style>
```

替换逻辑: 若已存在 `:start` / `:end` 标记, 只替换两者之间; 否则插入新块, 并顺手清掉早期手工 patch 留下的、含 `EmojiPatch` 的旧 `<style>` 块.  
CSP 是 `style-src 'self' 'unsafe-inline'`, `file://` 外链样式会被拦, 所以只能内联.

### checksum 同步

VSCode 启动时校验 `product.json` 里 `workbench.html` 的 checksum, 不匹配会提示"安装损坏". 必须同步:

```
值   = base64(sha256(workbench.html 原始字节)).rstrip('=')
位置 = product.json -> vs/code/electron-browser/workbench/workbench.html
```

### 提权

`/usr/share/code/...` 属 `root:root`, 扩展进程是普通用户, 直接写会失败 (实测 `NOT writable`). 用 `pkexec`.

分工: **扩展负责所有计算, 特权脚本只负责拷贝**, 全程用临时目录, 不落任何持久缓存:

```
1. 扩展 (普通用户权限):
   tmp = mkdtemp('/tmp/emoji-patch-')            # 0700
   - 读 workbench.html -> 替换标记块 -> 写 tmp/workbench.html
   - 读 product.json   -> 只改那一个 checksum -> 写 tmp/product.json
   - 写 tmp/apply.sh  (#!/bin/bash + cp -f tmp/<file> <目标>, 路径全绝对)
2. spawnSync('pkexec', ['/bin/bash', tmp + '/apply.sh'])
   pkexec 会清洗环境, 所以脚本内不得依赖 PATH/变量
3. 成功 -> 删除 tmp/; 失败 -> 保留并提示用户手动 sudo bash tmp/apply.sh
```

- 先算后拷, 保证两个文件一致落盘.
- **不使用** `~/.cache/emoji-patch` 之类的数据目录.

### 生效

写完后执行 `workbench.action.reloadWindow`.

## C. 劫持格式化: 内存里包装 `toFormatTableStr`

markdowntable 所有会重排表格的操作 (Format all tables / Tab / Shift+Tab / Align / Move / Insert / TSV / CSV / formatOnSave) 都汇聚到**唯一函数** `toFormatTableStr`.

两个扩展跑在同一个 extension host 进程里, 且 VSCode 用**标准 Node `require`** 加载扩展:

```ts
// src/vs/workbench/api/node/extHostExtensionService.ts
if (mode === 'esm') { r = await import(module.toString(true)); }
else                { r = require(module.fsPath); }
```

所以只要拿到同一个模块对象, 改它的属性即可, **不需要碰磁盘文件**:

```js
const ext = vscode.extensions.getExtension('takumii.markdowntable');
const helper = require(path.join(ext.extensionPath, 'out', 'markdownTableDataHelper.js'));

if (!helper.__emojiPatchWrapped) {
  const orig = helper.toFormatTableStr;
  helper.toFormatTableStr = (tableData) => {
    const md = orig(tableData);
    const r = spawnSync(oxfmtPath, ['--stdin-filepath', 'x.md'], { input: md, encoding: 'utf8' });
    return (r.status === 0 && r.stdout) ? r.stdout.replace(/[\r\n]+$/, '') : md;   // 失败退回原样
  };
  helper.__emojiPatchWrapped = true;
}
```

有效的原因 (已核对编译产物):

- `out/commands.js:12` 是 `const mtdh = require("./markdownTableDataHelper");`, 整模块引入, 非解构.
- 11 处调用**全部**是 `mtdh.toFormatTableStr(...)`, 属性访问在调用时才解析, 所以改 `exports` 属性即生效.
- helper 内部的 2 处局部调用 (`tsvToTableData` / `insertColumn`) 会绕过包装, 但命令层随后会再用 `mtdh.toFormatTableStr` 重新渲染其结构, 仍会被覆盖.

必须用 `spawnSync`: `toFormatTableStr` 是同步函数, 且其返回值被同步用于计算光标位置. 下游会重新解析 oxfmt 的结果, 光标不受影响.

---

# 适用范围

| 区域         | 是否生效     | 说明                                                                                        |
| ------------ | ------------ | ------------------------------------------------------------------------------------------- |
| 编辑器       | ✅           | 走 `editor.fontFamily`, 覆盖普通编辑 / diff / Notebook 单元格                               |
| 终端         | ⚠️ 需对齐族名 | 走 `terminal.integrated.fontFamily`, 族名要和编辑器第一个族一致才能复用同一个 `@font-face` |
| 调试控制台   | ⚠️ 需对齐族名 | 走 `debug.console.fontFamily`, 同上                                                         |
| 独立 webview | ❌           | Markdown 预览 / Notebook 富输出 / 扩展面板 (Draw.io, Excalidraw…) 是独立文档, 用不到它      |

终端与调试控制台补齐写法 (关键是**族名一致**, 不再需要 `'EmojiPatch'`):

```jsonc
"terminal.integrated.fontFamily": "'Iosevka Term', monospace",
"debug.console.fontFamily": "'Iosevka Term', monospace",
```

> webview 里的 emoji 会直接落到 `Noto Color Emoji`, 是彩色但 ~2.5 格, 不经 `size-adjust`; 这是独立文档的固有限制.

---

# 表格对齐

## 为什么以 oxfmt 为准

- `oxfmt` (`oxc.oxc-vscode`) 的 markdown 格式化用 Rust `unicode-width`, emoji (含 ZWJ / VS16) 一律计 2 格.
- `takumii.markdowntable` 的 `getLen` 是**手写码点区间** (astral emoji 记 3 格, `⌚` 记 1 格), 到处算错. 所以只让它做**结构操作** (导航, 增删/移动行列, 对齐, TSV/CSV), 不允许它决定列宽 —— 本插件的做法就是把它唯一的渲染出口 `toFormatTableStr` 接到 oxfmt 上.
- Markdown Preview Enhanced 没有表格格式化 (只有预览端的 colspan/rowspan).

## 已知边角

- **单个 regional indicator** (`U+1F1E6-1F1FF`, 26 个, 如 `🇦`): `unicode-width` 算 1 格, Noto 渲染 2 格, oxfmt 会多补一个空格. 完整国旗 (两个 RI, 如 `🇨🇳`) 两边都是 2 格, 正常. 表里避免单个 RI.
- **text-presentation 的 emoji** (如 `🏔`): oxfmt 算 1 格, 但字体链末尾的 `Noto Color Emoji` 仍会把它渲染成 ~2.5 格 —— 属于无解项 (CSS 无法表达"必须带 VS16"), 表里避免. 写成带 VS16 的 `🏔️` 则两边都是 2 格.
- 本插件 `unicode-range` 之外的那 204 个窄 emoji 正是这一类, 刻意排除.

---

# 方案选用的考虑

## 为什么不用"重新注册同名命令"

VSCode 扩展宿主源码里写死了, 后注册者会直接抛错:

```ts
// src/vs/workbench/api/common/extHostCommands.ts
if (this._commands.has(id)) {
    throw new Error(`command '${id}' already exists`);
}
```

所以在自研扩展里注册 `markdowntable.*` 会失败. 只能包装实现或改文件.

## 为什么不改 markdowntable 的文件

改文件 (patch `out/markdownTableDataHelper.js`) 也能达到同样效果, 但要面对:

- 扩展升级后文件被整体替换, 需重新打补丁.
- 需要处理版本目录名变化 (`takumii.markdowntable-*`).
- 运行时改了文件, 已加载的模块不会重新加载, 需要重启扩展宿主.

而"内存里包装"完全没有这些问题. 唯一剩余风险是 markdowntable 改内部文件名/结构, 那时 require 路径失效 —— 用 `try/catch` 兜底, 并在命令结果里提示.

> 关于完整性校验: 已确认 `verifySignature` 只在**下载/安装/升级时**校验 `.vsix` 签名 (`extensionManagementService.downloadExtension`), **不校验已安装扩展的文件内容**. 所以即便是改文件方案也不会有"被判定损坏"的问题 —— 但既然内存包装更干净, 就不改文件.

## 为什么不写 `settings.json`

`settings.json` 是指向 dotfiles 仓库的符号链接, 写它等于把 patch 带进仓库, 且需求明确要求配置里不出现 patch 名字.

改用"族名顶替"后, `editor.fontFamily` 保持正常的字体列表即可, **无需任何写入**.

## 为什么用 pkexec 而不是"用户可写安装"

VSCode 由 AUR 安装, 安装脚本是现成的, 不应改动; `/usr/share/code` 属 root, 无法写.

- `pkexec`: 系统已装, 每次执行弹一次 polkit 授权. 代价是需求 3/4 各一次授权, 可接受.
- `sudo -n`: 需要免密配置, 引入额外系统配置, 放弃.
- `chmod g+w` 目标目录: pacman 升级后会重置, 不稳定, 放弃.

## 为什么不用 Custom CSS 扩展

`be5invis.vscode-custom-css` 之类同样要 patch `workbench.html` (并同步 checksum); 旧手工方案还要额外在 `editor.fontFamily` 里引用 `'EmojiPatch'`. 自己做能一并解决需求 3/4/5, 且不留这个引用.

## oxfmt 的 round-trip 差异 (需接受)

| 情形                                  | oxfmt 行为                    |
| ------------------------------------- | ----------------------------- |
| CRLF 行尾                             | 归一为 LF                     |
| ≥4 空格缩进的表                       | 视为代码块, **跳过重排**      |
| 行内代码里未转义的 `\|` (`` `a|b` ``) | 按 GFM 规范拆列 (应写作 `\|`) |
| 行尾多余的 leftover 单元格            | 补一个 `\|` (无害)            |
| `:---:` / 居中 / 右对齐               | 保留并重排                    |

## oxfmt 的调用方式

- `spawnSync` 调 CLI: 无需常驻, 每次格式化几十毫秒, 表格操作频率低, 够用.
- 不用 LSP: 常驻进程 + 生命周期管理复杂度不值得.
- 不用格式化 provider API (`vscode.executeFormatRangeProvider`): 它是异步的, 塞不进同步的 `toFormatTableStr`.
- oxfmt 路径: 优先取配置项, 其次自动探测 (PATH, mise 安装目录).

---

# 插件结构

## 命令

| 命令 id              | 标题               | 作用                                                                  |
| -------------------- | ------------------ | --------------------------------------------------------------------- |
| `emojiPatch.enable`  | Emoji Patch: 生效  | 生成 range + 重写 CSS 块 + 同步 checksum + 重载窗口 (= 应用/更新)     |
| `emojiPatch.disable` | Emoji Patch: 失效  | 删除 CSS 块并还原 checksum + 重载窗口                                 |

状态信息 (range 码点数 / 块是否存在 / 表格包装状态) 直接跟在两个命令的结果通知里, 不单独做 status 命令.

## 配置项

| 配置                             | 默认                          | 说明                                            |
| -------------------------------- | ----------------------------- | ----------------------------------------------- |
| `emojiPatch.codeRoot`            | `/usr/share/code/resources/app` | VSCode app 根目录                             |
| `emojiPatch.codeFont`            | `""`                          | 要顶替的族名; 空则自动取 `editor.fontFamily` 第一个族 |
| `emojiPatch.oxfmtPath`           | `""`                          | oxfmt 可执行文件路径; 空则自动探测               |
| `emojiPatch.notoFamily`          | `Noto Color Emoji`            | 颜色 emoji 字体族                                |
| `emojiPatch.sizeAdjust`          | `80.3%`                       | 缩放, 保证 emoji 恰好 2 格                       |
| `emojiPatch.patchMarkdownTable`  | `true`                        | 是否包装 markdowntable                           |

## 激活时机

`onStartupFinished`. 要保证在 markdowntable 被使用前完成包装 (内存包装与加载顺序无关, 但越早越稳).

## 目录结构

```
vscode-emoji-patch/
├── DESIGN.md                    # 本文档
├── README.md
├── mise.toml                    # 工具版本 (写法与全局一致, 直接复用已装版本)
├── package.json                 # 扩展清单 (id: lhs-12.emoji-patch)
├── aube-lock.yaml               # aube lockfile
├── tsconfig.json
├── .oxlintrc.json / .oxfmtrc.json
├── .vscodeignore
├── src/
│   ├── extension.ts             # activate / deactivate
│   ├── const.ts                 # 标记 / 常量 / 路径
│   ├── range.ts                 # 拉 emoji-sequences.txt -> unicode-range 字符串
│   ├── cssBlock.ts              # 生成两行 @font-face (族名顶替)
│   ├── workbench.ts             # 标记块注入/移除 + sha256 checksum 同步
│   ├── elevate.ts               # 临时目录 + 只做 cp 的脚本 + pkexec
│   ├── oxfmtPath.ts             # oxfmt 路径探测
│   ├── hijack.ts                # 内存包装 markdowntable 的 toFormatTableStr
│   └── commands.ts              # 生效 / 失效 两个命令
├── test/run.js                  # 无依赖测试 (21 项, 含端到端)
└── out/                         # 构建产物
```

## 关键实现细节

### unicode-range 生成

```
输入: https://www.unicode.org/Public/emoji/latest/emoji-sequences.txt
输出: "U+231A-231B, U+23E9-23EC, ... , U+1F202, U+1F237"
```

- 解析按 [上文规则](#unicode-range-的码点集合); 相邻码点合并成区间 (结果 86 段).
- 6 个 CJK 全角码点并入集合后一起合并.
- 网络失败时从当前 `workbench.html` 里已有的 `unicode-range` 读回 (不落缓存).

### CSS 块

固定用 `/* == emoji-patch:start == */` 与 `/* == emoji-patch:end == */` 包围, 只替换两者之间, 天然幂等.  
插入位置: `</head>` 之前 (按 `</head>` 行的缩进对齐). 读写按 UTF-8 原始字节, 不做损坏性转换.

### product.json 只做文本级替换

`product.json` 是带 tab 缩进的大文件, 绝不能 `JSON.parse` + `stringify` 整体重写. 只对那一个 checksum 做**文本级正则替换**:

```js
const re = /("vs\/code\/electron-browser\/workbench\/workbench\.html"\s*:\s*")[^"]*(")/;
text.replace(re, `$1${newChecksum}$2`);
```

这样其余内容 (含缩进/顺序) 一字节不变.

### 包装的幂等

用模块上的标记 (`helper.__emojiPatchWrapped`) 防止重复包装. 包装函数闭包缓存 `orig`.

---

# 工具链

遵循 oxc / VoidZero 生态, 包管理用 aube.

## mise.toml

项目自带 `mise.toml`, 只声明它真正用到的工具, 且版本写法与全局 `~/.config/mise/config.toml` **完全一致** —— mise 因此直接复用全局已装的版本, 不重复下载.

```toml
[tools]
node   = "lts"      # v24: 跑 test, 也是 aube 的宿主
oxfmt  = "latest"   # 兼具运行时依赖身份
aube   = "latest"
oxlint = "latest"
```

全局配置里与本项目无关的 (rust / java / maven / uv / ruff / stylua / gh / typst …) 不搬.

## 一览

| 用途       | 选择         | 来源            | 命令                                        |
| ---------- | ------------ | --------------- | ------------------------------------------- |
| Node       | node lts     | mise (全局复用) | `node`                                      |
| 包管理     | aube         | mise (全局复用) | `aube add -D <pkg>` / `aube install`        |
| 临时执行   | aubx         | aube            | `aubx @vscode/vsce package` (代替 npx)      |
| 运行脚本   | aubr         | aube            | `aubr build` (代替 npm run)                 |
| 语法检查   | oxlint       | mise (全局复用) | `oxlint src test`                           |
| 代码格式化 | oxfmt        | mise (全局复用) | `oxfmt src test package.json tsconfig.json` |
| 编译       | tsc          | devDependency   | `tsc -p .`                                  |
| 扩展打包   | @vscode/vsce | aubx            | `aubx @vscode/vsce package`                 |
| 运行时依赖 | **0 个**     | —               | 只用 Node 内置 + `vscode` API + spawn 外部 oxfmt |

## devDependencies

| 包              | 版本      | 说明                                                           |
| --------------- | --------- | -------------------------------------------------------------- |
| `@types/node`   | `^24`     | **必须与运行时 Node 同大版本** (见下)                          |
| `@types/vscode` | `1.138.0` | 与 `engines.vscode` 对齐, 取支持的最低版本而非现装版本         |
| `typescript`    | `^7.0.2`  | TS 7 (原生版); 见"为什么 typescript 不放 mise"                 |

`@types/node` 的版本规则: 它描述的是某个 Node 大版本的 API 面. 本项目的运行时是 **Node 24** —— mise 给的是 v24.21.0, VSCode 1.139.1 (Electron 43.6.0 / Chromium 150) 的 extension host 内置 Node 24.20.0. 装 `@types/node@26` 会让编译器放行只有 Node 26 才有的 API, 到运行时才炸, 所以固定 `^24`.

## 其它说明

- lockfile 为 `aube-lock.yaml`. aube 用全局内容寻址 store + 符号链接, 同版本依赖跨项目**本来就零重复** (实测本项目整个 `node_modules` 只有 88K).
- oxlint / oxfmt 由 mise 全局提供 (符合"开发工具用 mise"原则), 不进 devDependencies. oxfmt 例外之处在于它同时是扩展的**运行时**依赖: `src/oxfmtPath.ts` 按 `配置 > PATH > mise 安装目录` 顺序探测, 最终拿到的就是同一个二进制.
- **为什么 `typescript` 不放 mise**: 全局 mise 里本来就没有它, 搬过去等于新增安装, 谈不上"复用"; 而留在 devDependencies 能由 `aube-lock.yaml` 锁定编译版本, 让 `aube install` 一步到位. 若日后想让全局 TS 复用到多个项目, 可以改成: 全局 `config.toml` 与项目 `mise.toml` 都加 `"npm:typescript" = "7"`, 再从这里删掉它.
- 扩展规模很小 (零运行时依赖), `tsc` 直出 `out/` 即可, **不需要打包器**.
- 若日后确实要打单文件, 按偏好选 **rolldown** (VoidZero), 输出 CJS 并 externalize `vscode`.
- `@vscode/vsce` 是唯一非 oxc 生态的项 (微软官方的扩展打包工具), 无法替代.
- 项目自身的 lint/format 用 oxlint/oxfmt; 扩展**运行时**也调 oxfmt, 同一条链.

---

# 影响范围

本 patch 对系统的全部痕迹一览.

## 被写入的 VSCode 安装文件 (2 个, 需提权)

| 路径                                                                                     | 改动量                                                                            |
| ---------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `/usr/share/code/resources/app/out/vs/code/electron-browser/workbench/workbench.html`     | 插入/替换一个 `/* emoji-patch:start */ … /* emoji-patch:end */` 标记块             |
| `/usr/share/code/resources/app/product.json`                                             | **只改一个 key**: `checksums["vs/code/electron-browser/workbench/workbench.html"]` |

## 被"减少"内容的文件 (1 个)

| 路径                                                    | 改动                                              |
| ------------------------------------------------------- | ------------------------------------------------- |
| `~/.config/Code/User/settings.json` (→ dotfiles 符号链接) | 删掉手写的 `'EmojiPatch', ` 前缀, 以后不再需要    |

## 新增的文件/目录

| 路径                                                       | 说明                                                       |
| ---------------------------------------------------------- | ---------------------------------------------------------- |
| `~/.vscode/extensions/lhs-12.emoji-patch-<ver>/`           | 扩展本体                                                   |
| `~/.vscode/extensions/extensions.json`                     | VSCode 自己维护的扩展清单 (装/卸扩展必然变动)              |
| `/tmp/emoji-patch-<rand>/`                                 | 临时目录, 成功即删                                         |
| `~/.config/Code/User/globalStorage/lhs-12.emoji-patch/`    | 仅当扩展使用 `globalStorageUri` 时才存在; 本设计不使用     |

## 完全不改

| 对象                    | 说明                                            |
| ----------------------- | ----------------------------------------------- |
| markdowntable 的 `out/*.js` | 只在内存包装 `toFormatTableStr`             |
| 系统字体 / fontconfig   | 不新增字体文件, 只 `@font-face` 引用现有 Noto   |
| dotfiles 仓库其它文件   | —                                               |
| `~/.cache/emoji-patch`  | 不使用, 无持久数据目录                          |

## 生命周期

| 事件                       | 结果                                                                     |
| -------------------------- | ------------------------------------------------------------------------ |
| VSCode / pacman 升级       | `workbench.html` / `product.json` 被覆盖 → patch 痕迹**自动清零**, 跑一次"生效"恢复 (`settings.json` 不受影响) |
| `Emoji Patch: 失效`        | 删标记块并还原 checksum → 回到出厂状态                                   |
| 卸载扩展                   | 删 `~/.vscode/extensions/lhs-12.emoji-patch-*` → 无残留                  |
| 每日常态                   | 除 2 个安装文件的内容差异外零额外痕迹; 无后台进程                        |

---

# 排错与恢复

## 确认是否生效

- 看 `✅❌` 是否变彩色; 或 `Toggle Developer Tools` 里选中 `.monaco-editor` 看 computed `font-family`.
- 命令面板 → `Developer: Show Running Extensions`, 确认 `lhs-12.emoji-patch` 已激活.
- 扩展宿主日志里会有一行 `[emoji-patch] workbench: 已注入; 表格格式化: oxfmt`.

## 常见失败

| 现象                          | 处理                                                                                     |
| ----------------------------- | ---------------------------------------------------------------------------------------- |
| pkexec 弹窗没出现 / 被拒       | 错误通知里点"复制脚本路径", 再 `sudo bash <脚本>`; 效果与自动写入一致                    |
| 提示"安装损坏"                | checksum 没同步 (例如手工改了 `workbench.html`). 重跑一次"生效"即可                      |
| emoji 仍是单色                | 查 `editor.fontFamily` 第一个族是否与 `@font-face` 里的族名一致; 看扩展日志里的族名       |
| 表格仍按 markdowntable 宽度排 | 表格包装没生效 (缺 oxfmt 或 markdowntable 结构变了), 看命令结果通知里的提示               |

## 恢复原状

- 优先: 命令 `Emoji Patch: 失效`.
- 兜底: `sudo pacman -S visual-studio-code-bin` 重装, 直接覆盖那两个文件.
- 卸载: 扩展面板卸载 `lhs-12.emoji-patch`.

---

# 风险与遗留

| 项                                      | 说明                                          | 处理                                                |
| --------------------------------------- | --------------------------------------------- | --------------------------------------------------- |
| 族名顶替在真实 VSCode 里的表现          | 仅在本地 Edge 验证过; VSCode 用 Electron, 应一致 | 待真实 VSCode 里实测字重/斜体/连字/字号             |
| markdowntable 内部结构变化              | require 路径或函数名变化                      | try/catch + 命令结果里提示                          |
| pkexec 在扩展宿主的弹窗                 | 无 TTY, 依赖 polkit agent                     | 失败时给出脚本路径手动执行                          |
| VSCode 升级后 `product.json` 结构变化   | checksum key 位置                             | 找不到 key 时报错并保留临时脚本                     |
| 非 ASCII 路径 / 编码                    | `workbench.html` 读写                         | 按 UTF-8 字节处理, 不做编码转换                     |

# 里程碑

| # | 内容                                                                     | 状态 |
| - | ------------------------------------------------------------------------ | ---- |
| 1 | 骨架: 扩展激活, 注册 `生效` / `失效` 两个命令                            | ✅   |
| 2 | 内存包装 `toFormatTableStr`, 用真实 markdowntable 模块验证输出 == oxfmt  | ✅   |
| 3 | 按族名顶替法生成 CSS 块, 注入后 emoji 分流且普通文本不受影响             | ✅   |
| 4 | `pkexec` 提权写入 + checksum 同步 + 幂等 (假 pkexec + 假 codeRoot 端到端) | ✅   |
| 5 | 收尾: 移除 dotfiles 里 `'EmojiPatch', ` 前缀; 删除旧的 plan 文档          | 待办 |

未自动化的最后一步: 在真实的 root 目录上跑一次"生效"并接受 polkit 弹窗.

---

# 附录: unicode-range 参考

`Emoji_Presentation=Yes` (1228) + 9 个修饰符基码 + 6 个 CJK 全角 = 1243 个码点, 合并后 86 段:

```css
unicode-range:
    U+231A-231B, U+23E9-23EC, U+23F0, U+23F3, U+25FD-25FE, U+2614-2615,
    U+261D, U+2648-2653, U+267F, U+2693, U+26A1, U+26AA-26AB,
    U+26BD-26BE, U+26C4-26C5, U+26CE, U+26D4, U+26EA, U+26F2-26F3,
    U+26F5, U+26F9-26FA, U+26FD, U+2705, U+270A-270D, U+2728,
    U+274C, U+274E, U+2753-2755, U+2757, U+2795-2797, U+27B0,
    U+27BF, U+2B1B-2B1C, U+2B50, U+2B55, U+3030, U+303D,
    U+3297, U+3299, U+1F004, U+1F0CF, U+1F18E, U+1F191-1F19A,
    U+1F1E6-1F1FF, U+1F201-1F202, U+1F21A, U+1F22F, U+1F232-1F23A, U+1F250-1F251,
    U+1F300-1F320, U+1F32D-1F335, U+1F337-1F37C, U+1F37E-1F393, U+1F3A0-1F3CC, U+1F3CF-1F3D3,
    U+1F3E0-1F3F0, U+1F3F4, U+1F3F8-1F43E, U+1F440, U+1F442-1F4FC, U+1F4FF-1F53D,
    U+1F54B-1F54E, U+1F550-1F567, U+1F574-1F575, U+1F57A, U+1F590, U+1F595-1F596,
    U+1F5A4, U+1F5FB-1F64F, U+1F680-1F6C5, U+1F6CC, U+1F6D0-1F6D2, U+1F6D5-1F6D9,
    U+1F6DC-1F6DF, U+1F6EB-1F6EC, U+1F6F4-1F6FC, U+1F7E0-1F7EB, U+1F7F0, U+1F90C-1F93A,
    U+1F93C-1F945, U+1F947-1F9FF, U+1FA70-1FA7C, U+1FA80-1FAC6, U+1FAC8, U+1FACC-1FADD,
    U+1FADF-1FAEB, U+1FAEF-1FAFA;
```

平时不用手算, 格式化成上面结果的逻辑在 `src/range.ts`. 单独跑一遍 (仅当 Unicode 发新版需要核对时, 需联网):

```bash
python3 - <<'PY'
import urllib.request

def parse(spec):
    s = spec.strip()
    if '..' in s:
        a, b = s.split('..')
        return set(range(int(a, 16), int(b, 16) + 1))
    return {int(s, 16)}

wide = set()
url = 'https://www.unicode.org/Public/emoji/latest/emoji-sequences.txt'
for line in urllib.request.urlopen(url).read().decode().splitlines():
    line = line.strip()
    if not line or line.startswith('#'):
        continue
    fields = [x.strip() for x in line.split(';')]
    data, etype = fields[0], fields[1]
    toks = data.split()
    if etype == 'Basic_Emoji':
        if len(toks) < 2:
            wide |= parse(toks[0])
    elif etype == 'RGI_Emoji_Flag_Sequence':
        wide |= {int(toks[0], 16), int(toks[1], 16)}
    elif etype in ('RGI_Emoji_Tag_Sequence', 'RGI_Emoji_Modifier_Sequence'):
        wide |= parse(toks[0])

# MiSans 缺的 CJK 全角字符
wide |= {0x3030, 0x303D, 0x3297, 0x3299, 0x1F202, 0x1F237}

ps = sorted(wide)
ranges, st, pr = [], ps[0], ps[0]
for x in ps[1:]:
    if x == pr + 1:
        pr = x
    else:
        ranges.append((st, pr)); st = pr = x
ranges.append((st, pr))
print(', '.join(f'U+{a:04X}-{b:04X}' if b > a else f'U+{a:04X}' for a, b in ranges))
PY
```
