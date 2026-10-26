import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { evaluate } from './matcher.js';
import type { Policy, Profile } from './types.js';

function loadPolicy(id: string): Policy {
  const url = new URL(`../../../data/policies/${id}.json`, import.meta.url);
  return JSON.parse(readFileSync(url, 'utf8')) as Policy;
}

const nationalScholarship = loadPolicy('national-scholarship');
const vocationalNational = loadPolicy('vocational-national-scholarship');
const minorityGraduate = loadPolicy('minority-graduate-plan');

/** 国家奖学金：基本条件全部满足、年级合规的画像（成绩条件由各用例自己填） */
const nsBasics: Profile = {
  nationality: '中华人民共和国',
  'political.support': true,
  'conduct.compliance': true,
  'conduct.integrity': true,
  'achievement.outstanding': true,
  'education.grade': 2,
  'education.level': '本科',
};

test('并列通道：常规成绩达标、突出表现通道不满足，仍判符合（不再被另一条通道拖累）', () => {
  const profile: Profile = {
    ...nsBasics,
    'academic.rankPercent': 5,
    'academic.comprehensiveRankPercent': 4,
    // 排名已进前 10%，走常规通道即可；但没有「经学校盖章的突出证明材料」，
    // 突出表现通道不成立 —— 这在旧实现里会把整份政策判成不符合
    'achievement.proofAvailable': false,
  };
  const result = evaluate(nationalScholarship, profile);

  const routine = result.channels.find((c) => c.id === 'routine');
  const outstanding = result.channels.find((c) => c.id === 'outstanding');
  assert.equal(routine?.verdict, 'pass');
  assert.equal(outstanding?.verdict, 'fail');
  // 通道之间是二选一：另一条通道不满足不该影响结论
  assert.equal(result.overall, 'pass');
  assert.match(result.headline, /常规成绩通道/);
});

test('并列通道：只有突出表现通道达标，也判符合', () => {
  const profile: Profile = {
    ...nsBasics,
    'academic.rankPercent': 20,
    'academic.comprehensiveRankPercent': 18,
    'achievement.outstanding': true,
    'achievement.proofAvailable': true,
  };
  const result = evaluate(nationalScholarship, profile);

  assert.equal(result.channels.find((c) => c.id === 'routine')?.verdict, 'fail');
  assert.equal(result.channels.find((c) => c.id === 'outstanding')?.verdict, 'pass');
  assert.equal(result.overall, 'pass');
  assert.match(result.headline, /突出表现通道/);
});

test('并列通道：两条通道都不满足才判不符合', () => {
  const profile: Profile = {
    ...nsBasics,
    'academic.rankPercent': 45,
    'academic.comprehensiveRankPercent': 50,
    'achievement.outstanding': false,
    'achievement.proofAvailable': false,
  };
  const result = evaluate(nationalScholarship, profile);

  assert.equal(result.channels.every((c) => c.verdict === 'fail'), true);
  assert.equal(result.overall, 'fail');
  assert.match(result.headline, /都没满足/);
});

test('入学第六年不再具备资格：按年级判断，而不是把入学年份当年限', () => {
  const base = { ...nsBasics, 'academic.rankPercent': 5, 'academic.comprehensiveRankPercent': 4 };
  // 二年级符合（原实现会把 2024 ≤ 5 判成不符合）
  assert.equal(evaluate(nationalScholarship, { ...base, 'education.grade': 2 }).overall, 'pass');
  // 六年级不符合
  const result = evaluate(nationalScholarship, { ...base, 'education.grade': 6 });
  assert.equal(result.overall, 'fail');
  const gradeGroup = result.groups.find((g) => g.groupId === 'g2');
  assert.equal(gradeGroup?.verdict, 'fail');
});

test('中职国家奖学金：前 5% 直接认定，不再要求突出表现材料', () => {
  const profile: Profile = {
    nationality: '中华人民共和国',
    'school.type': '中等职业学校',
    'enrollment.status': '全日制在校生',
    'ideology.support': true,
    'compliance.lawAndRules': true,
    'integrity.moralQuality': true,
    'performance.excellent': true,
    'education.grade': 2,
    'major.rankPercent': 3,
    // 突出表现与证明材料都没填：前 5% 通道不该被它们拖成未知
    'outstanding.any': undefined,
    'outstanding.proofAvailable': undefined,
  };
  const result = evaluate(vocationalNational, profile);
  const top5 = result.channels.find((c) => c.id === 'top5');
  const top30 = result.channels.find((c) => c.id === 'top30');
  assert.equal(top5?.verdict, 'pass');
  assert.equal(top30?.verdict, 'unknown');
  assert.equal(result.overall, 'pass');
});

test('少数民族骨干计划：报考硕士与报考博士是两条通道，不会因学历互斥被判不符合', () => {
  const profile: Profile = {
    'identity.politicalStance': true,
    'identity.isMinority': true,
    'education.hasBachelor': true,
    'education.level': '硕士',
    'age.current': 30,
    'academic.excellent': true,
    'academic.languageStandard': true,
    'agreement.acceptDirected': true,
    'agreement.signed': true,
    'region.isWestern': true,
    // 择优参考条件（非硬性）：明确勾「没有」，避免留空让整组变成「待补充」
    'academic.hasAchievement': false,
    'academic.bilingualMinorityLanguage': false,
  };
  const result = evaluate(minorityGraduate, profile);
  const master = result.channels.find((c) => c.id === 'master');
  const doctor = result.channels.find((c) => c.id === 'doctor');
  assert.equal(master?.verdict, 'pass');
  assert.equal(doctor?.verdict, 'fail');
  // 旧实现里「年龄条件」组要求学历同时是硕士和博士，必然 fail
  assert.equal(result.overall, 'pass');
});
