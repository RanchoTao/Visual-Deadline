# Visual Deadline 产品功能文档

本目录保存 Visual Deadline 的中文产品介绍、功能详解、功能状态审计、截图计划和 LaTeX 源码。

## 当前交付状态

- 已完成基于 `main` 代码的功能审计；
- 已完成中文 LaTeX 主文档；
- 已预留 24 个真实浏览器截图位置；
- 尚未提交二进制 PDF；
- 截图和 PDF 应作为发布产物生成，不作为本次 Git 文本提交的前置条件。

## 文件

- `FEATURE_AUDIT.md`：逐项功能状态与限制；
- `SCREENSHOT_INDEX.md`：24 个截图位置和固定文件名；
- `assets/screenshots/`：真实截图目录；
- `latex/visual_deadline_guide.tex`：可独立编译的中文主文档；
- `latex/README.md`：编译说明。

## 文档事实边界

文档按照以下顺序确定事实：实际代码与可运行行为、功能审计、仓库 README 与专项文档、界面文案。它明确区分已实现、部分实现、演示数据、规划中和无法核验，尤其不会把健康接入、微信通讯录读取或未来 AI 能力写成正式上线功能。

## 后续更新流程

1. 在本地或线上运行当前版本；
2. 使用匿名且一致的演示数据；
3. 按 `SCREENSHOT_INDEX.md` 采集 PNG；
4. 将图片写入 `assets/screenshots/`，保持文件名不变；
5. 使用 XeLaTeX 编译两次；
6. 渲染抽查封面、目录、功能表和所有截图页；
7. 将 PDF 作为 Release、Actions artifact 或网站下载文件发布，避免 Codex Cloud 的二进制差异限制。

## 建议版本目标

- v0.1：代码审计、完整文字和截图占位；
- v0.2：补齐 24 张真实截图；
- v1.0：邮箱验证、支付与权限闭环验证后作为公开用户手册发布。

