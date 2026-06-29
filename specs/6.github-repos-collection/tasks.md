# github-repos-collection — 任务清单

## 任务版本

| 日期       | 版本 | 说明     |
| ---------- | ---- | -------- |
| 2026-06-28 | v1   | 初始任务 |

## 项目信息

- 项目名: github-repositories-fllow
- 架构类型: pnpm monorepo（Hono + Drizzle + Aurora，React SPA）
- specs 路径: specs/6.github-repos-collection/

## 任务列表

### 功能 1: 数据表

- [x] T-001: `github_repos` Drizzle schema（外键 user_id→github_users ON DELETE CASCADE + 字段）+ ensureSchema DDL + 重生成 migration ~30min

### 功能 2: 取数客户端

- [x] T-002: `fetchGithubRepos(token)` 分页（Link 头翻页、type=owner、上限 300、truncated 标记）+ `toNewGithubRepos` 映射 ~30min

### 功能 3: 入库与接口

- [x] T-003: `POST /api/github` 扩展——取账户后按 user_id 先删后插仓库（事务），返回 reposCount/truncated ~30min
- [x] T-004: `GET /api/users/:id/repos`（id 校验 + 按 pushed_at 倒序）；确认 DELETE 级联生效 ~15min

### 功能 4: 前端展开

- [x] T-005: 账户卡片展开/折叠 + `listUserRepos(id)` 按需加载 + 仓库行渲染（语言/star/fork/时间/链接，空态/截断提示）~30min

### 集成与测试

- [ ] T-006: 集成测试——含 >100(分页) 与 >300(截断) 账户、级联删除、空仓库账户 ~15min

## 依赖关系

- T-001 依赖 `1.T-001`（github_users 表，作外键目标）
- T-002 依赖 `1.T-004`（GitHub 客户端范式）
- T-003 依赖 T-001、T-002，且与 `7.T-002`(upsert) 协同（先用过渡逻辑，7 落地后切 upsert 取 userId）
- T-004 依赖 T-001、`2.T-005`
- T-005 依赖 T-004、`5.T-002`(api client)、`5.T-003`(账户列表 UI)
- T-006 依赖 T-001~T-005

## 风险点

- GitHub 速率限制：大量分页可能触发 403/限额 → 控制上限 300，必要时读速率头退避。
- 先删后插需在事务内，避免删后插失败导致仓库丢失。
- 外键级联需 DB 真正建立（ensureSchema DDL 写对 `REFERENCES ... ON DELETE CASCADE`），否则删账户报错或留孤儿。
- 与 7 的 upsert 接口耦合：T-003 标注过渡策略，避免阻塞。
