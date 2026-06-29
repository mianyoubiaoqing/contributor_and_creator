# Linux 部署说明

本项目支持部署在 Ubuntu、Debian 和常见 Linux 服务器上。推荐优先使用 Docker；如果服务器不使用容器，可以使用 systemd 裸机部署脚本。

## 方式一：Docker Compose

服务器已安装 Docker 和 Docker Compose Plugin 时：

```bash
cd guild-board
docker compose up -d --build
```

默认监听：

```text
http://SERVER_IP:3000
```

修改端口：

```bash
GUILD_BOARD_PORT=8080 docker compose up -d --build
```

查看日志：

```bash
docker compose logs -f guild-board
```

停止：

```bash
docker compose down
```

## 方式二：Ubuntu 裸机一键安装

适用于 Ubuntu/Debian 系统。脚本会安装 Node.js、安装依赖、构建应用，并创建 systemd 服务。

```bash
cd guild-board
bash scripts/ubuntu-install.sh
```

自定义端口：

```bash
PORT=8080 bash scripts/ubuntu-install.sh
```

自定义服务名：

```bash
APP_NAME=guild-board PORT=8080 bash scripts/ubuntu-install.sh
```

查看状态：

```bash
sudo systemctl status guild-board
```

查看日志：

```bash
journalctl -u guild-board -f
```

更新部署：

```bash
bash scripts/ubuntu-update.sh
```

## 方式三：普通本地生产启动

```bash
cd guild-board
bash scripts/start-local.sh
```

自定义端口：

```bash
PORT=8080 bash scripts/start-local.sh
```

## 当前数据持久化边界

默认模式使用浏览器 `localStorage` 保存演示数据。多人团队正式使用时，应接入 Supabase/Postgres，否则不同成员浏览器里的数据不会同步。

## Supabase 过渡云同步

当前版本已经支持一个过渡云同步模式：通过 `mvp_project_states` 表把完整项目状态保存为 JSON。先在 Supabase SQL Editor 执行：

```sql
-- docs/supabase-mvp-sync.sql
create table if not exists mvp_project_states (
  project_key text primary key,
  state jsonb not null,
  updated_at timestamptz not null default now()
);

alter table mvp_project_states enable row level security;
```

然后复制 `.env.example` 为 `.env.local`，填写：

```text
NEXT_PUBLIC_APP_MODE=cloud
NEXT_PUBLIC_GUILD_BOARD_PROJECT_KEY=your-jam-project-key
NEXT_PUBLIC_GUILD_BOARD_SYNC_TOKEN=change-this-shared-token
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
GUILD_BOARD_SYNC_TOKEN=change-this-shared-token
GITHUB_WEBHOOK_SECRET=change-this-github-webhook-secret
```

`SUPABASE_SERVICE_ROLE_KEY` 只在服务端 `/api/state` 使用，不会发送到浏览器。`NEXT_PUBLIC_GUILD_BOARD_SYNC_TOKEN` 是临时团队同步令牌，不等同于正式登录权限；正式版本仍应接 Supabase Auth 和成员级 RLS。

## Supabase Auth 成员权限

当前版本已经支持邮箱密码注册/登录。登录用户访问 `/api/state` 时会携带 Supabase session token；服务端会检查 `mvp_project_members` 表，确认该用户属于当前 `project_key`。

启用步骤：

1. 在 Supabase Dashboard 进入 `Authentication -> Providers`，确认 Email provider 已启用。
2. 执行 `docs/supabase-auth-members.sql`。
3. 主策进入应用的 **成员** 页签，生成邀请码。
4. 成员打开邀请链接，注册/登录并加入项目。

如果需要手动设置主策账号，可在 Supabase `Authentication -> Users` 复制用户 id，然后插入成员权限：

```sql
insert into mvp_project_members (project_key, user_id, display_name, access_level)
values (
  'ciga-jam-2026',
  'USER_UUID_HERE',
  'Member Name',
  'member'
);
```

`access_level` 可选：

```text
owner, planner, reviewer, member, viewer
```

当前 `/api/state` 只检查“是否为项目成员”。更细的读写权限会在关系表拆分后进入 RLS 策略。

详细成员加入流程见 `docs/invite-flow.md`。

Docker Compose 可以通过 `.env` 注入这些变量：

```bash
cp .env.example .env
docker compose up -d --build
```

Ubuntu systemd 裸机部署时，先在项目根目录创建 `.env.local`，再运行：

```bash
bash scripts/ubuntu-install.sh
```
