import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { RESPONSIBILITY_LABEL, buildCalendar, classifyResponsibility, parseDeadlineText } from './calendar.js';
import type { Policy } from './types.js';

/**
 * 申报日历测试。
 *
 * 政策原文的时间写法五花八门（「每年 10 月 31 日前」「2025 年秋季学期」「受理之日起 30 个工作日内」），
 * 这里守住分类规则：年度节点必须落到正确的月份，相对时限不能被误当成年度节点。
 */

const HERE = path.dirname(fileURLToPath(import.meta.url));
const POLICY_DIR = path.resolve(HERE, '../../../data/policies');

function loadPolicies(): Policy[] {
  const files = fs.readdirSync(POLICY_DIR).filter((f) => f.endsWith('.json') && !f.startsWith('_'));
  return files.map((f) => JSON.parse(fs.readFileSync(path.join(POLICY_DIR, f), 'utf8')) as Policy);
}

test('申报日历：年度窗口解析到月份与日期', () => {
  const a = parseDeadlineText('每年10月31日前');
  assert.equal(a.kind, 'annual');
  assert.deepEqual(a.months, [10]);
  assert.equal(a.day, 31);

  const b = parseDeadlineText('每年9月30日前');
  assert.equal(b.kind, 'annual');
  assert.deepEqual(b.months, [9]);

  const c = parseDeadlineText('每年6月底前');
  assert.equal(c.kind, 'annual');
  assert.deepEqual(c.months, [6]);
  // 「6 月底」要落到 6 月 30 日，不能出现不存在的 6 月 31 日
  assert.equal(c.day, 30);

  const d = parseDeadlineText('当年11月10日前');
  assert.equal(d.kind, 'annual');
  assert.deepEqual(d.months, [11]);
  assert.equal(d.day, 10);
});

test('申报日历：具体日期属于某一年', () => {
  const parsed = parseDeadlineText('2025-08-31');
  assert.equal(parsed.kind, 'specific');
  assert.deepEqual(parsed.months, [8]);
  assert.equal(parsed.day, 31);
});

test('申报日历：学期与招生季单独归类', () => {
  const autumn = parseDeadlineText('2025年秋季学期');
  assert.equal(autumn.kind, 'semester');
  assert.deepEqual(autumn.months, [9]);

  const spring = parseDeadlineText('2017年春季学期');
  assert.equal(spring.kind, 'semester');
  assert.deepEqual(spring.months, [3]);

  const admission = parseDeadlineText('每年高考录取提前批');
  assert.equal(admission.kind, 'semester');
});

test('申报日历：相对时限不算年度节点', () => {
  for (const text of ['受理之日起30个工作日内', '开学后15个工作日内', '不少于5个工作日', '确认同意决定之日下月起']) {
    const parsed = parseDeadlineText(text);
    assert.equal(parsed.kind, 'process', `${text} 应归入办理时限`);
    assert.deepEqual(parsed.months, []);
  }
});

test('申报日历：政策沿革与空值', () => {
  assert.equal(parseDeadlineText('2014年底前').kind, 'history');
  assert.equal(parseDeadlineText('').kind, 'other');
  assert.equal(parseDeadlineText(undefined).kind, 'other');
});

test('申报日历：往年的一次性节点沉到政策沿革，不再混进今年月份', () => {
  const calendar = buildCalendar(loadPolicies());
  const currentYear = new Date().getFullYear();

  for (const month of calendar.months) {
    for (const event of month.events) {
      if (event.year === undefined) continue;
      assert.ok(
        event.year >= currentYear,
        `${event.label}（${event.dateText}）是往年节点，不应出现在 ${month.month} 月`,
      );
    }
  }

  // 过期的一次性节点仍保留在历史里，并带上标记，方便核对「这个节点已经过去了」
  const expired = calendar.history.filter((event) => event.expired);
  assert.ok(expired.length > 0, '历史分组里应保留带过期标记的一次性节点');
});

test('申报日历：逐条标出责任方，个人节点不跟学校报送混在一起', () => {
  assert.equal(classifyResponsibility('学生向学校提出申请'), 'applicant');
  assert.equal(classifyResponsibility('学生本人登录系统提交申请'), 'applicant');
  assert.equal(classifyResponsibility('中央高校报送评审结果'), 'school');
  assert.equal(classifyResponsibility('校内公示'), 'school');
  assert.equal(classifyResponsibility('省级教育行政部门统一报教育部审批'), 'authority');
  assert.equal(classifyResponsibility('地方教育行政部门审核汇总'), 'authority');
  // 「学校报送学生申请」是学校的事，不能因为含「学生申请」就判成个人
  assert.equal(classifyResponsibility('学校报送学生申请'), 'school');
  // 节点名本身就是申请人动作
  assert.equal(classifyResponsibility('见习补贴申领'), 'applicant');
  assert.equal(classifyResponsibility('高考报名'), 'applicant');
  // 「申请受理」是部门动作，不是申请人动作
  assert.equal(classifyResponsibility('申请受理'), 'authority');

  // 排在月份里的每条节点都必须有责任方，且落在四种取值内
  const calendar = buildCalendar(loadPolicies());
  for (const month of calendar.months) {
    for (const event of month.events) {
      assert.ok(
        event.responsibility in RESPONSIBILITY_LABEL,
        `${event.label} 的责任方未标注`,
      );
    }
  }
});

test('申报日历：真实政策库能汇总出 12 个月份结构', () => {
  const calendar = buildCalendar(loadPolicies());

  assert.equal(calendar.months.length, 12);
  assert.ok(calendar.stats.fixedEvents > 0, '应当有固定到月份的年度节点');
  assert.ok(calendar.stats.policies >= 10, `覆盖政策数偏少：${calendar.stats.policies}`);
  assert.ok(calendar.stats.monthsCovered >= 5, `覆盖月份数偏少：${calendar.stats.monthsCovered}`);

  // 每月事件按 MM-DD 排序
  for (const month of calendar.months) {
    const keys = month.events.map((e) => e.sortKey);
    assert.deepEqual(keys, [...keys].sort(), `${month.month} 月的事件没有按时间排序`);
  }

  // 9 / 10 / 11 月是高校奖助学金申报的集中窗口，必须有节点
  const autumnMonths = [9, 10, 11].map((m) => calendar.months[m - 1].events.length);
  assert.ok(autumnMonths.every((n) => n > 0), `秋季申报窗口缺少节点：${JSON.stringify(autumnMonths)}`);

  // 每条年度节点都必须有来源政策
  const policyIds = new Set(loadPolicies().map((p) => p.id));
  for (const month of calendar.months) {
    for (const event of month.events) assert.ok(policyIds.has(event.policyId));
  }

  // 办理时限与年度节点不能混在一起
  for (const event of calendar.process) assert.deepEqual(event.months, []);
});
