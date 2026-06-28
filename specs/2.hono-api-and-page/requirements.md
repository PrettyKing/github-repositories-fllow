# hono-api-and-page — 需求规格

## 概述

用单个 Hono app 同时提供「一个页面」和「一组接口」：表单页填入 GitHub 个人 token，后端取账户信息并用 Drizzle「增」记录，提供列表与「删」，页面/接口受 Basic Auth 保护。对应作业要求 1（接口+页面）与 2（增删）。

## 项目信息

- 项目名: github-repositories-fllow
- 架构类型: pnpm monorepo（Hono 后端，AWS Lambda 运行）

## 需求版本

| 日期       | 版本 | 说明     |
| ---------- | ---- | -------- |
| 2026-06-28 | v1   | 初始需求 |

## 用户故事

- 作为用户，我想在网页表单粘贴 GitHub token，以便系统拉取并保存我的账户信息。
- 作为用户，我想看到已保存账户列表并能删除某条，以便管理收集到的数据。
- 作为管理员，我希望页面与接口受鉴权保护，以便没有凭据的人不能公开读写/删除数据。

## 功能需求

1. [F-001] `GET /` 返回表单页面 HTML（密码框 + 提交按钮 + 列表区）。
2. [F-002] `POST /api/github`：校验 token 非空 → 调 GitHub 取数 → Drizzle「增」一条 → 返回 201 + 记录。
3. [F-003] `GET /api/users`：按 `createdAt` 倒序返回全部记录。
4. [F-004] `DELETE /api/users/:id`：校验 id 为整数 → Drizzle「删」→ 返回 `{ ok: true }`。
5. [F-005] `GET /health`：免鉴权返回 `{ status: "ok" }`，供网关/监控探活。
6. [F-006] Basic Auth：配置了 `BASIC_AUTH_USER`/`PASSWORD` 时保护除 `/health` 外的所有路由；未配置时鉴权关闭（本地开发）。
7. [F-007] 中间件：`logger`、`/api/*` 的 `cors`（来源取 `env.CORS_ORIGIN`）、`/api/*` 前 `ensureSchema`。
8. [F-008] 前端页面 JS：提交表单调 `POST /api/github`、加载/刷新列表、删除按钮调 `DELETE`，错误区展示后端错误信息。
9. [F-009] Lambda 入口 `lambda.ts`（`handle(app)`，API Gateway HTTP API payload v2）与本地入口 `index.ts`。

## 非功能需求

- 性能: 单 Hono 实例复用，`ensureSchema` 仅首次建表。
- 安全: Basic Auth 覆盖页面+接口，仅 `/health` 放行；token 仅一次性透传不入库；错误信息不泄露内部细节。
- 兼容性: 同一 app 既能本地 node 运行（`index.ts`）也能在 Lambda 运行（`lambda.ts`）。

## 验收标准

- [ ] [AC-001] 无凭据访问 `/` 或任一 `/api/*` 返回 401；正确凭据返回 200/预期结果；`/health` 始终 200。
- [ ] [AC-002] 空 token `POST /api/github` 返回 400 且含校验信息；无效 token 返回 502 含 GitHub 错误（如 401）。
- [ ] [AC-003] 有效 token 提交后返回 201，`GET /api/users` 能查到该记录，删除后不再出现。
- [ ] [AC-004] 非整数 `:id` 删除返回 400。

## 依赖

- 1.github-data-core（`db`、`ensureSchema`、`githubUsers`、`fetchGithubUser`、`toNewGithubUser`、`env`）
- hono、hono/basic-auth、hono/cors、hono/logger、hono/aws-lambda、zod

## 开放问题

- 无（as-built，实现已线上验证）。
