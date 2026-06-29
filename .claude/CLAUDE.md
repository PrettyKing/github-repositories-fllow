# github-repositories-fllow — 项目指南

GitHub 账户信息收集：表单填入个人 token → Hono 后端取 `api.github.com/user` → Drizzle 增删入 Aurora。单 Hono app 同时直出页面与接口，打成 Lambda 经 API Gateway 暴露，SAM 部署到 AWS（`ap-northeast-1`），GitHub Actions(OIDC) 自动化。

## 技术栈

- **Monorepo**: pnpm workspace（Better-T-Stack），`apps/*` + `packages/*`，`pnpm@11.9.0`
- **后端**: Hono 4（`apps/server`），Node 22 / Lambda(arm64) 运行
- **ORM/DB**: Drizzle ORM + PostgreSQL / Aurora Serverless v2（`packages/db`）
- **前端**: React Router 7 SPA（`apps/web`，`ssr:false`）+ 共享 shadcn/ui（`packages/ui`）；构建为静态资源，**由同一个 Hono Lambda 经 `serveStatic` 托管**（`dist/client`），前端走相对 `/api`（同源、零 CORS）。旧的 `page.ts`（Hono 直出 HTML）已删除
- **配置**: `@t3-oss/env-core` + zod 集中校验（`packages/env`）
- **打包**: tsdown（Lambda 产物自包含单文件 `dist/lambda.mjs`）
- **IaC/部署**: AWS SAM（`template.yaml` + `samconfig.toml`），CI `infra/github-oidc.yaml` + `.github/workflows/deploy.yml`
- **TS**: ESNext / bundler 解析 / `strict` + `noUncheckedIndexedAccess` + `noUnusedLocals/Parameters`（`packages/config/tsconfig.base.json`）

## 目录结构

```
apps/
  server/   # Hono 后端：app.ts(路由) page.ts(页面) github.ts(取数) lambda.ts(入口) index.ts(本地)
  web/      # React Router 前端（本作业未使用）
packages/
  db/       # Drizzle schema + 连接池 + ensureSchema 幂等建表
  env/      # 环境变量校验（server.ts / web.ts）
  ui/       # 共享 shadcn/ui
  config/   # 共享 tsconfig
infra/      # github-oidc.yaml（CI 部署角色 + 权限边界）
template.yaml / samconfig.toml  # SAM 主栈
specs/      # 开发规格（PLAN.md + 编号 feature 目录 + LESSONS.md）
```

## 常用命令

```bash
pnpm install
pnpm dev                       # 全部应用开发模式
pnpm dev:server                # 仅后端（tsx watch）
pnpm --filter server build     # tsdown 产出 dist/lambda.mjs（Lambda 自包含）
pnpm build:lambda              # 部署用：web build → server build → 拷 client 到 dist/client
pnpm check-types               # 全仓 tsc -b 类型检查
pnpm db:generate / db:push / db:studio / db:migrate

sam validate --lint --region ap-northeast-1
sam deploy                     # 读 samconfig.toml
sam delete --stack-name github-repositories-fllow --region ap-northeast-1   # 验收后拆栈省钱
```

## 接口一览（apps/server/src/app.ts）

| 方法 | 路径 | 鉴权 | 说明 |
| --- | --- | --- | --- |
| GET | `/` | Basic Auth | React SPA（serveStatic 出 `client/index.html`） |
| POST | `/api/github` | Basic Auth | token 取账户并 **upsert**（按 github_id 去重）+ 同步其仓库；返回 `created/reposCount/truncated` |
| GET | `/api/users` | Basic Auth | 列出已保存账户（createdAt 倒序，含 updatedAt） |
| DELETE | `/api/users/:id` | Basic Auth | 删账户（仓库由外键 ON DELETE CASCADE 级联删） |
| GET | `/api/users/:id/repos` | Basic Auth | 某账户的仓库列表（pushedAt 倒序） |
| POST | `/api/users/:id/refresh` | Basic Auth | 用新 token 重新同步该账户与仓库 |
| GET | `/api/stats` | Basic Auth | 聚合统计（账户/仓库数、followers 合计、Top5、语言分布） |
| GET | `/health` | 放行 | 健康检查 |

## 约定

- 包间引用走 `@github-repositories-fllow/*` workspace 别名，**不写相对路径跨包**。
- 凭据（DB 密码 / Basic Auth / GitHub token）只走环境变量或 Secrets Manager，**永不入仓**。
- env 必须经 `packages/env` 校验后使用，不直接读 `process.env`。
- 改 DB schema 后须同步 `ensureSchema()` 的 DDL 与重生成 migration（二者必须一致）。
- 详细规则见 `.claude/rules/`，架构决策与踩坑见 `specs/LESSONS.md`，开发规格见 `specs/`。
