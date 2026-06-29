# user-dedup-refresh — 技术设计

## 设计版本

| 日期       | 版本 | 说明     |
| ---------- | ---- | -------- |
| 2026-06-28 | v1   | 初始设计 |

## 项目架构

- 架构类型: pnpm monorepo（Hono + Drizzle + Aurora，React SPA）
- 涉及层: 数据库（唯一约束 + updated_at + 迁移）、后端（upsert + refresh 接口）、前端（刷新入口 + 更新时间）
- 文件: `packages/db/src/schema/github-users.ts`、`packages/db/src/index.ts`、`apps/server/src/app.ts`、`apps/web/*`

> 遵循 `.claude/rules/`：upsert 单语句避免竞态、schema 改动同步 DDL+migration、接口受 Basic Auth、token 不入库不打日志。

## 功能模块设计

### 模块 1: schema 变更（F-001 / F-005）

`github-users.ts`：`githubId` 加 `.unique()`；新增 `updatedAt: timestamp("updated_at").notNull().defaultNow()`。`ensureSchema()` DDL 增加 `updated_at` 列与 `github_id` 唯一约束（`CREATE UNIQUE INDEX IF NOT EXISTS` 或表内 `UNIQUE`），重生成 migration。

### 模块 2: 历史去重迁移（F-004）

在唯一约束生效前执行一次去重：保留每个 `github_id` 的最大 `id`（视为最新），删除其余。SQL 形如
`DELETE FROM github_users a USING github_users b WHERE a.github_id = b.github_id AND a.id < b.id;`
作为一次性迁移/`ensureSchema` 中「建唯一索引前」的前置步骤，保证幂等（重复执行无副作用）。

### 模块 3: upsert（F-002）

`POST /api/github`：账户取数后用 Drizzle `insert(...).onConflictDoUpdate({ target: githubUsers.githubId, set: { ...fields, updatedAt: sql\`now()\` } }).returning()`。通过 `xmax`=0 或比较插入前后判断 created/updated（简化：返回行 + 一个 `created` 布尔，用 `ON CONFLICT` 不易直接拿到，可用先查存在性或 `RETURNING (xmax = 0) AS inserted`）。返回 `{ row, created }`。

### 模块 4: refresh 接口（F-003）

`POST /api/users/:id/refresh`：`id` 整数校验 → 读 body `token`（zod 校验非空）→ `fetchGithubUser(token)` 校验该 token 对应账户的 `github_id` 与目标记录一致（防止用别的 token 刷错账户，可选）→ upsert 更新账户 → 调 `fetchGithubRepos` 重置仓库（依赖 6）。token 用后不存。返回更新后的行。

### 模块 5: 前端刷新入口（F-006）

`apps/web`：账户卡片展示 `updated_at`（相对时间/绝对时间）；「刷新」按钮 → 弹出输入框重填 token → `api.ts` 的 `refreshUser(id, token)` 调 `POST /api/users/:id/refresh` → sonner 反馈 → 刷新列表与该账户仓库。

## 接口契约

| 方法 | 路径 | 鉴权 | 请求 | 响应 |
| --- | --- | --- | --- | --- |
| POST | `/api/github` | Basic Auth | `{token}` | 200/201 `{ row, created }` |
| POST | `/api/users/:id/refresh` | Basic Auth | `{token}` | 200 row / 400 `{error}` / 502 `{error}` |

## 数据模型

`github_users` 增 `updated_at`、`github_id` 唯一约束；不新增表。

## 安全考虑

- refresh 受 Basic Auth；token 仅一次性透传，不入库、不打日志。
- 可选校验：refresh 传入 token 的账户须与目标记录 `github_id` 一致，避免错刷。

## 技术决策

| 决策 | 选项 | 理由 |
| ---- | ---- | ---- |
| upsert 单语句 ON CONFLICT | 不用「查后写」 | 避免并发竞态与重复行 |
| 去重保留最新(最大 id) | 删除旧行 | 历史脏数据收敛为每账户一条 |
| 迁移先于唯一约束 | 顺序约束 | 有重复时直接建唯一约束会失败 |
| created 判定用 xmax/存在性 | RETURNING 标记 | 让前端区分新建/更新反馈 |
| refresh 重填 token | 不持久化 token | 安全合规，token 不落库 |
