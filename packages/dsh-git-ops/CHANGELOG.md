# Changelog

## 2.1.1 (2026-10-28)

- 面板错误页显示实际查看的目录：此前无工具调用记录时面板退到宿主安装
  目录，显示「当前目录不是 git 仓库」却不说是哪个目录，读起来像在拒绝
  用户的项目
- 错误页新增一行说明：面板跟随会话里最近一次 git 工具调用的目录

## 2.1.0 (2026-10-28)

- 工作区根目录降级：会话 cwd 不是 git 仓库时不再是一句拒绝——
  其下唯一的嵌套仓库直接采用；多个候选列出清单引导模型用 `path` 选择；
  零候选保持原拒绝。Settings 面板同样列出候选仓库
- 新增 `prepare` 脚本：pnpm 从 git 仓库安装只执行 `prepare`，
  仓库内无 `lib/` 产物，没有它 GitHub 来源会装出坏包
- 测试 18 项全绿（新增 tests/workspace-root.test.mjs 三项）

## 2.0.0 (2026-10-28)

- 新增工具：`git_branch`（list/create/switch/delete，delete 走安全 -d）、
  `git_stash`（list/push/pop）、`git_show`（单提交 stat+patch）、
  `git_push`（**配置门禁**：默认不注册，`plugin-data/dsh-git-ops/config.json`
  里 `allowPush: true` 才出现——宿主进程可达网络与凭据，绕过沙箱审批层，
  这道门必须在插件侧补上）
- `git_commit` 支持配置身份（`identity.name/email`，以 `-c` 传参，优先于全局配置）
- 面板新增分支徽章区；payload 增加 branches
- 测试 15 项全绿

## 0.1.0 (2026-10-28)

- 首个版本：`git_status` / `git_diff` / `git_log` / `git_commit` 四个工具
- 宿主进程直跑，绕开 run_code 沙箱的 HOME 剥离（docs 审计 D-3）
- 参数 argv 数组传递，无 shell 注入面；输出流 512 KiB 上限，patch 64 KiB 截断
- 纯宿主半边：`inject = []`，工具经 `ctx.inject(['tools'])` 降级挂载
- 测试 7 项全绿（真实 ToolRuntime + 真实临时仓库）
