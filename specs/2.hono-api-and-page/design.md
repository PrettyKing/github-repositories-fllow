# hono-api-and-page — 技术设计

## 设计版本

| 日期       | 版本 | 说明     |
| ---------- | ---- | -------- |
| 2026-06-28 | v1   | 初始设计 |

## 项目架构

- 架构类型: pnpm monorepo（Hono 单 app，AWS Lambda 经 API Gateway HTTP API 暴露）
- 涉及层: 后端（Hono 路由/中间件）、前端（页面 HTML + 原生 JS）、运行时入口（Lambda / 本地）
- 所属包/文件: `apps/server/src/{app,page,github,lambda,index}.ts`

> 无 `.claude/rules/`；遵循仓库约定：Hono 单 app 直出页面与接口、env 集中校验、错误返回 `{ error }` + 合适状态码。

## 功能模块设计

### 模块 1: app 骨架与中间件（F-007）

`apps/server/src/app.ts`，`new Hono()`：

- `app.use(logger())`
- `app.use("/api/*", cors({ origin: env.CORS_ORIGIN, allowMethods: ["GET","POST","DELETE","OPTIONS"] }))`
- `app.use("/api/*", async (_c, next) => { await ensureSchema(); return next(); })`（用库前确保表存在）

### 模块 2: Basic Auth 鉴权（F-006）

当 `env.BASIC_AUTH_USER && env.BASIC_AUTH_PASSWORD` 时构造 `basicAuth({...})` guard，注册 `app.use("*", ...)`，但对 `c.req.path === "/health"` 直接放行 `next()`。未配置凭据则不挂鉴权（本地开发自动关闭）。

### 模块 3: 页面与健康检查（F-001 / F-005）

- `GET /` → `c.html(pageHtml)`
- `GET /health` → `c.json({ status: "ok" })`

### 模块 4: 增（POST /api/github）（F-002）

`tokenSchema = z.object({ token: z.string().min(1) })`。读取 body（`catch(() => ({}))`），`safeParse` 失败 → 400 + 首条 issue message。成功：`fetchGithubUser(token)` → `db.insert(githubUsers).values(toNewGithubUser(gh)).returning()` → 201 + row；`catch` → 502 + 错误信息（GitHub 调用失败/无效 token 在此冒泡）。

### 模块 5: 列与删（F-003 / F-004）

- `GET /api/users` → `db.select().from(githubUsers).orderBy(desc(createdAt))`
- `DELETE /api/users/:id` → `Number(id)`，非整数 400；否则 `db.delete().where(eq(id))` → `{ ok: true }`

### 模块 6: 表单页面（F-001 / F-008）

`apps/server/src/page.ts` 导出 `pageHtml`（内联 `<style>` + 原生 JS）：密码框（token）、提交按钮、错误区、列表区。前端 JS：提交 → `fetch POST /api/github` → 成功刷新列表/失败显示 `error`；启动加载 `GET /api/users` 渲染卡片（头像/login/name/stats）；每行删除按钮 → `DELETE /api/users/:id` 后刷新。提示「Token 仅一次性调用，不会被保存」。

### 模块 7: 运行入口（F-009）

- `lambda.ts`：`export const handler = handle(app)`（`hono/aws-lambda`，HTTP API payload v2）。
- `index.ts`：本地 node 启动入口（开发用）。

## 接口契约

| 方法 | 路径 | 鉴权 | 请求 | 响应 |
| --- | --- | --- | --- | --- |
| GET | `/` | Basic Auth | - | 200 HTML |
| GET | `/health` | 放行 | - | 200 `{status:"ok"}` |
| POST | `/api/github` | Basic Auth | `{token}` | 201 row / 400 `{error}` / 502 `{error}` |
| GET | `/api/users` | Basic Auth | - | 200 row[] |
| DELETE | `/api/users/:id` | Basic Auth | - | 200 `{ok:true}` / 400 `{error}` |

## 数据模型

复用 1.github-data-core 的 `github_users`；本 feature 只读写不改 schema。

## 安全考虑

- Basic Auth 覆盖页面+全部 `/api/*`，仅 `/health` 放行。
- token 不持久化；错误信息克制（`{ error: message }`）。
- CORS 来源由 `env.CORS_ORIGIN` 控制（同源页面用 `*`）。

## 技术决策

| 决策 | 选项 | 理由 |
| ---- | ---- | ---- |
| 页面与接口同一 Hono app | 单 app | 作业要求「一个页面 + 一个接口」，Lambda 单函数承载 |
| 鉴权 `/health` 放行 | 自定义中间件分流 | 监控/网关探活免凭据 |
| 取数失败用 502 | 上游错误 | 区分「客户端入参 400」与「上游 GitHub 502」 |
| 页面用内联原生 JS | 无打包前端 | 单文件直出，零额外构建，契合 Lambda |
