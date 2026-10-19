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
| dsh-context-memory | `0.7.1` | pre-step 捕获显式记忆语句，注入 top-5 相关记忆 + 未决冲突 |
| dsh-theme-studio | `0.9.0` | 主题工作室（tokens、apply、io、themes） |

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

## 已知测试失败

- `dsh-context-memory`：Windows 上 1 个失败（`memory.test.mjs` 的「a guard that
  cannot run is reported as broken」）。`runGuard` spawn 不存在的二进制时，
  Windows 报 `ENOENT` 的路径与 POSIX 的 ESRCH 不同，outcome 落不到 `broken`。
  60 个测试 59 过。与 monorepo 结构无关，在收缩前的独立仓库上同样失败。
