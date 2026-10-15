# dsh-plugins

DeepSeek Harness 插件集合（monorepo）。

从 8 个独立仓库合并而来，**完整保留 173 个 commit 的历史**（用 `git filter-repo` 重写路径 + `git merge --allow-unrelated-histories`）。

## 结构

```
dsh-plugins/
├── package.json              # private 根，pnpm workspace
├── pnpm-workspace.yaml       # packages/*
├── PLUGIN-CONTRACT.md        # 插件开发契约（跨插件共享）
├── THEME-CONTRACT.md         # 主题与令牌契约
└── packages/
    ├── dsh-context-memory/   # 每个仍是独立 npm 包
    ├── dsh-cost-track/
    ├── dsh-model-arena/
    ├── dsh-prompt-vcs/
    ├── dsh-step-trace/
    ├── dsh-theme-studio/
    ├── dsh-tool-stats/
    └── dsh-verdict/
```

## 插件

| 插件 | npm 版本 | 用途 |
|---|---|---|
| dsh-context-memory | `0.6.1` | pre-step 捕获显式记忆语句，注入 top-5 相关记忆 + 未决冲突 |
| dsh-verdict | `0.5.1` | 评审/校验流水线（guard、pipeline、promote、schedule、skills） |
| dsh-theme-studio | `0.6.3` | 主题工作室（tokens、apply、io、themes） |
| dsh-cost-track | `0.5.1` | 成本追踪 + 计价 |
| dsh-model-arena | `0.5.1` | 模型竞技场（arena、diff、scoring） |
| dsh-prompt-vcs | `0.5.1` | 提示词版本控制 |
| dsh-step-trace | `0.5.1` | 单步追踪回放 |
| dsh-tool-stats | `0.5.1` | 工具调用统计 |

## 常用命令

```powershell
# 安装全部依赖（共享一份 node_modules）
pnpm install

# 构建 / 测试 / 类型检查（全部包）
pnpm build
pnpm test
pnpm typecheck

# 只操作某个包
pnpm --filter dsh-verdict build
pnpm --filter dsh-verdict test

# 发某一个包
cd packages\dsh-verdict
npm publish

# 一次性发所有包（版本已各自 bump 后）
pnpm -r publish
```

## 收益

| | 合并前 | 合并后 |
|---|---|---|
| `node_modules` | 375.3 MB（8 份重复） | 52.9 MB（1 份共享） |
| 依赖安装 | `cd` 8 次 `npm install` | 根目录一次 `pnpm install` |
| CI | 8 份相同 `ci.yml` | 1 份 |
| 发全部 | 重复 8 次 | `pnpm -r publish` |

各包的 `name` / `version` / `files` / `dsh` 字段与 `peerDependencies` **完全未变**，npm 用户装到的内容一致。

## 修订契约时

契约条款必须来自对**运行时**的实际核验。当前基准 `0.2.0-rc.2`：

```powershell
$g = "$env:APPDATA\npm\node_modules\@deepseek-ai\dsh\node_modules\@deepseek-ai"
$d = "C:\Users\12925\AppData\Local\Programs\DeepSeek Harness\resources\app.asar\dsh\node_modules\@deepseek-ai"
$g\dsh-plugin-manager\README.zh.md   # 第 9 章的一手来源
```

## 已知测试失败（合并前既有，非合并导致）

- `dsh-context-memory`：3 个失败
- `dsh-verdict`：9 个失败

均已在备份的原仓库上复现同一组失败，见 `git log` 中 `packages/` 下的历史。
