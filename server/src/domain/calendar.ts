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
    const month = Number(iso[2]);
    const day = Number(iso[3]);
    if (month >= 1 && month <= 12) {
      return { kind: 'specific', months: [month], day, sortKey: `${pad2(month)}-${pad2(day)}` };
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

/** 从一批政策里汇总出申报日历 */
export function buildCalendar(policies: Policy[]): CalendarData {
  const months: CalendarMonth[] = Array.from({ length: 12 }, (_, i) => ({ month: i + 1, events: [] }));
  const semester: CalendarEvent[] = [];
  const process: CalendarEvent[] = [];
  const history: CalendarEvent[] = [];
  const other: CalendarEvent[] = [];
  const policyIds = new Set<string>();

  for (const policy of policies) {
    const deadlines = policy.deadlines || [];
    if (deadlines.length > 0) policyIds.add(policy.id);

    deadlines.forEach((deadline, index) => {
      // date 为空时，退一步从 note 里找时间线索（「受理之日起 3 个工作日内」这类写在备注里）
      let parsed = parseDeadlineText(deadline.date);
      if (!deadline.date || !deadline.date.trim()) {
        parsed = parseDeadlineText(deadline.note);
      }

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
        kind: parsed.kind,
        sortKey: parsed.sortKey,
      };

      if ((parsed.kind === 'annual' || parsed.kind === 'specific') && parsed.months.length > 0) {
        const month = parsed.months[0];
        months[month - 1].events.push(event);
      } else if (parsed.kind === 'semester') {
        semester.push(event);
      } else if (parsed.kind === 'history') {
        history.push(event);
      } else if (parsed.kind === 'other') {
        other.push(event);
      } else {
        process.push(event);
      }
    });
  }

  const bySort = (a: CalendarEvent, b: CalendarEvent): number => a.sortKey.localeCompare(b.sortKey);
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
