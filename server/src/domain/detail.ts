/**
 * 政策详情页的视图模型。
 *
 * 政策库卡片只回答「这份政策有多少条判定」，点进去要能读完一份政策：
 * 条件按什么逻辑分组、每条具体要满足什么、要交哪些材料、什么时候截止、原文怎么写的。
 * 这里把 Policy 转成「按条件组 / 按原文段落」的展示视图，纯函数、零 token，
 * 服务端与静态版共用同一份逻辑 —— 页面上看到的内容与判定引擎用的是同一份数据。
 */
import type {
  Condition,
  ConditionGroup,
  DeadlineItem,
  MaterialItem,
  Policy,
  PolicySection,
} from './types.js';

export interface DetailConditionView {
  id: string;
  /** 组内序号，从 1 开始 */
  index: number;
  label: string;
  /** 人话版要求，如「不低于 2 年级」「须为『是』」 */
  requirement: string;
  required: boolean;
  docRef: string;
  quote: string;
  hint?: string;
  /** 该条件引用的原文段落标题，如「第七条（二）」 */
  sectionHeading: string;
}

export interface DetailGroupView {
  id: string;
  name: string;
  logic: 'all' | 'any';
  /** 「以下 5 条须同时满足」/「满足任意 1 条即可」 */
  logicText: string;
  conditions: DetailConditionView[];
  docRef: string;
  sectionHeading: string;
}

export interface DetailSectionView {
  id: string;
  heading: string;
  text: string;
  /** 有多少条条件引用这一段 */
  conditionCount: number;
  repaired: boolean;
}

export interface DetailStats {
  groups: number;
  conditions: number;
  requiredConditions: number;
  fields: number;
  materials: number;
  requiredMaterials: number;
  deadlines: number;
  sections: number;
  chars: number;
}

export interface DetailRelated {
  id: string;
  title: string;
  category: string;
  level: string;
  year: number;
  conditions: number;
  materials: number;
  /** 为什么推荐这份，如「同类奖学金」「材料清单重合 2 项」 */
  reason: string;
}

/** 推荐只需要这些字段，政策库摘要（PolicySummary）刚好全部具备 */
export interface RelatedCandidate {
  id: string;
  title: string;
  category: string;
  level: string;
  year: number;
  conditions: number;
  materials: number;
  /** 材料清单的名字，有则参与重合度打分 */
  materialNames?: string[];
}

export interface PolicyDetail {
  id: string;
  groupViews: DetailGroupView[];
  sectionViews: DetailSectionView[];
  materials: MaterialItem[];
  deadlines: DeadlineItem[];
  /** 已经过时/需要注意的条款提示（notes 里带【】或标「现行标准」的） */
  alertNotes: string[];
  normalNotes: string[];
  stats: DetailStats;
}

const OPERATOR_TEXT: Record<string, string> = {
  eq: '等于',
  ne: '不等于',
  in: '属于',
  notIn: '不属于',
  gte: '不低于',
  gt: '高于',
  lte: '不高于',
  lt: '低于',
  contains: '包含',
  exists: '须具备',
};

/** 把条件值拼成人话：布尔说「是/否」，数组说「A 或 B」，数字带单位 */
export function formatConditionValue(condition: Condition): string {
  const { value, unit } = condition;
  if (Array.isArray(value)) {
    return value.map((v) => '「' + String(v) + '」').join(' 或 ');
  }
  if (typeof value === 'boolean') {
    return value ? '「是」' : '「否」';
  }
  if (typeof value === 'number') {
    return String(value) + (unit ?? '');
  }
  return '「' + value + '」' + (unit ?? '');
}

function findFieldLabel(policy: Policy | undefined, key: string): string | undefined {
  return policy?.fields.find((f) => f.key === key)?.label;
}

/**
 * 条件的可读要求。
 *
 * 少数条件的 value 不是取值而是另一个字段的 key（如家庭收入低于当地标准写作
 * lt: household.localStandard），这时用该字段的 label 代替，避免页面上出现点路径。
 */
export function formatRequirement(condition: Condition, policy?: Policy): string {
  const { operator, value } = condition;
  if (operator === 'exists') {
    if (typeof value === 'string' && value.includes('.')) {
      const fieldLabel = findFieldLabel(policy, value);
      if (fieldLabel) return '须先填写「' + fieldLabel + '」';
    }
    return typeof value === 'string' && !value.includes('.')
      ? '须具备「' + value + '」'
      : '须填写该项';
  }
  if (
    (operator === 'lt' || operator === 'gt' || operator === 'lte' || operator === 'gte') &&
    typeof value === 'string'
  ) {
    const fieldLabel = findFieldLabel(policy, value);
    if (fieldLabel) return (OPERATOR_TEXT[operator] ?? operator) + '「' + fieldLabel + '」';
  }
  return (OPERATOR_TEXT[operator] ?? operator) + ' ' + formatConditionValue(condition);
}

/** 条件组的逻辑说明 */
export function formatGroupLogic(logic: 'all' | 'any', count: number): string {
  if (logic === 'any') return '满足以下任意 1 条即可（共 ' + count + ' 条）';
  return '以下 ' + count + ' 条须同时满足';
}

function sectionHeadingOf(policy: Policy, docRef: string): string {
  return policy.sections.find((s: PolicySection) => s.id === docRef)?.heading ?? docRef;
}

/** 详情页需要的统计口径，与政策库卡片、首页统计保持一致 */
export function buildDetailStats(policy: Policy): DetailStats {
  const conditions = policy.conditions.flatMap((g) => g.conditions);
  return {
    groups: policy.conditions.length,
    conditions: conditions.length,
    requiredConditions: conditions.filter((c) => c.required).length,
    fields: policy.fields.length,
    materials: policy.materials.length,
    requiredMaterials: policy.materials.filter((m) => m.required).length,
    deadlines: policy.deadlines.length,
    sections: policy.sections.length,
    chars: policy.originalText.length,
  };
}

/** notes 拆成「需要注意的过时/现行标准提示」与普通说明 */
export function splitNotes(notes: string[]): { alertNotes: string[]; normalNotes: string[] } {
  const isAlert = (n: string) => /^【/.test(n) || /现行标准|过时|已废止|已失效|替代/.test(n);
  return {
    alertNotes: notes.filter(isAlert),
    normalNotes: notes.filter((n) => !isAlert(n)),
  };
}

function buildGroupViews(policy: Policy): DetailGroupView[] {
  return policy.conditions.map((group: ConditionGroup) => ({
    id: group.id,
    name: group.name,
    logic: group.logic,
    logicText: formatGroupLogic(group.logic, group.conditions.length),
    docRef: group.docRef,
    sectionHeading: sectionHeadingOf(policy, group.docRef),
    conditions: group.conditions.map((condition, i) => ({
      id: condition.id,
      index: i + 1,
      label: condition.label,
      requirement: formatRequirement(condition, policy),
      required: condition.required,
      docRef: condition.docRef,
      quote: condition.quote,
      hint: condition.hint,
      sectionHeading: sectionHeadingOf(policy, condition.docRef),
    })),
  }));
}

function buildSectionViews(policy: Policy): DetailSectionView[] {
  const counts = new Map<string, number>();
  for (const group of policy.conditions) {
    for (const condition of group.conditions) {
      counts.set(condition.docRef, (counts.get(condition.docRef) ?? 0) + 1);
    }
  }
  return policy.sections.map((section) => ({
    id: section.id,
    heading: section.heading,
    text: section.text,
    conditionCount: counts.get(section.id) ?? 0,
    repaired: section.repaired === true,
  }));
}

/** 从完整政策提炼推荐用到的字段 */
export function toRelatedCandidate(policy: Policy): RelatedCandidate {
  return {
    id: policy.id,
    title: policy.title,
    category: policy.category,
    level: policy.level,
    year: policy.year,
    conditions: policy.conditions.reduce((sum, g) => sum + g.conditions.length, 0),
    materials: policy.materials.length,
    materialNames: policy.materials.map((m) => m.name),
  };
}

/**
 * 同类政策推荐。
 *
 * 跨政策的字段复用率很低（333 个字段实例里 285 个不同 key），所以不按字段重合度，而按
 * 「同一类别 > 材料清单重合 > 同一级别 > 材料数量接近 > 年份接近」打分：
 * 用户读完一份奖学金政策，最可能接着看的是另一份奖学金政策。
 * 入参用摘要级字段（RelatedCandidate），静态版不需要为了推荐去拉 32 份全文。
 */
export function pickRelated(
  candidates: RelatedCandidate[],
  currentId: string,
  limit = 3,
): DetailRelated[] {
  const current = candidates.find((c) => c.id === currentId);
  if (!current) return [];
  const currentMaterials = new Set(current.materialNames ?? []);
  const scored = candidates
    .filter((c) => c.id !== currentId)
    .map((c) => {
      const sharedMaterials = (c.materialNames ?? []).filter((name) =>
        currentMaterials.has(name),
      ).length;
      const sameCategory = c.category === current.category;
      const sameLevel = c.level === current.level;
      const materialGap = Math.abs(c.materials - current.materials);
      const yearGap = Math.abs(c.year - current.year);
      let score = 0;
      if (sameCategory) score += 4;
      score += Math.min(sharedMaterials, 2) * 1.5;
      if (sameLevel) score += 1;
      if (materialGap === 0) score += 0.6;
      else if (materialGap <= 2) score += 0.3;
      if (yearGap <= 3) score += 0.5;
      const reason = sameCategory
        ? '同类' + c.category
        : sharedMaterials > 0
          ? '材料清单重合 ' + sharedMaterials + ' 项'
          : sameLevel
            ? '同为' + c.level + '政策'
            : '条件规模接近';
      return { id: c.id, title: c.title, category: c.category, level: c.level, year: c.year, conditions: c.conditions, materials: c.materials, reason, score };
    })
    .sort((a, b) => (b.score !== a.score ? b.score - a.score : b.year - a.year));
  return scored.slice(0, limit).map(({ score, ...rest }) => rest);
}

/** 一份政策详情页需要的视图数据（推荐单独用 pickRelated，两种数据源都能喂） */
export function buildPolicyDetail(policy: Policy): PolicyDetail {
  const { alertNotes, normalNotes } = splitNotes(policy.notes);
  return {
    id: policy.id,
    groupViews: buildGroupViews(policy),
    sectionViews: buildSectionViews(policy),
    materials: policy.materials,
    deadlines: policy.deadlines,
    alertNotes,
    normalNotes,
    stats: buildDetailStats(policy),
  };
}
