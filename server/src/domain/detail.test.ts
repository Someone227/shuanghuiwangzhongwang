import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  buildDetailStats,
  buildPolicyDetail,
  formatGroupLogic,
  formatRequirement,
  pickRelated,
  splitNotes,
  toRelatedCandidate,
} from './detail.js';
import type { Policy } from './types.js';

/**
 * 政策详情页测试。
 *
 * 详情页是「只读浏览」页面，最容易出的错是展示出来的要求与判定引擎用的条件对不上
 * —— 页面说「不低于 2 年级」，引擎按 3 年级判，用户就会觉得被坑。
 * 所以下面的用例守住三条：
 * 1. 展示的条件数、组数、序号与源数据逐项一致；
 * 2. 条件值格式化成中文后仍能读出原意（布尔、单位、数组、字段引用）；
 * 3. 统计口径与政策库卡片一致，推荐不推荐自己。
 */

const HERE = path.dirname(fileURLToPath(import.meta.url));
const POLICY_DIR = path.resolve(HERE, '../../../data/policies');

function loadPolicies(): Policy[] {
  const files = fs.readdirSync(POLICY_DIR).filter((f) => f.endsWith('.json') && !f.startsWith('_'));
  return files.map((f) => JSON.parse(fs.readFileSync(path.join(POLICY_DIR, f), 'utf8')) as Policy);
}

const POLICIES = loadPolicies();
const POLICY = POLICIES.find((p) => p.id === 'national-scholarship');
if (!POLICY) throw new Error('缺少 national-scholarship 样本');

test('政策详情：条件组视图与源数据逐项一致', () => {
  const detail = buildPolicyDetail(POLICY);
  assert.equal(detail.groupViews.length, POLICY.conditions.length);
  detail.groupViews.forEach((group, gi) => {
    const source = POLICY.conditions[gi];
    assert.equal(group.name, source.name);
    assert.equal(group.logic, source.logic);
    assert.equal(group.conditions.length, source.conditions.length);
    group.conditions.forEach((condition, ci) => {
      assert.equal(condition.label, source.conditions[ci].label);
      assert.equal(condition.index, ci + 1, '组内序号应从 1 连续编号');
      assert.equal(condition.quote, source.conditions[ci].quote, '原文引用必须原样带出');
      assert.ok(condition.sectionHeading.length > 0, '每条条件都要能定位到原文段落标题');
    });
  });
});

test('政策详情：条件值格式化成中文仍能读出原意', () => {
  const flat = POLICY.conditions.flatMap((g) => g.conditions);
  const boolCondition = flat.find((c) => typeof c.value === 'boolean');
  assert.ok(boolCondition, '样本里应有布尔取值条件');
  const text = formatRequirement(boolCondition, POLICY);
  assert.ok(text.includes('「是」') || text.includes('「否」'), '布尔条件应展示为「是」/「否」，实际：' + text);

  const gradeCondition = flat.find((c) => c.operator === 'gte' && typeof c.value === 'number');
  assert.ok(gradeCondition, '样本里应有数值下限条件');
  const gradeText = formatRequirement(gradeCondition, POLICY);
  assert.ok(gradeText.startsWith('不低于'), '数值下限应展示为「不低于」，实际：' + gradeText);
  assert.ok(gradeText.includes(gradeCondition.unit ?? ''), '数值条件要带单位，实际：' + gradeText);

  const inCondition = POLICIES.flatMap((p) => p.conditions.flatMap((g) => g.conditions)).find(
    (c) => c.operator === 'in' && Array.isArray(c.value),
  );
  assert.ok(inCondition, '样本里应有枚举条件');
  const inText = formatRequirement(inCondition);
  assert.ok(inText.includes('或'), '枚举条件应用「或」连接，实际：' + inText);
});

test('政策详情：组逻辑说明随 all/any 变化', () => {
  assert.equal(formatGroupLogic('all', 5), '以下 5 条须同时满足');
  assert.equal(formatGroupLogic('any', 3), '满足以下任意 1 条即可（共 3 条）');
});

test('政策详情：统计口径与源数据一致', () => {
  for (const policy of POLICIES) {
    const stats = buildDetailStats(policy);
    const flat = policy.conditions.flatMap((g) => g.conditions);
    assert.equal(stats.conditions, flat.length, policy.id + ' 条件数不一致');
    assert.equal(stats.groups, policy.conditions.length, policy.id + ' 条件组数不一致');
    assert.equal(stats.requiredConditions, flat.filter((c) => c.required).length);
    assert.equal(stats.materials, policy.materials.length);
    assert.equal(stats.fields, policy.fields.length);
    assert.equal(stats.chars, policy.originalText.length);
  }
});

test('政策详情：过时条款提示单独拆出来', () => {
  const { alertNotes, normalNotes } = splitNotes(POLICY.notes);
  assert.ok(alertNotes.length >= 1, '样本 notes 里有一条【现行标准】提示');
  assert.ok(alertNotes[0].startsWith('【'), '带【】的提示应归入 alertNotes');
  assert.equal(alertNotes.length + normalNotes.length, POLICY.notes.length, '拆分不能丢条目');
  assert.equal(splitNotes([]).alertNotes.length, 0);
});

test('政策详情：同类推荐不含自己且优先同类别', () => {
  const candidates = POLICIES.map(toRelatedCandidate);
  const related = pickRelated(candidates, POLICY.id, 3);
  assert.equal(related.length, 3);
  assert.ok(!related.some((r) => r.id === POLICY.id), '不能把当前政策推荐给自己');
  assert.equal(new Set(related.map((r) => r.id)).size, 3, '推荐不能重复');
  assert.equal(related[0].category, POLICY.category, '第一条应是同类政策');
  assert.ok(related[0].reason.includes('同类'), '推荐理由要说清为什么，实际：' + related[0].reason);
  assert.ok(related[0].materials >= 0, '推荐卡片要带材料数');
});

test('政策详情：摘要级数据也能算出推荐（静态版不拉全文）', () => {
  const summaries = POLICIES.map((p) => ({
    id: p.id,
    title: p.title,
    category: p.category,
    level: p.level,
    year: p.year,
    conditions: p.conditions.reduce((sum, g) => sum + g.conditions.length, 0),
    materials: p.materials.length,
  }));
  const related = pickRelated(summaries, POLICY.id, 3);
  assert.equal(related.length, 3);
  assert.ok(!related.some((r) => r.id === POLICY.id));
});

test('政策详情：每份政策都能构建完整视图', () => {
  for (const policy of POLICIES) {
    const detail = buildPolicyDetail(policy);
    assert.equal(detail.id, policy.id);
    assert.equal(detail.sectionViews.length, policy.sections.length);
    assert.ok(detail.stats.conditions > 0, policy.id + ' 应至少有一条判定条件');
    const referenced = detail.groupViews.flatMap((g) => g.conditions).map((c) => c.docRef);
    for (const docRef of new Set(referenced)) {
      assert.ok(
        detail.sectionViews.some((s) => s.id === docRef),
        policy.id + ' 的条件引用了不存在的原文段落：' + docRef,
      );
    }
  }
});
