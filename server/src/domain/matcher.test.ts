import { test } from 'node:test';
import assert from 'node:assert/strict';

import { evaluate, getField } from './matcher.js';
import type { Policy } from './types.js';
import { scholarshipPolicy, subsidyPolicy } from './__fixtures__/policies.js';

/** 用户填 「学生户籍县 == 办理地县」这类字段间对比，条件值用 {{field.path}} 模板表达 */
const hukouPolicy = {
  id: 'fixture-template',
  title: '模板对比测试政策',
  level: '国家级',
  category: '助学贷款',
  issuer: '测试',
  year: 2026,
  sourceUrl: 'https://example.com',
  originalText: '学生本人入学前户籍、其父母（或其他法定监护人）户籍均在本县（市、区）。',
  sections: [{ id: 's1', heading: '户籍条件', text: '学生本人入学前户籍、其父母（或其他法定监护人）户籍均在本县（市、区）。' }],
  fields: [
    { key: 'household.studentCounty', label: '学生户籍所在县', type: 'text' },
    { key: 'household.applyCounty', label: '办理贷款的县', type: 'text' },
  ],
  conditions: [{
    id: 'g1',
    name: '户籍条件',
    logic: 'all',
    docRef: 's1',
    conditions: [{
      id: 'c1',
      field: 'household.studentCounty',
      label: '学生户籍在办理地',
      operator: 'eq',
      value: '{{household.applyCounty}}',
      docRef: 's1',
      quote: '学生本人入学前户籍、其父母（或其他法定监护人）户籍均在本县（市、区）。',
      required: true,
    }],
  }],
  materials: [],
  deadlines: [],
  notes: [],
  extraction: { engine: 'manual', model: 'fixture', at: '2026-10-25' },
} as unknown as Policy;

const fullProfile = {
  nationality: '中国',
  education: { mode: '全日制', grade: 3 },
  rank: { percent: 5 },
  honor: { any: true },
};

test('getField 支持点路径', () => {
  assert.equal(getField(fullProfile, 'education.mode'), '全日制');
  assert.equal(getField(fullProfile, 'education.nothing'), undefined);
});

test('全部条件满足 -> overall=pass', () => {
  const result = evaluate(scholarshipPolicy, fullProfile);
  assert.equal(result.overall, 'pass');
  assert.equal(result.summary.fail, 0);
  assert.equal(result.summary.unknown, 0);
  assert.match(result.headline, /符合条件/);
  assert.deepEqual(result.missingMaterials, []);
});

test('年级不足 -> overall=fail，且给出差在哪', () => {
  const result = evaluate(scholarshipPolicy, { ...fullProfile, education: { mode: '全日制', grade: 1 } });
  assert.equal(result.overall, 'fail');
  const grade = result.conditions.find((c) => c.conditionId === 'c3');
  assert.ok(grade);
  assert.equal(grade.verdict, 'fail');
  assert.match(grade.gap ?? '', /二年级以上/);
  assert.match(grade.quote, /二年级以上/);
  assert.equal(grade.docRef, 's2');
});

test('字段缺失 -> unknown，而不是误判 fail', () => {
  const profile = { nationality: '中国', education: { mode: '全日制' }, rank: {} };
  const result = evaluate(scholarshipPolicy, profile);
  assert.equal(result.overall, 'unknown');
  const grade = result.conditions.find((c) => c.conditionId === 'c3');
  assert.equal(grade?.verdict, 'unknown');
  assert.match(result.headline, /补充信息|人工确认/);
});

test('建议性条件不满足只记 warn，不影响总体结论', () => {
  const result = evaluate(scholarshipPolicy, { ...fullProfile, honor: { any: false } });
  assert.equal(result.overall, 'pass');
  const honor = result.conditions.find((c) => c.conditionId === 'c5');
  assert.equal(honor?.verdict, 'warn');
  assert.equal(result.summary.warn, 1);
});

test('any 组：满足其一即通过', () => {
  const byDegree = evaluate(subsidyPolicy, { education: { degree: '本科' }, title: { level: '无' } });
  const anyGroup = byDegree.groups.find((g) => g.groupId === 'g1');
  assert.equal(anyGroup?.verdict, 'pass');

  const byTitle = evaluate(subsidyPolicy, { education: { degree: '专科' }, title: { level: '中级' } });
  assert.equal(byTitle.groups.find((g) => g.groupId === 'g1')?.verdict, 'pass');

  const neither = evaluate(subsidyPolicy, { education: { degree: '专科' }, title: { level: '无' } });
  assert.equal(neither.groups.find((g) => g.groupId === 'g1')?.verdict, 'fail');
});

test('autoUncertain 条件 -> unknown 且提示人工确认', () => {
  const result = evaluate(subsidyPolicy, { education: { degree: '本科' }, title: { level: '无' } });
  const housing = result.conditions.find((c) => c.conditionId === 'c3');
  assert.equal(housing?.verdict, 'unknown');
  assert.match(housing?.reason ?? '', /人工确认/);
  assert.equal(result.overall, 'unknown');
});

test('模板值 {{field}}：两个用户字段相互比较', () => {
  const same = evaluate(hukouPolicy, { household: { studentCounty: '江宁区', applyCounty: '江宁区' } });
  assert.equal(same.overall, 'pass');

  const diff = evaluate(hukouPolicy, { household: { studentCounty: '鼓楼区', applyCounty: '江宁区' } });
  assert.equal(diff.overall, 'fail');
  assert.match(diff.conditions[0].gap ?? '', /江宁区/);

  const missing = evaluate(hukouPolicy, { household: { studentCounty: '江宁区' } });
  assert.equal(missing.overall, 'unknown');
  assert.match(missing.conditions[0].reason, /applyCounty/);
});

test('数值比较：gte / lte 边界值', () => {
  const edge = evaluate(scholarshipPolicy, { ...fullProfile, rank: { percent: 10 }, education: { mode: '全日制', grade: 2 } });
  assert.equal(edge.overall, 'pass');
  const over = evaluate(scholarshipPolicy, { ...fullProfile, rank: { percent: 10.1 } });
  assert.equal(over.overall, 'fail');
});
