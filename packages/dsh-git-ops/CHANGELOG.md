# Changelog

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
