# dsh-git-ops

![dsh](https://img.shields.io/badge/dsh-0.2.1--rc.2-blueviolet.svg) ![license](https://img.shields.io/badge/license-MIT-blue.svg)

Structured git tools for the dsh agent: `git_status` / `git_diff` / `git_log` / `git_commit`.

## 为什么需要它

dsh 官方 90+ 工具里**没有任何 git 集成**——模型操作 git 只能裸敲 bash/pwsh，丢失结构化输出、审批粒度与状态面板。更糟的是 `docs/DSH-SESSION-AUDIT-FINDINGS.md` 记录的 D-3：dsh 的 run_code 沙箱按设计剥离 `HOME`/`USERPROFILE`，模型在会话里跑 `git commit` 直接 fatal（真实翻车案例 t8/s14、t27/s2）。

本插件在**宿主进程**里直接调 git，不经过沙箱，D-3 不适用；参数走 argv 数组，无 shell 注入面；双输出流各限 512 KiB，`git log` 狂奔也吃不掉模型上下文。

## 工具

| 工具 | 读/写 | 做什么 |
|---|---|---|
| `git_status` | 读 | 分支 + 每文件暂存/工作区状态（porcelain v1 结构化解析） |
| `git_diff` | 读 | 未暂存/已暂存 patch，`-U` 可调，64 KiB 截断保护 |
| `git_log` | 读 | 最近 N 条提交（hash/作者/日期/主题），1-50 |
| `git_commit` | 写 | 暂存指定路径 + 提交；无暂存内容时拒绝并说明原因；缺身份时原样转达 git 的提示 |

只读工具 `isConcurrencySafe: true`，`git_commit` 串行。

## 安装

本机环境是 Desktop（Electron，19387 端口）。推荐应用内「插件」页添加（无需退出应用）；
CLI 装载需要**先完整退出 Desktop**：

```sh
dsh plugin --profile desktop add dsh-git
# 本地 path 安装（开发时）:
dsh plugin --profile desktop add E:\VSCodeSpace\Agent\DeepSeek\dsh-plugins\packages\dsh-git
# 装载核验:
dsh --profile desktop --dump-config | Select-String "dsh-git"
```

## 设计决定

- **`inject = []`**：不声明任何必需服务。工具经 `ctx.inject(['tools'])` 挂载——没有工具注册表的宿主（CLI、headless）只是没有 git 工具，插件本体照常运行。工作目录经 `ctx.get('workingDirectory')` 机会式读取，缺失时退回会话头 `cwd`。理由见 `PLUGIN-CONTRACT.md` §4.1。
- **不做浏览器半边**：v1 是纯工具插件（对照官方 `tool-session-query` 的形态），无面板、无 client 产物，CLI 与 Desktop 通用。
- **提交身份**：直接依赖宿主环境的 git 配置（宿主进程不受沙箱环境剥离影响）。缺身份时把 git 自己的报错原样转给模型，附可操作的修复路径。

## 面板

Desktop/Web 的 Settings 里有「Git」页（浏览器半边，`settings.section` 槽位）：显示最近会话所在仓库的分支、改动文件、最近 5 条提交，数据每次请求现算，中英文跟随界面语言。

## 测试

```sh
pnpm test    # 9 项：真实 ToolRuntime + 真实临时 git 仓库 + 面板路由，全程走 ctx.tools.execute
```
