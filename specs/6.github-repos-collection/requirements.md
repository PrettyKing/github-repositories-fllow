# github-repos-collection — 需求规格

## 概述

收集并展示账户的 GitHub 仓库：提交 token 取账户的同时拉取其仓库列表入库，列表页可展开查看某账户的仓库（语言/star/fork/更新时间/链接），删除账户时级联删除仓库。让 *repositories* 名副其实。

## 项目信息

- 项目名: github-repositories-fllow
- 架构类型: pnpm monorepo（Hono + Drizzle + Aurora，React SPA 前端）

## 需求版本

| 日期       | 版本 | 说明     |
| ---------- | ---- | -------- |
| 2026-06-28 | v1   | 初始需求 |

## 用户故事

- 作为用户，提交 token 时希望同时收集我的仓库列表，了解账户下项目概况。
- 作为用户，希望在账户下展开查看其仓库（名称、语言、star/fork、更新时间），并能跳转 GitHub。

## 功能需求

1. [F-001] 新增 `github_repos` 表：外键 `user_id`→`github_users.id`（`ON DELETE CASCADE`）、`repo_id`、`name`、`full_name`、`html_url`、`description`、`language`、`stargazers_count`、`forks_count`、`is_private`、`pushed_at`、`created_at`(入库时间)。
2. [F-002] 取数客户端 `fetchGithubRepos(token)`：调 `GET /user/repos?per_page=100&sort=updated&type=owner`，按 `Link` 头翻页，**上限 300**，超出标注「仅展示前 N 个」。
3. [F-003] 提交 token 取账户后，同步拉取并写入该账户的仓库（账户 upsert 后按 `user_id` 批量重置/写入仓库）。
4. [F-004] `GET /api/users/:id/repos`：返回某账户仓库列表（页面展开时按需加载）。
5. [F-005] `DELETE /api/users/:id` 级联删除该账户仓库（DB 外键级联，无孤儿数据）。
6. [F-006] 前端：账户卡片可展开/折叠仓库子列表，展示语言/star/fork/更新时间，名称链接 `html_url`，按需调 `/api/users/:id/repos`。

## 非功能需求

- 性能: 分页拉取注意 GitHub 速率限制；仓库列表按需加载，避免一次性渲染过多。
- 安全: 接口受 Basic Auth；token 不持久化；仓库数据无敏感字段。
- 一致性: `github_repos` 的 DDL 同步 `ensureSchema()` 与 drizzle migration。

## 验收标准

- [ ] [AC-001] 提交含公开仓库的 token 后，`github_repos` 有对应记录，页面可展开看到。
- [ ] [AC-002] 仓库数 > 100 的账户能取到第一页之外的数据；> 300 时明确标注上限。
- [ ] [AC-003] 删除账户后其仓库记录一并消失，无孤儿数据。
- [ ] [AC-004] 不含 fork 的仓库（`type=owner`）符合预期，空仓库账户展开显示空态。

## 依赖

- 1.github-data-core（db、ensureSchema、env、GitHub 客户端范式）
- 2.hono-api-and-page（增删查接口与中间件）
- 5.frontend-react-spa（仓库展开 UI 落在 React）
- GitHub `GET /user/repos`（分页 + 速率限制）

## 开放问题

- 已采用默认决策：`type=owner`（不含 fork）、分页上限 300（详见 PLAN.md）。
