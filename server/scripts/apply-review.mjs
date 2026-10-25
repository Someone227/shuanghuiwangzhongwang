#!/usr/bin/env node
/**
 * apply-review.mjs —— 人工复核：把「AI 抽对了原文、但原文本身已过时」的地方显式标注出来。
 *
 * 背景：政策库里的原文多为 2006—2019 年文件，其中的额度、试点范围等数字已经变了。
 * 不做处理的话，用户会被按十几年前的标准判定，结论是错的。
 *
 * 处理原则（不篡改 AI 抽取结果）：
 *   1. 保留原文 quote / value 原样 —— 「原文写了什么」是事实，不能改；
 *   2. 过时的判定条件标 autoUncertain，运行期输出「需人工确认」而不是误判 pass/fail；
 *   3. notes 顶部追加【现行标准】提示，review.changes 记录本次改了什么（可审计）。
 *
 * 幂等：重复执行不会重复追加，已有的【现行…】提示会先被清掉再写入。
 *
 * 用法：node scripts/apply-review.mjs [--dry-run]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SERVER_ROOT = path.resolve(HERE, '..');
const REPO_ROOT = path.resolve(SERVER_ROOT, '..');
/** 政策库与抽取脚本共用仓库根下的 data/policies（运行期由 server 读取） */
const POLICY_DIR = path.join(REPO_ROOT, 'data', 'policies');
const DRY = process.argv.includes('--dry-run');

/** 原文过时而需要提示的情形：id -> 追加到 notes 的条目（按顺序） */
const REVIEW_NOTES = {
  'national-scholarship': [
    '【现行标准】财教〔2024〕181号：自2024年起，本专科生国家奖学金奖励标准由每生每年8000元提高到10000元，奖励名额由每年6万名增加到12万名。本办法规定的评审条件未变。',
  ],
  'national-inspiring-scholarship': [
    '【现行标准】财教〔2024〕181号：自2024年起，本专科生国家励志奖学金奖励标准由每生每年5000元提高到6000元。本暂行办法规定的申请条件未变。',
  ],
  'national-education-grant': [
    '【现行标准】财教〔2024〕181号：自2024年秋季学期起，本专科生国家助学金平均资助标准由每生每年3300元提高到3700元，高校在每生每年2500—5000元范围内自主确定，可分为2—3档。',
  ],
  'student-loan': [
    '【现行标准】原文“每年最高不超过6000元”为2008年标准；现行本专科生每生每年最高20000元、研究生每生每年最高25000元，以经办银行和县级学生资助管理中心当年规定为准。',
    '【现行范围】原文仅列出江苏、湖北、重庆、甘肃、陕西5个试点省份；目前全国各省（区、市）均已开展生源地信用助学贷款。',
  ],
  'postgraduate-recommendation': [
    '【现行补充】本试行办法为基础性文件；推免名额分配、信息公开、时间安排等以教育部当年通知为准。',
  ],
};

/**
 * 条件级补丁：key 为 condition.id。
 * autoUncertain=true 表示该条无法凭用户填写自动判定，运行期一律输出「需人工确认」。
 */
const CONDITION_PATCHES = {
  'student-loan': {
    c9: {
      autoUncertain: true,
      hint: '原文写的是2008年的标准（每年最高不超过6000元）。现行本专科生每年最高20000元、研究生25000元，请按当地经办银行和县级学生资助管理中心当年规定填写。',
    },
    c11: {
      autoUncertain: true,
      hint: '原文只列出5个试点省份，那是2008年的情况；目前全国各省（区、市）都已开展生源地信用助学贷款，请向户籍所在县级学生资助管理中心确认。',
    },
    c12: {
      autoUncertain: true,
      hint: '原文的“已备案开展”无法从个人信息中判定；目前全国均已开展，请向户籍所在县级学生资助管理中心确认。',
    },
  },
};

/** 复核变更留痕 */
const CHANGES = {
  'national-scholarship': ['notes 追加【现行标准】提示：2024年起本专科国奖由8000元提高到10000元，名额由6万增加到12万（财教〔2024〕181号）。'],
  'national-inspiring-scholarship': ['notes 追加【现行标准】提示：2024年起本专科励志奖学金由5000元提高到6000元（财教〔2024〕181号）。'],
  'national-education-grant': ['notes 追加【现行标准】提示：2024年秋季起本专科国家助学金平均标准由3300元提高到3700元，区间2500—5000元（财教〔2024〕181号）。'],
  'student-loan': [
    'notes 追加【现行标准】提示：原文6000元为2008年额度，现行本专科20000元、研究生25000元。',
    'notes 追加【现行范围】提示：原文5个试点省份已过时，现全国均已开展。',
    '条件 c9（贷款金额不超过6000元）标为 autoUncertain，改为「需人工确认」并提示现行额度。',
    '条件 c11（生源地为5个试点省份）标为 autoUncertain，避免非试点省份用户被误判为不符合。',
    '条件 c12（其他省份已备案开展）标为 autoUncertain：该条无法由个人信息判定。',
  ],
  'postgraduate-recommendation': ['notes 追加【现行补充】提示：名额分配与信息公开以教育部当年通知为准。'],
};

function isReviewNote(n) {
  return typeof n === 'string' && (n.startsWith('【现行标准】') || n.startsWith('【现行范围】') || n.startsWith('【现行补充】'));
}

function main() {
  const files = fs.readdirSync(POLICY_DIR).filter((f) => f.endsWith('.json') && !f.startsWith('_'));
  const today = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const reviewedAt = today.getFullYear() + '-' + pad(today.getMonth() + 1) + '-' + pad(today.getDate());

  let touched = 0;
  for (const file of files) {
    const full = path.join(POLICY_DIR, file);
    const policy = JSON.parse(fs.readFileSync(full, 'utf8'));
    const changes = [];
    const notes = Array.isArray(policy.notes) ? policy.notes : [];

    // 1) 追加现行标准提示（幂等：先清掉上一次写入的【现行…】条目）
    const baseNotes = notes.filter((n) => !isReviewNote(n));
    const reviewNotes = REVIEW_NOTES[policy.id] ?? [];
    const nextNotes = [...reviewNotes, ...baseNotes];
    if (JSON.stringify(nextNotes) !== JSON.stringify(notes)) {
      policy.notes = nextNotes;
      changes.push(...(CHANGES[policy.id] ?? []).filter((c) => c.startsWith('notes')));
    }

    // 2) 条件级补丁：只加 autoUncertain / hint，不动 value、quote、label
    for (const group of policy.conditions ?? []) {
      for (const cond of group.conditions ?? []) {
        const patch = CONDITION_PATCHES[policy.id]?.[cond.id];
        if (!patch) continue;
        let dirty = false;
        if (patch.autoUncertain !== undefined && cond.autoUncertain !== patch.autoUncertain) {
          cond.autoUncertain = patch.autoUncertain;
          dirty = true;
        }
        if (patch.hint !== undefined && cond.hint !== patch.hint) {
          cond.hint = patch.hint;
          dirty = true;
        }
        if (dirty) {
          const msg = (CHANGES[policy.id] ?? []).find((c) => c.indexOf('条件 ' + cond.id) === 0);
          changes.push(msg || ('条件 ' + cond.id + ' 标注为需人工确认。'));
        }
      }
    }

    // 3) 复核记录
    const prev = policy.review;
    policy.review = {
      humanReviewed: true,
      reviewedAt,
      reviewer: '团队人工复核',
      changes: changes.length > 0 ? changes : (prev?.changes ?? []),
    };
    if (JSON.stringify(prev) === JSON.stringify(policy.review) && changes.length === 0) continue;

    touched += 1;
    console.log('[review] ' + policy.id + ': ' + changes.length + ' 处改动');
    for (const c of changes) console.log('         - ' + c);
    if (!DRY) fs.writeFileSync(full, JSON.stringify(policy, null, 2) + '\n', 'utf8');
  }
  console.log('\n' + (DRY ? '[dry-run] ' : '') + '复核完成：' + touched + ' 份政策' + (DRY ? '（未写盘）' : ' 已写盘'));
}

main();
