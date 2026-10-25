import { Router } from 'express';

import { currentUser, requireAuth } from '../auth/middleware.js';
import {
  addRecord,
  clearRecords,
  getDraft,
  listRecords,
  saveDraft,
  type JudgementSummary,
  type VerdictValue,
} from '../userdata/store.js';

export const meRouter = Router();

const POLICY_ID_PATTERN = /^[a-z0-9-]+$/;
const VERDICTS: VerdictValue[] = ['pass', 'fail', 'unknown', 'warn'];

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isValidPolicyId(value: string): boolean {
  return POLICY_ID_PATTERN.test(value);
}

/** 读取某份政策下当前账号的草稿（换电脑登录后能接着填） */
meRouter.get('/me/drafts/:policyId', requireAuth, (req, res) => {
  const policyId = req.params.policyId ?? '';
  if (!isValidPolicyId(policyId)) {
    res.status(400).json({ ok: false, error: '政策编号不合法' });
    return;
  }
  res.json({ ok: true, data: getDraft(currentUser(res).id, policyId) });
});

/** 保存草稿（登录用户的填写进度存在服务端，而不是浏览器本地） */
meRouter.put('/me/drafts/:policyId', requireAuth, (req, res) => {
  const policyId = req.params.policyId ?? '';
  if (!isValidPolicyId(policyId)) {
    res.status(400).json({ ok: false, error: '政策编号不合法' });
    return;
  }
  const profile = (req.body as { profile?: unknown } | undefined)?.profile;
  if (!isPlainObject(profile)) {
    res.status(400).json({ ok: false, error: 'profile 必须是对象' });
    return;
  }
  res.json({ ok: true, data: saveDraft(currentUser(res).id, policyId, profile) });
});

/** 该账号最近的判定记录 */
meRouter.get('/me/records', requireAuth, (_req, res) => {
  res.json({ ok: true, data: listRecords(currentUser(res).id) });
});

/** 追加一条判定记录（判定成功后由前端调用） */
meRouter.post('/me/records', requireAuth, (req, res) => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const policyId = typeof body.policyId === 'string' ? body.policyId : '';
  const policyTitle = typeof body.policyTitle === 'string' ? body.policyTitle : '';
  const overall = body.overall as VerdictValue;
  const summary = body.summary as JudgementSummary | undefined;

  if (!isValidPolicyId(policyId) || !policyTitle) {
    res.status(400).json({ ok: false, error: '缺少政策信息' });
    return;
  }
  if (!VERDICTS.includes(overall)) {
    res.status(400).json({ ok: false, error: '判定结论不合法' });
    return;
  }
  if (!summary || typeof summary !== 'object') {
    res.status(400).json({ ok: false, error: '缺少判定统计' });
    return;
  }
  const counts = [summary.pass, summary.fail, summary.unknown, summary.warn, summary.requiredTotal];
  if (counts.some((item) => typeof item !== 'number' || !Number.isFinite(item) || item < 0)) {
    res.status(400).json({ ok: false, error: '判定统计不合法' });
    return;
  }
  res.status(201).json({
    ok: true,
    data: addRecord(currentUser(res).id, {
      policyId,
      policyTitle,
      overall,
      summary: {
        pass: summary.pass,
        fail: summary.fail,
        unknown: summary.unknown,
        warn: summary.warn,
        requiredTotal: summary.requiredTotal,
      },
    }),
  });
});

/** 清空判定记录 */
meRouter.delete('/me/records', requireAuth, (_req, res) => {
  clearRecords(currentUser(res).id);
  res.json({ ok: true, data: { cleared: true } });
});
