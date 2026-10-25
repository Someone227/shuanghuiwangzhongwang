import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { Policy } from '../domain/types.js';

/**
 * 政策库读取层。
 *
 * 政策库是静态数据（data/policies/*.json），由 AI 在开发期抽取、人工复核后入库。
 * 运行期只读文件、不联网、不调大模型，所以现场演示不会有任何延迟或费用。
 *
 * 这么多文件（31 个、约 1MB）每次全量读解析只需几十毫秒，优先保证「改了文件立即生效」。
 */

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '..', '..', '..');

export const POLICY_DIR = path.join(REPO_ROOT, 'data', 'policies');

/** 列表页需要的摘要：不带原文与条件树，避免一次传几百 KB */
export interface PolicySummary {
  id: string;
  title: string;
  level: Policy['level'];
  category: Policy['category'];
  issuer: string;
  year: number;
  sourceUrl?: string;
  stats: {
    sections: number;
    fields: number;
    conditions: number;
    required: number;
    materials: number;
    deadlines: number;
  };
  review: { humanReviewed: boolean; reviewedAt: string } | null;
}

function readPolicyFiles(): Policy[] {
  const files = fs
    .readdirSync(POLICY_DIR)
    .filter((f) => f.endsWith('.json') && !f.startsWith('_'));
  return files.map((f) => JSON.parse(fs.readFileSync(path.join(POLICY_DIR, f), 'utf8')) as Policy);
}

export function listPolicies(): PolicySummary[] {
  return readPolicyFiles()
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
}

/** 只允许 [a-z0-9-] 的 id，顺带防住 ../ 之类的路径穿越 */
export function getPolicy(id: string): Policy | null {
  if (!/^[a-z0-9-]+$/.test(id)) return null;
  try {
    return JSON.parse(fs.readFileSync(path.join(POLICY_DIR, id + '.json'), 'utf8')) as Policy;
  } catch {
    return null;
  }
}
