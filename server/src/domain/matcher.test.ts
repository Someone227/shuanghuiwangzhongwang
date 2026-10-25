import { test } from 'node:test';
import assert from 'node:assert/strict';

import { evaluate, getField } from './matcher.js';
import { scholarshipPolicy, subsidyPolicy } from './__fixtures__/policies.js';

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

test('数值比较：gte / lte 边界值', () => {
  const edge = evaluate(scholarshipPolicy, { ...fullProfile, rank: { percent: 10 }, education: { mode: '全日制', grade: 2 } });
  assert.equal(edge.overall, 'pass');
  const over = evaluate(scholarshipPolicy, { ...fullProfile, rank: { percent: 10.1 } });
  assert.equal(over.overall, 'fail');
});
