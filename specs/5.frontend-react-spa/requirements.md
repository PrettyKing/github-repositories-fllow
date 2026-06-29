# frontend-react-spa — 需求规格

## 概述

用 React Router 7 SPA 取代 Hono 直出的 `page.ts` 页面，作为账户/仓库收集与统计的统一前端；静态产物由现有同一个 Hono Lambda 托管（拓扑①），保持「单 URL + Basic Auth」不变。

## 项目信息

- 项目名: github-repositories-fllow
- 架构类型: pnpm monorepo（Hono 后端 + React Router SPA），AWS Lambda 同源托管静态

## 需求版本

| 日期       | 版本 | 说明     |
| ---------- | ---- | -------- |
| 2026-06-28 | v1   | 初始需求 |

## 用户故事

- 作为用户，我希望用一个现代 React 界面提交 token、查看与删除账户，体验比手写 HTML 更顺。
- 作为开发者，我希望前后端同源、前端走相对 `/api`，免去跨域与构建时注入 API 地址。
- 作为运维，我希望部署形态不变（一个 Lambda、一个 URL、Basic Auth 照旧）。

## 功能需求

1. [F-001] `apps/web` 保持 `ssr: false`（纯 SPA），清理脚手架占位页，搭好 root 布局 + 主题 + sonner toaster。
2. [F-002] 轻量 API client（`src/lib/api.ts`）：统一相对路径 `fetch("/api/...")`，封装 JSON 解析与错误抛出。
3. [F-003] 账户收集 UI：token 提交表单、账户列表、删除——对齐并替换 `page.ts` 现有能力（含「token 不被保存」提示）。
4. [F-004] 后端用 `@hono/node-server/serve-static` 托管 `./client` 静态资源 + SPA fallback（catch-all 回 `index.html`）；删除 `page.ts` 与 `GET /` HTML。
5. [F-005] 中间件/路由顺序：`logger → cors(/api/*) → basicAuth(* 除 /health) → ensureSchema(/api/*) → /health → /api/* → serveStatic → catch-all 回 index.html`，static/fallback 不得吞 `/api/*` 与 `/health`。
6. [F-006] 构建编排：`react-router build`(web) → 拷贝 `build/client/*` 到 `apps/server/dist/client/` → `tsdown`(server)；提供根脚本 `build:lambda`。
7. [F-007] 本地开发：Vite dev(5173) 代理 `/api`、`/health` 到 Hono(3000)，保留 HMR；`env/web.ts` 的 `VITE_SERVER_URL` 改为可选。
8. [F-008] CI：`.github/workflows/deploy.yml` 构建步骤改用 `build:lambda`；`template.yaml` 路由不变，按需评估 `MemorySize`。

## 非功能需求

- 性能: SPA 首屏资源体积可控；Lambda 包含静态资源后冷启动略增，作业规模可接受。
- 安全: 首屏与静态资源同受 Basic Auth；`/health` 仍放行；token 不持久化。
- 兼容性: 同源相对路径，零 CORS；保持单 Lambda 部署形态。

## 验收标准

- [ ] [AC-001] `pnpm build:lambda` 产出 `apps/server/dist/` 含 `lambda.mjs` 与 `client/`（index.html + assets）。
- [ ] [AC-002] 部署后访问 `/` 加载 React SPA（非旧字符串 HTML），Basic Auth 正常弹框。
- [ ] [AC-003] SPA 内 token 提交 → 列表 → 删除全链路通过（相对 `/api`，无 CORS 错误）。
- [ ] [AC-004] 直接访问客户端子路径（如 `/users/1`）刷新不 404，fallback 回 index.html。
- [ ] [AC-005] `/health` 仍 200 且免鉴权；`/api/*` 行为不变。
- [ ] [AC-006] 本地 `pnpm dev:web` + `pnpm dev:server` HMR 与接口代理正常。

## 依赖

- 2.hono-api-and-page（被替换页面的接口与中间件）
- React Router 7（SPA）、`@hono/node-server/serve-static`、`packages/ui`、sonner、lucide（均已具备）

## 开放问题

- 已采用默认决策：直接删除 `page.ts`；保持单 Lambda 同源托管（详见 PLAN.md）。
