/**
 * 领域模型：政策条件树（Policy Condition Tree）
 *
 * 设计要点：
 * 1. 政策原文切成 section，每个条件都能通过 docRef 精确回溯到原文段落 —— 判定有据可查。
 * 2. 条件是可判定的原子表达式（operator + field + value），不依赖大模型 —— 运行期零 token。
 * 3. 条件组支持 all / any 逻辑，覆盖「同时满足若干基本条件」与「满足任一专项条件」两类政策写法。
 * 4. autoUncertain 标记不可自动判定的条件（如「家庭经济困难」需认定），一律输出「需人工确认」而不误判。
 */

export type PolicyLevel = '国家级' | '省级' | '市级' | '区级' | '校级';

export type PolicyCategory = '奖学金' | '助学金' | '助学贷款' | '推免保研' | '人才补贴' | '专项补贴' | '其他';

export type FieldType = 'text' | 'number' | 'boolean' | 'select' | 'multiselect';

/** 政策原文段落：判定结果的「原文回溯」锚点 */
export interface PolicySection {
  id: string;
  heading: string;
  text: string;
  /** 在 originalText 中的字符起始位置（用于前端高亮），由抽取阶段计算 */
  start?: number;
  end?: number;
  /** 人工复核时按原文补齐过段落文本（修复 AI 抽取的截断/断句错误） */
  repaired?: boolean;
}

/** 表单字段定义：前端据此动态生成「填自己」表单 */
export interface ProfileField {
  /** 点路径，如 education.level */
  key: string;
  label: string;
  type: FieldType;
  options?: string[];
  unit?: string;
  placeholder?: string;
  /** 该字段被哪些条件引用，用于提示「这一项影响哪几条判定」 */
  usedBy?: string[];
}

export type Operator = 'eq' | 'ne' | 'in' | 'notIn' | 'gte' | 'lte' | 'gt' | 'lt' | 'contains' | 'exists';

export interface Condition {
  id: string;
  /** profile 中的点路径 */
  field: string;
  /** 人话描述，如「全日制本科二年级（含）以上」 */
  label: string;
  operator: Operator;
  value: string | number | boolean | string[];
  unit?: string;
  /** 关联的原文段落 id */
  docRef: string;
  /** 原文原句，判定结果直接展示 */
  quote: string;
  /** 硬性条件（true）不满足即不具备资格；false 为建议性条件，不满足只提示 */
  required: boolean;
  /** 无法自动判定，必须人工确认 */
  autoUncertain?: boolean;
  /** 不满足时给用户的建议 */
  hint?: string;
}

export interface ConditionGroup {
  id: string;
  name: string;
  /** all: 组内条件全部满足；any: 满足任意一条即可 */
  logic: 'all' | 'any';
  conditions: Condition[];
  docRef: string;
}

export interface MaterialItem {
  name: string;
  required: boolean;
  note?: string;
  docRef?: string;
}

export interface DeadlineItem {
  label: string;
  date?: string;
  note?: string;
  docRef?: string;
}

/**
 * 人工复核记录。
 *
 * AI 抽取的是「原文写了什么」，但政策原文可能已经过时（如 2008 年的贷款额度）。
 * 运行期不能联网取最新政策，所以在建库阶段由人复核，把「原文过时之处」显式标注出来，
 * 让判定结果既忠于原文、又不会误导用户。
 */
export interface PolicyReview {
  /** 是否已人工复核 */
  humanReviewed: boolean;
  /** 复核日期 YYYY-MM-DD */
  reviewedAt: string;
  reviewer?: string;
  /** 具体改了什么，逐条留痕（可审计） */
  changes: string[];
}

export interface Policy {
  id: string;
  title: string;
  level: PolicyLevel;
  category: PolicyCategory;
  issuer: string;
  year: number;
  sourceUrl?: string;
  /** 政策原文全文，供前端高亮 */
  originalText: string;
  sections: PolicySection[];
  fields: ProfileField[];
  conditions: ConditionGroup[];
  materials: MaterialItem[];
  deadlines: DeadlineItem[];
  notes: string[];
  /** 抽取元信息：谁抽的、什么时候、模型版本 —— 作为「数据由 AI 生成」的证据 */
  extraction: {
    engine: 'deepseek' | 'manual';
    model?: string;
    at: string;
  };
  /** 人工复核记录：AI 建库 + 人工校订，两者叠加才是可用的政策库 */
  review?: PolicyReview;
}

/** 用户填报的个人情况，键为 ProfileField.key */
export type Profile = Record<string, unknown>;

/** pass 符合 / fail 不符合 / unknown 信息不足需确认 / warn 建议性条件未满足 */
export type Verdict = 'pass' | 'fail' | 'unknown' | 'warn';

export interface ConditionResult {
  conditionId: string;
  groupId: string;
  label: string;
  verdict: Verdict;
  /** 判定理由（人话） */
  reason: string;
  /** 你的实际情况 */
  actual?: unknown;
  /** 政策要求的条件 */
  expected: string;
  quote: string;
  docRef: string;
  /** 差在哪（fail 时给出可操作说明） */
  gap?: string;
  hint?: string;
}

export interface GroupResult {
  groupId: string;
  name: string;
  logic: 'all' | 'any';
  verdict: Verdict;
  conditionResults: ConditionResult[];
}

export interface EvaluationSummary {
  pass: number;
  fail: number;
  unknown: number;
  warn: number;
  /** 硬性条件总数 */
  requiredTotal: number;
}

export interface EvaluationResult {
  policyId: string;
  overall: Verdict;
  groups: GroupResult[];
  conditions: ConditionResult[];
  summary: EvaluationSummary;
  /** 一句话结论，前端直接展示 */
  headline: string;
  /** 缺失的材料（按满足情况动态计算） */
  missingMaterials: string[];
  nextSteps: string[];
}
