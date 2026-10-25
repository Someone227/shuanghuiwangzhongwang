import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, before, beforeEach, describe, it } from 'node:test';

import { MAX_RECORDS, addRecord, clearRecords, getDraft, listRecords, saveDraft } from './store.js';

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
});
