# AI 协同记录（可审计的过程证据）

本目录记录作品中「由 AI 参与生成」的全部环节，供评审核查 AI 使用的真实性与可复现性。

## policies/ —— 政策库生成记录

网站的判定引擎运行期**不调用任何大模型**（零 token、可离线）。AI 只在一个环节被使用：把政策原文抽取成结构化条件树。

- 生成脚本：`server/scripts/extract-policies.mjs`
- 输入：`data/policies/raw/*.txt`（政策原文，附 `_sources.json` 来源链接）
- 输出：`data/policies/*.json`（网站运行期读取的条件树）
- 本目录 `policies/<id>.json` 保存每次调用的完整请求体、原始响应体、token 用量与模型名

复现方式：

```bash
cd server
node scripts/extract-policies.mjs --dry-run   # 检查原文与 key
node scripts/extract-policies.mjs             # 重新生成全部政策库
```

需要注意：大模型输出存在不确定性，重新生成的结果与仓库中已提交的 JSON 可能不完全一致。仓库中以已提交的 JSON 为准，本目录的记录用于证明「这些数据确实由 AI 生成」以及使用了什么提示词。
