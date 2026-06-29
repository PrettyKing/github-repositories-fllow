# frontend-react-spa — 技术设计

## 设计版本

| 日期       | 版本 | 说明     |
| ---------- | ---- | -------- |
| 2026-06-28 | v1   | 初始设计 |

## 项目架构

- 架构类型: pnpm monorepo（React Router 7 SPA + Hono 单 Lambda 同源托管静态）
- 涉及层: 前端（React/Vite）、后端（Hono 静态托管 + 路由）、构建（react-router build + 拷贝 + tsdown）、CI、本地 dev
- 文件: `apps/web/*`、`apps/server/src/app.ts`、`apps/server/tsdown.config.ts`、根构建脚本、`.github/workflows/deploy.yml`

> 遵循 `.claude/rules/`：相对路径调用避免 CORS（security）、机密不入仓、`pnpm check-types` 零错误（code-style）、保持单 URL + Basic Auth（deployment）。

## 功能模块设计

### 模块 1: SPA 基座（F-001）

`apps/web` 保持 `react-router.config.ts` 的 `ssr: false`。清理 `src/routes/_index.tsx` 的 ASCII 占位，改为业务首页。`root.tsx` 提供布局、`ThemeProvider`、`<Toaster />`（sonner）。Tailwind v4 + `packages/ui`(shadcn) 已接好直接用。

**涉及层及关键设计:** 前端构建产物 `build/client/`（`index.html` + `assets/`），纯客户端渲染。

### 模块 2: API client（F-002）

`apps/web/src/lib/api.ts`：基础地址用**相对** `/api`（生产同源；dev 经 Vite proxy）。封装 `request<T>(path, init)`：`fetch` → 非 2xx 读 `{ error }` 抛出 → 2xx 返回 JSON。导出 `listUsers / addUser(token) / deleteUser(id)`，后续 A/B/E 接口在此扩展。

### 模块 3: 账户收集 UI（F-003）

首页组件：token `<input type=password>` + 提交（sonner 反馈成功/错误）、账户卡片列表（头像/login/name/stats）、每行删除。替换 `page.ts` 全部能力。提示「token 仅一次性调用，不保存」。用 `packages/ui` 的 button/input/card。

### 模块 4: 后端静态托管 + SPA fallback（F-004 / F-005）

`apps/server/src/app.ts`：

- 删除 `import { pageHtml }`、`GET /` 与 `page.ts`。
- `import { serveStatic } from "@hono/node-server/serve-static"`。
- 路由顺序：`logger` → `cors(/api/*)` → `basicAuth(* 除 /health)` → `ensureSchema(/api/*)` → `GET /health` → `/api/*` 业务路由 → `app.use("/*", serveStatic({ root: "./client" }))` → `app.get("*", serveStatic({ path: "./client/index.html" }))`（SPA fallback）。
- `root: "./client"` 相对 `process.cwd()`（Lambda = `/var/task`），即部署包内的 `client/`。

**涉及层及关键设计:** 后端 fs 读盘 serve；`/api/*`、`/health` 在静态之前注册，优先匹配，不被 fallback 吞掉。

### 模块 5: 构建编排（F-006 / F-008）

- 根 `package.json` 新增 `build:lambda`：`pnpm --filter web build && node scripts/copy-web-to-server.mjs && pnpm --filter server build`。
- `scripts/copy-web-to-server.mjs`：把 `apps/web/build/client/*` 复制到 `apps/server/dist/client/`（`tsdown` 的 `clean:false` 不会清掉它；注意拷贝在 server build 之前或之后均可，保证最终 `dist/` 同时含 `lambda.mjs` 与 `client/`）。
- `.github/workflows/deploy.yml`：`Build server bundle` 步骤改为 `pnpm build:lambda`。
- `template.yaml`：`CodeUri: apps/server/dist/` 不变（自动含 client/）；`MemorySize` 视包体评估（默认 256 起，必要时上调）。

### 模块 6: 本地 dev（F-007）

`apps/web/vite.config.ts` 加 `server.proxy`：`/api` 与 `/health` → `http://localhost:3000`。`env/web.ts` 的 `VITE_SERVER_URL` 改 `z.url().optional()`（生产相对路径不依赖它）。开发流程：`pnpm dev:server`（3000）+ `pnpm dev:web`（5173，HMR）。

## 接口契约

不新增网络接口；复用 2.hono-api-and-page 的 `/`, `/api/users`, `/api/github`, `DELETE /api/users/:id`, `/health`。前端 `api.ts` 用相对路径消费它们。新增静态路由由 `serveStatic` 接管 `/`、`/assets/*` 与未知路径。

## 数据模型

无新增数据模型。

## 安全考虑

- 相对路径同源调用，零 CORS 暴露面（security.md）。
- 静态资源与首屏受 Basic Auth 保护；`/health` 放行不变。
- 前端不持久化 token；不在前端日志打印 token。

## 技术决策

| 决策 | 选项 | 理由 |
| ---- | ---- | ---- |
| SPA(ssr:false) | 纯客户端 | 内部工具无 SEO/首屏需求，免 SSR Lambda |
| 同 Lambda 托管静态 | serveStatic(./client) | 保单 URL + Basic Auth，零新增 infra/成本（拓扑①） |
| 相对 `/api` | 不用 VITE_SERVER_URL | 同源免 CORS，免构建时注入 API 地址 |
| 静态文件随 dist 打包 | 构建期拷贝 client/ | tsdown 单文件不内联静态资源，须落盘到 CodeUri |
| 删除 page.ts | 不保留降级页 | 避免双份 UI 维护 |
