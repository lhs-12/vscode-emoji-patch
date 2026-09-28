<h1><center>VSCode Emoji Patch 插件设计</center></h1>

插件 id: `lhs-12.emoji-patch`  
项目目录: `~/MyProjects/vscode-emoji-patch`

---

# 目的

## 背景

当前为了让 VSCode 里的 emoji 与 kitty 表现一致 (彩色 + 严格 2 格宽, 与 oxfmt 表格对齐一致), 采用手工 patch 的方式:

- 改 `/usr/share/code/resources/app/out/vs/code/electron-browser/workbench/workbench.html`, 注入 `<style>` (`@font-face` + `unicode-range`).
- 同步改 `product.json` 里的 checksum.
- 手写 `editor.fontFamily` 加 `'EmojiPatch'`.

痛点:

- 要改好几处, 容易漏.
- VSCode 每次升级 `workbench.html` 被覆盖, 全部重来.
- Unicode 发布新 emoji 后, `unicode-range` 需要重新生成.
- `editor.fontFamily` 里出现 patch 专用名字, 且这个文件是 dotfiles 仓库的, 不想让 patch 进仓库.

## 目标

做一个**个人专用**的 VSCode 扩展, 把上述流程自动化. 不考虑通用性, 不考虑发布到 Marketplace, 不考虑对别人环境的兼容.

## 需求清单

| #   | 需求                        | 说明                                                            |
| --- | --------------------------- | --------------------------------------------------------------- |
| 1   | 覆盖 style                  | 能往 workbench 注入 `@font-face` CSS (扩展 API 做不到, 见下)    |
| 2   | 隐式替换字体族              | 配置里不出现任何 patch 名字, 但运行时 emoji 走 Noto Color Emoji |
| 3   | 升级后重新生效              | VSCode 升级后, 一条命令恢复 patch                               |
| 4   | 更新 `unicode-range`        | 不升级 VSCode 也能刷新 emoji 码点集合                           |
| 5   | 劫持 markdowntable 的格式化 | 该插件所有会重排表格的操作都改走 oxfmt                          |

约束:

- 幂等: 命令可重复执行, 结果只有一份配置.
- 不改 dotfiles 仓库里的 `settings.json`.
- VSCode 由 AUR 安装 (`visual-studio-code-bin`, 根目录属 root), 不能改成用户可写安装.

---

# 必要的背景知识

## 为什么必须用 `@font-face`

VSCode 的 `editor.fontFamily` 是一串 CSS font-family. 字体匹配按列表顺序找**第一个含该字形的字体**.

- 代码字体 (Iosevka Term) 含 `U+2705` `U+274C`, 于是这两个码点被它抢走, 渲染成窄体单色.
- 想让指定码点走 Noto Color Emoji, 只有 CSS `@font-face` + `unicode-range` 能做到按码点分流, 且能带 `size-adjust`.
- 扩展运行在 extension host (Node 进程), **没有**往 workbench 注入 CSS 的 API. 所以只能"改 `workbench.html`", 与现在手工做法同路, 区别只是自动化.

### 为什么这件事无法"只在内存里做"

扩展运行在 extension host, 拿不到 workbench 的 DOM, 也**没有注入 CSS 的扩展 API**. 唯一能按码点改 editor 字体匹配的机制是**文档级 `@font-face` + `unicode-range`**, 而 `@font-face` 必须存在于 workbench 页面里.

"桥接字体"替代方案也走不通:

- 把 Noto Color Emoji 子集化成独立族名 → 就必须把这个族名写进 `editor.fontFamily` (与需求 2 冲突).
- 让桥接字体**冒用**代码字体的族名 (`Iosevka Term`) → 也不行: Chromium 向 fontconfig 请求一个族时只取**一个**字体, 且请求里不带 charset, 不会把同名的第二个字体并入该族. 结果要么抢不到 `U+2705`, 要么连普通字符一起坏掉.
- 顺带实测: `pyftsubset` 也处理不了 Noto 的 CBDT/CBLC 位图彩色表 (报 `Data must be consecutive in indexSubTable offset formats`), 子集化本身开箱即用不可行.

所以**改 `workbench.html` 是唯一路径**. 代价已压到最小: 只加一个带标记的 `<style>` 块, 可一键移除, 且 VSCode 升级会自动清除.

## `size-adjust: 80.3%`

- Noto Color Emoji: upem 2048, advance 2550 = 1.2451em.
- 一个单元格 = 0.5em. 2 格 = 1.0em.
- `1.2451 × 0.803 ≈ 1.0`. 所以 `size-adjust: 80.3%` 让 emoji 恰好 2 格.
- 判定标准是 `advance == 整数倍单元格宽度`, 这是真正的对齐不变量.

## `unicode-range` 的码点集合

取 kitty 的 `wide_emoji` 语义: **默认 emoji 呈现** (`Emoji_Presentation=Yes`) + 9 个修饰符基码.

由 UCD `emoji-sequences.txt` 生成, 规则:

- `Basic_Emoji`: 只取单码点项 (`len(tokens) < 2`).
- `RGI_Emoji_Flag_Sequence`: 取两个 regional indicator.
- `RGI_Emoji_Tag_Sequence`: 取首个码点 (`U+1F3F4`).
- `RGI_Emoji_Modifier_Sequence`: 取首个码点 (即那 9 个基码).

末尾再把 6 个 CJK 全角字符并入集合 (MiSans 缺字, 且 oxfmt 也算 2 格):

```
U+3030, U+303D, U+3297, U+3299, U+1F202, U+1F237
```

结果: **1243 个码点, 86 段** (相邻码点统一合并; 6 个 CJK 全角中有 4 个已并入相邻区间).

与 oxfmt (`unicode-width`) 的"2 格"集合相比只有 35 个已知差异, 均属有意保留:

- 26 个单个 regional indicator: 国旗由两个 RI 组成, 两个 RI 都必须在 range 内才能触发 Noto 的连字. 单个 RI 是边角 (kitty 算 2, oxfmt 算 1).
- 9 个 Emoji 18 新码点: oxfmt 内置 `unicode-width 0.2.2` 数据落后, 其后更新即一致.

`unicode-range` 之外还有 204 个窄 emoji (text presentation) 刻意排除, 以免把数字/键帽/普通符号染成彩色. 它们照旧回落到符号字体.

## oxfmt 的表格宽度

oxfmt 的单元格宽度以 `unicode-width` 为准. 实测:

- `✅` = 2 格, `❤` = 1 格 / `❤️` = 2 格.
- `🏔` = 1 格 / `🏔️` = 2 格.

表格对齐的正确做法就是"让渲染宽度等于 oxfmt 的宽度", 这也是选择 oxfmt 作为唯一格式化器的原因.

---

# 整体方案

扩展由三块互相独立的机制组成, 分别对应需求.

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

不新增字体族名字, 而是**抢用**用户字体链里第一个族的名字, 再把真字体用 `local()` 引回来.

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

族名从 `editor.fontFamily` 的第一个族动态取得 (默认 `Iosevka Term`).

### 实测依据 (本地 Edge / Chromium, 100px)

| 场景 | 实测宽度 | 结论 |
| --- | --- | --- |
| `✅` in `'Iosevka Term'`, 只写 ② | 100.19 | `@font-face` 赢, 期望 1.245em × 80.3% = 100 |
| `X` in `'Iosevka Term'`, 只写 ② | 72.22 | 系统 Iosevka 被整体顶替, 掉到兜底字体 |
| `X` in `'Iosevka Term'`, 写 ①+② | 50 | 真 Iosevka 回归 |
| `✅`, 写 ①+② | 100.19 | emoji 仍走 Noto |
| 把 ② 写在 ① 之前 | `✅` = 50 | 顺序敏感, **后写的 `@font-face` 生效** |
| `local("DejaVu Sans")` 单条, 400 vs 700 | 388.92 → 416.52 | 真粗体被 fontconfig 取到 |
| 无粗体字面的字体 (Century 等), 400 vs 700 | 相同 | 证明上一条不是伪粗体 |

要点:

- ① 必须写; 否则同族名被整体顶替, 普通字符会掉到兜底字体.
- ① 一条即可覆盖该族所有字重/斜体.
- ② 的 `unicode-range` 之外的字符 → 该族没有字形 → 照旧往后回落. 行为与手工 patch 时**完全一致**.

## B. 注入 CSS: 标记块 + checksum + pkexec

### 写入内容

在 `workbench.html` 的 `</style>` 之前 (或 `</head>` 之前) 写入带标记的块, 便于幂等替换:

```html
<style>
/* == emoji-patch:start (auto-generated, do not edit) == */
@font-face { font-family: "Iosevka Term"; src: local("Iosevka Term"); }
@font-face { font-family: "Iosevka Term"; src: local("Noto Color Emoji"); size-adjust: 80.3%; unicode-range: ...; }
/* == emoji-patch:end == */
</style>
```

替换逻辑: 若已存在 `:start` / `:end` 标记, 只替换两者之间; 否则插入新块.

### checksum 同步

VSCode 启动时校验 `product.json` 里 `workbench.html` 的 checksum, 不匹配会提示安装损坏. 必须同步:

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

- 先算后拷, 保证两个文件一致地落盘.
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
    return (r.status === 0 && r.stdout) ? r.stdout : md;   // 失败退回原样
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

而"内存里包装"完全没有这些问题. 唯一剩余风险是 markdowntable 改内部文件名/结构, 那时 require 路径失效 —— 用 `try/catch` 兜底, 并在状态命令里提示.

> 关于完整性校验: 已确认 `verifySignature` 只在**下载/安装/升级时**校验 `.vsix` 签名 (`extensionManagementService.downloadExtension`), **不校验已安装扩展的文件内容**. 所以即使是改文件方案也不会有"被判定损坏"的问题 —— 但既然内存包装更干净, 就不改文件.

## 为什么不写 `settings.json`

`settings.json` 是指向 dotfiles 仓库的符号链接, 写它等于把 patch 带进仓库. 且需求明确要求配置里不出现 patch 名字.

改用"族名顶替"后, 只需 `editor.fontFamily` 保持正常的字体列表即可, **无需任何写入**.

## 为什么用 pkexec 而不是"用户可写安装"

VSCode 由 AUR 安装, 安装脚本是现成的, 不应改动; `/usr/share/code` 属 root, 无法写.

- `pkexec`: 系统已装, 每次执行弹一次 polkit 授权. 代价是每点 3/点 4 一次授权, 可接受.
- `sudo -n`: 需要免密配置, 引入额外系统配置, 放弃.
- `chmod g+w` 目标目录: pacman 升级后会重置, 不稳定, 放弃.

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
- oxfmt 路径: 优先取配置项, 其次自动探测 (`which oxfmt`, mise 安装目录).

---

# 插件结构

## 命令

| 命令 id | 标题 | 作用 |
| --- | --- | --- |
| `emojiPatch.enable` | Emoji Patch: 生效 | 生成 range + 重写 CSS 块 + 同步 checksum + 重载窗口 (= 应用/更新) |
| `emojiPatch.disable` | Emoji Patch: 失效 | 删除 CSS 块并还原 checksum + 重载窗口 |

状态信息 (range 码点数 / 块是否存在 / markdowntable 包装状态) 直接跟在两个命令的执行结果通知里, 不单独做 status 命令.

## 配置项

| 配置 | 默认 | 说明 |
| --- | --- | --- |
| `emojiPatch.codeRoot` | `/usr/share/code/resources/app` | VSCode app 根目录 |
| `emojiPatch.codeFont` | `""` | 要顶替的族名; 空则自动取 `editor.fontFamily` 的第一个族 |
| `emojiPatch.oxfmtPath` | `""` | oxfmt 可执行文件路径; 空则自动探测 |
| `emojiPatch.notoFamily` | `Noto Color Emoji` | 颜色 emoji 字体族 |
| `emojiPatch.sizeAdjust` | `80.3%` | 缩放, 保证 emoji 恰好 2 格 |
| `emojiPatch.patchMarkdownTable` | `true` | 是否包装 markdowntable |

## 激活时机

`onStartupFinished`. 要保证在 markdowntable 被使用前完成包装 (内存包装与加载顺序无关, 但越早越稳).

## 目录结构

```
vscode-emoji-patch/
├── DESIGN.md
├── README.md
├── package.json                 # 扩展清单 (id: lhs-12.emoji-patch)
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

- 解析按上文规则; 相邻码点合并成区间 (结果 86 段).
- 6 个 CJK 全角码点并入集合后一起合并.
- 网络失败时从当前 `workbench.html` 里已有的 `unicode-range` 读回 (不落缓存).

### CSS 块

固定用 `/* == emoji-patch:start == */` 与 `/* == emoji-patch:end == */` 包围, 只替换两者之间, 天然幂等.

具体插入位置: `</head>` 之前 (按 `</head>` 行的缩进对齐). 读写按 UTF-8 原始字节, 不做损坏性转换.

### product.json 只做文本级替换

`product.json` 是带 tab 缩进的大文件, 绝不能 `JSON.parse` + `stringify` 整体重写. 只对那一个 checksum 做**文本级正则替换**:

```js
const re = /("vs\/code\/electron-browser\/workbench\/workbench\.html"\s*:\s*")[^"]*(")/;
text.replace(re, `$1${newChecksum}$2`);
```

这样其余内容 (含缩进/顺序) 一字节不变.

### 数据获取

每次执行 `apply` 时直接联网拉 `emoji-sequences.txt` 解析, 不落缓存. 网络失败时回退: 从当前 `workbench.html` 里已有的 `unicode-range` 读出上次的码点集合.

### 包装的幂等

用模块上的标记 (`helper.__emojiPatchWrapped`) 防止重复包装. 包装函数闭包缓存 `orig`.

---

# 工具链

遵循 oxc / VoidZero 生态, 包管理用 aube.

| 用途 | 选择 | 命令 |
| --- | --- | --- |
| 包管理 | aube | `aube add -D <pkg>` / `aube install` |
| 临时执行 | aubx | `aubx @vscode/vsce package` (代替 npx) |
| 运行脚本 | aubr | `aubr build` (代替 npm run) |
| 语法检查 | oxlint | `oxlint` |
| 代码格式化 | oxfmt | `oxfmt .` |
| 编译 | tsc | `tsc -p .` |
| 扩展打包 | @vscode/vsce | `aubx @vscode/vsce package` |
| 运行时依赖 | **0 个** | 只用 Node 内置 + `vscode` API + spawn 外部 oxfmt |

说明:

- lockfile 为 `aube-lock.yaml`.
- oxlint / oxfmt 由 **mise** 全局提供 (符合"开发工具用 mise"原则), 不进 devDependencies.
- 扩展规模很小 (零运行时依赖), `tsc` 直出 `out/` 即可, **不需要打包器**.
- 若日后确实要打单文件, 按你的偏好选 **rolldown** (VoidZero), 输出 CJS 并 externalize `vscode`.
- `@vscode/vsce` 是唯一非 oxc 生态的项 (微软官方的扩展打包工具), 无法替代.
- 项目自身的 lint/format 用 oxlint/oxfmt; 扩展**运行时**也调 oxfmt, 同一条链.

---

# 影响范围

本 patch 对系统的全部痕迹一览.

## 被写入的 VSCode 安装文件 (2 个, 需提权)

| 路径 | 改动量 |
| --- | --- |
| `/usr/share/code/resources/app/out/vs/code/electron-browser/workbench/workbench.html` | 插入/替换一个 `/* emoji-patch:start */ … /* emoji-patch:end */` 标记块 |
| `/usr/share/code/resources/app/product.json` | **只改一个 key**: `checksums["vs/code/electron-browser/workbench/workbench.html"]` |

## 被"减少"内容的文件 (1 个)

| 路径 | 改动 |
| --- | --- |
| `~/.config/Code/User/settings.json` (→ dotfiles 仓库符号链接) | 删掉手写的 `'EmojiPatch', ` 前缀, 以后不再需要 |

## 新增的文件/目录

| 路径 | 说明 |
| --- | --- |
| `~/.vscode/extensions/lhs-12.emoji-patch-<ver>/` | 扩展本体 |
| `~/.vscode/extensions/extensions.json` | VSCode 自己维护的扩展清单 (装/卸扩展必然变动) |
| `/tmp/emoji-patch-<rand>/` | 临时目录, 成功即删 |
| `~/.config/Code/User/globalStorage/lhs-12.emoji-patch/` | 仅当扩展使用 `globalStorageUri` 时才存在; 本设计不使用 |

## 完全不改

| 对象 | 说明 |
| --- | --- |
| markdowntable 的 `out/*.js` | 只在内存包装 `toFormatTableStr` |
| 系统字体 / fontconfig | 不新增字体文件, 只 `@font-face` 引用现有 Noto |
| dotfiles 仓库其它文件 | — |
| `~/.cache/emoji-patch` | 不使用, 无持久数据目录 |

## 生命周期

| 事件 | 结果 |
| --- | --- |
| VSCode 升级 | `workbench.html` / `product.json` 被覆盖 → patch 痕迹**自动清零**, 跑一次"应用"恢复 |
| `emojiPatch.disable` | 删标记块并还原 checksum → 回到出厂状态 |
| 卸载扩展 | 删 `~/.vscode/extensions/lhs-12.emoji-patch-*` → 无残留 |
| 每日常态 | 除 2 个安装文件的内容差异外, 零额外痕迹; 无后台进程 |

---

# 风险与待验证

| 项 | 说明 | 处理 |
| --- | --- | --- |
| 族名顶替在真实 VSCode 里的表现 | 目前仅在本地 Edge 验证; VSCode 用 Electron, 应一致 | 骨架阶段实测: 字重/斜体/连字/字号是否正常 |
| markdowntable 内部结构变化 | require 路径或函数名变化 | try/catch + 状态命令提示 |
| pkexec 在扩展宿主的弹窗 | 无 TTY, 依赖 polkit agent | 实测; 失败给出脚本路径手动执行 |
| VSCode 升级后 `product.json` 结构变化 | checksum key 位置 | 状态命令检测并提示 |
| 非 ASCII 路径/编码 | `workbench.html` 读写编码 | 按字节处理 (`Buffer`), 不做编码转换 |

---

# 里程碑 (全部完成)

| # | 内容 | 状态 |
| --- | --- | --- |
| 1 | 骨架: 扩展激活, 注册 `生效` / `失效` 两个命令 | ✅ |
| 2 | 点在内存包装 `toFormatTableStr`, 用真实 markdowntable 模块验证输出 == oxfmt | ✅ |
| 3 | 按族名顶替法生成 CSS 块, 注入后 emoji 分流且普通文本不受影响 | ✅ |
| 4 | `pkexec` 提权写入 + checksum 同步 + 幂等 (用假 pkexec + 假 codeRoot 做端到端) | ✅ |
| 5 | 收尾: 移除 dotfiles 里 `'EmojiPatch', ` 前缀; 更新 `software-config` 的 plan 文档 | 待办 |

未自动化的最后一步: 在真实的 root 目录上跑一次 "生效" 并接受 polkit 弹窗.
