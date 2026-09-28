'use strict';
/**
 * 无依赖测试: node test/run.js
 * 覆盖所有不依赖 VS Code 运行时的核心逻辑.
 */
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { readFileSync, existsSync, readdirSync } = require('node:fs');
const { homedir } = require('node:os');
const Module = require('node:module');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'out');
const CODE_ROOT = '/usr/share/code/resources/app';
const WORKBENCH = path.join(CODE_ROOT, 'out/vs/code/electron-browser/workbench/workbench.html');
const PRODUCT = path.join(CODE_ROOT, 'product.json');
const DESIGN_DOC = path.join(ROOT, 'DESIGN.md');

/** 取已安装的最新 markdowntable —— 目录名带版本号, 不能写死. */
function findMdtExt() {
  const root = path.join(homedir(), '.vscode', 'extensions');
  if (!existsSync(root)) {
    return undefined;
  }
  const dirs = readdirSync(root)
    .filter((d) => d.startsWith('takumii.markdowntable-'))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  return dirs.length > 0 ? path.join(root, dirs[dirs.length - 1]) : undefined;
}
const MDT_EXT = findMdtExt();

const range = require(path.join(OUT, 'range.js'));
const cssBlock = require(path.join(OUT, 'cssBlock.js'));
const wb = require(path.join(OUT, 'workbench.js'));
const oxfmtPath = require(path.join(OUT, 'oxfmtPath.js'));
const hijack = require(path.join(OUT, 'hijack.js'));
const consts = require(path.join(OUT, 'const.js'));

let passed = 0;
let failed = 0;
function test(name, fn) {
  try {
    const r = fn();
    if (r instanceof Promise) {
      return r.then(
        () => ok(name),
        (e) => ko(name, e),
      );
    }
    ok(name);
  } catch (e) {
    ko(name, e);
  }
  return undefined;
}
function ok(name) {
  passed++;
  console.log(`  \u2713 ${name}`);
}
function ko(name, e) {
  failed++;
  console.log(`  \u2717 ${name}\n      ${e && e.message ? e.message.split('\n').join('\n      ') : e}`);
}
function section(t) {
  console.log(`\n${t}`);
}

/** markdowntable 的 helper 模块加载时会 require('vscode'), 用 stub 顶掉. */
const MDT_VSCODE_STUB = {
  workspace: {
    getConfiguration: () => ({
      get: (k) =>
        ({
          alignData: true,
          alignColumnHeader: true,
          paddedDelimiterRowPipes: true,
          ignoreCodeblock: true,
        })[k.split('.').pop()],
    }),
  },
};

/** 干净地加载 (或重新加载) markdowntable 的 helper 模块. */
function loadMdtHelper() {
  const p = path.join(MDT_EXT, 'out', 'markdownTableDataHelper.js');
  delete require.cache[p];
  const origLoad = Module._load;
  Module._load = function (request, parent, isMain) {
    if (request === 'vscode') {
      return MDT_VSCODE_STUB;
    }
    return origLoad.call(this, request, parent, isMain);
  };
  try {
    return require(p);
  } finally {
    Module._load = origLoad;
  }
}

async function main() {
  // ---------------------------------------------------------------- range
  section('range.ts');
  const seq = await range.fetchEmojiSequences();
  assert.ok(seq.length > 10000, 'emoji-sequences.txt 内容过短');
  const built = range.buildUnicodeRange(seq);
  const setOf = (rangeStr) => {
    const s = new Set();
    for (const t of rangeStr
      .split(',')
      .map((x) => x.trim())
      .filter(Boolean)) {
      if (t.includes('-')) {
        const [a, b] = t.slice(2).split('-');
        for (let c = parseInt(a, 16); c <= parseInt(b, 16); c++) s.add(c);
      } else {
        s.add(parseInt(t.slice(2), 16));
      }
    }
    return s;
  };
  const cps = setOf(built.range);
  await test(`生成 range: ${built.count} 个码点 / ${built.range.split(',').length} 段 (相邻已合并)`, () => {
    assert.equal(built.count, 1243);
    assert.equal(cps.size, built.count, '段展开后码点数应与 count 一致');
  });

  // 与 DESIGN.md 附录里手写的完整列表交叉校验 (文档是唯一的人工可读副本)
  await test('码点集合与 DESIGN.md 附录里的 range 完全一致', () => {
    assert.ok(existsSync(DESIGN_DOC), 'DESIGN.md 不存在');
    const doc = readFileSync(DESIGN_DOC, 'utf8');
    const appendix = /# 附录: unicode-range 参考([\s\S]*)$/.exec(doc);
    assert.ok(appendix, 'DESIGN.md 里找不到附录章节');
    const m = /unicode-range:\s*([\s\S]*?);/.exec(appendix[1]);
    assert.ok(m, '附录里找不到 unicode-range');
    assert.deepEqual(
      [...cps].sort((a, b) => a - b),
      [...setOf(m[1])].sort((a, b) => a - b),
    );
  });

  await test('6 个 CJK 全角都在 range 内', () => {
    for (const c of [0x3030, 0x303d, 0x3297, 0x3299, 0x1f202, 0x1f237]) {
      assert.ok(cps.has(c), `U+${c.toString(16).toUpperCase()} 缺失`);
    }
  });
  await test('含 U+2705 / U+274C / U+1F1E6-1F1FF', () => {
    assert.ok(cps.has(0x2705) && cps.has(0x274c));
    assert.ok(cps.has(0x1f1e6) && cps.has(0x1f1ff));
  });
  await test('不含 EP=No 的 U+1F3D4 (🏔)', () => {
    assert.ok(!cps.has(0x1f3d4));
  });

  // 表格里只能用 range 内的 emoji: 被排除的字符渲染宽度与 oxfmt 的口径对不上
  // (被排除 = 带 VS16 的 Basic_Emoji 基码 ∪ keycap 基码, 再减去 range)
  const excluded = (() => {
    const ex = new Set();
    for (const raw of seq.split('\n')) {
      const line = raw.split('#')[0].trim();
      if (!line) {
        continue;
      }
      const fields = line.split(';').map((x) => x.trim());
      const toks = fields[0].split(/\s+/);
      if ((fields[1] === 'Basic_Emoji' && toks.length > 1) || fields[1] === 'Emoji_Keycap_Sequence') {
        ex.add(parseInt(toks[0], 16));
      }
    }
    return [...ex].filter((c) => !cps.has(c));
  })();
  await test(`被排除的 emoji: ${excluded.length} 个 (与文档里的数一致)`, () => {
    assert.equal(excluded.length, 204);
  });
  // 其中 12 个是 keycap 基码 (# * 0-9), 在表格里就是普通 ASCII, 不用管
  const tableUnsafe = excluded.filter((c) => c > 0x7f);
  for (const file of ['README.md', 'DESIGN.md']) {
    // 回调是同步的, 不必 await (也就避开了 no-await-in-loop)
    test(`${file}: 表格里不用 range 之外的 ${tableUnsafe.length} 个 emoji`, () => {
      const found = [];
      readFileSync(path.join(ROOT, file), 'utf8')
        .split('\n')
        .forEach((line, i) => {
          if (!line.trimStart().startsWith('|')) {
            return;
          }
          for (const ch of line) {
            if (tableUnsafe.includes(ch.codePointAt(0))) {
              found.push(`${file}:${i + 1} ${ch}`);
            }
          }
        });
      assert.equal(found.length, 0, `表格里出现会错位的 emoji (${found.join(', ')}) —— 换成 range 内的 emoji 或纯文字`);
    });
  }
  await test('extractRangeFromHtml 能读回 range', () => {
    const html = `<style>@font-face { unicode-range: ${built.range}; }</style>`;
    assert.equal(range.extractRangeFromHtml(html), built.range);
  });

  // -------------------------------------------------------------- cssBlock
  section('cssBlock.ts');
  const inner = cssBlock.buildCssBlock({
    codeFont: 'Iosevka Term',
    notoFamily: 'Noto Color Emoji',
    sizeAdjust: '80.3%',
    unicodeRange: 'U+2705, U+274C',
  });
  await test('先交还本地族, 后覆盖 emoji (顺序敏感)', () => {
    const lines = inner.split('\n');
    assert.match(lines[0], /font-family: "Iosevka Term"; src: local\("Iosevka Term"\)/);
    assert.match(lines[1], /src: local\("Noto Color Emoji"\)/);
    assert.match(lines[1], /size-adjust: 80\.3%/);
    assert.match(lines[1], /unicode-range: U\+2705, U\+274C;/);
  });

  // ------------------------------------------------------------- workbench
  section('workbench.ts');
  const sampleHtml =
    '<!doctype html>\n<html>\n  <head>\n    <style>body{}</style>\n  </head>\n  <body></body>\n</html>\n';
  const injected = wb.injectBlock(sampleHtml, inner);
  await test('注入: 标记存在且在 </head> 之前', () => {
    assert.ok(wb.hasBlock(injected));
    assert.ok(injected.indexOf(consts.MARKER_START) < injected.indexOf('</head>'));
    assert.ok(injected.includes('@font-face'));
  });
  await test('注入幂等: 再注入一次结果不变', () => {
    assert.equal(wb.injectBlock(injected, inner), injected);
  });
  await test('注入幂等: 换内容只替换标记之间', () => {
    const other = inner.replace('U+2705, U+274C', 'U+1F600');
    const again = wb.injectBlock(injected, other);
    assert.ok(again.includes('U+1F600'));
    assert.equal(again.split(consts.MARKER_START).length, 2);
    assert.equal(again.split(consts.MARKER_END).length, 2);
    assert.ok(!again.includes('U+2705, U+274C'));
  });
  await test('stripBlock: 完全还原', () => {
    assert.equal(wb.stripBlock(injected), sampleHtml);
  });
  const legacy = sampleHtml.replace(
    '  </head>',
    '    <style>\n      @font-face {\n        font-family: "EmojiPatch";\n        src: local("Noto Color Emoji");\n        size-adjust: 80.3%;\n        unicode-range: U+2705;\n      }\n    </style>\n  </head>',
  );
  await test('stripBlock: 能清掉早期手工 EmojiPatch 块', () => {
    const out = wb.stripBlock(legacy);
    assert.ok(!out.includes('EmojiPatch'));
    assert.ok(!out.includes('@font-face'));
  });
  await test('stripBlock: 无标记时原样返回', () => {
    assert.equal(wb.stripBlock(sampleHtml), sampleHtml);
  });

  // -------------------------------------------------------------- preview
  section('preview.ts (假 vscode + 假 webview 类)');
  class FakeWebview {
    #html = '';
    get html() {
      return this.#html;
    }
    set html(value) {
      this.#html = value;
    }
  }
  const fakePanels = [];
  const PREVIEW_STUB = {
    ViewColumn: { Active: -1 },
    window: {
      createWebviewPanel: () => {
        const panel = { disposed: false, webview: new FakeWebview() };
        panel.dispose = () => {
          panel.disposed = true;
        };
        fakePanels.push(panel);
        return panel;
      },
    },
  };
  const mpeHtml =
    '<!doctype html>\n<html>\n<head>\n<meta id="crossnote-data" data-config="{}">\n</head>\n<body></body>\n</html>\n';
  const builtinHtml =
    '<!DOCTYPE html>\n<html style="--vscode-x:y">\n<head>\n<meta charset="UTF-8">\n<meta id="vscode-markdown-preview-data" data-settings="{}" data-initial-md-content="x">\n</head>\n<body class="vscode-body">\n</body>\n</html>';
  const loadPreview = (stub) => {
    const p = path.join(OUT, 'preview.js');
    delete require.cache[p];
    const orig = Module._load;
    Module._load = function (request, parent, isMain) {
      if (request === 'vscode') {
        return stub;
      }
      return orig.call(this, request, parent, isMain);
    };
    try {
      return require(p);
    } finally {
      Module._load = orig;
    }
  };
  const previewMod = loadPreview(PREVIEW_STUB);
  const face = cssBlock.parseCssBlock(inner);
  const rules = [previewMod.mpePreviewRule(inner), previewMod.vscodePreviewRule(face)];
  const fallbackCss = rules[1].css;

  await test('parseCssBlock: 与 buildCssBlock 往返一致', () => {
    assert.deepEqual(face, { notoFamily: 'Noto Color Emoji', sizeAdjust: '80.3%', unicodeRange: 'U+2705, U+274C' });
    assert.equal(cssBlock.parseCssBlock('没有 font-face'), undefined);
  });
  await test('预览规则: 两条规则各认各的 shell', () => {
    assert.equal(rules[0].marker, 'crossnote-data');
    assert.equal(rules[1].marker, 'vscode-markdown-preview-data');
    assert.ok(!fallbackCss.includes('Iosevka Term'), '自带预览不顶替族名, 也不碰预览自己的字体');
    assert.ok(fallbackCss.includes(`"${consts.PREVIEW_FAMILY}", var(--markdown-font-family`));
    assert.ok(fallbackCss.includes(`"${consts.PREVIEW_FAMILY}", var(--vscode-editor-font-family`));
  });
  await test('预览注入: MPE shell 用 workbench 那份块, 插到 </head> 之前', () => {
    const out = previewMod.injectPreviewCss(mpeHtml, rules);
    assert.ok(out);
    assert.ok(out.includes('<style>'));
    assert.ok(out.includes('@font-face'));
    assert.ok(out.indexOf('@font-face') < out.indexOf('</head>'));
  });
  await test('预览注入: 自带预览 shell 用前插族名的块', () => {
    const out = previewMod.injectPreviewCss(builtinHtml, rules);
    assert.ok(out);
    assert.ok(out.includes(consts.PREVIEW_FAMILY));
    assert.ok(out.includes('@font-face'));
    assert.ok(out.indexOf(consts.PREVIEW_FAMILY) < out.indexOf('</head>'));
  });
  await test('预览注入: 非预览 HTML / 缺 </head> / 已插过 都不动', () => {
    assert.equal(previewMod.injectPreviewCss(sampleHtml, rules), undefined);
    assert.equal(previewMod.injectPreviewCss('crossnote-data 但没有 head', rules), undefined);
    const once = previewMod.injectPreviewCss(mpeHtml, rules);
    assert.equal(previewMod.injectPreviewCss(once, rules), undefined);
  });
  await test('预览劫持: 两种预览都被注入, 借的面板立刻 dispose', () => {
    const r = previewMod.installPreviewPatch(rules);
    assert.equal(r.installed, true);
    assert.equal(fakePanels.length, 1);
    assert.equal(fakePanels[0].disposed, true);
    const mpe = new FakeWebview();
    mpe.html = mpeHtml;
    assert.ok(mpe.html.includes('@font-face'));
    const builtin = new FakeWebview();
    builtin.html = builtinHtml;
    assert.ok(builtin.html.includes(consts.PREVIEW_FAMILY));
    assert.equal(previewMod.isPreviewPatched(), true);
  });
  await test('预览劫持: 其它 webview 原样通过', () => {
    const wv = new FakeWebview();
    const plain = '<html><head></head><body>x</body></html>';
    wv.html = plain;
    assert.equal(wv.html, plain);
  });
  await test('预览劫持: 重复安装是 no-op (不再借面板)', () => {
    assert.equal(previewMod.installPreviewPatch(rules).installed, true);
    assert.equal(fakePanels.length, 1);
  });
  await test('预览劫持: 卸载后恢复原样, 重复卸载返回 false', () => {
    assert.equal(previewMod.uninstallPreviewPatch(), true);
    assert.equal(previewMod.isPreviewPatched(), false);
    const wv = new FakeWebview();
    wv.html = mpeHtml;
    assert.ok(!wv.html.includes('@font-face'));
    assert.equal(previewMod.uninstallPreviewPatch(), false);
  });

  // -------------------------------------------------------------- checksum
  section('checksum');
  const realHtml = readFileSync(WORKBENCH);
  const realSum = wb.sha256Base64(realHtml);
  const productJson = readFileSync(PRODUCT, 'utf8');
  const productKey = /"vs\/code\/electron-browser\/workbench\/workbench\.html"\s*:\s*"([^"]*)"/.exec(productJson)[1];
  await test('sha256 算法与 product.json 里现有值一致', () => {
    assert.equal(realSum, productKey);
  });
  await test('updateChecksum 只改那一个值', () => {
    const changed = wb.updateChecksum(productJson, 'TESTVALUE');
    assert.match(changed, /"vs\/code\/electron-browser\/workbench\/workbench\.html"\s*:\s*"TESTVALUE"/);
    assert.equal(changed.length, productJson.length + 'TESTVALUE'.length - productKey.length);
    const restored = wb.updateChecksum(changed, productKey);
    assert.equal(restored, productJson, '改回来应与原文完全一致');
  });
  await test('整链路: 注入 -> 算 checksum -> 改 product.json -> 可读回', () => {
    const patched = wb.injectBlock(realHtml.toString('utf8'), inner);
    const buf = Buffer.from(patched, 'utf8');
    const sum = wb.sha256Base64(buf);
    const next = wb.updateChecksum(productJson, sum);
    const back = /"vs\/code\/electron-browser\/workbench\/workbench\.html"\s*:\s*"([^"]*)"/.exec(next)[1];
    assert.equal(back, sum);
    assert.notEqual(sum, realSum);
    assert.equal(
      wb.stripBlock(patched),
      wb.stripBlock(realHtml.toString('utf8')),
      'strip 后应与去掉旧块的原文件逐字一致',
    );
  });

  // ---------------------------------------------------------------- oxfmt
  section('oxfmtPath.ts');
  const oxfmt = oxfmtPath.resolveOxfmt('');
  await test('能自动探测到 oxfmt', () => {
    assert.ok(oxfmt, '未找到 oxfmt');
    assert.ok(existsSync(oxfmt));
  });

  // ---------------------------------------------------------------- hijack
  section('hijack.ts (用真实 markdowntable 模块)');
  if (!MDT_EXT) {
    console.log('  - 跳过 (未安装 markdowntable)');
  } else {
    await test('包装后输出 == oxfmt 输出', () => {
      const helper = loadMdtHelper();
      const table = [
        '| 名称 | 状态 | 说明 |',
        '| --- | --- | --- |',
        '| 中文 | ✅ | 一行 |',
        '| emoji | ❌ | 两格 |',
        '| code | `a|b` | x |',
      ].join('\n');
      const data = helper.stringToTableData(table);
      const before = helper.toFormatTableStr(data);
      const want = spawnSync(oxfmt, ['--stdin-filepath', 'table.md'], {
        input: before,
        encoding: 'utf8',
      });
      assert.equal(want.status, 0, want.stderr);

      const res = hijack.hijackTableFormatter(MDT_EXT, oxfmt);
      assert.equal(res.wrapped, true, res.message);
      const after = helper.toFormatTableStr(data);
      assert.equal(after, want.stdout.replace(/[\r\n]+$/, ''));
      assert.ok(!after.endsWith('\n'), '不应带尾部换行');
      // 再包装一次应幂等
      assert.equal(hijack.hijackTableFormatter(MDT_EXT, oxfmt).message, '已包装');
      assert.equal(helper.toFormatTableStr(data), after);
      // 对齐: ✅ 按 2 格对齐, 中文按 2 格
      const lines = after.split('\n');
      assert.ok(lines[1].includes('| ---'), 'delimiter 行存在');
      assert.equal(lines.length, 5, `行数应为 5, 实际 ${lines.length}`);
    });
    await test('oxfmt 找不到时退回原样', () => {
      const helper = loadMdtHelper();
      const data = helper.stringToTableData('| a | b |\n| --- | --- |\n| 1 | 2 |\n');
      // 用一个不存在的 oxfmt 路径包装 -> 必须退回 orig
      const res = hijack.hijackTableFormatter(MDT_EXT, '/nonexistent/oxfmt');
      assert.equal(res.wrapped, true);
      const got = helper.toFormatTableStr(data);
      assert.ok(typeof got === 'string' && got.includes('| a'), '应返回 markdowntable 原始结果');
    });
  }

  // ---------------------------------------------------------------- elevate
  section('elevate.ts');
  const elevate = require(path.join(OUT, 'elevate.js'));
  await test('preparePrivilegedDir: 临时目录 + 脚本内容正确 (不提权)', () => {
    const fs = require('node:fs');
    const os = require('node:os');
    const p = elevate.preparePrivilegedDir([
      { dest: '/usr/share/code/x.txt', content: Buffer.from('hello') },
      { dest: '/usr/share/code/product.json', content: Buffer.from('{}') },
    ]);
    try {
      assert.ok(path.resolve(p.dir).startsWith(path.resolve(os.tmpdir())), '临时目录应在 /tmp 下');
      const script = fs.readFileSync(p.scriptPath, 'utf8');
      const lines = script.trim().split('\n');
      assert.equal(lines[0], '#!/bin/bash');
      assert.equal(lines[1], 'set -euo pipefail');
      assert.equal(lines.length, 4, '应有 2 条 cp');
      assert.ok(script.includes('/usr/share/code/x.txt'));
      assert.ok(script.includes('/usr/share/code/product.json'));
      assert.ok(!script.includes('~'), 'pkexec 会清洗环境, 不能出现 ~');
      const src = path.join(p.dir, '_usr_share_code_x.txt');
      assert.equal(fs.readFileSync(src, 'utf8'), 'hello');
      assert.equal(fs.statSync(p.scriptPath).mode & 0o777, 0o755);
    } finally {
      fs.rmSync(p.dir, { recursive: true, force: true });
    }
    assert.ok(!fs.existsSync(p.dir), '清理后临时目录应消失');
  });

  // ------------------------------------------------- 端到端 (假 pkexec)
  section('commands.ts (端到端: 假 pkexec + 假 codeRoot)');
  await test('enable -> 注入+同步 checksum+幂等; disable -> 逐字节还原', async () => {
    const fs = require('node:fs');
    const os = require('node:os');
    const wbMod = require(path.join(OUT, 'workbench.js'));

    // 假 codeRoot: 拿真实文件当样本
    const fakeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'emoji-patch-root-'));
    const relDir = 'out/vs/code/electron-browser/workbench';
    fs.mkdirSync(path.join(fakeRoot, relDir), { recursive: true });
    fs.copyFileSync(WORKBENCH, path.join(fakeRoot, relDir, 'workbench.html'));
    fs.copyFileSync(PRODUCT, path.join(fakeRoot, 'product.json'));
    const wbPath = path.join(fakeRoot, relDir, 'workbench.html');
    const prodPath = path.join(fakeRoot, 'product.json');
    const origWb = wbMod.stripBlock(fs.readFileSync(wbPath, 'utf8'));

    // 假 pkexec: 忽略提权, 直接 bash 脚本
    const fakeBin = fs.mkdtempSync(path.join(os.tmpdir(), 'emoji-patch-bin-'));
    fs.writeFileSync(path.join(fakeBin, 'pkexec'), '#!/bin/sh\n/bin/bash "$2"\n', { mode: 0o755 });
    const oldPath = process.env.PATH;
    process.env.PATH = `${fakeBin}:${oldPath}`;

    const settings = {
      codeRoot: fakeRoot,
      codeFont: '',
      notoFamily: 'Noto Color Emoji',
      sizeAdjust: '80.3%',
      oxfmtPath: '',
      patchMarkdownTable: false,
    };
    const stub = {
      workspace: {
        getConfiguration: (sec) => ({
          get: (k) => (sec === 'editor' ? "'EmojiPatch', 'IsoFont', 'MiSans'" : settings[k]),
        }),
      },
      window: {
        showInformationMessage: async () => undefined,
        showErrorMessage: async () => undefined,
      },
      commands: { executeCommand: async () => undefined },
      extensions: { getExtension: () => undefined },
      env: { clipboard: { writeText: async () => undefined } },
    };
    const origLoad = Module._load;
    Module._load = function (request, parent, isMain) {
      if (request === 'vscode') {
        return stub;
      }
      return origLoad.call(this, request, parent, isMain);
    };
    let cmds;
    try {
      for (const f of ['commands.js', 'extension.js', 'hijack.js']) {
        delete require.cache[path.join(OUT, f)];
      }
      cmds = require(path.join(OUT, 'commands.js'));
    } finally {
      Module._load = origLoad;
    }

    try {
      await cmds.enable();
      const after = fs.readFileSync(wbPath, 'utf8');
      assert.ok(wbMod.hasBlock(after), '应已注入');
      assert.ok(
        after.includes('font-family: "IsoFont"; src: local("IsoFont")'),
        '应跳过 EmojiPatch 顶替第一个真实字体族',
      );
      assert.ok(after.includes('font-family: "IsoFont"; src: local("Noto Color Emoji")'));
      assert.ok(after.includes('size-adjust: 80.3%'));
      assert.equal(after.split(consts.MARKER_START).length, 2, '只能有一个注入块');
      assert.ok(!after.includes('EmojiPatch'), '旧的手工块应被清掉');
      const expectSum = wbMod.sha256Base64(fs.readFileSync(wbPath));
      assert.ok(fs.readFileSync(prodPath, 'utf8').includes(`"${expectSum}"`), 'checksum 应已同步');

      // 幂等: 再跑一次不改文件
      fs.writeFileSync(path.join(fakeBin, 'marker'), 'x');
      const snapWb = fs.readFileSync(wbPath);
      const snapProd = fs.readFileSync(prodPath);
      await cmds.enable();
      assert.ok(fs.readFileSync(wbPath).equals(snapWb), '重复 enable 不应改动 workbench.html');
      assert.ok(fs.readFileSync(prodPath).equals(snapProd), '重复 enable 不应改动 product.json');

      // disable
      await cmds.disable();
      const disabled = fs.readFileSync(wbPath, 'utf8');
      assert.ok(!wbMod.hasBlock(disabled), '应已移除');
      assert.equal(disabled, origWb, 'disable 后应与去掉旧块的原文件逐字节一致');
      assert.ok(fs.readFileSync(prodPath, 'utf8').includes(`"${wbMod.sha256Base64(fs.readFileSync(wbPath))}"`));

      // 再 disable 应 no-op
      const snap2 = fs.readFileSync(wbPath);
      await cmds.disable();
      assert.ok(fs.readFileSync(wbPath).equals(snap2));
    } finally {
      process.env.PATH = oldPath;
      fs.rmSync(fakeRoot, { recursive: true, force: true });
      fs.rmSync(fakeBin, { recursive: true, force: true });
    }
  });

  section('结果');
  console.log(`  通过 ${passed}, 失败 ${failed}`);
  process.exit(failed === 0 ? 0 : 1);
}

main();
