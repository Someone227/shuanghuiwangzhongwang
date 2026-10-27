import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = 9335;
const HTML = 'file:///C:/Users/30516/Desktop/git/docs/tech-report/report.html';
const PROFILE = path.join(os.tmpdir(), 'edge-measure-' + Date.now());
const FOOT = '<div style="width:100%;padding:0 12mm;font-family:Microsoft YaHei;font-size:7.5pt;color:#8a938e;display:flex;justify-content:space-between;"><span>x</span><span>第 <span class="pageNumber"></span> / <span class="totalPages"></span> 页</span></div>';
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const child = spawn(EDGE, ['--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check',
  '--disable-extensions','--remote-debugging-port='+PORT,'--user-data-dir='+PROFILE,'about:blank'], { stdio:'ignore' });

async function waitVersion(){ for(let i=0;i<80;i++){ try{ const r=await fetch('http://127.0.0.1:'+PORT+'/json/version'); if(r.ok) return await r.json(); }catch{} await sleep(250);} throw new Error('CDP not ready'); }

let id=0; const pending=new Map();
function call(ws, method, params={}, sessionId){ const _id=++id; return new Promise((res,rej)=>{ pending.set(_id,m=> m.error? rej(new Error(method+' → '+JSON.stringify(m.error))): res(m.result)); ws.send(JSON.stringify(sessionId?{id:_id,method,params,sessionId}:{id:_id,method,params})); }); }
const countPages = (buf) => (buf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) || []).length;

(async () => {
  const ver = await waitVersion();
  const ws = new WebSocket(ver.webSocketDebuggerUrl);
  await new Promise((res,rej)=>{ ws.onopen=res; ws.onerror=()=>rej(new Error('ws fail')); });
  ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };

  const { targetId } = await call(ws,'Target.createTarget',{url:HTML});
  const { sessionId } = await call(ws,'Target.attachToTarget',{targetId,flatten:true});
  await call(ws,'Page.enable',{},sessionId);
  for(let i=0;i<60;i++){ const st=await call(ws,'Runtime.evaluate',{expression:'document.readyState',returnByValue:true},sessionId); if(st.result&&st.result.value==='complete') break; await sleep(200); }
  await sleep(1000);

  const total = await call(ws,'Runtime.evaluate',{expression:'document.querySelectorAll("section").length',returnByValue:true},sessionId);
  const n = total.result.value;
  const out = [];
  for (let i = 0; i < n; i++) {
    const r = await call(ws,'Runtime.evaluate',{expression:
      '(() => { const ss=[...document.querySelectorAll("section")]; ss.forEach((s,k)=>{ s.style.display = (k==='+i+') ? "" : "none"; }); return ss['+i+'].className + " | " + (ss['+i+'].querySelector("h1")?ss['+i+'].querySelector("h1").textContent.replace(/\s+/g," ").trim():"（无标题）"); })()'
    ,returnByValue:true},sessionId);
    await sleep(350);
    const pdf = await call(ws,'Page.printToPDF',{preferCSSPageSize:true, printBackground:true, displayHeaderFooter:true, headerTemplate:'<div></div>', footerTemplate:FOOT},sessionId);
    const pages = countPages(Buffer.from(pdf.data,'base64'));
    out.push({ idx:i, label:r.result.value, pages });
    console.log(i, pages, r.result.value);
  }
  fs.writeFileSync(path.join('C:/Users/30516/Desktop/git/docs/tech-report','_measure.json'), JSON.stringify(out,null,2), 'utf8');

  await call(ws,'Target.closeTarget',{targetId});
  ws.close(); child.kill();
  try { fs.rmSync(PROFILE,{recursive:true,force:true}); } catch {}
  process.exit(0);
})().catch(e=>{ console.error('FAILED:', e.message); try{child.kill();}catch{} process.exit(1); });
