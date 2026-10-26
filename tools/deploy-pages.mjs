#!/usr/bin/env node
/**
 * 把 web/dist 发布到 GitHub Pages（gh-pages 分支）。
 *
 * 为什么不用 GitHub Actions：当前仓库的 Git 凭据只有 repo scope，没有 workflow scope，
 * 推送 .github/workflows/*.yml 会被 GitHub 拒绝。直接把构建产物推到 gh-pages 分支
 * 同样能部署，而且更快、过程更透明（每次部署就是一次普通提交）。
 *
 * 用法（先构建，再发布）：
 *   pnpm --filter server exec tsx scripts/export-static-data.mjs
 *   pnpm --filter web run build:pages
 *   node tools/deploy-pages.mjs
 */

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '..');
const DIST = path.join(REPO_ROOT, 'web', 'dist');
const OWNER = 'Someone227';
const REPO = 'shuanghuiwangzhongwang';
const BRANCH = 'gh-pages';

const token = (() => {
  const out = execFileSync('git', ['credential', 'fill'], {
    input: 'protocol=https\nhost=github.com\n\n',
    encoding: 'utf8',
    cwd: REPO_ROOT,
  });
  const m = out.match(/password=(.+)/);
  if (!m) throw new Error('拿不到 GitHub 凭据（git credential fill 没有返回 password）');
  return m[1].trim();
})();

async function api(method, apiPath, body) {
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    try {
      const res = await fetch(`https://api.github.com/repos/${OWNER}/${REPO}${apiPath}`, {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github+json',
          'Content-Type': 'application/json',
          'User-Agent': 'nengshenma-deploy',
        },
        body: body ? JSON.stringify(body) : undefined,
      });
      const text = await res.text();
      const data = text ? JSON.parse(text) : null;
      if (res.ok) return data;
      // 最终一致性导致的 404/422 偶发失败，等一下重试
      if ((res.status === 404 || res.status === 422) && attempt < 4) {
        await new Promise((r) => setTimeout(r, attempt * 1200));
        continue;
      }
      throw new Error(`${method} ${apiPath} -> HTTP ${res.status} ${text.slice(0, 300)}`);
    } catch (err) {
      if (attempt === 4) throw err;
      if (!/fetch failed|HTTP 5\d\d/.test(String(err))) throw err;
      await new Promise((r) => setTimeout(r, attempt * 1200));
    }
  }
}

/** 递归收集 dist 下的文件，返回相对路径 */
function walk(dir, base = dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full, base));
    else out.push(path.relative(base, full).replace(/\\/g, '/'));
  }
  return out;
}

if (!fs.existsSync(DIST)) {
  console.error('✗ 没有找到 web/dist，先跑构建：pnpm --filter web run build:pages');
  process.exit(1);
}

// GitHub Pages 默认跑 Jekyll，加 .nojekyll 跳过（否则下划线开头的文件会被忽略）
fs.writeFileSync(path.join(DIST, '.nojekyll'), '');

// GitHub Pages 没有 SPA 回退规则：直接访问深链（/calendar、/match/xxx）会落到
// GitHub 自带的 404 页。把 index.html 复制一份成 404.html，由前端路由接管地址，
// 这样别人粘贴任意页面地址、或在页面上刷新，都能正常打开。
fs.copyFileSync(path.join(DIST, 'index.html'), path.join(DIST, '404.html'));

const files = walk(DIST).sort();
console.log(`准备发布 ${files.length} 个文件到 ${OWNER}/${REPO}@${BRANCH}`);

// 1) 逐个上传 blob
const tree = [];
for (const rel of files) {
  const content = fs.readFileSync(path.join(DIST, rel)).toString('base64');
  const blob = await api('POST', '/git/blobs', { content, encoding: 'base64' });
  tree.push({ path: rel, mode: '100644', type: 'blob', sha: blob.sha });
  process.stdout.write('.');
}
console.log('');

// 2) 建 tree
const newTree = await api('POST', '/git/trees', { tree });
console.log(`✓ tree ${newTree.sha.slice(0, 7)}`);

// 3) 建 commit（有旧分支就以它作 parent，保持历史线性）
let parent;
try {
  const ref = await api('GET', `/git/ref/heads/${BRANCH}`);
  parent = ref.object.sha;
} catch {
  parent = undefined;
}
const commit = await api('POST', '/git/commits', {
  message: `deploy: 发布静态站点 ${new Date().toISOString()}`,
  tree: newTree.sha,
  parents: parent ? [parent] : [],
});
console.log(`✓ commit ${commit.sha.slice(0, 7)}`);

// 4) 更新分支
if (parent) {
  await api('PATCH', `/git/refs/heads/${BRANCH}`, { sha: commit.sha, force: true });
} else {
  await api('POST', '/git/refs', { ref: `refs/heads/${BRANCH}`, sha: commit.sha });
}
console.log('✓ 已更新分支 refs/heads/' + BRANCH);
console.log(`\n在线地址：https://${OWNER.toLowerCase()}.github.io/${REPO}/`);
