# github-data-core — 需求规格

## 概述

应用的数据层与取数核心：用 Drizzle ORM 在 PostgreSQL/Aurora 中持久化 GitHub 账户信息，提供幂等建表、连接池、GitHub API 取数客户端与环境变量校验。是 feature 2（接口/页面）的底座。

## 项目信息

- 项目名: github-repositories-fllow
- 架构类型: pnpm monorepo（Better-T-Stack）— Hono + Drizzle + Aurora PostgreSQL，TypeScript 全栈，部署到 AWS Lambda

## 需求版本

| 日期       | 版本 | 说明     |
| ---------- | ---- | -------- |
| 2026-06-28 | v1   | 初始需求 |

## 用户故事

- 作为系统，我需要把 GitHub 账户信息结构化入库，以便页面列表展示与删除。
- 作为运维，我希望应用在私有子网内能自助建表，以便 CI 不必直连数据库。
- 作为开发者，我希望启动时校验环境变量，以便配置缺失能尽早失败而非运行时崩溃。

## 功能需求

1. [F-001] 定义 `github_users` 数据表（Drizzle schema），字段含 GitHub 账户的 id/login/name/头像/简介/公司/位置/仓库与关注计数/主页/创建时间。
2. [F-002] 提供 Drizzle 数据库实例与 PostgreSQL 连接池，支持 Aurora/RDS 的 TLS（`DATABASE_SSL`）。
3. [F-003] 提供 `ensureSchema()` 幂等建表，DDL 与 drizzle migration `0000` 保持一致，容器生命周期内只执行一次、失败可重试。
4. [F-004] 提供 GitHub API 取数客户端 `fetchGithubUser(token)`，调用 `GET https://api.github.com/user`，对 401/非 2xx 抛出友好错误。
5. [F-005] 提供 `toNewGithubUser()` 把 GitHub API 响应映射成入库记录（snake_case → camelCase，计数缺省 0）。
6. [F-006] 提供集中式环境变量校验（`@t3-oss/env-core` + zod）：`DATABASE_URL`、`DATABASE_SSL`、`CORS_ORIGIN`、`BASIC_AUTH_*`、`NODE_ENV`。

## 非功能需求

- 性能: `ensureSchema` 用 module 级 promise 缓存，避免每请求建表；连接池复用。
- 安全: `DATABASE_URL` 含凭据，仅来自环境变量，不硬编码；TLS 由 `DATABASE_SSL` 控制。
- 兼容性: 同一套 schema 同时支撑本地 PostgreSQL 与 Aurora Serverless v2；`CORS_ORIGIN` 允许 `"*"` 或合法 URL。

## 验收标准

- [ ] [AC-001] `pnpm db:generate` 产出的 migration 与 `ensureSchema` 的 DDL 字段、约束、默认值一致。
- [ ] [AC-002] 用无效 token 调 `fetchGithubUser` 抛出含 "401" 的友好错误，而非未捕获异常。
- [ ] [AC-003] 缺失 `DATABASE_URL` 或非法 `CORS_ORIGIN` 时，env 校验启动即抛错（除非设 `SKIP_ENV_VALIDATION`）。
- [ ] [AC-004] `toNewGithubUser` 对缺失的 name/bio/company/location 写入 null，计数字段缺失时落 0。

## 依赖

- drizzle-orm、drizzle-orm/node-postgres、pg
- @t3-oss/env-core、zod、dotenv
- GitHub REST API（`api.github.com/user`，API 版本 `2022-11-28`）

## 开放问题

- 无（as-built，实现已线上验证）。
