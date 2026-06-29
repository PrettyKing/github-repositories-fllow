# stats-dashboard — 需求规格

## 概述

为已收集数据提供只读聚合总览：账户总数、仓库总数、followers/public_repos 求和、Top N 账户、语言分布，前端用纯文本 + CSS 进度条展示（不引图表库）。

## 项目信息

- 项目名: github-repositories-fllow
- 架构类型: pnpm monorepo（Hono + Drizzle + Aurora，React SPA）

## 需求版本

| 日期       | 版本 | 说明     |
| ---------- | ---- | -------- |
| 2026-06-28 | v1   | 初始需求 |

## 用户故事

- 作为用户，我希望在页面顶部看到收集数据的总览，快速判断规模与分布。

## 功能需求

1. [F-001] `GET /api/stats`：用 Drizzle 聚合返回——账户总数、仓库总数、followers 总和、public_repos 总和、Top 5 账户（按 followers）、语言分布 Top N（来自 `github_repos.language`，含「其他」归并）。
2. [F-002] 前端统计区：关键数字卡片 + 语言分布用 **CSS 进度条**（占比），渲染在列表上方。
3. [F-003] 统计随数据变化刷新（页面加载、增删改/刷新操作后重新拉取）。
4. [F-004] 空数据态：所有指标显示 0 / 空，不报错。

## 非功能需求

- 性能: 聚合走 SQL（`count`/`sum`/`group by`），不在应用层全表遍历。
- 安全: 接口受 Basic Auth；只读，不暴露敏感字段。
- 兼容性: 语言分布依赖 6 的仓库数据；无仓库时该区显示空态。

## 验收标准

- [ ] [AC-001] 空数据时面板显示 0/空态，不报错。
- [ ] [AC-002] 收集多账户后，总数、求和、Top N 数值正确。
- [ ] [AC-003] 语言分布进度条占比之和合理（约 100%，可含「其他」）。
- [ ] [AC-004] 增删/刷新后统计区随之更新。

## 依赖

- 1.github-data-core、2.hono-api-and-page（db 与接口基建）
- 5.frontend-react-spa（统计区 UI 落点）
- 6.github-repos-collection（语言分布数据源）
- 7.user-dedup-refresh（去重后统计口径准确）

## 开放问题

- 已采用默认决策：不引图表库，纯文本 + CSS 进度条（详见 PLAN.md）。
