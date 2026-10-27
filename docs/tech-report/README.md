# 技术设计文档（源码与构建脚本）

本目录是《能申吗 · 技术设计文档 v1.0》的**可复现源码**。参赛提交的 PDF 由这里的 HTML 片段构建而成，
文档内所有数字（政策数、条件数、调用次数、token 用量、缺陷编号、提交记录）都来自仓库真实文件与 git 历史，
不存在人工估算或占位数据。

## 文件说明

| 文件 | 说明 |
| --- | --- |
| `part1.html` ~ `part6.html` | 文档正文六部分（封面/目录、架构、流程、AI 链路、数据与风险、页面与质量、里程碑、缺陷、边界、附录） |
| `styles.css` | 打印样式：A4 页面、章节分页、表格与图注、页脚留白 |
| `build.mjs` | 构建脚本：注入 4 张内联 SVG 图（图 2-1 架构、图 3-1 建库流水线、图 3-2 判定流程、图 4-1 AI 调用边界），拼装为 `report.html` |
| `make-pdf.mjs` | 调用本机 Edge（CDP `Page.printToPDF`）输出 A4 PDF，页脚含「第 x / 30 页」 |
| `measure-pages.mjs` | 逐章单独打印，量出每章页数，用于回填目录页码 |

## 构建方法

```bash
node docs/tech-report/build.mjs        # 生成 report.html
node docs/tech-report/make-pdf.mjs     # 生成 PDF 到桌面
```

构建依赖本机 Microsoft Edge（CDP 远程调试端口），无需安装额外 npm 包。

## 提交版本

- 文档版本：v1.0（2026-10-27）
- 对应代码提交：`6b13d6c`（main 分支）
- PDF：`docs/能申吗-技术文档-v1.0.pdf`，A4 / 30 页（比赛要求 ≤30 页）
