# user-dedup-refresh — 任务清单

## 任务版本

| 日期       | 版本 | 说明     |
| ---------- | ---- | -------- |
| 2026-06-28 | v1   | 初始任务 |

## 项目信息

- 项目名: github-repositories-fllow
- 架构类型: pnpm monorepo（Hono + Drizzle + Aurora，React SPA）
- specs 路径: specs/7.user-dedup-refresh/

## 任务列表

### 功能 1: schema 与迁移

- [x] T-001: `github_users` 加 `updated_at` + `github_id` 唯一约束（schema + ensureSchema DDL + 重生成 migration）~15min
- [x] T-002: 历史去重迁移（保留每 github_id 最大 id，删其余；幂等，置于建唯一索引前）~15min

### 功能 2: upsert 与 refresh

- [x] T-003: `POST /api/github` 改 upsert（onConflictDoUpdate github_id，刷新 updated_at，返回 created 标记）~30min
- [x] T-004: `POST /api/users/:id/refresh`（token 校验 + 重新取数 upsert + 连带刷新仓库）~30min

### 功能 3: 前端

- [x] T-005: 账户卡片展示 updated_at + 刷新入口（重填 token → refreshUser → 反馈/刷新）~15min

### 集成与测试

- [x] T-006: 集成测试——重复提交去重、迁移后建约束成功、refresh 更新字段与仓库 ~15min

## 依赖关系

- T-001 依赖 `1.T-001`（github_users 现状）
- T-002 必须先于 T-001 的「唯一约束生效」执行（去重 → 再建约束）
- T-003 依赖 T-001
- T-004 依赖 T-003、`1.T-004`，且连带刷新仓库依赖 `6.T-002`/`6.T-003`
- T-005 依赖 T-004、`5.T-002`(api client)、`5.T-003`(账户列表 UI)
- T-006 依赖 T-001~T-005

## 风险点

- 有历史重复时直接建唯一约束会失败 → 必须先跑 T-002 去重，再建约束（顺序敏感）。
- `ON CONFLICT` 需要目标列确有唯一约束/索引，否则 upsert 报错 → 与 T-001 顺序绑定。
- created/updated 判定：`RETURNING (xmax = 0)` 在连接池/某些场景不稳，必要时退化为「先查存在性」。
- refresh 用错 token 可能刷错账户 → 加 github_id 一致性校验（design 模块 4）。
