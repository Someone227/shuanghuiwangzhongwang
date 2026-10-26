import { Router } from 'express';

import { buildCalendar } from '../domain/calendar.js';
import { evaluate } from '../domain/matcher.js';
import { getPolicy, listAllPolicies, listPolicies } from '../policies/store.js';
import { RADAR_SLOTS, scanPolicies, slotCoverage, toRadarBundle } from '../domain/radar.js';

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

/**
 * 政策雷达元数据：26 个统一画像槽位 + 每份政策的精简包（不含原文）。
 * 前端拿到它之后在本地跑 scanBundles()，填表即可实时分层。
 */
policiesRouter.get('/radar', (_req, res) => {
  const policies = listAllPolicies();
  res.json({
    ok: true,
    data: { slots: RADAR_SLOTS, coverage: slotCoverage(policies), policies: policies.map(toRadarBundle) },
  });
});

/**
 * 政策雷达：提交一份统一画像，返回 32 份政策的分层结论。
 * 纯规则判定，不调用大模型 —— 画像与政策条件的映射关系全部可追溯。
 */
policiesRouter.post('/radar/scan', (req, res) => {
  const slots = (req.body ?? {}) as Record<string, unknown>;
  const policies = listAllPolicies();
  res.json({ ok: true, data: { ...scanPolicies(policies, slots), coverage: slotCoverage(policies) } });
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
