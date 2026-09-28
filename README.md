<h1><center>Emoji Patch (VSCode 扩展)</center></h1>

个人专用小扩展, 给 VSCode 补两件事:

1. emoji 用彩色的 **Noto Color Emoji** 显示, 并且严格占 2 格宽 (编辑器 / 终端 / Markdown 预览);
2. markdown 表格的列宽改由 **oxfmt** 计算, 不再用 markdowntable 自带那套.

只服务本机这套环境 (Linux + AUR 装的 VSCode), 不打算发到 Marketplace.

## 装之前 / 装之后

| 场景                                                    | 装之前                                                   | 装之后                                  |
| ------------------------------------------------------- | -------------------------------------------------------- | --------------------------------------- |
| `✅` `❌` `🎉` 这类 emoji                               | 用正文的等宽字体画, 黑白、窄                             | 走 Noto Color Emoji, 彩色, 正好 2 格宽  |
| emoji 混在中文或表格里                                  | 宽度对不上, 表格竖线跟着歪                               | 宽度与中文一致, 不用再手动补空格        |
| markdown 表格格式化 (Tab 跳格 / 对齐 / Format Document) | markdowntable 自己数字符宽度, 碰到 emoji、全角符号会算错 | 交给 oxfmt 算, 和你手写表格时的口径一致 |
| Markdown 预览 (MPE / VSCode 自带)                       | emoji 黑白、偏窄 (走预览自己的字体)                      | 和编辑器一致: 彩色, 恰好 2 格宽         |

## 具体改了哪四处

1. **emoji 换字体** —— 只影响 emoji 码点. 其它字符仍然用你配置的第一个字体 (默认 `Iosevka Term`), 字重、斜体、连字都照旧.
2. **宽度锁成 2 格** —— 为此 emoji 被整体缩到 80.3%, 看起来比 Noto 原本的尺寸小一圈; 换来的是和中文一样宽, 表格不再错位.
3. **表格格式化换工具** —— markdowntable 的增删行列、Tab 跳格、对齐等操作都改走 oxfmt. 它的安装文件没有被改过, 关掉本扩展就回到原样.
4. **两种 Markdown 预览也注入同一份字体** —— 拦下预览插件 / VSCode 渲染预览时写的 HTML, 在内存里把 CSS 插进它的 `head`. 不写任何文件: `~/.config/crossnote/` (包括 `style.less`)、MPE 扩展目录、`settings.json` 都没改过.

## 哪些地方生效

| 区域                             | 是否生效 | 说明                                                                          |
| -------------------------------- | -------- | ----------------------------------------------------------------------------- |
| 编辑器                           | ✅       | 普通编辑、diff、Notebook 单元格                                               |
| 终端 / 调试控制台                | 部分     | 这两处的字体是单独的配置项. 把它们的字体族写成和编辑器第一个族一样即可 (见下) |
| MPE 的 Markdown 预览             | ✅       | 需要它的 `font-family` 第一个族和编辑器相同 (本机已在 `style.less` 里统一)    |
| VSCode 自带的 Markdown 预览      | ✅       | 不需要额外配置; 预览自己的字体 (含 `markdown.preview.fontFamily`) 照旧生效    |
| 其它预览 / 扩展面板 (Draw.io 等) | ❌       | 独立文档, 用不到; 这类地方的 emoji 会直接落到 Noto Color Emoji, 彩色但偏宽    |

终端与调试控制台补齐写法:

```jsonc
"terminal.integrated.fontFamily": "'Iosevka Term', monospace",
"debug.console.fontFamily": "'Iosevka Term', monospace",
```

## 命令

| 命令                | 作用                                                                               |
| ------------------- | ---------------------------------------------------------------------------------- |
| `Emoji Patch: 生效` | 写入样式并让 VSCode 认可, 然后在提示里点"重新加载窗口"; 已经生效时会提示"无需变更" |
| `Emoji Patch: 失效` | 全部还原, 同样在提示里点"重新加载窗口"                                             |

两个命令都在命令面板 (`Ctrl+Shift+P`) 里搜 `Emoji Patch`.

预览注入不需要提权, 但同样受这两个命令开关控制; 重载窗口后也会自动恢复到当前状态. 已经开着的预览要**重新打开**才会吃到 (预览只在创建时读一次 HTML).

## 上手 (拿到项目之后)

### 1. 装依赖

```bash
mise install    # 工具: node / aube / oxlint / oxfmt
                # 版本与全局 mise 配置一致, 本机已装的话直接复用, 不会重复下载

aube install    # 包依赖: @types/node, @types/vscode, typescript
```

### 2. 编译并装进 VSCode

```bash
aubr package                                         # 生成 emoji-patch-<版本>.vsix

code --install-extension emoji-patch-*.vsix --force   # 装 (已经装过就覆盖)
```

装完重载 VSCode 窗口 (或重启) 让扩展加载.

### 3. 让它生效

命令面板 → `Emoji Patch: 生效` → 弹出 polkit 授权 (扩展要改 VSCode 安装目录里的一个 html 文件) → 授权成功后点提示里的"重新加载窗口".  
之后 `✅❌🎉` 应该就是彩色 2 格宽了.

### 4. 日常与升级后

- **VSCode 升级后**: 升级会覆盖那个 html 文件, patch 随之失效 —— 再点一次 `Emoji Patch: 生效` 即可, 不用重装扩展.
- **想临时关掉**: 跑 `Emoji Patch: 失效`. 注意只禁用扩展是不够的, 样式还留在文件里.
- **想彻底回到原样**: `Emoji Patch: 失效`, 或者 `sudo pacman -S visual-studio-code-bin` 重装 VSCode (那两个文件直接覆盖).
- **想让 emoji 表跟上 Unicode 新版本**: 跑一次 `生效` 就会重新拉取码点表.

## 改功能 / 开发

代码在 `src/`, 编译到 `out/`:

```bash
aubr build    # 编译一次 (tsc -> out/)
aubr watch    # 改代码时持续编译
aubr test     # 33 项无依赖测试 (含端到端)
aubr lint     # oxlint (整仓)
aubr format   # oxfmt (整仓, 含本文件与 DESIGN.md)
aubr check    # tsc --noEmit + oxlint
```

改完要让新代码生效, 重复"上手"里的第 2、3 步: `aubr package` → 装 → 命令面板 `生效`.

为什么要这么做、为什么不选别的做法 (字体族怎么顶替, 为什么必须改 `workbench.html`, checksum 是怎么回事, oxfmt 有哪些 round-trip 差异…), 都记在 `DESIGN.md`.
