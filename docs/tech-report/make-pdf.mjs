import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = 9334;
const HTML = 'file:///C:/Users/30516/Desktop/git/docs/tech-report/report.html';
const OUT = 'C:/Users/30516/Desktop/能申吗-技术文档.pdf';
const PROFILE = path.join(os.tmpdir(), 'edge-pdftool-' + Date.now());
const FOOT = '<div style="width:100%;padding:0 14mm;font-family:Microsoft YaHei,sans-serif;font-size:7.5pt;color:#8a938e;display:flex;justify-content:space-between;">'
  + '<span>能申吗 · 技术设计文档 v1.0</span><span>第 <span class="pageNumber"></span> / <span class="totalPages"></span> 页</span></div>';

const child = spawn(EDGE, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  '--disable-extensions', '--remote-debugging-port=' + PORT, '--user-data-dir=' + PROFILE, 'about:blank'],
  { stdio: 'ignore' });

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function waitVersion() {
  for (let i = 0; i < 80; i++) {
    try { const r = await fetch('http://127.0.0.1:' + PORT + '/json/version'); if (r.ok) return await r.json(); } catch {}
    await sleep(250);
  }
  throw new Error('Edge CDP 未就绪');
}

let id = 0;
const pending = new Map();

function call(ws, method, params = {}, sessionId) {
  const _id = ++id;
  return new Promise((res, rej) => {
    pending.set(_id, (m) => (m.error ? rej(new Error(method + ' → ' + JSON.stringify(m.error))) : res(m.result)));
    ws.send(JSON.stringify(sessionId ? { id: _id, method, params, sessionId } : { id: _id, method, params }));
  });
}

(async () => {
  const ver = await waitVersion();
  const ws = new WebSocket(ver.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = (e) => rej(new Error('WS 失败')); });
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
  };

  const { targetId } = await call(ws, 'Target.createTarget', { url: HTML });
  const { sessionId } = await call(ws, 'Target.attachToTarget', { targetId, flatten: true });
  await call(ws, 'Page.enable', {}, sessionId);

  for (let i = 0; i < 60; i++) {
    const st = await call(ws, 'Runtime.evaluate', { expression: 'document.readyState', returnByValue: true }, sessionId);
    if (st.result && st.result.value === 'complete') break;
    await sleep(200);
  }
  await sleep(1200); // 等待字体与布局稳定

  const info = await call(ws, 'Runtime.evaluate', { expression: 'document.querySelectorAll(".chapter").length + "/" + document.body.scrollHeight', returnByValue: true }, sessionId);
  console.log('页面章节数/高度:', info.result && info.result.value);

  const pdf = await call(ws, 'Page.printToPDF', {
    preferCSSPageSize: true,
    printBackground: true,
    displayHeaderFooter: true,
    headerTemplate: '<div></div>',
    footerTemplate: FOOT,
  }, sessionId);

  const buf = Buffer.from(pdf.data, 'base64');
  fs.writeFileSync(OUT, buf);
  const s = buf.toString('latin1');
  const pages = (s.match(/\/Type\s*\/Page[^s]/g) || []).length;
  const mb = (s.match(/\/MediaBox\s*\[([^\]]+)\]/) || [])[1];
  console.log('PDF:', buf.length, 'bytes | 页数:', pages, '| MediaBox:', mb);

  await call(ws, 'Target.closeTarget', { targetId });
  ws.close();
  child.kill();
  try { fs.rmSync(PROFILE, { recursive: true, force: true }); } catch {}
  process.exit(0);
})().catch((e) => { console.error('FAILED:', e.message); try { child.kill(); } catch {} process.exit(1); });
