# github-repos-collection — 技术设计

## 设计版本

| 日期       | 版本 | 说明     |
| ---------- | ---- | -------- |
| 2026-06-28 | v1   | 初始设计 |

## 项目架构

- 架构类型: pnpm monorepo（Hono + Drizzle + Aurora，React SPA）
- 涉及层: 数据库（github_repos 表 + 外键级联）、外部取数（GitHub repos 客户端）、后端（入库 + 接口）、前端（仓库展开 UI）
- 文件: `packages/db/src/schema/github-repos.ts`、`apps/server/src/github.ts`、`app.ts`、`apps/web/*`

> 遵循 `.claude/rules/`：DB 列 snake_case / TS camelCase、映射集中纯函数、schema 改动同步 DDL+migration（deployment）、接口受 Basic Auth（security）。

## 功能模块设计

### 模块 1: github_repos 表（F-001 / F-005）

`packages/db/src/schema/github-repos.ts`，`pgTable("github_repos")`：

| 列 | 类型 | 约束 |
| --- | --- | --- |
| id | serial | pk |
| user_id | integer | not null, references github_users(id) **on delete cascade** |
| repo_id | integer | not null |
| name / full_name / html_url | text | name/full_name not null |
| description / language | text | nullable |
| stargazers_count / forks_count | integer | not null default 0 |
| is_private | boolean | not null default false |
| pushed_at | timestamp | nullable |
| created_at | timestamp | not null default now() |

导出 `GithubRepo` / `NewGithubRepo`。`schema/index.ts` re-export。`ensureSchema()` 追加该表 DDL（含外键级联），并重生成 migration。建议 `user_id` 加索引。

### 模块 2: 仓库取数客户端（F-002）

`apps/server/src/github.ts` 增 `fetchGithubRepos(token)`：循环 `GET https://api.github.com/user/repos?per_page=100&sort=updated&type=owner&page=N`，解析 `Link` 头 `rel="next"` 翻页，累计上限 300（达到即停并返回 `truncated` 标记）。请求头复用现有（Bearer/Accept/UA/Api-Version）。映射 `toNewGithubRepos(userId, apiRepos)`（snake→camel，计数 `?? 0`）。

### 模块 3: 入库逻辑（F-003）

`POST /api/github` 流程扩展：账户 upsert（见 7.user-dedup-refresh）拿到 `userId` 后，调 `fetchGithubRepos`，对该 `user_id` **先删后插**（`delete where user_id` → 批量 `insert`）保证刷新一致；包在事务里。返回体附 `reposCount`/`truncated`。

> 与 7 的协同：7 提供 upsert 后的稳定 `userId`；6 在其后写仓库。6 可先用「先查/插账户拿 id」过渡，7 落地后切到 upsert。

### 模块 4: 接口（F-004 / F-005）

- `GET /api/users/:id/repos`：`id` 整数校验 → `db.select().from(githubRepos).where(eq(userId,id)).orderBy(desc(pushedAt))`。
- `DELETE /api/users/:id`：依赖外键 `ON DELETE CASCADE` 自动删仓库（无需应用层显式删）。

### 模块 5: 前端仓库展开（F-006）

`apps/web`：账户卡片加「展开/收起」；展开时经 `api.ts` 的 `listUserRepos(id)` 调 `/api/users/:id/repos` 按需加载，渲染仓库行（语言色点/star/fork/`pushed_at`/`name`→`html_url`）。空仓库显示空态；`truncated` 时提示上限。

## 接口契约

| 方法 | 路径 | 鉴权 | 响应 |
| --- | --- | --- | --- |
| GET | `/api/users/:id/repos` | Basic Auth | 200 repo[] / 400 `{error}` |
| POST | `/api/github` | Basic Auth | 201/200，含 `reposCount`、`truncated` |
| DELETE | `/api/users/:id` | Basic Auth | 200 `{ok:true}`（级联删仓库） |

## 数据模型

新增 `github_repos`（见模块 1），与 `github_users` 一对多、级联删除。

## 安全考虑

- 接口受 Basic Auth；token 仅一次性透传不入库。
- 仓库数据为公开信息，无敏感字段；不记录 token 到日志。

## 技术决策

| 决策 | 选项 | 理由 |
| ---- | ---- | ---- |
| type=owner | 不含 fork | 聚焦账户自有仓库，减少噪音与请求量 |
| 分页上限 300 | 截断 + truncated 标记 | 防超大账户拖垮请求/页面与速率限额 |
| 仓库先删后插 | 按 user_id 重置 | 刷新时与 GitHub 现状一致，避免陈旧行 |
| 外键 ON DELETE CASCADE | DB 级联 | 删账户即清仓库，无孤儿数据 |
| 仓库按需加载 | 展开才拉 | 列表首屏轻量 |
