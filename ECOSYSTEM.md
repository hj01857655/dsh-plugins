# dsh 社区插件生态调研（2026-10-16）

> 来源：[0xsline/awesome-deepseek-harness](https://github.com/0xsline/awesome-deepseek-harness) 的
> `CATALOG.md`（自动生成于 2026-08-28：dsh-external/hub 271 仓 + 公开 `dsh-plugin` topic 1000 仓
> + 手动补充 471）+ GitHub topic 实时检索。本文按「解决了什么问题」归类，不按仓库名罗列。

## 生态规模

| 口径 | 数量 |
|---|---|
| 单插件 | 179 |
| 插件集（bundle / workspace / 安装器） | 23 |
| 技能（skills/SKILL.md） | 11 |
| IM 远程渠道 | 7 |
| 基础设施（桌面端 / 发行版 / 管理器） | 35 |
| 公开 topic 仓库（多为占位） | 1469 |

分布特征：数量上 **UI 皮肤、桌宠、摸鱼娱乐类最多**（dsh-qq2006、whale-girl、dsh-minigames、
dsh-auto-chess、dsh-pet、dsh-lazyfish…），但技术密度最高的在三块：**上下文/记忆、会话互通、
运维自救**。

## 一、上下文与记忆（最卷赛道）

| 插件 | 解决什么 |
|---|---|
| `dsh-context-doctor` | 上下文注入审计：指令链/技能目录/工具 schema 的 token 成本量化 + 重复/冲突检测 + 裁剪建议 |
| `dsh-memory` / `dsh-memory-evolve` | 跨会话长期记忆 + 分层（用户/项目/每日）+ 经验沉淀、技能自动创建 |
| `dsh-mnemon` / `dsh-engram-relay` | 外接记忆层（分类推断 / <1B 本地模型 + 100k 超长记忆） |
| `dsh-easy-ctx-manager` | 上下文节省管理 |
| `dsh-checkpoint` + `dsh-rewind` | 标记探索起点 → 把自 checkpoint 起的内容折叠成报告并替换出上下文（保留完整日志） |
| `dsh-slice-agent-loop` | agent loop 的有界 slice 上下文引擎 |

**结论**：已成红海，且在「量化审计」「分层自进化」两个纵深方向都有占位。

## 二、会话考古与跨工具互通（高价值共识）

| 插件 | 解决什么 |
|---|---|
| `dsh-session-hub` | opencode / Claude Code / Antigravity 历史会话显示在侧边栏 |
| `dsh-session-search` | 跨工具会话全文搜索（dsh/codex/claude/pi/opencode） |
| `cross-harness-cite` | 跨 Harness 引用 codex / claude code 的历史对话 |
| `dsh-session-cluster` | 同机跨会话消息通信（ListAgents/SendMessage 的 DSH 版） |
| `session-teleport` | PostgreSQL 单写者会话交接 |
| `Recall`（Rust 独立工具） | 切换 agent 保留记忆，本地优先搜索 AI 编码会话 |

**解决的真问题**：agent 会话散落在各客户端，查不到、引用不了、切工具即失忆。

## 三、会话/环境自救（运维向，社区刚起步）

| 插件 | 解决什么 |
|---|---|
| `dsh-session-health` | 多帧 zstd 会话文件帧级扫描诊断（torn/损坏/空会话） |
| `dsh-session-recovery` / `dsh-session-repair-skill` | 会话丢失/消失事故（GUI 显示 "0 sessions"）：诊断 corrupt session log、修帧结构 |
| `dsh-restart-recover` / `dsh-web-guard` | dsh web 崩溃/重启后自动拉起并继续（agent 跑在 web 进程内，kill 掉就全停） |
| `dsh-web-doctor` | 不依赖 web 进程的 out-of-band 终端一键诊断 |
| `dsh-bash-encoding` | bash 输出编码自动识别（UTF-16LE/UTF-8 乱码） |
| `dsh-pty-windows` | Windows PTY 进程检查器 |

**已知确定性痛点**：多客户端并发写会话日志会损坏 seq（stale-tail 等形态）；web 进程被 kill 则
agent 全停。该方向目前只有 skill 级方案，**没有成熟插件**。

## 四、工具扩充（零依赖纯函数风格）

`dsh-toolkit` 系列：json（JMESPath 子集）/ csv（RFC 4180 状态机）/ regex / schema /
diff / stat / time / calculator / encoding / markdown，统一风格「零依赖 + 只读 + 无动态执行」。
`dsh-tool-search` 做 per-agent 按需工具发现。

**结论**：赛道已饱和；再做须更高阶（schema 自动生成、回归测试生成等）。

## 五、浏览器与 Computer Use

`dsh-browser-panel`（WebUI 内嵌有头浏览器，模型实时操控、用户可见）、`dsh-kimi-browser`/
`dsh-webbridge`（13 个 webbridge_* 工具）、`ego-browser`（13 个 ego_* 语义快照/定位点击/表单/
截图/CDP）、`dsh-computer-use`（macOS Accessibility 观察 + 陈旧状态保护）。

## 六、Agent 编排与工作流

`dsh-subagent-tree` / `yet-another-subagent`（subagent 树/可配置 profiles）、
`dsh-plan-execute`（plan/execute 双模型路由：规划用推理模型、批准后切执行模型）、
`dsh-deep-research`（自适应深度研究编排）、`dsh-sidechain`（/side、/btw 临时 fork 会话）、
`dsh-loop`（/loop 定时循环）、`dsh-inspect`（check→fix→review 对抗闭环）、
`dsh-evolve`（agent 在会话内给自己热挂载/剪掉能力）。

## 七、模型接入与成本

`dsh-llm-fallbacks`（按角色 LLM 重试与备用）、`dsh-agent-budget`（agent-tree token 预算）、
`dsh-live-stats` / `dsh-tps`（实时 token 与 TPS）、`dsh-vision`（view_image 桥接任意 OpenAI
兼容 VLM）。

## 八、UI / 皮肤 / 娱乐（数量最大，技术含量低）

皮肤：dsh-qq2006、dsh-deep-whale（鲸娘皮肤系列）、dsh-deepcel、dsh-skins、dsh-custom-css、
turtle-ui、ui-status-label；桌宠：dsh-pet、dsh-pet-rs（Rust 三端）；
娱乐：dsh-minigames、dsh-auto-chess、dsh-gomoku、dsh-d399、dsh-spur、dsh-lazyfish、
dsh-ads / dsh-anti-ads（整活广告层）、7d7d（小游戏平台）。

## 九、IM 通知渠道

飞书 / 企微 / 微信 / QQ / Telegram remote channel 全套 + dsh-web-ui-notify、dsh-feishu-notify。

## 十、工程化周边

`dsh-git-identity`（固定作者身份）、`dsh-github-integration`（issue/PR 修复战役）、
`official-plugins-port`（Claude Code/Codex 插件移植 23 个）、`oh-my-dsh`（24 个 gap 合集）、
`dsh-mega` / `dsh-plus`（精选安装器）、`dsh-mobileweb-adapter`（手机适配）。

## 十一、对本工作区 8 个插件的定位与空白

| 本仓库插件 | 社区同类 | 判断 |
|---|---|---|
| `dsh-context-memory` | dsh-memory / dsh-memory-evolve / dsh-mnemon | 赛道拥挤，差异化在「pre-step 注入 + 冲突检测」 |
| `dsh-cost-track` | dsh-live-stats / dsh-tps | 直接重叠，需找纵深 |
| `dsh-tool-stats` | dsh-toolkit 全家桶 | 赛道饱和 |
| `dsh-model-arena` | —（无同类） | **空白，保持** |
| `dsh-prompt-vcs` | dsh-prompt-studio | 不同层（版本管理 vs 编辑器），可互补 |
| `dsh-step-trace` | dsh-trace / dsh-activity-plugin | 部分重叠 |
| `dsh-theme-studio` | dsh-skins / dsh-custom-css | 重叠，但我们有 THEME-CONTRACT 令牌规范 |
| `dsh-verdict` | —（无同类） | **空白，保持** |

**值得投入的空白方向**（按价值排序）：

1. **会话考古/跨工具互通**（§二）——共识最强、已有 6+ 实现但仍有空白（如本地 RAG 检索层；
   `Recall` 是 Rust 独立工具，DSH 内插件少）。
2. **会话损坏修复插件化**（§三）——社区只有 skill 级方案，把帧级扫描 + 修复 + 重启做成正常
   插件是确定性需求。
3. `dsh-model-arena` / `dsh-verdict` 的差异化纵深（无同类竞争）。

## 备注

- catalog 数据生成于 2026-08-28，之后新仓库未覆盖；实时 star 排序不可用（topic 被通用 AI
  项目大量误标污染，需按 `name:dsh-` 前缀过滤）。
- 插件安装方式见 `PLUGIN-CONTRACT.md` §9/§11（契约已按 0.2.0-rc.2 修订）：
  `dsh plugin` 语义是**转发 pnpm**，registry / path / tarball / git 四种 spec 都支持。
  web profile 直接 `dsh plugin --profile web add <spec>`；desktop profile 推荐应用内「插件」页，
  但 0.2.0 起 CLI 也能操作——只要 Desktop 曾启动过初始化 profile 且已完整退出（否则
  `requireDesktopProfile()` 拒绝，或由 `withFileLock` 挡住并发写）。
  另注意 0.2.0 新增的**版本兼容闸门**：点名包的 `add` 会在 pnpm 运行前校验 DSH peer，
  不兼容需 `allow-version <pkg@ver> --dsh-version <runtime> --accept-risk` 显式豁免。
