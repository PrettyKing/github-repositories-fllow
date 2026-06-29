# user-dedup-refresh — 需求规格

## 概述

消除重复提交产生的脏数据并支持资料刷新：`github_id` 加唯一约束、新增 `updated_at`，`POST /api/github` 改为 upsert，新增 `POST /api/users/:id/refresh` 用当次 token 重新取数更新账户（及其仓库）。

## 项目信息

- 项目名: github-repositories-fllow
- 架构类型: pnpm monorepo（Hono + Drizzle + Aurora，React SPA）

## 需求版本

| 日期       | 版本 | 说明     |
| ---------- | ---- | -------- |
| 2026-06-28 | v1   | 初始需求 |

## 用户故事

- 作为用户，重复提交同一账户时希望更新现有记录而非新增重复行。
- 作为用户，希望对已收集账户点「刷新」，用重新填入的 token 拉取最新资料与仓库。

## 功能需求

1. [F-001] `github_users.github_id` 加**唯一约束**；新增 `updated_at` 列（每次写入刷新）。
2. [F-002] `POST /api/github` 改为 **upsert**：命中 `github_id` 则更新各字段与 `updated_at`，否则插入；返回区分「created / updated」。
3. [F-003] 新增 `POST /api/users/:id/refresh`：用请求体传入的 token 重新取数并更新该账户（连带仓库，配合 6）；token 不持久化。
4. [F-004] 旧重复数据迁移：上唯一约束前先去重，**保留每个 `github_id` 最新一条**，删除其余。
5. [F-005] schema 变更（唯一约束 + `updated_at`）同步 `ensureSchema()` DDL 与 drizzle migration。
6. [F-006] 前端：每条账户展示「最近更新时间」，提供「刷新」入口（弹出重填 token 后调 refresh）。

## 非功能需求

- 性能: upsert 用单条 `ON CONFLICT` 语句，避免「查后写」竞态。
- 安全: refresh 接口受 Basic Auth；token 仅一次性使用不入库不打日志。
- 一致性: 唯一约束落库前必须完成历史去重，否则建约束失败。

## 验收标准

- [ ] [AC-001] 同一 token 连续提交两次，`github_users` 只有一行，`updated_at` 被刷新。
- [ ] [AC-002] 对已有账户 refresh 后，变化字段（followers、public_repos、仓库等）被更新。
- [ ] [AC-003] 迁移脚本/逻辑能把历史重复行去重为每 `github_id` 一条（最新），随后唯一约束建立成功。
- [ ] [AC-004] 前端展示 updated_at，刷新入口工作正常。

## 依赖

- 1.github-data-core（github_users、db、ensureSchema、GitHub 客户端）
- 2.hono-api-and-page（POST /api/github 现状）
- 5.frontend-react-spa（刷新入口 UI）
- 6.github-repos-collection（refresh 连带刷新仓库）

## 开放问题

- 已采用默认决策：去重保留最新；上唯一约束前先去重（详见 PLAN.md）。
