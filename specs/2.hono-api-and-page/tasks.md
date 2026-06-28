# hono-api-and-page — 任务清单

## 任务版本

| 日期       | 版本 | 说明     |
| ---------- | ---- | -------- |
| 2026-06-28 | v1   | 初始任务 |

## 项目信息

- 项目名: github-repositories-fllow
- 架构类型: pnpm monorepo（Hono 单 app，AWS Lambda）
- specs 路径: specs/2.hono-api-and-page/

## 任务列表

### 功能 1: app 骨架与中间件

- [ ] T-001: `new Hono()` + `logger` + `/api/*` cors（取 env.CORS_ORIGIN）+ `/api/*` 前 `ensureSchema` 中间件 ~15min

### 功能 2: 鉴权

- [ ] T-002: Basic Auth 中间件——配置凭据时 `app.use("*")` 保护、`/health` 放行；未配置则关闭 ~15min

### 功能 3: 页面与健康检查

- [ ] T-003: `GET /` 返回 pageHtml + `GET /health` 返回 `{status:"ok"}` ~5min

### 功能 4: 增删查接口

- [ ] T-004: `POST /api/github`：tokenSchema 校验 → fetchGithubUser → insert.returning → 201；400/502 错误码 ~30min
- [ ] T-005: `GET /api/users`（createdAt 倒序）+ `DELETE /api/users/:id`（id 整数校验，删后 `{ok:true}`）~15min

### 功能 5: 表单页面

- [ ] T-006: `page.ts` 表单页 HTML + 内联 JS（提交/加载列表/删除/错误展示）~30min

### 功能 6: 运行入口

- [ ] T-007: `lambda.ts`（`handle(app)`）+ `index.ts` 本地入口 ~5min

### 集成与测试

- [ ] T-008: 本地起服务端到端跑一遍：401/200 鉴权、空 token 400、无效 token 502、增→列→删 ~15min

## 依赖关系

- 全部依赖 1.github-data-core（`db`/`ensureSchema`/`githubUsers`/`fetchGithubUser`/`toNewGithubUser`/`env`）
- T-001 依赖 `1.T-002`、`1.T-003`、`1.T-006`
- T-004 依赖 `1.T-004`、`1.T-005`、T-001
- T-002 / T-003 / T-005 / T-006 依赖 T-001
- T-007 依赖 T-001~T-006
- T-008 依赖 T-001~T-007

## 风险点

- 鉴权中间件注册顺序若晚于路由，可能漏保护 → `app.use("*")` 须在路由前注册。
- `ensureSchema` 中间件仅挂 `/api/*`，页面 `GET /` 不触发建表属预期（页面不查库）。
- body 非 JSON 时 `c.req.json()` 抛错 → 用 `.catch(() => ({}))` 兜底再交 zod。
