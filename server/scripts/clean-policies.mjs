/**
 * 清洗政策原文的网页噪声。
 *
 * 两类噪声：
 * 1. 头部——抓取时网页的站点导航（登录 / 语言切换 / 搜索 / 首页 / 机构 / 新闻 / 当前位置 …）
 *    以及信息公示块，正文起点之前的部分与条款无关。
 * 2. 尾部——「点击右上角」「网站声明」「京ICP备」等页脚与移动端提示。
 *
 * 头部截断会改变所有段落的偏移，因此截断后用「去空白归一化定位」重算 start/end；
 * 只要有段落定位失败就整份跳过、不写盘。脚本可重复执行（已清洗过的文件不会重复截断）。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '..', '..');
const POLICY_DIR = path.join(REPO_ROOT, 'data', 'policies');

/**
 * 每份政策的正文起点标记（抓取页面里正文第一段的开头）。
 * 用固定标记而不是「第 N 个换行」，是因为不同站点的导航长度差别很大，
 * 且标记在原文中唯一，便于校验。
 */
const BODY_START = {
  'national-scholarship': '各省、自治区、直辖市教育厅（教委）',
  'national-inspiring-scholarship': '国务院有关部委、有关直属机构',
  'national-education-grant': '国务院有关部委、有关直属机构',
  'student-loan': '各省、自治区、直辖市、计划单列市财政厅（',
  'postgraduate-recommendation': '各省、自治区、直辖市教育厅（教委）',
  'work-study': '各省、自治区、直辖市教育厅（教委）、财政厅（局）',
  'military-service-grant': '党中央有关部门，国务院有关部委',
};

const NOISE_PATTERNS = [
  /点击右上角/,
  /选择在浏览器中打开/,
  /网站声明/,
  /网站地图/,
  /联系我们/,
  /版权所有：/,
  /京ICP备/,
  /京公网安备/,
  /网站标识码/,
  /日期：\d{4}-\d{2}-\d{2}\s*收藏/,
  /全国学生资助管理中心\s*-/,
  /关注\s*微信公众号/,
  /扫一扫分享本页/,
  /责任编辑：/,
  /相关阅读/,
];

function findNoiseStart(text) {
  let start = -1;
  for (const pattern of NOISE_PATTERNS) {
    const match = pattern.exec(text);
    if (!match) continue;
    if (start === -1 || match.index < start) start = match.index;
  }
  return start;
}

/** 建「去掉空白后的字符 -> 原文下标」映射，用来做容错定位。 */
function buildIndex(rawText) {
  let norm = '';
  const map = [];
  for (let i = 0; i < rawText.length; i += 1) {
    if (/\s/.test(rawText[i])) continue;
    norm += rawText[i];
    map.push(i);
  }
  return { norm, map };
}

/** 按 section.text 重新计算所有段落的 start/end；返回失败的段落描述。 */
function recomputeOffsets(policy) {
  const { norm, map } = buildIndex(policy.originalText);
  const next = [];
  for (const section of policy.sections) {
    const target = String(section.text || '').replace(/\s+/g, '');
    const at = target ? norm.indexOf(target) : -1;
    if (at < 0) return { failed: section.heading || section.id };
    next.push({ start: map[at], end: map[at + target.length - 1] + 1 });
  }
  policy.sections.forEach((section, index) => {
    section.start = next[index].start;
    section.end = next[index].end;
  });
  return { failed: null };
}

/** 截掉正文起点之前的站点导航，返回截掉的字符数（0 表示无需处理）。 */
function stripHead(policy) {
  const marker = BODY_START[policy.id];
  if (!marker) return { removedChars: 0, removedFrom: '' };
  const at = policy.originalText.indexOf(marker);
  if (at <= 40) return { removedChars: 0, removedFrom: '' };

  const head = policy.originalText.slice(0, at);
  const original = policy.originalText;
  policy.originalText = policy.originalText.slice(at);
  const result = recomputeOffsets(policy);
  if (result.failed) {
    policy.originalText = original;
    throw new Error(`${policy.id}：截头后段落「${result.failed}」无法定位，已回滚不写盘`);
  }
  return { removedChars: head.length, removedFrom: head.trim().split('\n').slice(0, 3).join(' / ') };
}

let headCleaned = 0;
let tailCleaned = 0;
let skipped = 0;

for (const file of fs.readdirSync(POLICY_DIR).filter((name) => name.endsWith('.json'))) {
  const full = path.join(POLICY_DIR, file);
  const policy = JSON.parse(fs.readFileSync(full, 'utf8'));
  if (!policy.originalText || !Array.isArray(policy.sections)) continue;

  let head = { removedChars: 0, removedFrom: '' };
  try {
    head = stripHead(policy);
  } catch (error) {
    console.warn(`  ✗ ${error.message}`);
    skipped += 1;
    continue;
  }

  const text = policy.originalText;
  const noiseStart = findNoiseStart(text);
  let tail = { removedChars: 0, removedFrom: '' };
  if (noiseStart !== -1) {
    const maxEnd = policy.sections.reduce((max, section) => Math.max(max, section.end ?? 0), 0);
    if (noiseStart < text.length * 0.5) {
      console.warn(`  跳过 ${policy.id} 的尾部清洗：噪声标记出现在正文前段（index=${noiseStart}）`);
    } else if (maxEnd > noiseStart) {
      console.warn(`  跳过 ${policy.id} 的尾部清洗：段落偏移（${maxEnd}）越过噪声起点（${noiseStart}）`);
    } else {
      tail = { removedChars: text.length - noiseStart, removedFrom: text.slice(noiseStart, noiseStart + 30) };
      policy.originalText = text.slice(0, noiseStart).replace(/\s+$/, '');
    }
  }

  if (head.removedChars === 0 && tail.removedChars === 0) {
    skipped += 1;
    continue;
  }

  policy.cleaning = {
    cleanedAt: new Date().toISOString().slice(0, 10),
    removedChars: head.removedChars + tail.removedChars,
    removedFrom: (head.removedFrom || tail.removedFrom).slice(0, 80),
    note: '截掉抓取网页的站点导航（头部）与页脚、移动端提示（尾部），正文条款未改动；段落偏移已重算',
  };
  fs.writeFileSync(full, `${JSON.stringify(policy, null, 2)}\n`, 'utf8');
  if (head.removedChars > 0) headCleaned += 1;
  if (tail.removedChars > 0) tailCleaned += 1;
  console.log(
    `  ✓ ${policy.id}：头部 -${head.removedChars} 字符，尾部 -${tail.removedChars} 字符，现长 ${policy.originalText.length}`,
  );
}

console.log(`\n清洗完成：头部清理 ${headCleaned} 份，尾部清理 ${tailCleaned} 份，跳过 ${skipped} 份`);
