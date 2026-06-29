# 邀请码与成员加入流程

第二阶段推荐使用邀请码或邀请链接，让成员自己完成注册、登录和加入项目。

## 一次性数据库准备

在 Supabase SQL Editor 执行：

```text
docs/supabase-auth-members.sql
```

这个 SQL 会创建：

- `mvp_project_members`
- `mvp_project_invites`

如果你之前已经执行过旧版本，可以再次执行。脚本包含 `if not exists` 和 `add column if not exists`。

## 主策生成邀请码

1. 打开应用。
2. 使用主策账号登录，或暂时使用共享同步令牌模式。
3. 进入 **成员** 页签。
4. 在 **生成邀请码** 区域设置：
   - 邀请标签
   - 默认权限
   - 使用上限
   - 是否需要批准
5. 点击 **生成邀请码**。
6. 在 **邀请码列表** 里点击 **复制链接**。

首次引导时，如果主策账号还没有被加入 `mvp_project_members`，成员页会回退到共享同步令牌创建邀请码。之后建议用邀请码把主策账号加入项目，并把权限改成 `owner`。

复制出的链接格式：

```text
https://your-domain.example/?invite=XXXX-XXXX-XXXX
```

## 成员加入项目

1. 成员打开邀请链接。
2. 在右上角注册或登录。
3. 邀请码会自动填入。
4. 成员填写显示名。
5. 点击 **加入项目**。

如果邀请码设置为自动批准，成员会立即加入项目。  
如果邀请码设置为需要批准，成员会进入待批准状态。

## 主策批准成员

1. 进入 **成员** 页签。
2. 点击 **刷新**。
3. 在成员列表里找到 **待批准** 成员。
4. 点击 **批准**。

## 当前权限说明

权限等级：

```text
owner    负责人
planner  主策/策划
reviewer 复核人
member   成员
viewer   观察者
```

当前 `/api/state` 写入权限允许：

```text
owner, planner, reviewer, member
```

`viewer` 后续会用于只读观察。更细的任务级权限会在关系表拆分之后实现。
