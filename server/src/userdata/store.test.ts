import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, before, beforeEach, describe, it } from 'node:test';

import {
  MAX_RECORDS,
  addRecord,
  clearAllProgress,
  clearDraft,
  clearProgress,
  clearRecords,
  getDraft,
  listProgress,
  listRecords,
  saveDraft,
  saveProgress,
} from './store.js';

let dir = '';

before(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'nengshenma-userdata-'));
  process.env.USERDATA_FILE = path.join(dir, 'user-data.json');
});

after(() => {
  rmSync(dir, { recursive: true, force: true });
  delete process.env.USERDATA_FILE;
});

beforeEach(() => {
  rmSync(path.join(dir, 'user-data.json'), { force: true });
});

const summary = { pass: 3, fail: 1, unknown: 2, warn: 0, requiredTotal: 6 };

describe('个人数据', () => {
  it('草稿按账号 + 政策分别保存，换设备登录能读回', () => {
    assert.equal(getDraft('user-a', 'student-loan'), null);
    saveDraft('user-a', 'student-loan', { 'identity.nationality': '中华人民共和国' });
    saveDraft('user-b', 'student-loan', { 'identity.nationality': '其他' });
    const draft = getDraft('user-a', 'student-loan');
    assert.deepEqual(draft?.profile, { 'identity.nationality': '中华人民共和国' });
    assert.equal(getDraft('user-b', 'student-loan')?.profile['identity.nationality'], '其他');
    assert.equal(getDraft('user-a', 'national-scholarship'), null);
  });

  it('清掉草稿后读不到，且只影响这一份政策', () => {
    saveDraft('user-a', 'student-loan', { 'identity.nationality': '中华人民共和国' });
    saveDraft('user-a', 'national-scholarship', { 'identity.nationality': '中华人民共和国' });
    assert.equal(clearDraft('user-a', 'student-loan'), true);
    assert.equal(getDraft('user-a', 'student-loan'), null);
    assert.ok(getDraft('user-a', 'national-scholarship'));
    // 没保存过的草稿重复清除不报错
    assert.equal(clearDraft('user-a', 'student-loan'), false);
    assert.equal(clearDraft('user-b', 'student-loan'), false);
  });

  it('判定记录新的在前，且最多保留 20 条', () => {
    for (let i = 0; i < MAX_RECORDS + 5; i += 1) {
      addRecord('user-a', {
        policyId: 'national-scholarship',
        policyTitle: `第 ${i} 次判定`,
        overall: 'unknown',
        summary,
      });
    }
    const records = listRecords('user-a');
    assert.equal(records.length, MAX_RECORDS);
    assert.equal(records[0]?.policyTitle, `第 ${MAX_RECORDS + 4} 次判定`);
    assert.equal(listRecords('user-b').length, 0);
  });

  it('可以清空某个账号的判定记录', () => {
    addRecord('user-a', { policyId: 'student-loan', policyTitle: '助学贷款', overall: 'pass', summary });
    clearRecords('user-a');
    assert.deepEqual(listRecords('user-a'), []);
  });

  it('填报进度只存数量，不存任何填写内容', () => {
    saveProgress('user-a', 'student-loan', { policyTitle: '助学贷款', filled: 8, total: 14 });
    const [entry] = listProgress('user-a');
    assert.equal(entry?.policyId, 'student-loan');
    assert.equal(entry?.policyTitle, '助学贷款');
    assert.equal(entry?.filled, 8);
    assert.equal(entry?.total, 14);
    // 进度对象里不应该出现字段值
    assert.deepEqual(Object.keys(entry ?? {}).sort(), ['filled', 'policyId', 'policyTitle', 'total', 'updatedAt']);
    // 不同账号互不影响
    assert.deepEqual(listProgress('user-b'), []);
  });

  it('填报进度按更新时间倒序，且可单条清除', () => {
    saveProgress('user-a', 'student-loan', { policyTitle: '助学贷款', filled: 1, total: 14 });
    saveProgress('user-a', 'national-scholarship', { policyTitle: '国家奖学金', filled: 6, total: 12 });
    const list = listProgress('user-a');
    assert.equal(list.length, 2);
    assert.equal(list[0]?.policyId, 'national-scholarship');
    assert.equal(clearProgress('user-a', 'student-loan'), true);
    assert.deepEqual(
      listProgress('user-a').map((item) => item.policyId),
      ['national-scholarship'],
    );
    assert.equal(clearProgress('user-a', 'student-loan'), false);
  });

  it('同一份政策重复上报只保留最新进度', () => {
    saveProgress('user-a', 'student-loan', { policyTitle: '助学贷款', filled: 3, total: 14 });
    saveProgress('user-a', 'student-loan', { policyTitle: '助学贷款', filled: 9, total: 14 });
    const list = listProgress('user-a');
    assert.equal(list.length, 1);
    assert.equal(list[0]?.filled, 9);
  });

  it('可以一次清掉全部填报进度', () => {
    saveProgress('user-a', 'student-loan', { policyTitle: '助学贷款', filled: 3, total: 14 });
    saveProgress('user-b', 'student-loan', { policyTitle: '助学贷款', filled: 5, total: 14 });
    clearAllProgress('user-a');
    assert.deepEqual(listProgress('user-a'), []);
    assert.equal(listProgress('user-b').length, 1);
  });
});
