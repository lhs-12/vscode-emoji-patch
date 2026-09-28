<h1><center>Emoji Patch (VSCode 扩展)</center></h1>

个人专用扩展. 设计与取舍见 `DESIGN.md`.

## 命令

| 命令 | 作用 |
| --- | --- |
| `Emoji Patch: 生效` | 生成/更新 `unicode-range`, 写入 `workbench.html` 的标记块, 同步 `product.json` checksum, 然后重载窗口 |
| `Emoji Patch: 失效` | 删除标记块并还原 checksum, 然后重载窗口 |

## 它做什么

1. **字体分流**: 用 `@font-face` 抢用 `editor.fontFamily` 第一个族的名字, 只把 emoji 码点交给 Noto Color Emoji (`size-adjust: 80.3%` → 恰好 2 格). 配置里不需要出现任何 patch 名字.
2. **注入 CSS**: 需要写 `workbench.html` (VSCode 没有注入 CSS 的扩展 API), 通过 `pkexec` 提权, 全程用临时目录, 不留持久数据.
3. **劫持表格格式化**: 在内存里包装 markdowntable 的 `toFormatTableStr`, 让它的所有格式化操作改走 oxfmt. 不改它的磁盘文件.

## 开发

```bash
aube install        # 依赖
aube run build      # tsc -> out/
aube run test       # 无依赖测试 (21 项)
aube run lint       # oxlint
aube run format     # oxfmt
aube run package    # 出 .vsix
```
