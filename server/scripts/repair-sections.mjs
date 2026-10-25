#!/usr/bin/env node
/**
 * repair-sections.mjs —— 修复无法回溯原文的条件段落
 *
 * 为什么需要：模型转写段落时可能漏字/断句（例如漏掉「（见附表）」），
 * 使段落文本无法在原文中定位，前端就无法回链高亮。
 * 本脚本用「最长可匹配前缀 + 尾部对齐 + 句末补全」把段落文本替换为原文真实片段。
 * 可重复执行（已能定位的段落会跳过）。
 *
 * 用法：node scripts/repair-sections.mjs
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

const strip = (s) => String(s || '').replace(/\s+/g, '');

let repaired = 0;
let failed = 0;

for (const file of fs.readdirSync(POLICY_DIR).filter((f) => f.endsWith('.json'))) {
  const full = path.join(POLICY_DIR, file);
  const policy = JSON.parse(fs.readFileSync(full, 'utf8'));
  if (!Array.isArray(policy.sections) || typeof policy.originalText !== 'string') continue;

  const raw = policy.originalText;
  const { norm, map } = buildIndex(raw);
  let dirty = false;

  for (const section of policy.sections) {
    const target = strip(section.text);
    if (!target) continue;
    if (norm.includes(target)) continue;

    // 最长可匹配前缀
    let lo = 0;
    let hi = target.length;
    while (lo < hi) {
      const mid = Math.ceil((lo + hi) / 2);
      if (norm.includes(target.slice(0, mid))) lo = mid;
      else hi = mid - 1;
    }
    if (lo < 12) {
      console.log(`  ✗ ${policy.id}/${section.id}: 前缀仅 ${lo} 字符，需人工处理`);
      failed += 1;
      continue;
    }

    const startPos = norm.indexOf(target.slice(0, lo));

    // 尾部对齐：模型文本末尾片段在原文中的位置
    const tailLen = Math.min(24, target.length);
    const tail = target.slice(-tailLen);
    let endPos = -1;
    const hit = norm.indexOf(tail, startPos + lo);
    if (hit >= 0) endPos = hit + tailLen;
    if (endPos < 0) endPos = startPos + lo;

    // 向后补到最近的句号，保证语义完整
    for (let k = endPos; k < Math.min(norm.length, endPos + 40); k += 1) {
      if (norm[k] === '。') { endPos = k + 1; break; }
    }

    const newText = raw.slice(map[startPos], map[endPos - 1] + 1);
    console.log(`  ✓ ${policy.id}/${section.id}: 修复为原文片段（${target.length} -> ${strip(newText).length} 字符）`);
    section.text = newText;
    section.start = map[startPos];
    section.end = map[endPos - 1] + 1;
    section.repaired = true;
    repaired += 1;
    dirty = true;
  }

  if (dirty) fs.writeFileSync(full, JSON.stringify(policy, null, 2) + '\n', 'utf8');
}

console.log(`\n完成：修复 ${repaired} 段，需人工处理 ${failed} 段`);
if (failed > 0) process.exitCode = 1;
