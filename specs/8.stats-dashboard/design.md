# stats-dashboard — 技术设计

## 设计版本

| 日期       | 版本 | 说明     |
| ---------- | ---- | -------- |
| 2026-06-28 | v1   | 初始设计 |

## 项目架构

- 架构类型: pnpm monorepo（Hono + Drizzle + Aurora，React SPA）
- 涉及层: 后端（聚合查询 + 接口）、前端（统计区组件）
- 文件: `apps/server/src/app.ts`、`apps/web/src/*`

> 遵循 `.claude/rules/`：聚合走 SQL 不全表遍历（code-style/性能）、接口受 Basic Auth（security）、统计用 CSS 进度条不引依赖（PLAN 默认决策）。

## 功能模块设计

### 模块 1: 聚合接口（F-001 / F-004）

`GET /api/stats`，Drizzle 聚合：

- 账户数：`count(github_users)`；followers 和、public_repos 和：`sum(...)`。
- 仓库数：`count(github_repos)`。
- Top 5 账户：`select login, name, followers from github_users order by followers desc limit 5`。
- 语言分布：`select language, count(*) from github_repos where language is not null group by language order by count desc`，取 Top N（如 8），其余归并为「其他」，并算占比。
- 空数据：所有聚合返回 0 / 空数组（`sum` 用 `coalesce(...,0)`）。

返回结构：`{ users, repos, totalFollowers, totalPublicRepos, topUsers: [...], languages: [{ name, count, percent }] }`。

### 模块 2: 前端统计区（F-002 / F-003）

`apps/web`：列表上方 `StatsPanel`。经 `api.ts` 的 `getStats()` 调 `/api/stats`。渲染：
- 关键数字卡片（账户数/仓库数/总 followers/总 public_repos），用 `packages/ui` 的 card。
- 语言分布：每语言一行 `name + 进度条(width=percent%) + count`，进度条用纯 CSS（div + 背景宽度），无图表库。
- 在页面加载与「增/删/刷新」操作成功后调用 `getStats()` 重新拉取（可用简单状态或事件）。空态显示 0/占位。

## 接口契约

| 方法 | 路径 | 鉴权 | 响应 |
| --- | --- | --- | --- |
| GET | `/api/stats` | Basic Auth | 200 `{ users, repos, totalFollowers, totalPublicRepos, topUsers[], languages[] }` |

## 数据模型

不新增表；只读聚合 `github_users` 与 `github_repos`。

## 安全考虑

- 接口受 Basic Auth；只读、不返回 token 或敏感字段。

## 技术决策

| 决策 | 选项 | 理由 |
| ---- | ---- | ---- |
| 聚合走 SQL | count/sum/group by | 性能与正确性，避免应用层遍历 |
| 语言 Top N + 其他 | 归并尾部 | 进度条不至过多、占比可读 |
| CSS 进度条 | 不引图表库 | 零新增依赖，作业规模够用 |
| 操作后重拉 stats | 简单刷新 | 实现简单、数据一致 |
