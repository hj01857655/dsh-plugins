# dsh-context-meter

![license](https://img.shields.io/badge/license-MIT-blue.svg) ![node](https://img.shields.io/badge/node-%3E%3D20-brightgreen.svg)

> 仓库地址：<https://github.com/hj01857655/dsh-plugins>

DeepSeek Harness 插件：**会话用量对比**——官方输入框指示器不看的三件事：跨会话对比、累计用量、模型路由。

## 定位（与官方 ContextMeter 的分工）

DSH 的输入框下方**已经有官方占用指示器**（环形占用 + 点击展开 system/tools/messages 组成）。本插件**不重复**那两块，只做它不做的：

| 能力 | 官方指示器 | 本插件 |
|---|---|---|
| 当前会话占用环 + 组成 | ✅ | ❌ 故意不做 |
| **跨会话对比表**（所有会话的窗口/预估/占用，红黄绿分档） | ❌ | ✅ |
| **累计用量四桶**（未缓存输入/输出/缓存读/缓存写） | ❌ | ✅ |
| **模型路由**（provider/model，last-wins 折叠自 request/header） | ❌ | ✅ |
| **`context_meter` 模型工具**（agent 主动查自己的用量） | ❌ | ✅ |

## 它不做什么

- **不算数**。所有数字来自官方 `@deepseek-ai/dsh-token-meter` 注册的会话投影与日志事件，本插件是纯读面。token-meter 未挂载时显示「无数据」而不是自己估。
- **不做压缩决策**。token-meter 不做 loop 决策，本插件同样只展示。

## 安装

```sh
dsh plugin --profile web add dsh-context-meter
# Desktop：应用内「插件」页安装，或完整退出后走 CLI
```

要求 DSH `0.2.1-rc.2+`（token-meter 的投影 wire 视图在该版本稳定）。

## 使用

- 装完后 Settings 里出现「会话用量对比」页，每 3 秒自动刷新
- 会话中让模型调用 `context_meter` 工具即可读当前用量与路由

## 开发

```sh
pnpm install
pnpm --filter dsh-context-meter build
pnpm --filter dsh-context-meter test
```

契约见仓库根 `PLUGIN-CONTRACT.md`。
