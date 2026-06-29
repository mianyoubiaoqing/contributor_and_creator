# 冒险者协会告示板 MVP

面向 Game Jam 团队的任务分配、贡献比例结算与奖金决议工具。第一阶段先跑通 10 人团队的核心流程：

- 项目创建、引擎版本、环境依赖、Markdown 协作文档。
- 任务发布、告示板拖拽、任务表格、难度与验收因子。
- 成员互评问卷。
- 申诉与复核队列。
- 贡献比例预结算、冻结。
- 奖金分配决议后置记录，支持未获奖或等待奖金结果。

## 技术栈

- Next.js App Router
- TypeScript
- Tailwind CSS
- TanStack Table
- dnd-kit
- Apache ECharts
- localStorage 持久化演示数据

后续云端化建议接 Supabase/Postgres，见 `docs/supabase-schema.sql`。

## 本地运行

```bash
npm install
npm run dev
```

默认地址：

```text
http://localhost:3000
```

## 验证

```bash
npm run verify
```

## 第一阶段边界

当前版本不直接分钱，只生成贡献比例快照。奖金是否存在、奖金金额和扣除项在结算后通过“奖金分配决议”记录。

AI 难度评估、GitHub App、远端数据库、登录权限和真实通知属于第二阶段。

## Linux 部署

支持 Ubuntu/Debian 等常见 Linux 服务器。

Docker 一键启动：

```bash
docker compose up -d --build
```

Ubuntu 裸机一键安装并注册 systemd 服务：

```bash
bash scripts/ubuntu-install.sh
```

详细说明见 `docs/deployment.md`。

## 云端同步模式

默认是本地模式。要让多人共享同一个项目状态：

1. 在 Supabase SQL Editor 执行 `docs/supabase-mvp-sync.sql`。
2. 复制 `.env.example` 为 `.env.local`。
3. 设置：

```text
NEXT_PUBLIC_APP_MODE=cloud
NEXT_PUBLIC_GUILD_BOARD_PROJECT_KEY=your-project-key
NEXT_PUBLIC_GUILD_BOARD_SYNC_TOKEN=your-team-sync-token
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
GUILD_BOARD_SYNC_TOKEN=your-team-sync-token
```

当前云端同步是第二阶段的过渡层，使用 `mvp_project_states` 保存完整项目 JSON。正式成员账号、RLS 权限和关系表拆分会在下一轮继续推进。

## 账号权限

已支持 Supabase Auth 的邮箱密码注册/登录。账号登录后，应用会优先用用户 session 访问 `/api/state`。

要启用成员级权限与邀请码：

1. 在 Supabase Auth 里允许 Email 登录。
2. 执行 `docs/supabase-auth-members.sql`。
3. 进入应用的 **成员** 页签。
4. 生成邀请码或邀请链接。
5. 成员打开链接，注册/登录后加入项目。

如果你想手动插入主策账号，可以到 Supabase `Authentication -> Users` 复制 user id，然后执行：

```sql
insert into mvp_project_members (project_key, user_id, display_name, access_level)
values (
  'ciga-jam-2026',
  'USER_UUID_HERE',
  'Member Name',
  'member'
);
```

共享同步令牌仍保留为临时备用通道。

详细流程见 `docs/invite-flow.md`。

## GitHub 仓库监听

已支持 GitHub Webhook 自动收集任务证据。

启用步骤：

1. 在 Supabase SQL Editor 执行 `docs/github-webhook.sql`。
2. 在 `.env.local` 设置 `GITHUB_WEBHOOK_SECRET`。
3. 打开应用的 **GitHub** 页签，复制 Webhook URL。
4. 到 GitHub 仓库 `Settings -> Webhooks` 新增 webhook。
5. 在 PR 标题、PR 描述或 commit message 中写入任务标记，例如 `[TASK-t2]`。

详细说明见 `docs/github-webhook.md`。
