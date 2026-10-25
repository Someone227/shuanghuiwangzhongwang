#!/usr/bin/env node
/**
 * 政策库生成器：政策原文 -> DeepSeek 结构化抽取 -> 可判定的条件树 JSON
 *
 * 设计原则
 * 1. 只跑一次：生成结果提交进仓库（data/policies/*.json），网站运行期直接读 JSON，不再调用任何大模型 —— 零 token、可离线。
 * 2. 可审计：每次调用的请求体与响应体完整存档到 docs/ai-log/policies/，作为「数据由 AI 生成」的过程证据。
 * 3. 可校验：抽取结果必须通过结构校验（docRef 必须指向真实条款、operator 必须在枚举内），不通过则带着错误重试一次。
 *
 * 用法：
 *   node scripts/extract-policies.mjs                # 处理 raw 目录下全部政策
 *   node scripts/extract-policies.mjs --only=student-loan
 *   node scripts/extract-policies.mjs --dry-run     # 只检查原文与 key，不发起请求
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SERVER_ROOT = path.resolve(HERE, '..');
const REPO_ROOT = path.resolve(SERVER_ROOT, '..');
dotenv.config({ path: path.join(REPO_ROOT, '.env') });

const RAW_DIR = path.join(REPO_ROOT, 'data', 'policies', 'raw');
const OUT_DIR = path.join(REPO_ROOT, 'data', 'policies');
const LOG_DIR = path.join(REPO_ROOT, 'docs', 'ai-log', 'policies');

const API_KEY = process.env.DEEPSEEK_API_KEY || '';
const BASE_URL = (process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com').replace(/\/+$/, '');
const MODEL = process.env.DEEPSEEK_MODEL_CHAT || 'deepseek-chat';

const OPERATORS = ['eq', 'ne', 'in', 'notIn', 'gte', 'lte', 'gt', 'lt', 'contains', 'exists'];
const FIELD_TYPES = ['text', 'number', 'boolean', 'select', 'multiselect'];

const SYSTEM_PROMPT = `你是学生资助与人才政策的结构化专家。你的任务不是解释政策，而是把政策原文转换成「机器可以逐条判定」的条件树 JSON。

要求：
1. 只输出 JSON，不要输出 markdown 代码块，不要输出任何解释文字。
2. 每条条件都必须能回溯到原文：docRef 指向你切分出的某个 section.id，quote 必须是该 section 里的一句原文（可截取，但不能改写）。
3. 条件必须可判定：field 是用户能填写的字段（点路径，如 education.grade），operator 是给定的枚举之一，value 是阈值/枚举值。
4. 无法量化或需要人工审核的条件（如「家庭经济困难」「综合素质特别突出」「品行优良」），仍然要抽出来，但设置 autoUncertain: true，不要编造判定规则。
5. 非硬性条件（建议性、加分项、择优参考）设置 required: false；硬性门槛设置 required: true。
6. 条件组的 logic：同一组内需要「同时满足」用 all，「满足任一即可」用 any。多个组之间默认按顺序全部满足。
7. 忽略网页导航、页脚、联系方式等非政策内容。
8. 字段值使用政策原文的表述（中文枚举，如「全日制」「本科」「硕士」），不要擅自翻译成英文或数字。
9. hints 面向用户：条件不满足时给他一条可操作的建议（例如还能申请什么、如何补足）。

输出 JSON 结构（严格遵守）：
{
  "id": "kebab-case 英文 id",
  "title": "政策名称",
  "level": "国家级|省级|市级|区级|校级",
  "category": "奖学金|助学金|助学贷款|推免保研|人才补贴|专项补贴|其他",
  "issuer": "发布单位",
  "year": 2026,
  "sourceUrl": "原文链接",
  "sections": [{ "id": "s1", "heading": "第X条 / 一、", "text": "该条完整原文" }],
  "fields": [{ "key": "education.grade", "label": "年级", "type": "number|text|select|boolean|multiselect", "options": ["仅 select 需要"], "unit": "可选单位", "placeholder": "可选提示" }],
  "conditions": [{
    "id": "g1", "name": "条件组名称", "logic": "all", "docRef": "s1",
    "conditions": [{
      "id": "c1", "field": "education.grade", "label": "二年级及以上",
      "operator": "gte", "value": 2, "unit": "年级",
      "docRef": "s2", "quote": "二年级及以上年级本专科学生方可申请",
      "required": true, "autoUncertain": false, "hint": "一年级新生暂不符合，可关注明年评审"
    }]
  }],
  "materials": [{ "name": "材料名称", "required": true, "note": "可选说明", "docRef": "s3" }],
  "deadlines": [{ "label": "时间节点", "date": "可选", "note": "可选说明", "docRef": "s4" }],
  "notes": ["需要用户特别注意的补充说明"]
}`;

function buildUserPrompt(meta, text) {
  return `请把下面这份政策原文抽取成条件树 JSON。

【政策元信息】
- id: ${meta.id}
- 标题: ${meta.title}
- 层级: ${meta.level}
- 类别: ${meta.category}
- 原文链接: ${meta.url}

【政策原文】
${text}`;
}

function validatePolicy(policy, meta) {
  const errors = [];
  const need = (cond, msg) => { if (!cond) errors.push(msg); };

  need(policy && typeof policy === 'object', '返回值不是对象');
  if (!policy || typeof policy !== 'object') return errors;

  need(policy.id === meta.id, `id 必须为 "${meta.id}"，实际为 "${policy.id}"`);
  need(typeof policy.title === 'string' && policy.title.length > 0, 'title 缺失');
  need(Array.isArray(policy.sections) && policy.sections.length > 0, 'sections 为空');
  need(Array.isArray(policy.conditions) && policy.conditions.length > 0, 'conditions 为空');
  need(Array.isArray(policy.fields), 'fields 必须是数组');
  need(Array.isArray(policy.materials), 'materials 必须是数组');
  need(Array.isArray(policy.deadlines), 'deadlines 必须是数组');
  need(Array.isArray(policy.notes), 'notes 必须是数组');

  const sectionIds = new Set((policy.sections || []).map((s) => s && s.id));
  const fieldKeys = new Set((policy.fields || []).map((f) => f && f.key));

  for (const section of policy.sections || []) {
    if (!section || !section.id || !section.text) errors.push('section 缺少 id 或 text');
  }
  for (const field of policy.fields || []) {
    if (!field || !field.key) errors.push('field 缺少 key');
    else if (!FIELD_TYPES.includes(field.type)) errors.push(`field ${field.key} 的 type 非法: ${field.type}`);
  }
  if (!Array.isArray(policy.conditions)) return errors;

  for (const group of policy.conditions) {
    if (!group || !group.id) { errors.push('条件组缺少 id'); continue; }
    if (group.logic !== 'all' && group.logic !== 'any') errors.push(`条件组 ${group.id} 的 logic 必须是 all 或 any`);
    if (!sectionIds.has(group.docRef)) errors.push(`条件组 ${group.id} 的 docRef "${group.docRef}" 不存在于 sections`);
    if (!Array.isArray(group.conditions) || group.conditions.length === 0) { errors.push(`条件组 ${group.id} 没有条件`); continue; }
    for (const c of group.conditions) {
      if (!c || !c.id) { errors.push(`条件组 ${group.id} 内有条件缺 id`); continue; }
      if (!OPERATORS.includes(c.operator)) errors.push(`条件 ${c.id} 的 operator 非法: ${c.operator}`);
      if (typeof c.required !== 'boolean') errors.push(`条件 ${c.id} 的 required 必须是布尔值`);
      if (!sectionIds.has(c.docRef)) errors.push(`条件 ${c.id} 的 docRef "${c.docRef}" 不存在于 sections`);
      if (!c.quote) errors.push(`条件 ${c.id} 缺少 quote（原文原句）`);
      if (!c.field) errors.push(`条件 ${c.id} 缺少 field`);
      else if (!fieldKeys.has(c.field)) errors.push(`条件 ${c.id} 的 field "${c.field}" 未在 fields 中声明`);
      if (c.value === undefined || c.value === null) errors.push(`条件 ${c.id} 缺少 value`);
    }
  }
  return errors;
}

function fillSectionOffsets(policy, rawText) {
  for (const section of policy.sections || []) {
    if (typeof section.text !== 'string') continue;
    const idx = rawText.indexOf(section.text);
    if (idx >= 0) {
      section.start = idx;
      section.end = idx + section.text.length;
    }
  }
  return policy;
}

async function callDeepseek(messages, attempt) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 240000);
  try {
    const res = await fetch(`${BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${API_KEY}` },
      body: JSON.stringify({
        model: MODEL,
        messages,
        temperature: 0,
        max_tokens: 8000,
        response_format: { type: 'json_object' },
      }),
      signal: controller.signal,
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${text.slice(0, 500)}`);
    const data = JSON.parse(text);
    return { data, raw: text, attempt };
  } finally {
    clearTimeout(timer);
  }
}

function extractJson(content) {
  const trimmed = String(content || '').trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = fenced ? fenced[1] : trimmed;
  return JSON.parse(body);
}

async function extractOne(meta, rawText) {
  const messages = [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: buildUserPrompt(meta, rawText) },
  ];

  const logs = [];
  let policy = null;
  let errors = [];

  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const startedAt = new Date().toISOString();
    const { data, raw } = await callDeepseek(messages, attempt);
    logs.push({ attempt, startedAt, request: messages, responseRaw: raw, usage: data.usage, model: data.model });

    const content = data.choices?.[0]?.message?.content ?? '';
    try {
      policy = extractJson(content);
    } catch (err) {
      errors = [`输出不是合法 JSON: ${String(err).slice(0, 200)}`];
      messages.push({ role: 'assistant', content });
      messages.push({ role: 'user', content: `上面的输出不是合法 JSON（${errors[0]}）。请只输出合法 JSON，重新生成。` });
      continue;
    }

    errors = validatePolicy(policy, meta);
    if (errors.length === 0) break;

    messages.push({ role: 'assistant', content });
    messages.push({
      role: 'user',
      content: `上面的 JSON 没有通过结构校验，问题如下：\n${errors.slice(0, 20).join('\n')}\n请修正这些问题，重新输出完整 JSON（只输出 JSON）。`,
    });
  }

  if (!policy || errors.length > 0) {
    throw new Error(`抽取失败（已重试）：\n${errors.join('\n')}`);
  }

  policy = fillSectionOffsets(policy, rawText);
  policy.extraction = {
    engine: 'deepseek',
    model: MODEL,
    at: new Date().toISOString(),
  };
  policy.originalText = rawText;
  return { policy, logs };
}

function parseArgs(argv) {
  const args = { only: null, dryRun: false };
  for (const item of argv.slice(2)) {
    if (item === '--dry-run') args.dryRun = true;
    else if (item.startsWith('--only=')) args.only = item.slice('--only='.length);
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv);
  if (!fs.existsSync(RAW_DIR)) {
    console.error(`找不到原文目录: ${RAW_DIR}`);
    process.exit(1);
  }
  const metaList = JSON.parse(fs.readFileSync(path.join(RAW_DIR, '_sources.json'), 'utf8')).sources;
  const targets = args.only ? metaList.filter((m) => m.id === args.only) : metaList;

  if (targets.length === 0) {
    console.error(`没有匹配的政策：${args.only}`);
    process.exit(1);
  }

  console.log(`模型: ${MODEL}  接口: ${BASE_URL}`);
  console.log(`待处理: ${targets.map((t) => t.id).join(', ')}`);

  if (args.dryRun) {
    for (const meta of targets) {
      const file = path.join(RAW_DIR, `${meta.id}.txt`);
      const exists = fs.existsSync(file);
      const size = exists ? fs.readFileSync(file, 'utf8').length : 0;
      console.log(`  - ${meta.id}: ${exists ? size + ' 字符' : '缺少原文'}`);
    }
    console.log(API_KEY ? 'API Key: 已配置' : 'API Key: 未配置（.env 中的 DEEPSEEK_API_KEY）');
    return;
  }

  if (!API_KEY) {
    console.error('缺少 DEEPSEEK_API_KEY：请在仓库根目录 .env 中填写后重试。');
    process.exit(1);
  }

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.mkdirSync(LOG_DIR, { recursive: true });

  let ok = 0;
  let failed = 0;
  for (const meta of targets) {
    const file = path.join(RAW_DIR, `${meta.id}.txt`);
    if (!fs.existsSync(file)) { console.error(`跳过 ${meta.id}: 缺少原文`); failed += 1; continue; }
    const rawText = fs.readFileSync(file, 'utf8');
    console.log(`\n▶ 抽取 ${meta.id}（${rawText.length} 字符）...`);
    try {
      const { policy, logs } = await extractOne(meta, rawText);
      fs.writeFileSync(path.join(OUT_DIR, `${meta.id}.json`), JSON.stringify(policy, null, 2), 'utf8');
      fs.writeFileSync(
        path.join(LOG_DIR, `${meta.id}.json`),
        JSON.stringify({ id: meta.id, title: meta.title, source: meta.url, generatedAt: new Date().toISOString(), logs }, null, 2),
        'utf8',
      );
      const conds = policy.conditions.reduce((n, g) => n + g.conditions.length, 0);
      console.log(`  ✓ 条件组 ${policy.conditions.length} 个 / 条件 ${conds} 条 / 字段 ${policy.fields.length} 个 -> data/policies/${meta.id}.json`);
      ok += 1;
    } catch (err) {
      console.error(`  ✗ ${String(err).slice(0, 800)}`);
      failed += 1;
    }
  }

  console.log(`\n完成：成功 ${ok}，失败 ${failed}。AI 调用记录见 docs/ai-log/policies/`);
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
