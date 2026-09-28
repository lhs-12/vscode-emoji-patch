<h1><center>Emoji Patch (VSCode 扩展)</center></h1>

个人专用扩展: 让 VSCode 的 emoji 与 kitty 表现一致 (彩色 + 严格 2 格宽), 并让 markdowntable 的表格格式化改走 oxfmt.  
设计与取舍见 `DESIGN.md`.

## 适用环境

- Linux + AUR 安装的 VSCode (`visual-studio-code-bin`, 装在 `/usr/share/code`), 写入需 `pkexec` 提权.
- 编辑器的字体链会被"顶替"第一个族 (默认 `Iosevka Term`): 不新增族名, 只把 emoji 码点分流给 `Noto Color Emoji`, 其余字符不受影响.

## 命令

| 命令                | 作用                                                                                                  |
| ------------------- | ----------------------------------------------------------------------------------------------------- |
| `Emoji Patch: 生效` | 生成/更新 `unicode-range`, 写入 `workbench.html` 的标记块, 同步 `product.json` checksum, 然后重载窗口 |
| `Emoji Patch: 失效` | 删除标记块并还原 checksum, 然后重载窗口                                                               |

## 它做什么

1. **字体分流**: 用 `@font-face` 抢用 `editor.fontFamily` 第一个族的名字, 只把 emoji 码点交给 Noto Color Emoji (`size-adjust: 80.3%` → 恰好 2 格). 配置里不需要出现任何 patch 名字.
2. **注入 CSS**: 需要写 `workbench.html` (VSCode 没有注入 CSS 的扩展 API), 通过 `pkexec` 提权, 全程用临时目录, 不留持久数据.
3. **劫持表格格式化**: 在内存里包装 markdowntable 的 `toFormatTableStr`, 让它的所有格式化操作改走 oxfmt. 不改它的磁盘文件.

## 安装与升级

```bash
aubr package                                         # 出 emoji-patch-<ver>.vsix
code --install-extension emoji-patch-*.vsix --force   # 装 / 覆盖
```

VSCode 升级会覆盖 `workbench.html`, patch 随之失效 —— 重跑一次 `Emoji Patch: 生效` 即可, 不必重装扩展.

## 开发

```bash
mise install        # 工具依赖 (node/aube/oxlint/oxfmt): 版本与全局 mise 配置一致, 直接复用

aube install        # 包依赖 (仅 @types/node, @types/vscode, typescript)

aubr build          # tsc -> out/
aubr test           # 无依赖测试 (21 项)
aubr lint           # oxlint
aubr format         # oxfmt
aubr package        # 出 .vsix
```

工具的版本声明在 `mise.toml`, 取舍理由见 `DESIGN.md` 的"工具链"章节.
