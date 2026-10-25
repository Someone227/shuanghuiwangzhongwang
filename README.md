# 能申吗 · 政策资格匹配器

> 贴一份政策原文 → AI 逐条判定你够不够格、差在哪一条、还缺什么材料。

奖助学金、专项补贴、保研推免、人才落户……这类政策文件动辄上万字，条件散落在正文、附件和脚注里。
学生和普通市民最常问的三个问题其实只有一句话：**「我能申吗？」**

「能申吗」把这件事做成一条完整链路：

| 步骤 | 做什么 |
| --- | --- |
| 1 贴政策 | 粘贴政策原文（或上传文档） |
| 2 AI 抽条件 | 自动抽取成**结构化条件树**（学历/年级/成绩/户籍/时间/材料…） |
| 3 填自己 | 一张表单描述个人情况 |
| 4 逐条判定 | **符合 / 不符合（差在哪条）/ 需人工确认**，每条给出理由 |
| 5 回溯原文 | 每条判定都能点回政策原文的对应条款 |
| 6 出结果 | 材料清单 + 时间轴提醒 |

## 技术栈

| 层 | 选型 |
| --- | --- |
| 前端 | Vue 3 + Vite + TypeScript + Tailwind CSS |
| 后端 | Node.js + Express + TypeScript |
| 数据库 | SQLite（`node:sqlite`，零原生依赖） |
| 大模型 | DeepSeek API（`deepseek-chat` 抽取 + `deepseek-reasoner` 复核） |
| 部署 | Docker / 云平台 |

## 快速开始

> 前置：Node.js ≥ 20.19、pnpm ≥ 9

```bash
# 1. 安装依赖
pnpm install

# 2. 配置环境变量（需要 DeepSeek API Key）
cp .env.example .env
#   编辑 .env，填入 DEEPSEEK_API_KEY=sk-xxxx

# 3. 启动（前端 + 后端同时）
pnpm dev
```

- 前端：http://localhost:5173
- 后端：http://localhost:8787
- 健康检查：http://localhost:8787/api/health

## 环境变量

见 `.env.example`。**真实 `.env` 已被 `.gitignore` 排除，绝不入库。**

| 变量 | 说明 |
| --- | --- |
| `PORT` | 后端端口，默认 8787 |
| `DEEPSEEK_API_KEY` | DeepSeek API Key |
| `DEEPSEEK_BASE_URL` | 默认 `https://api.deepseek.com` |
| `DEEPSEEK_MODEL_CHAT` | 默认 `deepseek-chat` |
| `DEEPSEEK_MODEL_REASONER` | 默认 `deepseek-reasoner` |
| `DATABASE_FILE` | SQLite 文件路径，默认 `./data/app.db` |

## 目录结构

```
.
├── web/                 # 前端（Vue 3 + Vite）
│   └── src/
│       ├── views/       # 页面
│       ├── components/  # 组件
│       ├── stores/      # Pinia 状态
│       └── lib/         # API 封装
├── server/              # 后端（Express + TypeScript）
│   └── src/
│       ├── routes/      # 接口
│       ├── services/    # 业务与 AI 调用
│       └── db.ts        # SQLite
├── docs/
│   └── ai-log/          # AI 协同记录（比赛要求的过程证据）
├── tools/
│   └── git-sync.mjs     # 当前网络环境下的 GitHub 同步工具
└── AGENTS.md            # 项目协作与版本管理约定
```

## 开发约定

见 [AGENTS.md](./AGENTS.md)。要点：

1. **重大更改必须 commit 并同步到 GitHub**，保证随时可回档。
2. **细粒度提交**：每次提交对应一个功能模块或一次 AI 对话，禁止一次性提交全部功能。
3. `main` 分支任何时候都能跑起来；大改走 `feat/xxx` 分支。
4. API Key 只放 `.env`，永不入库。
5. 每次提交后在 `docs/ai-log/` 留一份协同记录。

## 团队分工

| 角色 | 负责 |
| --- | --- |
| 前端 | 页面、交互、可视化 |
| 后端 / AI 集成 | 接口、数据模型、Prompt 与调用链路 |
| UI 与文档 | 视觉规范、技术文档、演示视频 |

## 文档

- 技术文档 PDF（≤30 页）：待产出，源文件在 `C:\Users\30516\Desktop\传智杯\02_技术文档\`
- 演示视频：待产出
