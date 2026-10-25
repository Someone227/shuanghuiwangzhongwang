/**
 * 后端 API 客户端与领域类型。
 *
 * 运行期所有判定都在服务端本地完成（读 JSON 条件树），这里只是薄薄一层 fetch 封装，
 * 不携带、也不请求任何大模型密钥。
 */

import { request } from './http';

export type Verdict = 'pass' | 'fail' | 'unknown' | 'warn';
export type FieldType = 'text' | 'number' | 'boolean' | 'select' | 'multiselect';
export type PolicyLevel = '国家级' | '省级' | '市级' | '区级' | '校级';
export type PolicyCategory = '奖学金' | '助学金' | '助学贷款' | '推免保研' | '人才补贴' | '专项补贴' | '其他';

export interface PolicySection {
  id: string;
  heading: string;
  text: string;
  start?: number;
  end?: number;
  repaired?: boolean;
}

export interface ProfileField {
  key: string;
  label: string;
  type: FieldType;
  options?: string[];
  unit?: string;
  placeholder?: string;
  usedBy?: string[];
}

export interface Condition {
  id: string;
  field: string;
  label: string;
  operator: string;
  value: string | number | boolean | string[];
  unit?: string;
  docRef: string;
  quote: string;
  required: boolean;
  autoUncertain?: boolean;
  hint?: string;
}

export interface ConditionGroup {
  id: string;
  name: string;
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

export interface PolicyReview {
  humanReviewed: boolean;
  reviewedAt: string;
  reviewer?: string;
  changes: string[];
}

export interface PolicySummary {
  id: string;
  title: string;
  level: PolicyLevel;
  category: PolicyCategory;
  issuer: string;
  year: number;
  sourceUrl?: string;
  stats: {
    sections: number;
    fields: number;
    conditions: number;
    required: number;
    materials: number;
    deadlines: number;
  };
  review?: PolicyReview;
}

export interface Policy {
  id: string;
  title: string;
  level: PolicyLevel;
  category: PolicyCategory;
  issuer: string;
  year: number;
  sourceUrl?: string;
  originalText: string;
  sections: PolicySection[];
  fields: ProfileField[];
  conditions: ConditionGroup[];
  materials: MaterialItem[];
  deadlines: DeadlineItem[];
  notes: string[];
  extraction: { engine: 'deepseek' | 'manual'; model?: string; at: string };
  review?: PolicyReview;
  /** 原文清洗记录：只截掉网页页脚噪声，正文条款未改动 */
  cleaning?: { cleanedAt: string; removedChars: number; removedFrom: string; note: string };
}

export interface ConditionResult {
  conditionId: string;
  groupId: string;
  label: string;
  verdict: Verdict;
  reason: string;
  actual?: unknown;
  expected: string;
  quote: string;
  docRef: string;
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
  requiredTotal: number;
}

export interface EvaluationResult {
  policyId: string;
  overall: Verdict;
  groups: GroupResult[];
  conditions: ConditionResult[];
  summary: EvaluationSummary;
  headline: string;
  missingMaterials: string[];
  nextSteps: string[];
}

export type Profile = Record<string, unknown>;

/** 政策列表（摘要） */
export function listPolicies(): Promise<PolicySummary[]> {
  return request<PolicySummary[]>('/api/policies');
}

/** 单份政策全量（原文、段落偏移、字段、条件树、材料、时限） */
export function getPolicy(id: string): Promise<Policy> {
  return request<Policy>(`/api/policies/${encodeURIComponent(id)}`);
}

/** 逐条判定：把用户画像交给服务端本地引擎计算 */
export function evaluatePolicy(id: string, profile: Profile): Promise<EvaluationResult> {
  return request<EvaluationResult>(`/api/policies/${encodeURIComponent(id)}/evaluate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ profile }),
  });
}
