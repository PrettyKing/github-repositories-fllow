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

## 第二次 PRD（2026-06-28）切分为 4 个 feature

> 来源需求：`docs/需求-前端react化.md`、`docs/需求-账户仓库收集增强.md`。
> 在已交付的 1–4 基线之上做增强，编号从 5 续。

| 序号 | feature                 | 说明                                                  | 依赖                | 状态   |
| ---- | ----------------------- | ----------------------------------------------------- | ------------------- | ------ |
| 5    | frontend-react-spa      | 前端 React 化：SPA 取代 page.ts，同 Lambda 托管静态   | 2                   | ✅ 完成 |
| 6    | github-repos-collection | A：收集并展示账户仓库（github_repos 表 + 分页取数）    | 1,2,5               | ✅ 实现完成（集成测试待部署 DB） |
| 7    | user-dedup-refresh      | B：提交去重(upsert) + 刷新同步                         | 1,2,5（refresh 接 6）| ✅ 实现完成（集成测试待部署 DB） |
| 8    | stats-dashboard         | E：聚合统计面板（CSS 进度条，无图表库）               | 5,6,7               | ✅ 实现完成（集成测试待部署 DB） |

**推荐执行顺序**：5 → 6 → 7 → 8（先 React 化打底，再叠 A/B/E；6 与 7 后端部分可并行）

### 本次采用的默认决策（开放问题）

- 实施顺序：先 React 化（5）打底，再在 React 内实现 A/B/E。
- `page.ts`：直接删除，不保留降级 HTML 页。
- 仓库收集：`type=owner`（不含他人 fork），分页上限 300，超出标注。
- 去重：保留最新；上唯一约束前先对历史重复行去重。
- 统计展示：纯文本 + CSS 进度条，不引图表库。
- 部署：保持单 Lambda 同源托管静态（拓扑①），不上 S3/CloudFront。

## ID 编号约定

- 功能需求 / 任务 / 验收标准 ID **在单个 feature 内编号**，跨 feature 用 `{序号}.` 前缀区分。
- 例：`2.T-001` = 序号 2 这个 feature 的 T-001；`3.F-005` = 序号 3 的 F-005。
- **跨 feature 依赖**写全限定 ID，如 `2.T-004 依赖 1.T-003`。
