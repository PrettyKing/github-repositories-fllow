# AGENTS.md

开发/审查代理在本仓库工作时遵循以下约定。完整说明见 `.claude/CLAUDE.md`、`.claude/rules/`、`specs/LESSONS.md`。

## 项目速览

pnpm monorepo（Better-T-Stack）：Hono 后端（`apps/server`）+ Drizzle/Postgres（`packages/db`）+ env 校验（`packages/env`）。单 Hono app 直出页面与接口，tsdown 打成自包含 Lambda，SAM 部署到 AWS（`ap-northeast-1`），GitHub Actions(OIDC) 自动化。

## 构建与校验

```bash
pnpm install
pnpm --filter server build     # 产出 dist/lambda.mjs
pnpm check-types               # 提交前必须零错误
pnpm dev:server                # 本地起后端
```

- 无 biome/eslint；类型门禁靠 `pnpm check-types`（tsc strict + noUnused* + noUncheckedIndexedAccess）。

## 硬约束（违反会出事）

- RDS/EC2 的 description / GroupDescription **只能用英文**（中文致 CloudFormation 整栈回滚）。
- `CORS_ORIGIN` env 用 `z.union([z.literal("*"), z.url()])`，不可纯 `z.url()`。
- 建表走运行时 `ensureSchema()`，不在 CI 跑 migration；改 schema 须同步 DDL 与 migration 0000。
- 机密（DB 密码 / Basic Auth / GitHub token）永不入仓、不打日志；走 env / Secrets Manager。
- 部署顺序：先 bootstrap（权限边界）再主栈。

## 规格与计划

- 开发规格在 `specs/`：`PLAN.md`（feature 索引与依赖）+ `1.github-data-core` → `2.hono-api-and-page` → `3.aws-infra-sam-deploy` → `4.cicd-oidc-deploy`，每个含 requirements/design/tasks。
- 跨 feature ID 用 `{序号}.` 前缀（如 `2.T-004 依赖 1.T-003`）。
- 教训沉淀写入 `specs/LESSONS.md`。
