import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { evaluate } from './matcher.js';
import type { Policy } from './types.js';

/**
 * 政策库数据契约测试。
 *
 * 政策库是「AI 建库 + 人工复核」的产物，是运行期判定的唯一依据。
 * 这里不测判定逻辑（在 matcher.test.ts），而是守住数据本身不能坏：
 *   - 每个条件都能回溯到存在的原文段落（docRef 有效）
 *   - 每句 quote 都真的出自原文（AI 没有编造）
 *   - 每段都有准确的字符偏移（前端高亮依赖它）
 *   - 人工复核过的过时条件必须输出「需确认」而不是误判
 */

const HERE = path.dirname(fileURLToPath(import.meta.url));
const POLICY_DIR = path.resolve(HERE, '../../../data/policies');

/** 去掉所有空白，中文文本比对时换行/空格差异不算不一样 */
const normalize = (s: string) => s.replace(/\s+/g, '');

function loadPolicies(): Policy[] {
  const files = fs.readdirSync(POLICY_DIR).filter((f) => f.endsWith('.json') && !f.startsWith('_'));
  return files.map((f) => JSON.parse(fs.readFileSync(path.join(POLICY_DIR, f), 'utf8')) as Policy);
}

const policies = loadPolicies();

test('政策库：至少收录五份政策且 id 唯一', () => {
  assert.ok(policies.length >= 5, `政策库只有 ${policies.length} 份`);
  const ids = new Set(policies.map((p) => p.id));
  assert.equal(ids.size, policies.length, '政策 id 有重复');
});

test('政策库：每个条件的 docRef 都指向存在的原文段落', () => {
  for (const policy of policies) {
    const sectionIds = new Set(policy.sections.map((s) => s.id));
    for (const group of policy.conditions) {
      assert.ok(sectionIds.has(group.docRef), `${policy.id} 组 ${group.id} 的 docRef ${group.docRef} 不存在`);
      for (const cond of group.conditions) {
        assert.ok(sectionIds.has(cond.docRef), `${policy.id} 条件 ${cond.id} 的 docRef ${cond.docRef} 不存在`);
      }
    }
  }
});

test('政策库：每句 quote 都能在原文中找到（AI 不编造）', () => {
  const text = new Map(policies.map((p) => [p.id, normalize(p.originalText)]));
  let checked = 0;
  for (const policy of policies) {
    for (const group of policy.conditions) {
      for (const cond of group.conditions) {
        assert.ok(
          text.get(policy.id)!.includes(normalize(cond.quote)),
          `${policy.id} 条件 ${cond.id} 的 quote 不在原文中：${cond.quote.slice(0, 40)}`,
        );
        checked += 1;
      }
    }
  }
  assert.ok(checked >= 50, `只校验了 ${checked} 条引用，数据量异常`);
});

test('政策库：每段都有准确的字符偏移（前端高亮依赖）', () => {
  for (const policy of policies) {
    for (const section of policy.sections) {
      assert.equal(typeof section.start, 'number', `${policy.id} 段落 ${section.id} 缺 start`);
      assert.equal(typeof section.end, 'number', `${policy.id} 段落 ${section.id} 缺 end`);
      const slice = policy.originalText.slice(section.start!, section.end!);
      assert.equal(normalize(slice), normalize(section.text), `${policy.id} 段落 ${section.id} 的偏移与正文不一致`);
    }
  }
});

test('人工复核：助学贷款的过时条件判为「需确认」而不是误判', () => {
  const loan = policies.find((p) => p.id === 'student-loan');
  assert.ok(loan, '缺少 student-loan 政策');
  assert.equal(loan!.review?.humanReviewed, true, 'student-loan 未标记人工复核');

  const result = evaluate(loan!, {});
  const byId = new Map(result.conditions.map((c) => [c.conditionId, c]));
  for (const id of ['c9', 'c11', 'c12']) {
    const cond = byId.get(id);
    assert.ok(cond, `判定结果缺少条件 ${id}`);
    assert.equal(cond!.verdict, 'unknown', `${id} 应判为需人工确认，实际是 ${cond!.verdict}`);
  }
  assert.notEqual(result.overall, 'fail', '空资料下不应直接判为不符合');
});

test('政策库：五份政策都能完成判定并给出结论', () => {
  for (const policy of policies) {
    const result = evaluate(policy, {});
    assert.equal(result.policyId, policy.id);
    assert.ok(result.headline.length > 0, `${policy.id} 没有结论文案`);
    assert.ok(result.summary.requiredTotal > 0, `${policy.id} 没有硬性条件`);
  }
});

test('前端表单格式（扁平键画像）能驱动真实政策判定', () => {
  const loan = policies.find((p) => p.id === 'student-loan')!;
  const profile = {
    'identity.nationality': '中华人民共和国',
    'identity.creditStatus': true,
    'education.enrollmentStatus': '高校在读学生',
    'education.schoolType': '全日制普通本科高校',
    'education.studentLevel': '本专科学生',
    'household.studentHukouCounty': '江宁区',
    'household.parentHukouCounty': '江宁区',
    'household.applyCounty': '江宁区',
    'household.province': '江苏',
    'economy.familyDifficulty': true,
    'loan.annualAmount': 8000,
    'loan.hasNationalLoanThisYear': false,
  };
  const result = evaluate(loan, profile);
  const byId = new Map(result.conditions.map((c) => [c.conditionId, c]));

  // 模板条件 {{household.applyCounty}} 依赖扁平键读取
  assert.equal(byId.get('c6')?.verdict, 'pass', '户籍县条件应判为符合');
  assert.equal(byId.get('c7')?.verdict, 'pass', '父母户籍县条件应判为符合');
  assert.equal(byId.get('c10')?.verdict, 'pass', '未获国家助学贷款应判为符合');
  // 布尔值在理由里要显示成中文，而不是 true/false
  assert.match(byId.get('c10')?.reason ?? '', /否/);
  assert.ok(result.summary.pass >= 6, `只判出 ${result.summary.pass} 项符合，扁平画像可能没被读到`);
});
