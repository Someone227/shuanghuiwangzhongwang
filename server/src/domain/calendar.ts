/**
 * 申报日历：把各份政策里的「时间节点」聚合成一年里的申报节奏。
 *
 * 政策原文的时间约定有几种写法，处理方式不同：
 * 1. 年度固定窗口 ——「每年 10 月 31 日前报送」：进年度日历，固定到月（有的到日）；
 * 2. 确定日期 ——「2025-08-31」：进年度日历，只属于某一年；
 * 3. 学期/招生周期 ——「2025 年秋季学期」「每年高考录取提前批」：单独归入「学期与招生季」；
 * 4. 相对时限 ——「受理之日起 30 个工作日内」：不是年度节点，归入「办理时限」；
 * 5. 政策沿革 ——「2014 年底前」：政策施行时间，归入「政策沿革」。
 *
 * 解析全部是规则匹配，不调用大模型 —— 和判定引擎一样，运行期零 token、断网可用。
 */

import type { Policy } from './types.js';

export type CalendarKind = 'annual' | 'specific' | 'semester' | 'process' | 'history' | 'other';

/**
 * 节点该谁去做。
 *
 * 政策原文里同一份文件既有「学生向学校提出申请」，也有「中央高校报送评审结果」，
 * 混在一起排进日历会让人以为学校报送也需要自己跑一趟 —— 所以逐条标出责任方。
 */
export type CalendarResponsibility = 'applicant' | 'school' | 'authority' | 'unknown';

export const RESPONSIBILITY_LABEL: Record<CalendarResponsibility, string> = {
  applicant: '个人要办',
  school: '学校/院系',
  authority: '主管部门',
  unknown: '未标注',
};

export interface CalendarEvent {
  /** 稳定 id：<policyId>-<序号> */
  id: string;
  policyId: string;
  policyTitle: string;
  category: string;
  level: string;
  /** 节点名称，如「学生向学校提出申请」 */
  label: string;
  /** 原文里的时间写法，如「每年 9 月 30 日前」 */
  dateText: string;
  note?: string;
  /** 解析出的月份（1-12）；空数组表示不落在某个具体月份 */
  months: number[];
  day?: number;
  kind: CalendarKind;
  /** 一次性节点的年份（如 2025-10-31）；「每年 X 月」这类年度循环节点没有 */
  year?: number;
  /** 这条节点该谁去做：个人 / 学校 / 主管部门 */
  responsibility: CalendarResponsibility;
  /** 已过期的当年一次性节点会沉到「政策沿革」 */
  expired?: boolean;
  /** 月内排序键 MM-DD */
  sortKey: string;
}

export interface CalendarMonth {
  /** 1-12 */
  month: number;
  events: CalendarEvent[];
}

export interface CalendarData {
  /** 固定到月份的年度节点，按月份分好组 */
  months: CalendarMonth[];
  /** 学期与招生季（不固定到某个月） */
  semester: CalendarEvent[];
  /** 提交之后的办理时限 */
  process: CalendarEvent[];
  /** 政策沿革（施行时间） */
  history: CalendarEvent[];
  /** 无法归类的余项 */
  other: CalendarEvent[];
  stats: {
    /** 年度节点数量（months 里的） */
    fixedEvents: number;
    /** 全部时间节点数量 */
    totalEvents: number;
    /** 涉及的政策份数 */
    policies: number;
    /** 有申报节点的月份数 */
    monthsCovered: number;
  };
}

const pad2 = (n: number): string => (n < 10 ? `0${n}` : String(n));

/** 某个月的最后一天（「6 月底」= 6 月 30 日，而不是不存在的 6 月 31 日） */
const lastDayOf = (month: number): number => new Date(2025, month, 0).getDate();

interface ParsedDeadline {
  kind: CalendarKind;
  months: number[];
  day?: number;
  /** 「2025-08-31」这类一次性日期带的年份 */
  year?: number;
  sortKey: string;
}

const EMPTY: ParsedDeadline = { kind: 'other', months: [], sortKey: '99-99' };

const annual = (month: number, day?: number): ParsedDeadline => ({
  kind: 'annual',
  months: [month],
  day,
  sortKey: `${pad2(month)}-${day === undefined ? '32' : pad2(day)}`,
});

const pick = (kind: CalendarKind, prefix: string, months: number[] = [], day?: number): ParsedDeadline => ({
  kind,
  months,
  day,
  sortKey: `${prefix}-00`,
});

/**
 * 解析一条时间节点的文本，判断它属于哪一类、落在哪个月。
 *
 * 顺序很重要：先认最具体的写法（ISO 日期 → 每年 X 月 Y 日 → 每年 X 月），
 * 再认学期/招生周期，最后才按关键词落到相对时限或政策沿革。
 */
export function parseDeadlineText(text: string | undefined): ParsedDeadline {
  const raw = (text || '').trim();
  if (!raw) return EMPTY;

  // 1. ISO 日期：2025-08-31
  const iso = raw.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) {
    const year = Number(iso[1]);
    const month = Number(iso[2]);
    const day = Number(iso[3]);
    if (month >= 1 && month <= 12) {
      return { kind: 'specific', months: [month], day, year, sortKey: `${pad2(month)}-${pad2(day)}` };
    }
  }

  // 2. 每年 X 月 Y 日 / 每年 X 月底前 / 每年 X 月
  let m = raw.match(/每年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日/);
  if (m) return annual(Number(m[1]), Number(m[2]));

  m = raw.match(/每年\s*(\d{1,2})\s*月底/);
  if (m) return annual(Number(m[1]), lastDayOf(Number(m[1])));

  m = raw.match(/每年\s*(\d{1,2})\s*月/);
  if (m) return annual(Number(m[1]));

  // 3. 学期与招生周期
  if (/秋季学期/.test(raw)) return pick('semester', '20', [9]);
  if (/春季学期/.test(raw)) return pick('semester', '21', [3]);
  if (/学期/.test(raw)) return pick('semester', '22');
  if (/提前批|录取|招生/.test(raw)) return pick('semester', '23', [6]);

  // 4. 当年/本年 X 月 Y 日（不带「每年」，按年度循环理解）
  m = raw.match(/(?:当年|本年|于)\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日/);
  if (m) return annual(Number(m[1]), Number(m[2]));

  m = raw.match(/(\d{1,2})\s*月\s*(\d{1,2})\s*日/);
  if (m && Number(m[1]) >= 1 && Number(m[1]) <= 12) return annual(Number(m[1]), Number(m[2]));

  m = raw.match(/(\d{1,2})\s*月底/);
  if (m && Number(m[1]) >= 1 && Number(m[1]) <= 12) return annual(Number(m[1]), lastDayOf(Number(m[1])));

  // 5. 政策沿革：某年年底前 / 某年起施行
  if (/\d{4}\s*年\s*(?:底|12\s*月\s*31\s*日)/.test(raw)) return pick('history', '30');

  // 6. 相对时限：受理/审核/公示/发放后 N 个工作日、次月起等
  if (/工作日|受理|收到|起算|次月|下月起|开学|入学|结束后|公示|一周内|当年底/.test(raw)) {
    return pick('process', '10');
  }

  // 7. 只写了年份的沿革信息
  if (/\d{4}\s*年/.test(raw)) return pick('history', '31');

  return EMPTY;
}

/** 学校/院系是主语 */
const SCHOOL_SUBJECT = /学校|高校|院系|学院|校内|辅导员|班主任|培养单位|就读院校/;
/** 只有学校才做的经办动作 */
const SCHOOL_ACT = /报送|上报|汇总|审核|评审|公示|备案|告知|组织|完成|公布|推荐|存档|归档/;
/** 主管部门是主语 */
const AUTHORITY_SUBJECT =
  /教育部|教育厅|教育行政部门|教育部门|主管部门|省级|中央部门|财政|人力资源|人社|国务院|民政|乡镇|街道|县级|人民政府/;
/** 只有主管部门才做的动作 */
const AUTHORITY_ACT = /审批|审核|下达|划拨|拨付|备案|汇总|逐级|报教育部|确认|查验|受理|推送|公示|公布|监管/;
/** 学生本人是主语 */
const APPLICANT_SUBJECT = /学生|本人|个人|申请人/;
/** 申请人要做的动作 */
const APPLICANT_ACT = /申请|申领|提交|报名|填报|签署|办理|领取|报到|提出|上交|递交|参加|返校/;
/** 节点名本身就是申请人动作，如「见习补贴申领」「高考报名」「协议签署」 */
const APPLICANT_LEAD = /申领|报名|填报|申请|办理|签署|提交|递交|领取/;

/**
 * 从节点名称判断这条该谁去做。
 *
 * 用「主语 + 动作」组合判断，而不是看到「学校」就判学校：
 * 「学校报送学生申请」是学校的事，「学生向学校提出申请」是学生的事，两者都含「学校」。
 * 顺序：学校主语 → 主管部门 → 学生主语 → 节点名直接是申请动作 → 未标注。
 */
export function classifyResponsibility(label: string, note?: string): CalendarResponsibility {
  const text = `${label} ${note ?? ''}`;
  // 学校主语只用节点名判断：note 里常出现「学生向学校提出申请」，带上 note 会把个人节点误判成学校的
  if (SCHOOL_SUBJECT.test(label) && SCHOOL_ACT.test(label)) return 'school';
  if (AUTHORITY_SUBJECT.test(text)) return 'authority';
  if (AUTHORITY_ACT.test(text) && !APPLICANT_SUBJECT.test(text)) return 'authority';
  if (APPLICANT_SUBJECT.test(text) && APPLICANT_ACT.test(text)) return 'applicant';
  // 「申请受理」「补贴审批」这类是部门动作，不是申请人动作
  if (APPLICANT_LEAD.test(text) && !/受理$|审批$/.test(label)) return 'applicant';
  return 'unknown';
}

/** 从一批政策里汇总出申报日历 */
export function buildCalendar(policies: Policy[]): CalendarData {
  const months: CalendarMonth[] = Array.from({ length: 12 }, (_, i) => ({ month: i + 1, events: [] }));
  const semester: CalendarEvent[] = [];
  const process: CalendarEvent[] = [];
  const history: CalendarEvent[] = [];
  const other: CalendarEvent[] = [];
  const policyIds = new Set<string>();
  // 一次性节点（「2025-10-31」）过了年份就不该再出现在今年的日历里，
  // 否则会把往年的一次性报送节点混进当前月份的「待办」
  const currentYear = new Date().getFullYear();

  for (const policy of policies) {
    const deadlines = policy.deadlines || [];
    if (deadlines.length > 0) policyIds.add(policy.id);

    deadlines.forEach((deadline, index) => {
      // date 为空时，退一步从 note 里找时间线索（「受理之日起 3 个工作日内」这类写在备注里）
      let parsed = parseDeadlineText(deadline.date);
      if (!deadline.date || !deadline.date.trim()) {
        parsed = parseDeadlineText(deadline.note);
      }

      const expired = parsed.kind === 'specific' && parsed.year !== undefined && parsed.year < currentYear;
      const kind: CalendarKind = expired ? 'history' : parsed.kind;
      const event: CalendarEvent = {
        id: `${policy.id}-${index}`,
        policyId: policy.id,
        policyTitle: policy.title,
        category: policy.category,
        level: policy.level,
        label: deadline.label,
        dateText: deadline.date || '',
        note: deadline.note,
        months: parsed.months,
        day: parsed.day,
        kind,
        year: parsed.year,
        responsibility: classifyResponsibility(deadline.label, deadline.note),
        expired: expired || undefined,
        sortKey: parsed.sortKey,
      };

      if ((kind === 'annual' || kind === 'specific') && parsed.months.length > 0) {
        const month = parsed.months[0];
        months[month - 1].events.push(event);
      } else if (kind === 'semester') {
        semester.push(event);
      } else if (kind === 'history') {
        history.push(event);
      } else if (kind === 'other') {
        other.push(event);
      } else {
        process.push(event);
      }
    });
  }

  // 同一天里个人要办的排前面：日历首先回答「我什么时候该动手」
  const responsibilityOrder: Record<CalendarResponsibility, number> = {
    applicant: 0,
    school: 1,
    authority: 2,
    unknown: 3,
  };
  const bySort = (a: CalendarEvent, b: CalendarEvent): number =>
    a.sortKey.localeCompare(b.sortKey) || responsibilityOrder[a.responsibility] - responsibilityOrder[b.responsibility];
  for (const month of months) month.events.sort(bySort);
  semester.sort(bySort);
  process.sort(bySort);
  history.sort(bySort);
  other.sort(bySort);

  const fixedEvents = months.reduce((sum, month) => sum + month.events.length, 0);
  const totalEvents = fixedEvents + semester.length + process.length + history.length + other.length;

  return {
    months,
    semester,
    process,
    history,
    other,
    stats: {
      fixedEvents,
      totalEvents,
      policies: policyIds.size,
      monthsCovered: months.filter((month) => month.events.length > 0).length,
    },
  };
}
