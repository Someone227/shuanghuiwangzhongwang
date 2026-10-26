import { Router } from 'express';

import { buildCalendar } from '../domain/calendar.js';
import { evaluate } from '../domain/matcher.js';
import { getPolicy, listAllPolicies, listPolicies } from '../policies/store.js';

export const policiesRouter = Router();

/** 政策列表（摘要） */
policiesRouter.get('/policies', (_req, res) => {
  res.json({ ok: true, data: listPolicies() });
});

/**
 * 年度申报日历：把 32 份政策里的 60 个时间节点按月份聚合。
 * 纯规则解析，不调用大模型。
 */
policiesRouter.get('/calendar', (_req, res) => {
  res.json({ ok: true, data: buildCalendar(listAllPolicies()) });
});

/** 单份政策全量（原文、段落、字段、条件树、材料） */
policiesRouter.get('/policies/:id', (req, res) => {
  const policy = getPolicy(req.params.id);
  if (!policy) {
    res.status(404).json({ ok: false, error: '政策不存在' });
    return;
  }
  res.json({ ok: true, data: policy });
});

/**
 * 判定入口：纯本地计算，不调用大模型。
 * 请求体 { profile: { 'education.grade': '大三', ... } }，返回逐条判定结果。
 */
policiesRouter.post('/policies/:id/evaluate', (req, res) => {
  const policy = getPolicy(req.params.id);
  if (!policy) {
    res.status(404).json({ ok: false, error: '政策不存在' });
    return;
  }
  const profile = (req.body as { profile?: unknown } | undefined)?.profile;
  if (typeof profile !== 'object' || profile === null || Array.isArray(profile)) {
    res.status(400).json({ ok: false, error: 'profile 必须是对象' });
    return;
  }
  res.json({ ok: true, data: evaluate(policy, profile as Record<string, unknown>) });
});
