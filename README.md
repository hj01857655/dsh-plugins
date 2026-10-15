# dsh-plugins 契约文档

本仓库只放**跨插件共享的契约文档**，不含任何插件源码——8 个插件各自是独立 git 仓库，位于本目录下的 `dsh-*` 子目录。

| 文档 | 内容 |
|---|---|
| [PLUGIN-CONTRACT.md](PLUGIN-CONTRACT.md) | 插件骨架、`package.json` 必填字段、两套 `inject`、浏览器半边打包、本地化、宿主路由、Desktop/Web 差异、版本兼容闸门、构建测试约定、真机验证清单、命名发布规范、agent 生命周期钩子 |
| [THEME-CONTRACT.md](THEME-CONTRACT.md) | 主题与样式：令牌分层（`--dsw-static-*` / `--dsw-alias-*` / `--dsw-specific-*` / `--dsh-*`）、`ctx.theme` API、为何必须写在 `body` 而非 `documentElement`、自创令牌名为何静默失效、圆角与动效为何没有令牌 |

## 本目录的 8 个插件

| 插件 | npm | 用途 |
|---|---|---|
| dsh-context-memory | `0.6.1` | pre-step 捕获显式记忆语句，注入 top-5 相关记忆 + 未决冲突 |
| dsh-verdict | `0.5.1` | 评审/校验流水线（guard、pipeline、promote、schedule、skills） |
| dsh-theme-studio | `0.6.3` | 主题工作室（tokens、apply、io、themes） |
| dsh-cost-track | `0.5.1` | 成本追踪 + 计价 |
| dsh-model-arena | `0.5.1` | 模型竞技场（arena、diff、scoring） |
| dsh-prompt-vcs | `0.5.1` | 提示词版本控制 |
| dsh-step-trace | `0.5.1` | 单步追踪回放 |
| dsh-tool-stats | `0.5.1` | 工具调用统计 |

全部已在 npm 发布，`lib/` 预构建随包分发。

## 修订契约时

契约条款必须来自对**运行时**的实际核验，不是推测。当前基准版本 `0.2.0-rc.2`（CLI 与 Desktop 均已对齐）。一手来源：

```powershell
# CLI 运行时
$g = "$env:APPDATA\npm\node_modules\@deepseek-ai\dsh\node_modules\@deepseek-ai"
# Desktop 运行时
$d = "C:\Users\12925\AppData\Local\Programs\DeepSeek Harness\resources\app.asar\dsh\node_modules\@deepseek-ai"
# 插件管理器官网中文 README（第 9 章的一手来源）
$g\dsh-plugin-manager\README.zh.md
```
