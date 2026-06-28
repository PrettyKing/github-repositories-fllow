# github-data-core — 技术设计

## 设计版本

| 日期       | 版本 | 说明     |
| ---------- | ---- | -------- |
| 2026-06-28 | v1   | 初始设计 |

## 项目架构

- 架构类型: pnpm monorepo（Better-T-Stack）
- 涉及层: 数据库（schema/migration）、数据访问（Drizzle/pg）、外部服务客户端（GitHub API）、配置（env 校验）
- 所属包: `packages/db`、`packages/env`、`apps/server/src/github.ts`

> 项目无 `.claude/rules/`；以下设计遵循仓库既有约定：TypeScript 严格类型、`@github-repositories-fllow/*` workspace 引用、env 集中校验、凭据只走环境变量。

## 功能模块设计

### 模块 1: 数据表 schema（F-001）

`packages/db/src/schema/github-users.ts`，Drizzle `pgTable("github_users")`：

| 列 | 类型 | 约束 |
| --- | --- | --- |
| id | serial | primary key |
| github_id | integer | not null |
| login | text | not null |
| name / avatar_url / bio / company / location / html_url | text | nullable |
| public_repos / followers / following | integer | not null default 0 |
| created_at | timestamp | not null default now() |

导出 `GithubUser`（$inferSelect）与 `NewGithubUser`（$inferInsert）类型。`schema/index.ts` 统一 re-export。drizzle 配置见 `packages/db/drizzle.config.ts`，迁移产物 `src/migrations/0000_*.sql`。

### 模块 2: 数据库实例与连接池（F-002）

`packages/db/src/index.ts`：`createDb()` 用 `pg.Pool`（`connectionString = env.DATABASE_URL`），当 `env.DATABASE_SSL` 为真时 `ssl: { rejectUnauthorized: false }`（VPC 内连 Aurora 足够），否则 `undefined`。导出单例 `db = createDb()`，并 `export * from "./schema"`。

### 模块 3: 幂等建表 ensureSchema（F-003）

module 级 `let schemaReady: Promise<void> | undefined`。首次调用执行 `CREATE TABLE IF NOT EXISTS "github_users" (...)`，DDL 逐字段对齐 migration `0000`。成功后 promise 缓存复用；`catch` 时把 `schemaReady` 重置为 `undefined` 并重新抛出，使下次请求可重试。设计动机：Lambda 在私有子网，CI 无法直连 Aurora，故建表由运行时冷启动完成而非 CI migration。

### 模块 4: GitHub 取数客户端（F-004 / F-005）

`apps/server/src/github.ts`：

- `GithubApiUser` 接口描述所需字段。
- `fetchGithubUser(token)`：`fetch("https://api.github.com/user")`，请求头 `Authorization: Bearer <token>`、`Accept: application/vnd.github+json`、`User-Agent`、`X-GitHub-Api-Version: 2022-11-28`；`401` → `Token 无效或已过期 (401)`，其它非 ok → `GitHub API 调用失败: <status> <statusText>`。
- `toNewGithubUser(u)`：字段映射，计数 `?? 0`。

### 模块 5: 环境变量校验（F-006）

`packages/env/src/server.ts`：`createEnv`（@t3-oss/env-core）server 段——`DATABASE_URL` 必填；`DATABASE_SSL` 接受 string/bool 并归一为 boolean（`"true"`/`"1"`/`true`）；`CORS_ORIGIN` 为 `z.union([z.literal("*"), z.url()])`；`BASIC_AUTH_USER/PASSWORD` 可选；`NODE_ENV` 枚举默认 development。`skipValidation` 由 `SKIP_ENV_VALIDATION` 控制，`emptyStringAsUndefined: true`。

## 接口契约

应用内模块导出（非网络接口）：

- `db`、`createDb()`、`ensureSchema(): Promise<void>`、`githubUsers`、`GithubUser`、`NewGithubUser`（`@github-repositories-fllow/db`）
- `fetchGithubUser(token: string): Promise<GithubApiUser>`、`toNewGithubUser(u): NewGithubUser`
- `env`（`@github-repositories-fllow/env/server`）

## 数据模型

见模块 1 表结构。唯一表 `github_users`，每次提交 token 即「增」一行；删除按 `id`。

## 安全考虑

- 凭据（`DATABASE_URL` 含库密码）仅来自环境变量，源码不落明文。
- Aurora 强制 TLS，`DATABASE_SSL=true` 开启；本地可关闭。
- GitHub token 只在请求时透传，不入库（页面提示亦如此）。

## 技术决策

| 决策 | 选项 | 理由 |
| ---- | ---- | ---- |
| 运行时建表 vs CI migration | `ensureSchema` 冷启动幂等建表 | Lambda 私有子网，CI 连不到库 |
| pg ssl `rejectUnauthorized:false` | 关闭证书校验 | VPC 内连 Aurora，简化证书链 |
| env 用 @t3-oss/env-core | 集中校验 | 配置缺失早失败，类型安全 |
| CORS_ORIGIN union | `"*"` 或 URL | 同源页面用 `*`；纯 `z.url()` 过不了 `*`（踩坑记录） |
