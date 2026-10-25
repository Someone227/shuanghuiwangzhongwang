#!/usr/bin/env node
/**
 * git-sync.mjs —— 通过 GitHub Git Data API 把本地 commit 同步到远端 GitHub
 *
 * 为什么需要它：github.com 的 HTTPS 推送在当前网络下被阻断（TLS 握手失败），
 * 但 api.github.com 可直连。本脚本用 Git Data API 创建远端 commit，
 * 并在本地重建同 SHA 的提交对象，效果等同于一次 git push（含完整提交历史）。
 *
 * 用法：
 *   node tools/git-sync.mjs          # 把本地所有未推送的 commit 推到远端
 *   node tools/git-sync.mjs --dry-run
 *
 * 约定：
 *   - 只在 main 分支、工作区干净、远端是本地祖先（可快进）时工作
 *   - token 从 git credential（Windows 凭据管理器）自动读取，不落盘
 */
import { execFileSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = process.env.GS_REPO || 'Someone227/shuanghuiwangzhongwang';
const BRANCH = process.env.GS_BRANCH || 'main';
const API = 'https://api.github.com';
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DRY = process.argv.includes('--dry-run');

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
  const maxAttempts = 4;
  let lastError = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
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
    if (res.ok) return text ? JSON.parse(text) : null;

    lastError = new Error(method + ' ' + path + ' -> HTTP ' + res.status + ' ' + text.slice(0, 400));
    // GitHub 刚上传 blob 后建树偶发 422「is not a valid blob」（最终一致性），等一会儿重试即可
    const transient =
      res.status >= 500 ||
      (res.status === 422 && (text.includes('is not a valid blob') || text.includes('does not exist')));
    if (!transient || attempt === maxAttempts) throw lastError;
    console.warn('  ! 第 ' + attempt + ' 次请求失败（' + res.status + '），' + attempt + ' 秒后重试：' + path);
    await new Promise((r) => setTimeout(r, attempt * 1000));
  }
  throw lastError;
}

function parseIdentity(commitObj, kind) {
  const line = commitObj.split('\n').find((l) => l.startsWith(kind + ' '));
  const m = line.match(/^(author|committer) (.+) <(.+)> (\d+) ([+-]\d{4})$/);
  if (!m) throw new Error('无法解析 ' + kind + ' 行: ' + line);
  return { name: m[2], email: m[3], ts: parseInt(m[4], 10), tz: m[5] };
}

/** commit 对象里第一个空行之后的部分就是 message（保持原字节，含尾部换行） */
function parseMessage(commitObj) {
  const i = commitObj.indexOf('\n\n');
  if (i < 0) throw new Error('commit 对象缺少 message 分隔空行');
  return commitObj.slice(i + 2);
}

function isoWithOffset(ts, tz) {
  const sign = tz[0] === '-' ? -1 : 1;
  const off = sign * (parseInt(tz.slice(1, 3), 10) * 3600 + parseInt(tz.slice(3, 5), 10) * 60);
  const d = new Date((ts + off) * 1000);
  return d.toISOString().slice(0, 19) + tz.slice(0, 3) + ':' + tz.slice(3, 5);
}

/** 从 GitHub 返回的 ISO 时间还原 (unix 秒, +0800 形式时区) */
function fromIso(iso) {
  const m = iso.match(/^(\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d)(Z|[+-]\d\d:\d\d)$/);
  if (!m) throw new Error('无法解析时间: ' + iso);
  const ts = Math.floor(Date.parse(iso) / 1000);
  const tz = m[2] === 'Z' ? '+0000' : m[2].replace(':', '');
  return { ts, tz };
}

function listEntries(sha) {
  const out = execFileSync('git', ['ls-tree', '-r', '-z', sha], { cwd: ROOT, maxBuffer: 256 * 1024 * 1024 }).toString('utf8');
  return out.split('\0').filter(Boolean).map((rec) => {
    const tab = rec.indexOf('\t');
    const meta = rec.slice(0, tab).split(' ');
    return { mode: meta[0], type: meta[1], sha: meta[2], path: rec.slice(tab + 1) };
  });
}

/** 上传某个 commit 的文件树，返回 tree sha；blob 按 sha 缓存，不重复上传 */
async function createTree(sha, uploaded) {
  const entries = listEntries(sha);
  const tree = [];
  for (const e of entries) {
    if (!uploaded.has(e.sha)) {
      const buf = execFileSync('git', ['cat-file', 'blob', e.sha], { cwd: ROOT, maxBuffer: 256 * 1024 * 1024 });
      const blob = await api('POST', '/repos/' + REPO + '/git/blobs', {
        content: buf.toString('base64'),
        encoding: 'base64',
      });
      if (blob.sha !== e.sha) throw new Error('blob sha 不一致: ' + e.path + ' 本地 ' + e.sha + ' 远端 ' + blob.sha);
      uploaded.add(e.sha);
    }
    tree.push({ path: e.path, mode: e.mode, type: 'blob', sha: e.sha });
  }
  const res = await api('POST', '/repos/' + REPO + '/git/trees', { tree });
  return res.sha;
}

/** 用远端 commit 元数据在本地重建 commit 对象（穷举 message 尾换行与时区写法） */
function rebuildLocalCommit(meta) {
  const author = fromIso(meta.author.date);
  const committer = fromIso(meta.committer.date);
  const message = meta.message;
  const parentLines = (meta.parents || []).map((p) => 'parent ' + p.sha + '\n').join('');

  const variants = [];
  for (const trailing of ['', '\n']) {
    for (const tzForm of [author.tz, author.tz.slice(0, 3) + ':' + author.tz.slice(3)]) {
      variants.push(
        'tree ' + meta.tree.sha + '\n' + parentLines +
        'author ' + meta.author.name + ' <' + meta.author.email + '> ' + author.ts + ' ' + tzForm + '\n' +
        'committer ' + meta.committer.name + ' <' + meta.committer.email + '> ' + committer.ts + ' ' + tzForm + '\n' +
        '\n' + message + trailing,
      );
    }
  }
  for (const v of variants) {
    const sha = execFileSync('git', ['hash-object', '-t', 'commit', '-w', '--stdin'], {
      cwd: ROOT, input: v, encoding: 'utf8',
    }).trim();
    if (sha === meta.sha) return sha;
  }
  throw new Error('无法在本地重建远端提交对象 ' + meta.sha + '（SHA 不匹配）');
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

  // 远端必须是本地祖先，否则拒绝（避免把别人的提交覆盖掉）
  const history = git(['rev-list', 'HEAD']).trim().split('\n');
  if (!history.includes(remoteSha)) {
    throw new Error(
      '无法安全同步：远端提交 ' + remoteSha + ' 不在本地历史中。\n' +
      '可能原因：远端被其他人更新。请先人工核对。',
    );
  }

  const commits = git(['rev-list', '--reverse', remoteSha + '..HEAD']).trim().split('\n').filter(Boolean);
  console.log('待同步提交:', commits.length, '个');

  if (DRY) {
    for (const sha of commits) console.log('  -', sha.slice(0, 7), git(['log', '-1', '--format=%s', sha]).trim());
    console.log('\n[dry-run] 未做任何改动');
    return;
  }

  const uploaded = new Set();
  const created = [];
  let parent = remoteSha;

  for (const sha of commits) {
    const commitObj = git(['cat-file', '-p', sha]);
    const author = parseIdentity(commitObj, 'author');
    const committer = parseIdentity(commitObj, 'committer');
    const message = parseMessage(commitObj);
    const subject = git(['log', '-1', '--format=%s', sha]).trim();

    const treeSha = await createTree(sha, uploaded);
    const res = await api('POST', '/repos/' + REPO + '/git/commits', {
      message,
      tree: treeSha,
      parents: [parent],
      author: { name: author.name, email: author.email, date: isoWithOffset(author.ts, author.tz) },
      committer: { name: committer.name, email: committer.email, date: isoWithOffset(committer.ts, committer.tz) },
    });

    created.push({ local: sha, remote: res.sha });
    console.log('  ' + (res.sha === sha ? '✓' : '≠') + ' ' + sha.slice(0, 7) + ' ' + subject +
      (res.sha === sha ? '' : ' → ' + res.sha.slice(0, 7)));
    parent = res.sha;
  }

  // 本地对象若与远端不一致（message 尾换行等），按远端元数据重建并移动分支
  const mismatched = created.filter((c) => c.local !== c.remote);
  if (mismatched.length > 0) {
    console.log('\n检测到 ' + mismatched.length + ' 个提交 SHA 与本地不同，按远端元数据重建本地历史…');
    for (const c of mismatched) {
      const meta = await api('GET', '/repos/' + REPO + '/git/commits/' + c.remote);
      rebuildLocalCommit(meta);
    }
  }

  // 更新远端 ref（快进）
  await api('PATCH', '/repos/' + REPO + '/git/refs/heads/' + BRANCH, { sha: parent, force: false });
  console.log('远端 ref  : 已更新 →', parent.slice(0, 7));

  // 本地 refs 对齐
  git(['update-ref', 'refs/heads/' + BRANCH, parent]);
  git(['update-ref', 'refs/remotes/origin/' + BRANCH, parent]);
  git(['reset', '--hard', parent]);
  console.log('本地 refs : 已对齐');

  console.log('\n✓ 同步完成 ' + commits.length + ' 个提交');
  console.log('   https://github.com/' + REPO + '/tree/' + BRANCH);
};

main().catch((e) => {
  console.error('\n✗ 同步失败: ' + (e && e.message ? e.message : e));
  process.exit(1);
});
