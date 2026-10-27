# dsh-context-meter

![license](https://img.shields.io/badge/license-MIT-blue.svg) ![node](https://img.shields.io/badge/node-%3E%3D20-brightgreen.svg)

> 仓库地址：<https://github.com/hj01857655/dsh-plugins>

DeepSeek Harness 插件：**上下文占用面板**——当前会话的窗口大小、下一请求预估 token、占用百分比、组成与累计用量，一屏看完。

## 它做什么

- **Settings 面板**：占用条 + 三档颜色（<60% 充裕 / 60–85% 偏高 / ≥85% 接近压缩），2 秒自动刷新
- **组成分解**：system prompt / 工具 schema / 消息正文各占多少 token（近似值，来自官方投影）
- **累计用量**：未缓存输入 / 输出 / 缓存读 / 缓存写四个桶
- **`context_meter` 工具**：模型自己也能在长会话中主动查占用，判断是否接近压缩阈值

## 它不做什么

- **不算数**。所有数字来自官方 `@deepseek-ai/dsh-token-meter` 注册的会话投影（`contextPressure` / `contextBreakdown` / `tokenUsage`），本插件是纯读面。token-meter 未挂载时显示「暂无数据」而不是自己估。
- **不做压缩决策**。README 明说 token-meter 不做 loop 决策，本插件同样只展示。

## 安装

```sh
dsh plugin --profile web add dsh-context-meter
# Desktop：应用内「插件」页安装，或完整退出后走 CLI
```

要求 DSH `0.2.1-rc.2+`（token-meter 的投影 key 在 `0.2.1-rc.2` 才有稳定 wire 视图）。

## 使用

- 装完后 Settings 里出现「上下文占用」页
- 会话中让模型调用 `context_meter` 工具即可读当前占用

## 开发

```sh
pnpm install
pnpm --filter dsh-context-meter build
pnpm --filter dsh-context-meter test
```

契约见仓库根 `PLUGIN-CONTRACT.md`。
