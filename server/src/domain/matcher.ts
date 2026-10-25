import type {
  Condition,
  ConditionResult,
  EvaluationResult,
  EvaluationSummary,
  GroupResult,
  Policy,
  Profile,
  Verdict,
} from './types.js';

/**
 * 读取点路径字段：education.level -> profile.education.level
 *
 * 同时兼容两种画像结构：
 * 1. 嵌套对象   { education: { level: '本科' } }
 * 2. 扁平键值   { 'education.level': '本科' }（前端表单、localStorage 里更好存）
 * 扁平键优先；取不到再按点路径逐层下钻。
 */
export function getField(profile: Profile, path: string): unknown {
  if (profile !== null && typeof profile === 'object') {
    const flat = (profile as Record<string, unknown>)[path];
    if (flat !== undefined) return flat;
  }
  return path.split('.').reduce<unknown>((acc, key) => {
    if (acc !== null && typeof acc === 'object') {
      return (acc as Record<string, unknown>)[key];
    }
    return undefined;
  }, profile);
}

const TEMPLATE_RE = /^\{\{\s*([\w.]+)\s*\}\}$/;

/**
 * 解析条件值里的 {{field.path}} 模板。
 * 典型场景：政策要求「学生户籍县 == 办理地县」，两个值都来自用户填表，只能相互比较。
 */
function resolveTemplate(value: unknown, profile?: Profile): { ok: boolean; value: unknown; missing?: string } {
  if (typeof value !== 'string') return { ok: true, value };
  const m = value.match(TEMPLATE_RE);
  if (!m) return { ok: true, value };
  if (!profile) return { ok: false, value: undefined, missing: m[1] };
  const resolved = getField(profile, m[1]);
  if (isEmpty(resolved)) return { ok: false, value: undefined, missing: m[1] };
  return { ok: true, value: resolved };
}

function isEmpty(value: unknown): boolean {
  return value === undefined || value === null || value === '' || (Array.isArray(value) && value.length === 0);
}

function normalize(value: unknown): string {
  return String(value).trim().toLowerCase();
}

function toNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number(value.trim());
    return Number.isNaN(n) ? null : n;
  }
  return null;
}

function humanize(value: unknown): string {
  if (typeof value === 'boolean') return value ? '是' : '否';
  return String(value);
}

export function describeExpected(condition: Condition, profile?: Profile): string {
  const templated = resolveTemplate(condition.value, profile);
  const display = templated.ok ? templated.value : Array.isArray(condition.value) ? condition.value.join(' 或 ') : String(condition.value);
  const raw = templated.missing
    ? `你填写的「${templated.missing}」`
    : Array.isArray(display)
      ? display.map(humanize).join(' 或 ')
      : humanize(display);
  const unit = condition.unit ? ` ${condition.unit}` : '';
  switch (condition.operator) {
    case 'eq':
      return `等于「${raw}」`;
    case 'ne':
      return `不等于「${raw}」`;
    case 'in':
      return `属于「${raw}」之一`;
    case 'notIn':
      return `不属于「${raw}」`;
    case 'gte':
      return `大于等于 ${raw}${unit}`;
    case 'lte':
      return `小于等于 ${raw}${unit}`;
    case 'gt':
      return `大于 ${raw}${unit}`;
    case 'lt':
      return `小于 ${raw}${unit}`;
    case 'contains':
      return `包含「${raw}」`;
    case 'exists':
      return '需要提供相关证明/信息';
    default:
      return raw;
  }
}

interface CheckOutcome {
  /** true 通过 / false 不通过 / null 无法判定 */
  ok: boolean | null;
  reason: string;
}

export function checkCondition(condition: Condition, actual: unknown, profile?: Profile): CheckOutcome {
  const templated = resolveTemplate(condition.value, profile);
  if (!templated.ok) {
    return { ok: null, reason: `需要先填写「${templated.missing}」才能对比` };
  }

  if (isEmpty(actual)) {
    return { ok: null, reason: '你还没填写这一项' };
  }

  if (condition.operator === 'exists') {
    const ok = actual !== false;
    return { ok, reason: ok ? '已提供相关信息' : '缺少这项信息' };
  }

  const value = templated.value;

  switch (condition.operator) {
    case 'in':
    case 'notIn': {
      const list = (Array.isArray(value) ? value : [value]).map(normalize);
      const hit = list.includes(normalize(actual));
      return {
        ok: condition.operator === 'in' ? hit : !hit,
        reason: `你的情况是「${String(actual)}」`,
      };
    }
    case 'gte':
    case 'lte':
    case 'gt':
    case 'lt': {
      const a = toNumber(actual);
      const b = toNumber(value);
      if (a === null || b === null) {
        return { ok: null, reason: '这一项需要填写数字才能比较' };
      }
      const ok =
        condition.operator === 'gte'
          ? a >= b
          : condition.operator === 'lte'
            ? a <= b
            : condition.operator === 'gt'
              ? a > b
              : a < b;
      return { ok, reason: `你的情况：${a}${condition.unit ?? ''}` };
    }
    case 'contains': {
      const arr = Array.isArray(actual) ? actual.map(normalize) : [normalize(actual)];
      const needle = normalize(value);
      const ok = arr.some((item) => item.includes(needle));
      return { ok, reason: ok ? `已包含「${String(value)}」` : `未包含「${String(value)}」` };
    }
    case 'eq':
    case 'ne': {
      const a = normalize(actual);
      const b = normalize(value);
      const eq = a === b || (toNumber(actual) !== null && toNumber(value) !== null && toNumber(actual) === toNumber(value));
      return { ok: condition.operator === 'eq' ? eq : !eq, reason: `你的情况是「${humanize(actual)}」` };
    }
    default:
      return { ok: null, reason: '未知的比较方式' };
  }
}

function verdictOf(condition: Condition, ok: boolean | null): Verdict {
  if (ok === true) return 'pass';
  if (ok === false) return condition.required ? 'fail' : 'warn';
  return 'unknown';
}

function evaluateGroup(policy: Policy, groupId: string, profile: Profile): GroupResult {
  const group = policy.conditions.find((g) => g.id === groupId);
  if (!group) throw new Error(`政策 ${policy.id} 中不存在条件组 ${groupId}`);

  const conditionResults: ConditionResult[] = group.conditions.map((condition) => {
    const actual = getField(profile, condition.field);
    const outcome = checkCondition(condition, actual, profile);
    const verdict = verdictOf(condition, outcome.ok);
    return {
      conditionId: condition.id,
      groupId: group.id,
      label: condition.label,
      verdict,
      reason: outcome.reason,
      actual,
      expected: describeExpected(condition, profile),
      quote: condition.quote,
      docRef: condition.docRef,
      gap:
        verdict === 'fail'
          ? `不满足「${condition.label}」：要求${describeExpected(condition, profile)}，你的情况是${isEmpty(actual) ? '未填写' : humanize(actual)}`
          : undefined,
      hint: condition.hint,
    };
  });

  const required = conditionResults.filter((r) => !isWarnOnly(policy, r));
  let verdict: Verdict;
  if (group.logic === 'any') {
    const hasPass = required.some((r) => r.verdict === 'pass');
    const hasUnknown = required.some((r) => r.verdict === 'unknown');
    verdict = hasPass ? 'pass' : hasUnknown ? 'unknown' : 'fail';
  } else {
    if (required.some((r) => r.verdict === 'fail')) verdict = 'fail';
    else if (required.some((r) => r.verdict === 'unknown')) verdict = 'unknown';
    else verdict = 'pass';
  }

  return {
    groupId: group.id,
    name: group.name,
    logic: group.logic,
    verdict,
    conditionResults,
  };
}

function isWarnOnly(policy: Policy, result: ConditionResult): boolean {
  for (const group of policy.conditions) {
    const c = group.conditions.find((x) => x.id === result.conditionId);
    if (c) return c.required === false;
  }
  return false;
}

function summarize(conditions: ConditionResult[]): EvaluationSummary {
  const summary: EvaluationSummary = { pass: 0, fail: 0, unknown: 0, warn: 0, requiredTotal: 0 };
  for (const item of conditions) {
    summary[item.verdict] += 1;
    if (item.verdict !== 'warn') summary.requiredTotal += 1;
  }
  return summary;
}

function buildHeadline(policy: Policy, overall: Verdict, summary: EvaluationSummary): string {
  if (overall === 'pass') {
    return `符合条件的概率很高：${summary.pass} 项硬性条件全部满足，可以着手准备材料了。`;
  }
  if (overall === 'fail') {
    return `暂不符合：有 ${summary.fail} 项硬性条件不满足，具体差在哪见下方逐条判定。`;
  }
  return `还不能下结论：有 ${summary.unknown} 项还没填写，补上就能出结论。`;
}

function buildMissingMaterials(policy: Policy, conditions: ConditionResult[]): string[] {
  const failConditions = new Set(conditions.filter((c) => c.verdict === 'fail').map((c) => c.conditionId));
  const missing: string[] = [];
  for (const material of policy.materials) {
    if (!material.required) continue;
    const related = policy.conditions
      .flatMap((g) => g.conditions)
      .some((c) => c.docRef === material.docRef && failConditions.has(c.id));
    if (related) missing.push(material.name);
  }
  return missing;
}

function buildNextSteps(policy: Policy, conditions: ConditionResult[]): string[] {
  const steps: string[] = [];
  const fails = conditions.filter((c) => c.verdict === 'fail');
  const unknowns = conditions.filter((c) => c.verdict === 'unknown');

  if (fails.length === 0 && unknowns.length === 0) {
    steps.push('按材料清单准备原件与复印件');
  }
  for (const item of fails) {
    if (item.hint) steps.push(item.hint);
  }
  for (const item of unknowns) {
    steps.push(`确认「${item.label}」：${item.reason}`);
  }
  for (const deadline of policy.deadlines) {
    steps.push(`留意时间节点：${deadline.label}${deadline.note ? `（${deadline.note}）` : ''}`);
  }
  return steps;
}

/**
 * 核心判定：政策条件树 × 用户情况 -> 逐条结论
 *
 * 纯函数、无网络、无大模型调用 —— 运行期零 token，结果可复现、可单元测试。
 */
export function evaluate(policy: Policy, profile: Profile): EvaluationResult {
  const groups = policy.conditions.map((group) => evaluateGroup(policy, group.id, profile));
  const conditions = groups.flatMap((g) => g.conditionResults);

  // 总体结论由「条件组」决定：any 组内部单个条件失败不代表整体不通过
  const groupVerdicts = groups.map((g) => g.verdict);
  let overall: Verdict;
  if (groupVerdicts.includes('fail')) overall = 'fail';
  else if (groupVerdicts.includes('unknown')) overall = 'unknown';
  else if (groupVerdicts.length === 0) overall = 'unknown';
  else overall = 'pass';

  const summary = summarize(conditions);

  return {
    policyId: policy.id,
    overall,
    groups,
    conditions,
    summary,
    headline: buildHeadline(policy, overall, summary),
    missingMaterials: buildMissingMaterials(policy, conditions),
    nextSteps: buildNextSteps(policy, conditions),
  };
}
