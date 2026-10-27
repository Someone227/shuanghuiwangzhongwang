import fs from 'node:fs';
import path from 'node:path';

const DIR = import.meta.dirname;
const F = '#0f6f5c', FL = '#e7f2ee', FD = '#0b5546';
const A = '#c2410c', AL = '#fdf0e8';
const L = '#d8ddd8', INK = '#1a1f1c', MUT = '#6b736e', SOFT = '#f6f7f3';
const FONT = "Microsoft YaHei,PingFang SC,Noto Sans CJK SC,sans-serif";
const MONO = "Consolas,Cascadia Mono,monospace";

function rect(x, y, w, h, o = {}) {
  const fill = o.fill ?? '#fff', stroke = o.stroke ?? L, r = o.r ?? 5, dash = o.dash ? ' stroke-dasharray="5 4"' : '';
  const sw = o.sw ?? 1.2;
  return '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" rx="' + r + '" fill="' + fill + '" stroke="' + stroke + '" stroke-width="' + sw + '"' + dash + '/>';
}
function txt(x, y, s, o = {}) {
  const size = o.size ?? 11, fill = o.fill ?? INK, w = o.weight ?? 400, anchor = o.anchor ?? 'start';
  const extra = o.mono ? ' font-family="' + MONO + '"' : '';
  return '<text x="' + x + '" y="' + y + '" font-family="' + FONT + '" font-size="' + size + '" font-weight="' + w + '" fill="' + fill + '" text-anchor="' + anchor + '"' + extra + '>' + s + '</text>';
}
function arw(x1, y1, x2, y2, o = {}) {
  const color = o.color ?? F, dash = o.dash ? ' stroke-dasharray="4 3"' : '';
  return '<line x1="' + x1 + '" y1="' + y1 + '" x2="' + x2 + '" y2="' + y2 + '" stroke="' + color + '" stroke-width="' + (o.sw ?? 1.4) + '" marker-end="url(#' + (o.marker ?? 'ar') + ')"' + dash + '/>';
}
function defs(colors) {
  return '<defs>' + colors.map(c =>
    '<marker id="' + c.id + '" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6.5" markerHeight="6.5" orient="auto-start-reverse">' +
    '<path d="M0,1 L9,5 L0,9 z" fill="' + c.color + '"/></marker>').join('') + '</defs>';
}

/* ============ 图 1 总体架构 ============ */
function figArch() {
  const s = [];
  s.push('<svg viewBox="0 0 720 428" xmlns="http://www.w3.org/2000/svg">');
  s.push(defs([{ id: 'ar', color: F }, { id: 'arA', color: A }, { id: 'arM', color: '#9aa4a0' }]));

  // 建库期（顶部虚线区）
  s.push(rect(12, 8, 696, 92, { fill: '#fcfaf7', stroke: A, dash: true, sw: 1.3 }));
  s.push(txt(24, 28, '建库期 · 开发环境 · 一次性', { size: 12, weight: 700, fill: A }));
  s.push(txt(700, 28, '只有这一层接触大模型', { size: 10, fill: A, anchor: 'end' }));
  const bw = 150, by = 40, bh = 44;
  const buildBoxes = [
    ['政策原文存档', 'data/policies/raw'],
    ['清洗与段落定位', '去导航 / 重算偏移'],
    ['DeepSeek 抽取', 'JSON Output · T=0'],
    ['结构校验 + 人工复核', '57 条复核记录'],
  ];
  buildBoxes.forEach((b, i) => {
    const bx = 28 + i * (bw + 16);
    s.push(rect(bx, by, bw, bh, { fill: '#fff', stroke: '#e8c9ae' }));
    s.push(txt(bx + bw / 2, by + 19, b[0], { size: 11.5, weight: 600, anchor: 'middle' }));
    s.push(txt(bx + bw / 2, by + 35, b[1], { size: 9.5, fill: MUT, anchor: 'middle' }));
    if (i < 3) s.push(arw(bx + bw + 1, by + bh / 2, bx + bw + 15, by + bh / 2, { color: A, marker: 'arA' }));
  });

  // 运行期
  s.push(txt(12, 128, '运行期 · 用户每次访问', { size: 12, weight: 700, fill: FD }));
  s.push(txt(708, 128, '零 token · 可离线 · 结果确定', { size: 10, fill: FD, anchor: 'end' }));

  // 浏览器
  s.push(rect(12, 142, 190, 96, { fill: FL, stroke: '#b7dccd' }));
  s.push(txt(107, 164, '浏览器', { size: 12, weight: 700, anchor: 'middle', fill: FD }));
  s.push(txt(107, 182, 'Vue 3 SPA · 8 个路由', { size: 10, anchor: 'middle' }));
  s.push(txt(107, 199, '3 个复用组件', { size: 10, anchor: 'middle' }));
  s.push(txt(107, 216, '静态模式：浏览器内判定', { size: 9.5, fill: MUT, anchor: 'middle' }));
  s.push(txt(107, 231, 'profile → 结论 / 原文高亮', { size: 9.5, fill: MUT, anchor: 'middle' }));

  // 服务端
  s.push(rect(240, 142, 190, 96, { fill: '#fff', stroke: '#b7dccd' }));
  s.push(txt(335, 164, 'Express 服务端', { size: 12, weight: 700, anchor: 'middle', fill: FD }));
  s.push(txt(335, 182, '20 个端点 · /api/*', { size: 10, anchor: 'middle' }));
  s.push(txt(335, 199, '账号 · 记录 · 进度', { size: 10, anchor: 'middle' }));
  s.push(txt(335, 216, '按需鉴权（Bearer）', { size: 9.5, fill: MUT, anchor: 'middle' }));
  s.push(txt(335, 231, '无会话状态 · 无 AI 调用', { size: 9.5, fill: MUT, anchor: 'middle' }));

  // 领域层
  s.push(rect(468, 142, 240, 96, { fill: '#fff', stroke: '#b7dccd' }));
  s.push(txt(588, 164, '领域层 · 纯函数', { size: 12, weight: 700, anchor: 'middle', fill: FD }));
  ['matcher（判定 · 375 行）', 'radar（雷达 · 1041 行）', 'calendar / detail / search'].forEach((t, i) => {
    s.push(rect(480, 174 + i * 20, 216, 16, { fill: SOFT, stroke: '#e6ebe6', r: 3 }));
    s.push(txt(488, 186 + i * 20, t, { size: 9.5, fill: INK }));
  });

  // 数据层
  s.push(rect(12, 262, 696, 58, { fill: SOFT, stroke: L }));
  s.push(txt(24, 282, '数据层', { size: 11.5, weight: 700, fill: FD }));
  s.push(txt(24, 302, 'data/policies/*.json（32 份条件树 + 原文）', { size: 9.5, fill: MUT }));
  s.push(txt(330, 302, 'data/users.json · data/user-data.json', { size: 9.5, fill: MUT }));
  s.push(txt(696, 302, 'docs/ai-log · 37 次留痕', { size: 9.5, fill: MUT, anchor: 'end' }));
  s.push(txt(24, 313, '全部纳入版本控制，与代码同版本、可 diff', { size: 9, fill: MUT }));

  // 连线
  s.push(arw(202, 176, 238, 176, { marker: 'ar' }));
  s.push(arw(238, 200, 202, 200, { marker: 'ar' }));
  s.push(txt(220, 165, 'HTTP', { size: 8.5, fill: MUT, anchor: 'middle' }));
  s.push(arw(430, 176, 466, 176, { marker: 'ar' }));
  s.push(arw(466, 200, 430, 200, { marker: 'ar' }));
  s.push(arw(202, 224, 466, 240, { marker: 'arM', color: '#9aa4a0', dash: true }));
  s.push(txt(300, 256, '静态模式：直接调用领域层（@domain 别名，非复制）', { size: 9, fill: MUT }));
  s.push(arw(580, 240, 580, 260, { marker: 'ar' }));
  s.push(arw(120, 260, 120, 240, { marker: 'ar' }));

  // 结论输出
  s.push(rect(12, 336, 696, 78, { fill: '#f8fbf9', stroke: '#b7dccd' }));
  s.push(txt(24, 356, '页面产物', { size: 11.5, weight: 700, fill: FD }));
  const outs = [['四状态逐条结论', 'pass / fail / unknown / warn'], ['材料清单', '按当前路径筛选'], ['时间节点', '60 个节点 · 标责任方'], ['原文高亮', 'quote → section 定位']];
  outs.forEach((o, i) => {
    const ox = 24 + i * 170;
    s.push(txt(ox, 380, o[0], { size: 10.5, weight: 600 }));
    s.push(txt(ox, 396, o[1], { size: 9, fill: MUT }));
  });
  s.push('</svg>');
  return s.join('');
}

/* ============ 图 2 建库链路 ============ */
function figPipeline() {
  const s = [];
  s.push('<svg viewBox="0 0 720 300" xmlns="http://www.w3.org/2000/svg">');
  s.push(defs([{ id: 'ar', color: F }, { id: 'arA', color: A }]));

  const steps = [
    ['① 官网原始页面', ['教育部 / 资助中心', '文字版 HTML']],
    ['② 存档与清洗', ['逐字存档 → 去导航', '重算段落偏移']],
    ['③ DeepSeek 抽取', ['JSON Output · T=0', '九条提示词约束']],
    ['④ 结构校验', ['docRef / quote / 枚举', '不通过带错重试']],
    ['⑤ 人工复核', ['57 条改动记录', '过时条款写 notes']],
  ];
  const w = 128, gap = 14, y = 46, h = 74;
  steps.forEach((st, i) => {
    const x = 12 + i * (w + gap);
    s.push(rect(x, y, w, h, { fill: i === 2 ? AL : '#fff', stroke: i === 2 ? A : L }));
    s.push(txt(x + w / 2, y + 22, st[0], { size: 11, weight: 700, anchor: 'middle', fill: i === 2 ? A : INK }));
    s.push(txt(x + w / 2, y + 41, st[1][0], { size: 9, fill: MUT, anchor: 'middle' }));
    s.push(txt(x + w / 2, y + 55, st[1][1], { size: 9, fill: MUT, anchor: 'middle' }));
    if (i < 4) s.push(arw(x + w + 1, y + h / 2, x + w + gap - 1, y + h / 2, { marker: 'ar' }));
  });

  // 产物条
  s.push(rect(12, 140, 696, 40, { fill: SOFT, stroke: L }));
  s.push(txt(24, 156, '产物：data/policies/*.json（32 份条件树） + docs/ai-log/policies/*.json（37 次调用全留痕，含 prompt / 响应 / token 用量）', { size: 9.5, fill: INK }));
  s.push(txt(24, 171, '所有产物入库，与代码同版本；任何一条结论都能顺着 docRef → quote → 原文逐字回溯', { size: 9, fill: MUT }));

  // 重试回流
  s.push('<path d="M 560 ' + (y + h) + ' C 560 200, 470 200, 470 ' + (y + h) + '" fill="none" stroke="' + A + '" stroke-width="1.3" stroke-dasharray="4 3" marker-end="url(#arA)"/>');
  s.push(txt(600, 200, '校验失败 → 带错误清单重试（≤2 次）', { size: 9.5, fill: A }));

  // 底部指标
  s.push(txt(12, 226, '一次建库的实测指标', { size: 11.5, weight: 700, fill: FD }));
  const kpis = [['32 份', '政策入库'], ['37 次', '调用（5 份重试）'], ['219,952', '总 token'], ['12.8 s', '平均单份耗时'], ['< 1 元', '一次建库成本']];
  kpis.forEach((k, i) => {
    const x = 12 + i * 138;
    s.push(rect(x, 236, 128, 48, { fill: FL, stroke: '#b7dccd', r: 4 }));
    s.push(txt(x + 64, 258, k[0], { size: 13, weight: 700, anchor: 'middle', fill: FD }));
    s.push(txt(x + 64, 274, k[1], { size: 8.8, fill: MUT, anchor: 'middle' }));
  });
  s.push('</svg>');
  return s.join('');
}

/* ============ 图 3 判定数据流 ============ */
function figEval() {
  const s = [];
  s.push('<svg viewBox="0 0 720 320" xmlns="http://www.w3.org/2000/svg">');
  s.push(defs([{ id: 'ar', color: F }]));

  const steps = [
    ['用户画像 profile', ['表单动态生成', '只问用得到的字段']],
    ['逐条 checkCondition', ['10 种操作符', '空值 → unknown']],
    ['组内合并 logic', ['all：全部满足', 'any：任一满足']],
    ['通道合并 channels', ['通道之间取任一', '通道外仍需全部']],
  ];
  const w = 162, gap = 16, y = 40, h = 78;
  steps.forEach((st, i) => {
    const x = 12 + i * (w + gap);
    s.push(rect(x, y, w, h, { fill: '#fff', stroke: L }));
    s.push(txt(x + w / 2, y + 22, st[0], { size: 11, weight: 700, anchor: 'middle', fill: FD }));
    s.push(txt(x + w / 2, y + 42, st[1][0], { size: 9.2, fill: MUT, anchor: 'middle' }));
    s.push(txt(x + w / 2, y + 57, st[1][1], { size: 9.2, fill: MUT, anchor: 'middle' }));
    if (i < 3) s.push(arw(x + w + 1, y + h / 2, x + w + gap - 1, y + h / 2, { marker: 'ar' }));
  });

  // 状态说明带
  s.push(rect(12, 134, 696, 44, { fill: SOFT, stroke: L }));
  s.push(txt(24, 152, '每条条件 → 四种状态', { size: 10.5, weight: 700, fill: FD }));
  const states = [['pass 符合', '#0f6f5c'], ['fail 不符合', '#b91c1c'], ['unknown 待补充', '#b45309'], ['warn 建议项', '#c2410c']];
  states.forEach((st, i) => {
    const x = 160 + i * 138;
    s.push('<circle cx="' + (x - 8) + '" cy="149" r="3.5" fill="' + st[1] + '"/>');
    s.push(txt(x, 153, st[0], { size: 9.6, fill: INK }));
  });
  s.push(txt(24, 169, '合并规则：只要有一条 fail 且为硬性条件 → 整组 fail；否则有待补充 → unknown；建议项不满足只降级为 warn', { size: 8.8, fill: MUT }));

  // 输出
  s.push(txt(12, 200, '汇总结论（确定性模板拼装，不经过大模型）', { size: 11, weight: 700, fill: FD }));
  const outs = [
    ['结论卡', '大概率可以申 / 暂不符合 / 还不能下结论'],
    ['材料清单', '按条件命中筛选 materials[]'],
    ['接下来做什么', '待补充项 + 时间节点提醒'],
    ['原文回溯', 'quote → sections[] 高亮定位'],
  ];
  outs.forEach((o, i) => {
    const x = 12 + i * 174;
    s.push(rect(x, 210, 162, 54, { fill: '#f8fbf9', stroke: '#b7dccd', r: 4 }));
    s.push(txt(x + 81, 230, o[0], { size: 10.5, weight: 700, anchor: 'middle', fill: FD }));
    s.push(txt(x + 81, 244, o[1].slice(0, 22), { size: 8.6, fill: MUT, anchor: 'middle' }));
    s.push(txt(x + 81, 256, o[1].slice(22), { size: 8.6, fill: MUT, anchor: 'middle' }));
  });

  s.push(txt(12, 292, '整条链路是纯函数：不联网、不读时钟、不用随机数 → 同样的输入永远得到同样的输出，可单元测试、可离线演示', { size: 9.5, fill: MUT }));
  s.push(txt(12, 307, '输入只有两样：政策 JSON（构建期固定）与用户 profile（页面内存）', { size: 9.5, fill: MUT }));
  s.push('</svg>');
  return s.join('');
}

/* ============ 图 4 AI 调用边界 ============ */
function figAI() {
  const s = [];
  s.push('<svg viewBox="0 0 720 340" xmlns="http://www.w3.org/2000/svg">');
  s.push(defs([{ id: 'arA', color: A }, { id: 'ar', color: F }]));

  // 左：开发期
  s.push(rect(10, 30, 320, 240, { fill: '#fdf9f5', stroke: '#e8c9ae' }));
  s.push(txt(26, 52, '开发期 · 有 AI', { size: 12, weight: 700, fill: A }));
  s.push(txt(26, 68, '一次性，可人工复核，可重跑', { size: 9.2, fill: MUT }));
  const lefts = [
    ['DeepSeek API', 'deepseek-chat · JSON Output · T=0'],
    ['抽取脚本', 'extract-policies.mjs · 314 行'],
    ['结构校验 + 重试', 'schema 校验 · 带错重试 ≤2 次'],
    ['人工复核', '57 条改动 · review 字段固化'],
  ];
  lefts.forEach((t, i) => {
    const y = 84 + i * 44;
    s.push(rect(26, y, 288, 36, { fill: '#fff', stroke: '#e8c9ae', r: 4 }));
    s.push(txt(38, y + 15, t[0], { size: 10.5, weight: 600, fill: INK }));
    s.push(txt(38, y + 29, t[1], { size: 8.8, fill: MUT, mono: false }));
  });

  // 右：运行期
  s.push(rect(390, 30, 320, 240, { fill: '#f6fbf8', stroke: '#b7dccd' }));
  s.push(txt(406, 52, '运行期 · 零 AI', { size: 12, weight: 700, fill: FD }));
  s.push(txt(406, 68, '用户每次访问，结论必须确定', { size: 9.2, fill: MUT }));
  const rights = [
    ['浏览器', '读预置 JSON · 内存内判定'],
    ['Express API', 'POST /policies/:id/evaluate'],
    ['matcher 纯函数', '不 import 任何 AI SDK'],
    ['政策条件树', '构建期固定，运行期只读'],
  ];
  rights.forEach((t, i) => {
    const y = 84 + i * 44;
    s.push(rect(406, y, 288, 36, { fill: '#fff', stroke: '#b7dccd', r: 4 }));
    s.push(txt(418, y + 15, t[0], { size: 10.5, weight: 600, fill: INK }));
    s.push(txt(418, y + 29, t[1], { size: 8.8, fill: MUT }));
  });

  // 中间防火墙
  s.push('<line x1="360" y1="24" x2="360" y2="286" stroke="' + A + '" stroke-width="1.6" stroke-dasharray="6 5"/>');
  s.push('<rect x="318" y="4" width="86" height="22" rx="11" fill="' + A + '"/>');
  s.push(txt(361, 19, '运行期防火墙', { size: 9.6, weight: 700, fill: '#fff', anchor: 'middle' }));
  s.push(txt(361, 300, '构建产物', { size: 9, fill: A, anchor: 'middle', weight: 600 }));
  s.push(arw(332, 158, 388, 158, { color: A, marker: 'arA', sw: 1.6 }));

  // 底部说明
  s.push(rect(10, 306, 700, 26, { fill: SOFT, stroke: L, r: 4 }));
  s.push(txt(24, 323, '效果：用户无论判定多少份政策、多少次，消耗 token 恒为 0；断网可用；结论可复现、可被单元测试覆盖', { size: 9.4, fill: INK }));
  s.push('</svg>');
  return s.join('');
}

/* ============ 拼接 ============ */
const parts = ['part1.html', 'part2.html', 'part3.html', 'part4.html', 'part5.html', 'part6.html']
  .map(f => fs.readFileSync(path.join(DIR, f), 'utf8'));

let body = parts.join('\n');

const figs = {
  'FIG:ARCH': { svg: figArch(), cap: '<b>图 2-1</b>　总体架构：建库期（有 AI）与运行期（零 AI）之间只有构建产物一条通路。' },
  'FIG:PIPELINE': { svg: figPipeline(), cap: '<b>图 3-1</b>　建库链路五步：原文 → 清洗 → 抽取 → 校验 → 人审，每一环都有可核查的产物。' },
  'FIG:EVAL': { svg: figEval(), cap: '<b>图 3-2</b>　判定数据流：profile 经逐条求值、组内合并、通道合并，输出结论与证据。' },
  'FIG:AI': { svg: figAI(), cap: '<b>图 4-1</b>　AI 调用边界：大模型只出现在左侧开发期，右侧运行期不 import 任何 AI 依赖。' },
};

for (const [key, f] of Object.entries(figs)) {
  const ph = '<!--' + key + '-->';
  if (!body.includes(ph)) { console.warn('WARN 缺少占位符', key); continue; }
  const html = '<div class="figure">' + f.svg + '<div class="fig-cap">' + f.cap + '</div></div>';
  body = body.split(ph).join(html);
}

const css = fs.readFileSync(path.join(DIR, 'styles.css'), 'utf8');
const page = '<!doctype html>\n<html lang="zh-CN">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1">\n' +
  '<title>能申吗 · 技术设计文档</title>\n<style>\n' + css + '\n</style>\n</head>\n<body>\n' + body + '\n</body>\n</html>\n';

fs.writeFileSync(path.join(DIR, 'report.html'), page, 'utf8');
const left = (page.match(/<!--FIG:[A-Z]+-->/g) || []).length;
console.log('report.html 生成完成：', page.length, '字符；剩余占位符', left);
