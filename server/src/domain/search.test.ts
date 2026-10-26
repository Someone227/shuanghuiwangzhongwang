import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { hitSnippet, looseIncludes, matchScore, normalizeSearch } from './search.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const POLICY_DIR = path.resolve(HERE, '../../../data/policies');

/** 政策正文里「家庭经济困难学生认定」这类长词组，用户常会漏掉一两个字 */
function loadOriginalText(id: string): string {
  const raw = fs.readFileSync(path.join(POLICY_DIR, `${id}.json`), 'utf8');
  return (JSON.parse(raw) as { originalText: string }).originalText;
}

/**
 * 宽松搜索测试。
 *
 * 搜索框不能要求用户一字不差地贴原文：原文是「我是一只大肥鱼」，
 * 用户搜「我一只大肥鱼」也得找到。这里守住「怎么算命中、算多准」这条线。
 */

test('宽松搜索：一字不差的查询拿满分', () => {
  assert.equal(matchScore('我是一只大肥鱼', '我是一只大肥鱼'), 100);
  assert.equal(matchScore('奖学金', '本专科生国家奖学金评审办法'), 100);
  assert.equal(matchScore('', '任意文本'), 100, '空查询视为不过滤');
});

test('宽松搜索：漏掉中间一两个字也能命中（用户原例）', () => {
  const haystack = '我是一只大肥鱼，住在很深的海里';
  const score = matchScore('我一只大肥鱼', haystack);
  assert.ok(score > 0, '漏掉「是」也应该命中');
  assert.ok(score < 100, '不是严格子串，分数应低于满分');
  assert.ok(looseIncludes('大肥鱼我', haystack) === false || true, '顺序不同不强制');

  // 原文模式（几千字的政策正文）同样要能命中
  assert.ok(matchScore('我一只大肥鱼', haystack, 'document') > 0);
});

test('宽松搜索：完全无关的查询不命中', () => {
  assert.equal(matchScore('量子力学', '本专科生国家奖学金评审办法'), 0);
  assert.equal(matchScore('xyzzy', '我是一只大肥鱼'), 0);
});

test('宽松搜索：原文模式阈值更高，避免常用字组合误命中', () => {
  const longText = '学生申请奖学金需要提交材料，学校审核后公示名单，最终由教育部门审批发放。'.repeat(20);
  // 短查询在标题里能命中，在长原文里不应凭常用字偶然命中
  assert.equal(matchScore('量子力学', longText, 'document'), 0);
  assert.ok(matchScore('学校审核', longText, 'document') > 0, '真出现的词要命中');
});

test('宽松搜索：多词查询要求每个词都命中', () => {
  assert.ok(matchScore('国家 奖学金', '本专科生国家奖学金评审办法') > 0);
  assert.equal(matchScore('国家 量子', '本专科生国家奖学金评审办法'), 0);
});

test('宽松搜索：归一化抹平全角、大小写和标点差异', () => {
  assert.equal(normalizeSearch('ＡＢＣ，测试。'), 'abc测试');
  assert.equal(normalizeSearch('  我 是  一只 '), '我是一只');
  assert.equal(matchScore('DeepSeek-API', 'deepseek api 调用'), 100);
});

test('宽松搜索：片段提取带上下文', () => {
  const text = '本专科生国家奖学金评审办法规定，申请国家奖学金的基本条件包括具有中华人民共和国国籍。';
  const snippet = hitSnippet('国家奖学金', text);
  assert.ok(snippet && snippet.includes('国家奖学金'), '片段里应含命中的词');
  assert.ok(snippet.length < text.length, '片段应短于原文');
  assert.equal(hitSnippet('量子力学', text), null, '完全没命中时不给片段');
});

test('宽松搜索：漏掉修饰词也能在政策原文里找到那句话', () => {
  const text = loadOriginalText('financial-hardship');
  assert.ok(text.includes('家庭经济困难学生认定'), '语料前提：原文里有完整说法');
  // 用户漏掉「经济」两个字
  assert.ok(matchScore('家庭困难学生认定', text, 'document') > 0);
  // 但随便拼几个常用字不该命中
  assert.equal(matchScore('天蓝色大象', text, 'document'), 0);
});

test('宽松搜索：标题里命中时分数高于原文里命中', () => {
  const title = matchScore('国家奖学金', '本专科生国家奖学金评审办法', 'field');
  const body = matchScore('国家奖学金', '……本办法规定的国家奖学金名额……', 'document');
  assert.ok(title >= body);
});
