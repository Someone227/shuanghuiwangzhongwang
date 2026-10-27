# AGENTS.md — 项目协作与版本管理约定

> 本文件是项目的 AI 协作约定，任何 AI 协作者动手前必须阅读并遵守。
> 本文件也属于比赛要求的「AI 协同过程可复现」证据的一部分。

## 一、版本管理铁律（用户 2026-10-24 明确要求）

1. **每一次影响重大的更改，必须 commit，并推送到 GitHub 做备份。**
2. **绝不能让项目处于「改崩了且无法回档」的状态。**

### 什么叫「影响重大」（需要 commit + push）

- 一个新功能模块完成，且本地跑通
- 依赖 / 架构 / 数据模型变更
- 影响主流程的 bug 修复
- 页面视觉或交互的大改
- 部署配置变更、比赛材料定稿

### 什么不算（可攒着一起提交）

- 文案微调、单一样式微调
- 临时实验代码（放 `experiment/` 或 feature 分支，验证完再决定去留）

## 二、比赛硬要求：提交历史必须细粒度

- **禁止攒到最后一次性 push**（官方红线：会被判定开发过程不可信）
- 一个功能模块 = 一次或多次提交
- commit message 写清：**做了什么、为什么**

### 提交信息格式

```
<type>: <一句话说明>

<可选：为什么这么做 / 影响范围>
```

type：`feat` 新功能 / `fix` 修复 / `docs` 文档 / `style` 样式 / `refactor` 重构 / `chore` 构建依赖配置 / `test` 测试

## 三、回档保障 SOP

1. **main 分支永远保持可运行**：提交前本地必须跑通（前端能 build、后端能启动、主流程能点通）
2. **里程碑打 tag**：如 `v0.1.0-scaffold`、`v0.2.0-policy-parse`，tag 是回档锚点
3. **大改先开分支**：`feat/xxx`，验证成功再合回 main；失败直接删分支，main 不受影响
4. **改崩了怎么回档**：
   - 回退到某个 tag：`git reset --hard <tag>`
   - 只撤销某次提交：`git revert <commit>`
   - 找回被删的文件：`git checkout <commit> -- <path>`

## 四、网络环境与同步方式（本机，2026-10-27 实测订正）

- **常规同步直接用 `git push`**：2026-10-27 实测 `git push origin main` 成功（`6b13d6c..f65713a`），推完 `git ls-remote` 与本地一致。此前阶段性出现的 `github.com` TLS 握手失败是代理节点故障，不是长期状态
- 推之前先确认网络：`git ls-remote origin main`（约 3 秒返回即通）；若超时，先检查 Clash Verge 的节点与规则，而不是改仓库协议
- 代理失效期间曾改用 GitHub Contents / Git Data API（`tools/git-sync.mjs`）绕过 `github.com`，脚本保留可用作备用方案，但**不再是首选**：它要求工作区干净、本地领先远端、且会在本地重建同 SHA 提交对象
- token 由 `git credential fill` 从 Windows 凭据管理器自动读取，不写入仓库
- 已知陷阱：`ghproxy` 等镜像只支持读（`git ls-remote` 可用）不支持 push，且会弹出 Git Credential Manager 索要第三方站点凭证，**不要填写**

## 五、AI 协同证据

- 每次与 AI 的关键对话、决策、Prompt 迭代，记录到 `docs/ai-log/`
- 比赛要求：技术文档和演示视频要能引用这些记录
