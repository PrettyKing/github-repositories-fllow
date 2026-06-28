# 开发计划索引

## 本次 PRD（2026-06-28）切分为 4 个 feature

> 来源需求：`docs/作业说明.md`（GitHub 账户信息收集 —— Hono + Drizzle + Aurora，SAM 部署到 AWS，GitHub Actions(OIDC) 自动化）。
> 本项目已实现并线上验证通过，specs 以「as-built」方式记录已交付系统。

| 序号 | feature              | 说明                                                          | 依赖 | 状态     |
| ---- | -------------------- | ------------------------------------------------------------- | ---- | -------- |
| 1    | github-data-core     | 数据层与取数核心：Drizzle schema、连接池、幂等建表、GitHub API、env | -    | 待开发   |
| 2    | hono-api-and-page    | Hono 接口、表单页面与 Basic Auth 鉴权、Lambda 入口            | 1    | 待开发   |
| 3    | aws-infra-sam-deploy | AWS 基础设施与 SAM 部署：VPC/Aurora/Lambda + 自包含打包       | 2    | 待开发   |
| 4    | cicd-oidc-deploy     | CI/CD：GitHub Actions OIDC + IAM 权限边界自动部署             | 3    | 待开发   |

**推荐执行顺序**：1 → 2 → 3 → 4（线性依赖；先建应用，再上基础设施，最后接 CI）

## 五条作业要求 → feature 映射

| 作业要求                                          | 落在 feature      |
| ------------------------------------------------- | ----------------- |
| 1. Hono 一个接口 + 一个页面，SAM 部署到 AWS       | 2（应用）+ 3（部署）|
| 2. 表单用个人 token 取 GitHub 信息 + Drizzle 增删 | 1（取数/数据）+ 2（接口/页面）|
| 3. 服务与 DB 同 VPC（1 子网出网 + 2 子网部署）    | 3                 |
| 4. GitHub Actions + IAM 权限部署                  | 4                 |
| 5. 自己的 JS 工作流完成开发                        | 3（tsdown 打包）+ 4（pnpm/CI）|

## ID 编号约定

- 功能需求 / 任务 / 验收标准 ID **在单个 feature 内编号**，跨 feature 用 `{序号}.` 前缀区分。
- 例：`2.T-001` = 序号 2 这个 feature 的 T-001；`3.F-005` = 序号 3 的 F-005。
- **跨 feature 依赖**写全限定 ID，如 `2.T-004 依赖 1.T-003`。
