# 需求说明 — 前端 React 化（SPA + 同 Lambda 托管）

> 文档版本 v1 ｜ 2026-06-28 ｜ 技术性需求：把当前 Hono 直出 HTML 的页面替换为 React 前端。
> 现状基线：`apps/server/src/page.ts` 用模板字符串直出整页 HTML；`apps/web`（React Router 7）已存在但作业未使用。

## 背景与目标

当前页面是 Hono 用字符串拼的静态 HTML，随功能增多（账户/仓库/统计的动态交互）越来越难维护。`apps/web` 本就是 Better-T-Stack 预置的 React Router 7 应用且配置为 **SPA 模式（`ssr: false`）**，产物是纯静态资源。

**目标**：用 React SPA 取代 `page.ts`，作为账户/仓库收集与统计（含后续 A/B/E 功能）的统一前端；**保持现有「单 Lambda、单 URL、Basic Auth」的部署形态不变**。

## 架构决策（已定）

采用**拓扑①：同 Lambda 托管静态**。

```
API Gateway → 单 Lambda(Hono)
   ├─ /            → serveStatic → SPA index.html
   ├─ /assets/*    → serveStatic → JS/CSS（带 hash）
   ├─ /api/*       → JSON 接口（原样）
   └─ /health      → 健康检查（放行）
```

- **同源**：前端与接口同一 URL，前端调用走**相对路径 `/api`**，无需构建时注入 `VITE_SERVER_URL`，也**无跨域**，`CORS_ORIGIN` 维持现状。
- **不引入** SSR、S3、CloudFront；`template.yaml` 路由不变（`/{proxy+}` ANY 已全量转发给 Hono）。
- **不上图表库**：统计展示用纯文本 + CSS 进度条（零新增依赖）。

### 关键技术点（必须正确处理）
tsdown 把 Lambda 打成单文件 `lambda.mjs`，**静态资源不会被内联**。因此：
- 构建时把 web 产物 `apps/web/build/client/*` **拷贝进 `apps/server/dist/client/`**，随 SAM `CodeUri: apps/server/dist/` 一起部署（Lambda 内位于 `/var/task/client`）。
- 用 `@hono/node-server/serve-static`（`apps/server` 已依赖 `@hono/node-server`）从磁盘读取文件 serve，`root: "./client"`（相对 `process.cwd()` = `/var/task`）。

## 功能 / 技术需求

### 前端（apps/web）
- F1. 保持 `ssr: false`（纯 SPA）；构建产物为 `build/client/`（`index.html` + `assets/`）。
- F2. 新增轻量 API client（`src/lib/api.ts`），统一用**相对路径** `fetch("/api/...")`，封装 JSON 解析与错误。
- F3. 用 React + `packages/ui`(shadcn) + sonner 实现：token 提交表单、账户列表、删除——**对齐并替换 `page.ts` 现有能力**。
- F4. 在同一前端内承载后续 **A（仓库展开）/ B（去重·刷新）/ E（统计面板）** 的 UI（具体行为见 `需求-账户仓库收集增强.md`）。
- F5. SPA 客户端路由的未知路径由后端 fallback 回 `index.html`（前端正常接管）。

### 后端（apps/server）
- F6. 删除 `src/page.ts` 与 `GET /` 的 HTML 处理；改由 `serveStatic` 托管静态资源。
- F7. 注册顺序：`logger → cors(/api/*) → basicAuth(* 除 /health) → ensureSchema(/api/*) → /health → /api/* 路由 → serveStatic(/assets 等) → catch-all GET * 回 index.html`。
- F8. `serveStatic` 与 SPA fallback **不得吞掉 `/api/*` 与 `/health`**（这些路由在前，优先匹配）。
- F9. Basic Auth 维持：首屏 `/` 与静态资源同受保护（浏览器首次弹框、后续缓存凭据），`/health` 仍放行。

### 构建与部署
- F10. 新增构建编排：`react-router build`(web) → 拷贝 `build/client/*` 到 `apps/server/dist/client/` → `tsdown`(server)。可用根脚本 `build:lambda`（或 server 的 prebuild）串起来。
- F11. `.github/workflows/deploy.yml` 的构建步骤改为执行上述编排（不再只 `pnpm --filter server build`）。
- F12. `template.yaml` 无需改路由；如包体增大可酌情上调 Lambda `MemorySize`（评估后定）。

### 本地开发
- F13. Vite dev server（`pnpm dev:web`，5173）配置 `/api` 与 `/health` proxy 到本地 Hono（`pnpm dev:server`，3000），保留 HMR；前端代码与生产同样用相对路径。
- F14. `packages/env/src/web.ts` 的 `VITE_SERVER_URL` 改为**可选**（生产走相对路径，不依赖它）。

## 验收标准
- [ ] AC1. `pnpm build:lambda` 产出含 `lambda.mjs` 与 `client/`（index.html + assets）的 `apps/server/dist/`。
- [ ] AC2. 部署后访问 `/`，浏览器加载 React SPA（非旧的字符串 HTML），Basic Auth 正常弹框。
- [ ] AC3. SPA 内提交 token → 列表 → 删除全链路通过（相对 `/api` 调用，无 CORS 错误）。
- [ ] AC4. 直接访问任意客户端子路径（如 `/users/1`）刷新不 404，由 fallback 回 index.html 后前端接管。
- [ ] AC5. `/health` 仍 200 且免鉴权；`/api/*` 行为不变。
- [ ] AC6. 本地 `pnpm dev:web` + `pnpm dev:server` 下 HMR 与接口代理正常。

## 影响与清理
- 移除：`apps/server/src/page.ts`、`GET /` HTML 处理。
- 变更：`app.ts` 中间件/路由顺序、`apps/server` 构建脚本、CI 构建步骤、`env/web.ts`。
- 新增：`apps/web` 的实际业务 UI 与 `api.ts`、构建拷贝脚本。

## 依赖
- `@hono/node-server/serve-static`（已具备 `@hono/node-server` 依赖）。
- React Router 7（SPA）、`packages/ui`、sonner、lucide（均已具备）。
- 与 `需求-账户仓库收集增强.md`（A/B/E）协同：React 前端是 A/B/E 的 UI 落点。

## 开放问题（开发前确认）
1. 与 A/B/E 的**实施顺序**：先做「React 化基础（替换现有页面）」再叠 A/B/E，还是合并一批做？（建议：先 React 化打底，再在 React 里实现 A/B/E）
2. 旧 `page.ts` 是直接删除，还是保留一版纯 HTML 作为 `/health` 之外的降级页？（默认：直接删除）
3. Lambda 包含静态资源后体积变大，是否需要约束首屏资源大小 / 是否接受冷启动略增？（默认：作业规模可接受）
