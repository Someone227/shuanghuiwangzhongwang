#!/usr/bin/env node
/**
 * fix-offsets.mjs —— 修正政策 JSON 中条件段落的原文偏移（start/end）
 *
 * 为什么需要：抽取脚本拿模型返回的段落文本去原文里 indexOf，遇到换行/空格差异会失败，
 * 导致前端「回链原文高亮」无法定位。本脚本按「去空白后匹配」重新计算偏移，可重复执行。
 *
 * 用法：node scripts/fix-offsets.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const POLICY_DIR = path.resolve(HERE, '../../data/policies');

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

let totalFixed = 0;
let totalMissing = 0;

for (const file of fs.readdirSync(POLICY_DIR).filter((f) => f.endsWith('.json'))) {
  const full = path.join(POLICY_DIR, file);
  const policy = JSON.parse(fs.readFileSync(full, 'utf8'));
  if (!Array.isArray(policy.sections) || typeof policy.originalText !== 'string') continue;

  const { norm, map } = buildIndex(policy.originalText);
  let fixed = 0;
  let missing = 0;
  for (const section of policy.sections) {
    const target = String(section.text || '').replace(/\s+/g, '');
    if (!target) { missing += 1; continue; }
    const idx = norm.indexOf(target);
    if (idx < 0) { missing += 1; delete section.start; delete section.end; continue; }
    const start = map[idx];
    const end = map[idx + target.length - 1] + 1;
    if (section.start !== start || section.end !== end) fixed += 1;
    section.start = start;
    section.end = end;
  }
  fs.writeFileSync(full, JSON.stringify(policy, null, 2) + '\n', 'utf8');
  totalFixed += fixed;
  totalMissing += missing;
  console.log(`${policy.id}: 段落 ${policy.sections.length}，修正 ${fixed}，仍无法定位 ${missing}`);
}

console.log(`\n完成：共修正 ${totalFixed} 段，无法定位 ${totalMissing} 段`);
if (totalMissing > 0) process.exitCode = 1;
