# stats-dashboard — 任务清单

## 任务版本

| 日期       | 版本 | 说明     |
| ---------- | ---- | -------- |
| 2026-06-28 | v1   | 初始任务 |

## 项目信息

- 项目名: github-repositories-fllow
- 架构类型: pnpm monorepo（Hono + Drizzle + Aurora，React SPA）
- specs 路径: specs/8.stats-dashboard/

## 任务列表

### 功能 1: 聚合接口

- [x] T-001: `GET /api/stats` Drizzle 聚合（账户/仓库数、followers/public_repos 求和、Top5 账户、语言分布 TopN+其他+占比，空态 coalesce）~30min

### 功能 2: 前端统计区

- [x] T-002: `StatsPanel` 组件——数字卡片 + 语言分布 CSS 进度条，`getStats()` 接入，空态 ~30min
- [x] T-003: 增/删/刷新操作后重拉 stats（状态联动）~15min

### 集成与测试

- [ ] T-004: 集成测试——空态不报错、数值正确、占比之和合理、操作后更新 ~15min

## 依赖关系

- T-001 依赖 `1.T-001`(github_users)、`6.T-001`(github_repos)
- T-002 依赖 T-001、`5.T-002`(api client)、`5.T-001`(SPA 基座)
- T-003 依赖 T-002 与账户列表/刷新 UI（`5.T-003`、`7.T-005`）
- T-004 依赖 T-001~T-003

## 风险点

- 语言分布需 6 的仓库数据；6 未完成时该区为空态（不阻塞接口）。
- `sum` 在空表返回 null → 用 `coalesce(...,0)` 兜底。
- 去重未完成（7）时账户聚合口径会偏高 → 按推荐顺序在 6/7 之后做。
