# frontend-react-spa — 任务清单

## 任务版本

| 日期       | 版本 | 说明     |
| ---------- | ---- | -------- |
| 2026-06-28 | v1   | 初始任务 |

## 项目信息

- 项目名: github-repositories-fllow
- 架构类型: pnpm monorepo（React Router SPA + Hono 单 Lambda 托管静态）
- specs 路径: specs/5.frontend-react-spa/

## 任务列表

### 功能 1: SPA 基座

- [x] T-001: 清理脚手架占位，搭 root 布局 + ThemeProvider + sonner Toaster，保持 ssr:false ~30min
- [x] T-002: API client `src/lib/api.ts`（相对 `/api`，request 封装 + listUsers/addUser/deleteUser）~15min

### 功能 2: 账户收集 UI

- [x] T-003: 首页——token 表单 + 提交联动 + 账户列表 + 删除（替换 page.ts 能力，sonner 反馈）~30min

### 功能 3: 后端静态托管

- [x] T-004: 删除 page.ts/`GET /`，接入 `serveStatic(./client)` + SPA fallback，重排中间件顺序（不吞 /api、/health）~30min

### 功能 4: 构建与配置

- [x] T-005: `scripts/copy-web-to-server.mjs` + 根脚本 `build:lambda`（web build → 拷 client → tsdown）~15min
- [x] T-006: Vite dev proxy（/api、/health → 3000）+ `env/web.ts` VITE_SERVER_URL 可选 ~15min
- [x] T-007: CI deploy.yml 构建步骤改用 `build:lambda`；评估 template.yaml MemorySize ~15min

### 集成与测试

- [x] T-008: 端到端验证 AC-001~AC-006（产物结构/SPA 加载/鉴权/增删/fallback/health/dev HMR）~30min

## 依赖关系

- 本 feature 整体依赖 `2.hono-api-and-page`（被替换的页面与接口）
- T-002 依赖 T-001；T-003 依赖 T-002
- T-004 依赖 `2.T-001`（中间件/路由现状）
- T-005 依赖 T-004（确定 dist/client 约定）
- T-007 依赖 T-005
- T-008 依赖 T-001~T-007

## 风险点

- `serveStatic` 的 `root` 在 Lambda 解析相对 `process.cwd()`（`/var/task`）→ 必须把 client 拷到 `dist/client`，否则 404。
- SPA fallback 若注册在 `/api`/`/health` 之前会吞掉接口 → 严格保证注册顺序。
- tsdown `clean:false` 才不会清掉拷入的 `client/`；若顺序为先拷后 build server，需确认 build 不清目录。
- Basic Auth 下静态资源首请求弹框属预期；确认浏览器缓存凭据后 assets 正常加载。
- 包体增大致冷启动/部署包变大 → 监控 Lambda 大小，必要时上调 MemorySize。
