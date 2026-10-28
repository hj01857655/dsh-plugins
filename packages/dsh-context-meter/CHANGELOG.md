# Changelog

## 0.2.0

- **重定位**：官方输入框已内置占用指示器（环形 + 组成面板），本插件砍掉重复的占用环与 breakdown 展示，收窄为三个官方没有的能力——跨会话对比表、累计用量四桶、模型路由（last-wins 折叠自 `request/header`）。
- `context_meter` 工具补上模型路由与累计用量，去掉了与官方面板重复的组成分解。
- 会话行带标题（读 `title` 投影，session-title 挂载时显示，否则「（未命名）」）。

## 0.1.0

- 初版：Settings 占用面板（pressure / breakdown / usage 投影读面）、`context_meter` 工具、CLI smoke 入口。
- 全部数字来自 `@deepseek-ai/dsh-token-meter` 的会话投影，本插件不做任何估算。
