#!/usr/bin/env node
/**
 * git-sync.mjs —— 通过 GitHub Git Data API 把本地 commit 同步到远端 GitHub
 * 用途：github.com 的 HTTPS 推送在当前网络下被阻断（TLS 握手失败），
 *       但 api.github.com 可直连。本脚本用 API 创建远端 commit 并在本地重建同 SHA 的对象，
 *       效果等同于一次 git push（含提交历史、文件内容、commit message）。
 *
 * 用法：
 *   node tools/git-sync.mjs                 # 同步当前 HEAD 到远端
 *   node tools/git-sync.mjs "自定义说明"     # 覆盖 commit message（一般不需要）
 *
 * 约定：
 *   - 只在 main 分支、工作区干净、本地恰好领先远端 1 个 commit 时工作
 *   - token 从 git credential（Windows 凭据管理器）自动读取，不落盘
 */
import { execFileSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = process.env.GS_REPO || 'Someone227/shuanghuiwangzhongwang';
const BRANCH = process.env.GS_BRANCH || 'main';
const API = 'https://api.github.com';
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const git = (args, opts = {}) =>
  execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, ...opts });

function getToken() {
  const out = execFileSync('git', ['credential', 'fill'], {
    cwd: ROOT,
    input: 'protocol=https\nhost=github.com\n\n',
    encoding: 'utf8',
    timeout: 20000,
  });
  const m = out.match(/^password=(.+)$/m);
  if (!m) throw new Error('无法从 git credential fill 获取 GitHub token');
  return m[1].trim();
}

const token = getToken();
async function api(method, path, body) {
  const res = await fetch(API + path, {
    method,
    headers: {
      Authorization: 'Bearer ' + token,
      Accept: 'application/vnd.github+json',
      'User-Agent': 'dsh-git-sync',
      'X-GitHub-Api-Version': '2022-11-28',
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(method + ' ' + path + ' -> HTTP ' + res.status + ' ' + text.slice(0, 400));
  return text ? JSON.parse(text) : null;
}

function parseIdentity(commitObjText, kind) {
  const line = commitObjText.split('\n').find((l) => l.startsWith(kind + ' '));
  const m = line.match(/^(author|committer) (.+) <(.+)> (\d+) ([+-]\d{4})$/);
  if (!m) throw new Error('无法解析 ' + kind + ' 行: ' + line);
  return { name: m[2], email: m[3], ts: parseInt(m[4], 10), tz: m[5] };
}

function isoWithOffset(ts, tz) {
  const sign = tz[0] === '-' ? -1 : 1;
  const off = sign * (parseInt(tz.slice(1, 3), 10) * 3600 + parseInt(tz.slice(3, 5), 10) * 60);
  const d = new Date((ts + off) * 1000);
  return d.toISOString().slice(0, 19) + tz.slice(0, 3) + ':' + tz.slice(3, 5);
}

const main = async () => {
  const branch = git(['rev-parse', '--abbrev-ref', 'HEAD']).trim();
  if (branch !== BRANCH) throw new Error('当前分支是 ' + branch + '，本脚本只同步 ' + BRANCH);

  const dirty = git(['status', '--porcelain']).trim();
  if (dirty) throw new Error('工作区有未提交变更，请先 git add + git commit：\n' + dirty);

  const localSha = git(['rev-parse', 'HEAD']).trim();
  const remote = await api('GET', '/repos/' + REPO + '/git/ref/heads/' + BRANCH);
  const remoteSha = remote.object.sha;
  console.log('本地 HEAD :', localSha);
  console.log('远端 HEAD :', remoteSha);

  if (localSha === remoteSha) {
    console.log('\n✓ 已同步，无需操作');
    return;
  }

  const parentSha = (() => {
    try { return git(['rev-parse', 'HEAD^']).trim(); } catch { return null; }
  })();
  let effectiveParent = parentSha;
  if (parentSha !== remoteSha) {
    // 本地没有远端对象时，git rev-parse 能解析到 remoteSha 才说明是快进
    let known = false;
    if (parentSha) {
      try {
        const all = git(['rev-list', 'HEAD']).trim().split('\n');
        known = all.includes(remoteSha);
      } catch { known = false; }
    }
    if (!known) {
      throw new Error(
        '无法安全同步：本地 HEAD 的父提交 (' + parentSha + ') 与远端 (' + remoteSha + ') 不同。\n' +
        '可能原因：远端被其他人更新，或上一次同步未完成。请先人工核对。'
      );
    }
  }

  const commitObj = git(['cat-file', '-p', 'HEAD']);
  const author = parseIdentity(commitObj, 'author');
  const committer = parseIdentity(commitObj, 'committer');
  const message = (process.argv[2] || git(['log', '-1', '--format=%B', 'HEAD'])).replace(/\n+$/, '');

  // 1) 上传全部 blob，建立完整树
  const lsTree = execFileSync('git', ['ls-tree', '-r', '-z', 'HEAD'], { cwd: ROOT, maxBuffer: 256 * 1024 * 1024 }).toString('utf8');
  const entries = lsTree.split('\0').filter(Boolean).map((rec) => {
    const tab = rec.indexOf('\t');
    const meta = rec.slice(0, tab).split(' ');
    const path = rec.slice(tab + 1);
    return { mode: meta[0], type: meta[1], sha: meta[2], path };
  });
  console.log('文件数    :', entries.length);

  const tree = [];
  for (const e of entries) {
    const buf = execFileSync('git', ['cat-file', 'blob', e.sha], { cwd: ROOT, maxBuffer: 256 * 1024 * 1024 });
    const blob = await api('POST', '/repos/' + REPO + '/git/blobs', {
      content: buf.toString('base64'),
      encoding: 'base64',
    });
    if (blob.sha !== e.sha) throw new Error('blob sha 不一致: ' + e.path + ' 本地 ' + e.sha + ' 远端 ' + blob.sha);
    tree.push({ path: e.path, mode: e.mode, type: 'blob', sha: blob.sha });
  }
  const treeRes = await api('POST', '/repos/' + REPO + '/git/trees', { tree });
  const treeSha = treeRes.sha;

  // 2) 创建远端 commit
  const parents = [];
  if (parentSha === remoteSha) parents.push(remoteSha);
  else parents.push(remoteSha);

  const commitRes = await api('POST', '/repos/' + REPO + '/git/commits', {
    message,
    tree: treeSha,
    parents,
    author: { name: author.name, email: author.email, date: isoWithOffset(author.ts, author.tz) },
    committer: { name: committer.name, email: committer.email, date: isoWithOffset(committer.ts, committer.tz) },
  });
  const newSha = commitRes.sha;
  console.log('远端新提交:', newSha);

  // 3) 本地重建同 SHA 的 commit 对象（穷举尾换行 / 时区写法变体）
  const variants = [];
  for (const trailing of [false, true]) {
    for (const tzForm of [author.tz, author.tz.slice(0, 3) + ':' + author.tz.slice(3)]) {
      const body =
        'tree ' + treeSha + '\n' +
        parents.map((p) => 'parent ' + p + '\n').join('') +
        'author ' + author.name + ' <' + author.email + '> ' + author.ts + ' ' + tzForm + '\n' +
        'committer ' + committer.name + ' <' + committer.email + '> ' + committer.ts + ' ' + tzForm + '\n' +
        '\n' + message + (trailing ? '\n' : '');
      variants.push(body);
    }
  }
  let matched = null;
  for (const v of variants) {
    const tmp = execFileSync('git', ['hash-object', '-t', 'commit', '-w', '--stdin'], {
      cwd: ROOT, input: v, encoding: 'utf8',
    }).trim();
    if (tmp === newSha) { matched = tmp; break; }
  }
  if (!matched) {
    throw new Error('本地无法重建与远端一致的 commit 对象（SHA 不匹配）。远端已创建 ' + newSha + '，请人工处理。');
  }
  console.log('本地对象  : 已重建，SHA 对齐');

  // 4) 更新远端 ref
  await api('PATCH', '/repos/' + REPO + '/git/refs/heads/' + BRANCH, { sha: newSha, force: false });
  console.log('远端 ref  : 已更新');

  // 5) 本地 refs 对齐
  git(['update-ref', 'refs/heads/' + BRANCH, newSha]);
  git(['update-ref', 'refs/remotes/origin/' + BRANCH, newSha]);
  try { git(['reset', '--hard', newSha]); } catch (e) { console.warn('reset --hard 警告:', String(e).slice(0, 200)); }

  const subject = message.split('\n')[0];
  console.log('\n✓ 同步完成: ' + newSha.slice(0, 7) + ' ' + subject);
  console.log('   https://github.com/' + REPO + '/commit/' + newSha);
};

main().catch((e) => {
  console.error('\n✗ 同步失败: ' + (e && e.message ? e.message : e));
  process.exit(1);
});
