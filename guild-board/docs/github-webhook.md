# GitHub 仓库监听

系统支持通过 GitHub Webhook 自动收集任务证据。

## 一次性数据库准备

在 Supabase SQL Editor 执行：

```text
docs/github-webhook.sql
```

## 环境变量

在 `.env.local` 或服务器环境变量里设置：

```text
GITHUB_WEBHOOK_SECRET=一段足够长的随机密钥
```

## GitHub 仓库设置

进入 GitHub 仓库：

```text
Settings -> Webhooks -> Add webhook
```

填写：

```text
Payload URL: 应用 GitHub 页签显示的 Webhook URL
Content type: application/json
Secret: GITHUB_WEBHOOK_SECRET 的值
```

建议选择事件：

```text
push
pull_request
pull_request_review
check_run
check_suite
```

## 任务绑定规则

在 PR 标题、PR 描述或 commit message 里写入：

```text
[TASK-t2]
```

也支持：

```text
TASK-t2
任务-t2
```

系统会把匹配到的 GitHub 事件写入对应任务的证据列表，并提高任务的证据系数。

## 当前边界

- Webhook 必须使用云端同步模式。
- 系统会保存原始 GitHub payload 到 `github_events`。
- 当前自动绑定依赖任务 ID 文本标记。
- 自动证据会影响 `evidenceStrength`，但不会直接决定最终贡献。

