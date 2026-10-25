import type { Verdict } from './api';

export interface VerdictMeta {
  label: string;
  short: string;
  badge: string;
  card: string;
  dot: string;
}

/** 四种判定结果的统一视觉语言：绿色可申、红色不符合、琥珀待补充、灰色建议性 */
export const VERDICT_META: Record<Verdict, VerdictMeta> = {
  pass: {
    label: '符合',
    short: '符合',
    badge: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    card: 'border-emerald-200 bg-emerald-50/40',
    dot: 'bg-emerald-500',
  },
  fail: {
    label: '不符合',
    short: '不符合',
    badge: 'bg-rose-50 text-rose-700 border-rose-200',
    card: 'border-rose-200 bg-rose-50/40',
    dot: 'bg-rose-500',
  },
  unknown: {
    label: '待补充',
    short: '待填',
    badge: 'bg-amber-50 text-amber-700 border-amber-200',
    card: 'border-amber-200 bg-amber-50/40',
    dot: 'bg-amber-500',
  },
  warn: {
    label: '建议项未满足',
    short: '建议',
    badge: 'bg-slate-100 text-slate-600 border-slate-200',
    card: 'border-slate-200 bg-slate-50',
    dot: 'bg-slate-400',
  },
};

export function overallTitle(verdict: Verdict): string {
  if (verdict === 'pass') return '大概率可以申';
  if (verdict === 'fail') return '暂不符合';
  if (verdict === 'warn') return '基本符合，有建议项待补';
  return '还不能下结论';
}

export function overallTone(verdict: Verdict): string {
  if (verdict === 'pass') return 'border-emerald-300 bg-emerald-50 text-emerald-900';
  if (verdict === 'fail') return 'border-rose-300 bg-rose-50 text-rose-900';
  if (verdict === 'warn') return 'border-slate-300 bg-slate-50 text-slate-800';
  return 'border-amber-300 bg-amber-50 text-amber-900';
}
