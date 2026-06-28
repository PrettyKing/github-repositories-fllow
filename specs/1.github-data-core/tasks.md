# github-data-core — 任务清单

## 任务版本

| 日期       | 版本 | 说明     |
| ---------- | ---- | -------- |
| 2026-06-28 | v1   | 初始任务 |

## 项目信息

- 项目名: github-repositories-fllow
- 架构类型: pnpm monorepo（Hono + Drizzle + Aurora，AWS Lambda）
- specs 路径: specs/1.github-data-core/

## 任务列表

### 功能 1: 数据表与迁移

- [ ] T-001: 定义 `github_users` Drizzle schema（字段/约束/默认值）+ 导出 `GithubUser`/`NewGithubUser`，并通过 `drizzle.config.ts` 生成 migration `0000` ~15min

### 功能 2: 数据访问层

- [ ] T-002: `createDb()` + `pg.Pool` 连接池 + `DATABASE_SSL` 条件 TLS，导出单例 `db` 与 `export * from schema` ~15min
- [ ] T-003: `ensureSchema()` 幂等建表（`CREATE TABLE IF NOT EXISTS`，DDL 对齐 migration 0000，promise 缓存 + 失败重置可重试）~15min

### 功能 3: GitHub 取数客户端

- [ ] T-004: `fetchGithubUser(token)` 调用 `api.github.com/user`（含请求头与 401/非 2xx 错误映射）~15min
- [ ] T-005: `toNewGithubUser()` 把 GithubApiUser 映射成 NewGithubUser（计数 `?? 0`）~5min

### 功能 4: 环境变量校验

- [ ] T-006: `packages/env/src/server.ts` env 校验（DATABASE_URL/SSL 归一化/CORS union/BASIC_AUTH/NODE_ENV）~15min

### 集成与测试

- [ ] T-007: 本地 PostgreSQL 联调：env 校验通过 → `ensureSchema` 建表 → 插入/查询一条记录 ~15min

## 依赖关系

- T-002 依赖 T-001
- T-003 依赖 T-001、T-002
- T-005 依赖 T-001
- T-007 依赖 T-002、T-003、T-006

## 风险点

- `ensureSchema` DDL 与 migration 0000 漂移 → 以 migration 为准，改 schema 后重生成并同步 DDL。
- `CORS_ORIGIN="*"` 若用纯 `z.url()` 会校验失败（踩坑记录）→ 必须用 `z.union([z.literal("*"), z.url()])`。
- 本地无 SSL 的 Postgres 误设 `DATABASE_SSL=true` 会连接失败 → 本地不设该变量。
