# dsh-plugins

![license](https://img.shields.io/badge/license-MIT-blue.svg) ![node](https://img.shields.io/badge/node-%3E%3D18-brightgreen.svg) ![pnpm](https://img.shields.io/badge/pnpm-11.28.6-orange.svg) ![dsh](https://img.shields.io/badge/dsh-0.2.0--rc.2-blueviolet.svg)

> 仓库地址：<https://github.com/hj01857655/dsh-plugins>

DeepSeek Harness 插件仓库，当前收录 2 个插件：`dsh-context-memory`（跨会话记忆）与
`dsh-theme-studio`（主题工作室）。

早期这里是 9 个插件的 monorepo，2026-10-20 起收缩：其余 7 个包
（dsh-cost-track / dsh-model-arena / dsh-prompt-vcs / dsh-spill-hygiene /
dsh-step-trace / dsh-tool-stats / dsh-verdict）已从工作区与 git 历史中一并移除。
它们仍发布在 npm 上，安装方式不变。

## 结构

```
dsh-plugins/
├── package.json              # private 根，pnpm workspace
├── pnpm-workspace.yaml       # packages/*
├── PLUGIN-CONTRACT.md        # 插件开发契约
├── THEME-CONTRACT.md         # 主题与令牌契约
└── packages/
    ├── dsh-context-memory/   # 每个仍是独立 npm 包
    └── dsh-theme-studio/
```

## 插件

| 插件 | npm 版本 | 用途 |
|---|---|---|
| dsh-context-memory | `0.9.0` | pre-step 捕获显式记忆语句，注入 top-5 相关记忆 + 被推翻的记忆单列 + 未决冲突 |
| dsh-theme-studio | `0.9.0` | 主题工作室（tokens、apply、io、themes） |

> `dsh-context-memory` 的 peer 已对齐运行时 `0.2.1-rc.2`（`^0.2.1-rc.2` / cordis `~4.0.5`）。
> `dsh-theme-studio` 只 peer `cordis`，而兼容闸门只检查 `@deepseek-ai/dsh-*` 这类包名，
> 所以它不受影响；改契约前先看 `PLUGIN-CONTRACT.md` 4.1 与 9.4。

> 官方已有哪些「记忆」相关能力、本插件补的是哪一块，见
> `../docs/DSH-MEMORY-CAPABILITY-MAP.md`。结论：dsh 有的是**会话**
> （持久化、检索、引用、回放），没有**记忆**（提炼后的断言、自动生效、可复验）。

## 常用命令

```powershell
# 安装依赖
pnpm install

# 构建 / 测试 / 类型检查
pnpm build
pnpm test
pnpm typecheck

# 只操作某个包
pnpm --filter dsh-context-memory build
pnpm --filter dsh-theme-studio test

# 发某一个包
cd packages\dsh-context-memory
npm publish
```

## 修订契约时

契约条款必须来自对**运行时**的实际核验。当前基准 `0.2.0-rc.2`：

```powershell
$g = "$env:APPDATA\npm\node_modules\@deepseek-ai\dsh\node_modules\@deepseek-ai"
$d = "C:\Users\12925\AppData\Local\Programs\DeepSeek Harness\resources\app.asar\dsh\node_modules\@deepseek-ai"
$g\dsh-plugin-manager\README.zh.md   # 第 9 章的一手来源
```
