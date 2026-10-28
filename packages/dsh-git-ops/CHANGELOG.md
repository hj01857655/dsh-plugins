# Changelog

## 0.1.0 (2026-10-28)

- 首个版本：`git_status` / `git_diff` / `git_log` / `git_commit` 四个工具
- 宿主进程直跑，绕开 run_code 沙箱的 HOME 剥离（docs 审计 D-3）
- 参数 argv 数组传递，无 shell 注入面；输出流 512 KiB 上限，patch 64 KiB 截断
- 纯宿主半边：`inject = []`，工具经 `ctx.inject(['tools'])` 降级挂载
- 测试 7 项全绿（真实 ToolRuntime + 真实临时仓库）
