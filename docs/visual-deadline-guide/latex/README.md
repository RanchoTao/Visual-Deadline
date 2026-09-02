# LaTeX 编译说明

推荐使用完整 TeX Live 或 MiKTeX，并确保包含 `ctex`、`fontspec`、`longtable`、`tabularx`、`tcolorbox`、`hyperref` 和 `graphicx`。

```bash
cd docs/visual-deadline-guide/latex
latexmk -xelatex -interaction=nonstopmode -halt-on-error visual_deadline_guide.tex
```

如果没有 `latexmk`：

```bash
xelatex -interaction=nonstopmode -halt-on-error visual_deadline_guide.tex
xelatex -interaction=nonstopmode -halt-on-error visual_deadline_guide.tex
```

文档通过 `\VDscreenshot` 命令处理截图：图片存在时自动插入，缺失时显示占位框，因此没有截图也可以编译。请勿使用 pdfLaTeX 编译中文主文档。

Codex Cloud 环境可能没有 TeX 发行版。此时保留 `.tex` 源码，在 Overleaf、本地 TeX Live 或 CI 中编译即可；无需把二进制 PDF 提交到功能分支。

