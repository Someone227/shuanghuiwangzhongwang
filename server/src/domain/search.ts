/**
 * 宽松搜索：给政策库的搜索框用。
 *
 * 目标：用户不需要把原文一字不差地贴进来。
 * 例如原文是「我是一只大肥鱼」，搜「我一只大肥鱼」也应该能找到它。
 *
 * 实现分三档，命中越直接分越高：
 * 1. 严格子串（100 分）—— 和浏览器的 includes 一致，最快最准；
 * 2. 二元组覆盖率（40~100 分）—— 把查询切成两字一组的片段，
 *    原文里命中足够多片段就算；中间漏一两个字不影响；
 * 3. 顺序字符兜底（25 分，仅短字段）—— 查询的字按顺序都能在文本里找到。
 *
 * 原文（几千字）只走前两档，且阈值更高，避免常用字组合误命中。
 * 这里全是纯函数、零依赖，静态部署时直接在浏览器里跑。
 */

const PUNCTUATION = /[\s,.;:!?'"()\[\]{}<>/\\|~`@#$%^&*+=_\-—–…·、，。；：！？“‘”’（）【】《》〈〉「」『』]+/g;

/** 归一化：全角转半角、去掉空白与标点、统一小写 */
export function normalizeSearch(text: string): string {
  let out = '';
  for (const ch of text) {
    const code = ch.codePointAt(0) ?? 0;
    // 全角空格当分隔符，直接丢掉
    if (code === 0x3000) continue;
    // 全角 ASCII（！～）转半角
    if (code >= 0xff01 && code <= 0xff5e) {
      out += String.fromCharCode(code - 0xfee0);
      continue;
    }
    out += ch;
  }
  return out.toLowerCase().replace(PUNCTUATION, '');
}

/** 切成二元组；查询只有一个字时退化为单字 */
function bigrams(text: string): string[] {
  if (text.length <= 1) return [text];
  const grams: string[] = [];
  for (let i = 0; i + 1 < text.length; i += 1) {
    const gram = text.slice(i, i + 2);
    // 查询自己打重复（「的的」）时去重，不重复计分
    if (!grams.includes(gram)) grams.push(gram);
  }
  return grams;
}

/** 查询字符按顺序出现在文本里时返回连续段数；否则返回 -1 */
function orderedSegments(query: string, text: string): number {
  let cursor = 0;
  let segments = 0;
  let inRun = false;
  for (const ch of query) {
    const at = text.indexOf(ch, cursor);
    if (at === -1) return -1;
    if (at !== cursor || !inRun) {
      segments += 1;
      inRun = true;
    }
    cursor = at + 1;
  }
  return segments;
}

function scoreOne(query: string, text: string, mode: 'field' | 'document'): number {
  if (!query) return 100;
  if (!text) return 0;
  // 第一档：严格子串
  if (text.includes(query)) return 100;

  // 第二档：二元组覆盖率
  const grams = bigrams(query);
  const hits = grams.filter((gram) => text.includes(gram)).length;
  const rate = hits / grams.length;
  if (mode === 'field') {
    if (grams.length >= 2 && hits >= 2 && rate >= 0.6) return Math.round(40 + rate * 60);
    // 第三档：顺序字符兜底，只用于标题、发布单位这类短字段
    if (query.length >= 3) {
      const segments = orderedSegments(query, text);
      if (segments > 0 && segments <= Math.max(2, Math.ceil(query.length / 4))) return 25;
    }
    return 0;
  }

  // 原文很长，常用字组合容易误命中，阈值抬高
  if (grams.length >= 2 && hits >= 3 && rate >= 0.75) return Math.round(30 + rate * 50);
  // 漏字较多时（如原文「家庭经济困难学生认定」、用户搜「家庭困难学生认定」），
  // 允许查询里的字按顺序分散出现，但断成太多段就说明不是同一句话
  if (query.length >= 4) {
    const segments = orderedSegments(query, text);
    if (segments > 0 && segments <= 3) return 20;
  }
  return 0;
}

/**
 * 给查询和文本打分：0 表示不命中，100 表示原文里一字不差地出现了查询。
 *
 * 查询里有空格时按多个词处理：每个词都要命中，取平均分。
 */
export function matchScore(query: string, text: string, mode: 'field' | 'document' = 'field'): number {
  const terms = query
    .split(/\s+/)
    .map((term) => normalizeSearch(term))
    .filter(Boolean);
  if (terms.length === 0) return 100;

  const haystack = normalizeSearch(text);
  if (!haystack) return 0;

  let total = 0;
  for (const term of terms) {
    const score = scoreOne(term, haystack, mode);
    if (score === 0) return 0;
    total += score;
  }
  return Math.round(total / terms.length);
}

/** 是否命中（只要分数大于 0） */
export function looseIncludes(query: string, text: string, mode: 'field' | 'document' = 'field'): boolean {
  return matchScore(query, text, mode) > 0;
}

/**
 * 从原文里截出命中位置附近的一小段，给搜索结果卡片展示「原文命中：……」。
 *
 * 优先用查询里最长的、原文中真能连续找到的片段锚定位置；
 * 宽松命中也找不到连续片段时，退回查询第一个字的位置。
 */
export function hitSnippet(query: string, text: string, radius = 22): string | null {
  if (!text) return null;
  const terms = query
    .split(/\s+/)
    .map((term) => normalizeSearch(term))
    .filter(Boolean);
  if (terms.length === 0) return null;

  const lower = text.toLowerCase();
  const candidates = new Set<string>();
  for (const term of terms) {
    candidates.add(term);
    for (const gram of bigrams(term)) candidates.add(gram);
  }

  let bestAt = -1;
  let bestLen = 0;
  for (const cand of candidates) {
    if (!cand || cand.length <= bestLen) continue;
    const at = lower.indexOf(cand.toLowerCase());
    if (at !== -1) {
      bestAt = at;
      bestLen = cand.length;
    }
  }
  if (bestAt === -1) {
    const first = terms.join('')[0];
    if (!first) return null;
    bestAt = lower.indexOf(first.toLowerCase());
    bestLen = 1;
    if (bestAt === -1) return null;
  }

  const start = Math.max(0, bestAt - radius);
  const end = Math.min(text.length, bestAt + bestLen + radius);
  const prefix = start > 0 ? '…' : '';
  const suffix = end < text.length ? '…' : '';
  const body = text.slice(start, end).replace(/\s+/g, ' ').trim();
  return prefix + body + suffix;
}
