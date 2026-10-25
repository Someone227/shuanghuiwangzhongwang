import type { Profile, ProfileField } from './api';

export interface FieldGroup {
  key: string;
  title: string;
  hint: string;
  fields: ProfileField[];
}

/**
 * 字段按点路径前缀分组，前端据此把长表单拆成几块。
 * 「已知前缀」各自成组；未知前缀与无前缀字段统一并入「其他情况」，
 * 保证任何政策新增字段都能渲染，且不会出现多个同名分组。
 */
const GROUP_META: Record<string, { title: string; hint: string }> = {
  identity: { title: '基本信息', hint: '国籍、诚信记录等身份层面的硬性条件' },
  student: { title: '学籍与身份', hint: '学校类型、学历层次、在读状态与学籍性质' },
  education: { title: '学籍与学业', hint: '学校类型、学历层次、年级、入学信息' },
  academic: { title: '学业成绩', hint: '成绩排名、科研与专业能力表现' },
  achievement: { title: '综合表现', hint: '获奖情况与证明材料' },
  conduct: { title: '品行与纪律', hint: '校规遵守、纪律处分记录' },
  political: { title: '思想政治', hint: '政治面貌与思想品德表现' },
  personal: { title: '个人品行', hint: '思想品德、遵纪守法、勤俭节约等日常表现' },
  school: { title: '学校情况', hint: '学校性质与是否师范生免费教育' },
  household: { title: '户籍与家庭', hint: '户籍所在地、法定监护人情况' },
  family: { title: '家庭情况', hint: '家庭经济困难认定与家庭负担' },
  economy: { title: '家庭经济', hint: '经济困难认定与家庭负担情况' },
  loan: { title: '贷款情况', hint: '已有贷款、本次申请额度' },
  health: { title: '身心状况', hint: '体检与心理健康情况' },
  application: { title: '申请材料', hint: '报名表、公示等程序性要求' },
  admission: { title: '推免资格', hint: '学籍、学位等推免资格性要求' },
  other: { title: '其他情况', hint: '其他需要补充的条件' },
};

const KNOWN_PREFIXES = new Set(Object.keys(GROUP_META).filter((key) => key !== 'other'));

export function groupFields(fields: ProfileField[]): FieldGroup[] {
  const buckets = new Map<string, ProfileField[]>();
  for (const field of fields) {
    const dot = field.key.indexOf('.');
    const rawPrefix = dot === -1 ? '' : field.key.slice(0, dot);
    const key = KNOWN_PREFIXES.has(rawPrefix) ? rawPrefix : 'other';
    const list = buckets.get(key) ?? [];
    list.push(field);
    buckets.set(key, list);
  }

  // 组顺序 = 字段在政策中首次出现的顺序，比固定排序更贴合原文结构；
  // 「其他情况」始终放最后，避免杂项挡在具体条件前面
  return [...buckets.entries()]
    .map(([key, list]) => ({
      key,
      title: GROUP_META[key]?.title ?? GROUP_META.other.title,
      hint: GROUP_META[key]?.hint ?? GROUP_META.other.hint,
      fields: list,
    }))
    .sort((a, b) => Number(a.key === 'other') - Number(b.key === 'other'));
}
/** 空画像：所有字段都留空，避免替用户假设答案 */
export function createEmptyProfile(fields: ProfileField[]): Profile {
  const profile: Profile = {};
  for (const field of fields) profile[field.key] = '';
  return profile;
}

export function isEmptyValue(value: unknown): boolean {
  if (value === undefined || value === null) return true;
  if (typeof value === 'string') return value.trim() === '';
  if (Array.isArray(value)) return value.length === 0;
  return false;
}

/** 提交前清洗：丢掉空值，布尔 false 要保留（它是有意义的答案） */
export function cleanProfile(profile: Profile): Profile {
  const cleaned: Profile = {};
  for (const [key, value] of Object.entries(profile)) {
    if (isEmptyValue(value)) continue;
    cleaned[key] = value;
  }
  return cleaned;
}

export function filledCount(fields: ProfileField[], profile: Profile): number {
  return fields.filter((field) => !isEmptyValue(profile[field.key])).length;
}

const DRAFT_PREFIX = 'nengshenma:draft:';

/** 本地暂存：同一页面刷新不丢已填内容（离开判定页会清掉） */
export function loadDraft(policyId: string): Profile | null {
  try {
    const raw = localStorage.getItem(`${DRAFT_PREFIX}${policyId}`);
    return raw ? (JSON.parse(raw) as Profile) : null;
  } catch {
    return null;
  }
}

export function saveDraft(policyId: string, profile: Profile): void {
  try {
    localStorage.setItem(`${DRAFT_PREFIX}${policyId}`, JSON.stringify(profile));
  } catch {
    /* 隐私模式下 localStorage 可能不可用，忽略即可 */
  }
}

/**
 * 清空所有本地草稿：离开判定页时调用。
 * 填的是个人情况（家庭经济、成绩排名…），不应该留在共用电脑上。
 */
export function clearAllDrafts(): void {
  try {
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (key?.startsWith(DRAFT_PREFIX)) keys.push(key);
    }
    for (const key of keys) localStorage.removeItem(key);
  } catch {
    /* 忽略 */
  }
}
