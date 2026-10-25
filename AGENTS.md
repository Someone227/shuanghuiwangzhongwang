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

## 四、网络环境与同步方式（本机，2026-10-25 实测订正）

- `github.com` 直连**不可用**：TLS 握手被重置（`schannel: failed to receive handshake`），`git push` / `git fetch` 均失败
- 本机 Clash Verge 代理（`127.0.0.1:7897`）的订阅节点（ermao.net / v2nodes 免费节点）访问海外同样失败：CONNECT 隧道能建立，但对端 TLS 无响应
- `api.github.com` 直连**可用**（HTTP 200，约 0.5s）——这是当前唯一可靠通道
- 因此同步到 GitHub **不使用** `git push`，改用：

  ```bash
  node tools/git-sync.mjs
  ```

  该脚本通过 GitHub Git Data API 上传文件、创建 commit、更新 `main` ref，并在本地重建**同 SHA** 的 commit 对象，效果与 `git push` 等价（提交历史、内容、message 完全一致）。前置条件：在 `main` 分支、工作区干净、本地领先远端 1 个 commit。
- token 由 `git credential fill` 从 Windows 凭据管理器自动读取，不写入仓库
- 禁用方案：ghproxy 等镜像仅支持读（`git ls-remote` 可用），不支持 push；且会触发 Git Credential Manager 弹窗索要第三方站点凭证，**不要填写**

## 五、AI 协同证据

- 每次与 AI 的关键对话、决策、Prompt 迭代，记录到 `docs/ai-log/`
- 比赛要求：技术文档和演示视频要能引用这些记录
