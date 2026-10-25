#!/usr/bin/env node
/**
 * 导出静态数据：把 data/policies/*.json 复制到 web/public/policies/。
 *
 * 用途：纯静态托管（GitHub Pages）—— 判定引擎在前端浏览器里跑，不需要后端。
 * 生成物：
 *   web/public/policies/index.json   列表页摘要（不含原文，避免首页一次拉 1MB）
 *   web/public/policies/<id>.json    每份政策全量（原文 + 条件树 + 材料 + 时限）
 *
 * 生成目录已被 .gitignore 忽略，构建前跑一次即可（CI 也是如此）。
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '..', '..');
const SRC_DIR = path.join(REPO_ROOT, 'data', 'policies');
const OUT_DIR = path.join(REPO_ROOT, 'web', 'public', 'policies');

const files = fs
  .readdirSync(SRC_DIR)
  .filter((f) => f.endsWith('.json') && !f.startsWith('_'))
  .sort();

if (files.length === 0) {
  console.error('✗ data/policies 下没有政策 JSON，先跑抽取流程');
  process.exit(1);
}

const policies = files.map((f) => JSON.parse(fs.readFileSync(path.join(SRC_DIR, f), 'utf8')));

fs.rmSync(OUT_DIR, { recursive: true, force: true });
fs.mkdirSync(OUT_DIR, { recursive: true });

// 摘要字段与 server/src/policies/store.ts 的 PolicySummary 保持一致
const summary = policies
  .map((p) => {
    const conditions = p.conditions.flatMap((g) => g.conditions);
    return {
      id: p.id,
      title: p.title,
      level: p.level,
      category: p.category,
      issuer: p.issuer,
      year: p.year,
      sourceUrl: p.sourceUrl,
      stats: {
        sections: p.sections.length,
        fields: p.fields.length,
        conditions: conditions.length,
        required: conditions.filter((c) => c.required).length,
        materials: p.materials.length,
        deadlines: p.deadlines.length,
      },
      review: p.review ? { humanReviewed: p.review.humanReviewed, reviewedAt: p.review.reviewedAt } : null,
    };
  })
  .sort((a, b) => a.title.localeCompare(b.title, 'zh-CN'));

let bytes = 0;
for (const p of policies) {
  const out = path.join(OUT_DIR, p.id + '.json');
  fs.writeFileSync(out, JSON.stringify(p));
  bytes += fs.statSync(out).size;
}
const indexOut = path.join(OUT_DIR, 'index.json');
fs.writeFileSync(indexOut, JSON.stringify(summary));
bytes += fs.statSync(indexOut).size;

console.log(
  `✓ 导出 ${policies.length} 份政策到 web/public/policies/（index.json + 每份全文，共 ${(bytes / 1024).toFixed(0)} KB）`,
);
