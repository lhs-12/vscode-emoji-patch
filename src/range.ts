import { EMOJI_SEQUENCES_URL, EXTRA_CODEPOINTS } from './const';

/** `231A` / `231A..231B` -> 码点数组. */
function parseCodePoints(spec: string): number[] {
  const s = spec.trim();
  if (s.includes('..')) {
    const [a, b] = s.split('..');
    const from = Number.parseInt(a, 16);
    const to = Number.parseInt(b, 16);
    const out: number[] = [];
    for (let c = from; c <= to; c++) {
      out.push(c);
    }
    return out;
  }
  return [Number.parseInt(s, 16)];
}

/**
 * 解析 UCD emoji-sequences.txt, 取"默认 emoji 呈现"的码点集合:
 * - Basic_Emoji: 只取单码点项 (含 VS16 的项跳过)
 * - RGI_Emoji_Flag_Sequence: 取两个 regional indicator
 * - RGI_Emoji_Tag_Sequence / RGI_Emoji_Modifier_Sequence: 取首个码点
 */
export function parseEmojiSequences(text: string): Set<number> {
  const set = new Set<number>();
  for (const raw of text.split('\n')) {
    const line = raw.split('#')[0]!.trim();
    if (!line) {
      continue;
    }
    const fields = line.split(';').map((x) => x.trim());
    const data = fields[0]!;
    const type = fields[1]!;
    const toks = data.split(/\s+/);
    if (type === 'Basic_Emoji') {
      if (toks.length < 2) {
        for (const c of parseCodePoints(toks[0]!)) {
          set.add(c);
        }
      }
    } else if (type === 'RGI_Emoji_Flag_Sequence') {
      set.add(Number.parseInt(toks[0]!, 16));
      set.add(Number.parseInt(toks[1]!, 16));
    } else if (type === 'RGI_Emoji_Tag_Sequence' || type === 'RGI_Emoji_Modifier_Sequence') {
      for (const c of parseCodePoints(toks[0]!)) {
        set.add(c);
      }
    }
  }
  return set;
}

function hex(c: number): string {
  return c.toString(16).toUpperCase().padStart(4, '0');
}

/** 码点集合 -> CSS unicode-range 字符串, 相邻码点合并为区间. */
export function toUnicodeRange(codePoints: Iterable<number>): string {
  const sorted = [...new Set(codePoints)].sort((a, b) => a - b);
  const parts: string[] = [];
  let i = 0;
  while (i < sorted.length) {
    let j = i;
    while (j + 1 < sorted.length && sorted[j + 1] === sorted[j]! + 1) {
      j++;
    }
    parts.push(i === j ? `U+${hex(sorted[i]!)}` : `U+${hex(sorted[i]!)}-${hex(sorted[j]!)}`);
    i = j + 1;
  }
  return parts.join(', ');
}

/** 由 emoji-sequences.txt 全文生成最终 unicode-range (末尾追加 6 个 CJK 全角字符). */
export function buildUnicodeRange(emojiSequencesText: string): { range: string; count: number } {
  const cps = parseEmojiSequences(emojiSequencesText);
  for (const c of EXTRA_CODEPOINTS) {
    cps.add(c);
  }
  return { range: toUnicodeRange(cps), count: cps.size };
}

/** 从已注入的 CSS 块里读回上次的 unicode-range (离线回退用). */
export function extractRangeFromHtml(html: string): string | undefined {
  const m = /unicode-range:\s*([^;]+);/.exec(html);
  return m ? m[1]!.trim() : undefined;
}

export async function fetchEmojiSequences(): Promise<string> {
  const res = await fetch(EMOJI_SEQUENCES_URL);
  if (!res.ok) {
    throw new Error(`下载 emoji-sequences.txt 失败: HTTP ${res.status}`);
  }
  return await res.text();
}
