# LESSONS — 架构决策与踩坑记录

> 开发前必读。新踩坑/新决策追加到对应小节，并在相关 feature 的 design.md「技术决策」表里引用。

## 架构决策

| 决策 | 选择 | 理由 |
| --- | --- | --- |
| 页面与接口同一 Hono app | 单 app（`apps/server`） | 作业「一个页面 + 一个接口」，Lambda 单函数承载，页面由后端直出 HTML（未用 React Router 前端） |
| 建表方式 | 运行时 `ensureSchema()` 冷启动幂等建表 | Lambda 在私有子网，CI 无法直连 Aurora，故不在 CI 跑 migration |
| Lambda 打包 | tsdown 自包含单文件 `lambda.mjs`（全依赖内联） | Lambda 内无需 `node_modules`，SAM 只打包 `dist/` |
| 数据库 | Aurora PostgreSQL Serverless v2（0.5–2 ACU），`DeletionPolicy: Delete` | 按需伸缩省成本；验收后一键拆栈不留快照 |
| 网络 | 1 公有子网（放 NAT，唯一出网）+ 2 私有子网（Lambda + Aurora，跨 2 AZ） | 满足作业「1 子网出网，2 子网部署」；DB 无公网入口 |
| CI 鉴权 | GitHub Actions OIDC 假设角色 | 仓库零长期密钥 |
| 防提权 | 部署角色建 Lambda 角色强制挂权限边界、限栈前缀、无权删边界 | admin 持边界、CI 只能用不能改，封顶实际权限 |
| Lambda 架构 | arm64（Graviton） | 更低单价 |

## 踩坑记录

1. **RDS / EC2 的 description 字段不能含中文** —— 非 ASCII 控制字符会让 CloudFormation 创建子网组 / 安全组失败、整栈回滚。`DBSubnetGroupDescription`、安全组 `GroupDescription` 一律用英文。
2. **`CORS_ORIGIN="*"` 过不了 `z.url()` 校验** —— Lambda 冷启动 env 校验直接抛错、所有请求失败。env 里放宽为 `z.union([z.literal("*"), z.url()])`。
3. **Lambda 在私有子网，CI 连不到库** —— 建表改由 Lambda 冷启动 `ensureSchema()` 幂等执行，而非 CI 跑 migration。
4. **VPC 自带主路由表(main route table)** —— AWS 每个 VPC 自动建一张；模板显式建 public/private 两张并关联全部子网，主表空置属正常、免费、删不掉，不必处理。
5. **`DATABASE_URL` 里的密码含标点会破坏连接串** —— Secrets Manager 生成密码时设 `ExcludePunctuation`，得到纯字母数字密码可安全拼接。
6. **部署顺序** —— 必须先建 bootstrap 栈（权限边界）再部署主栈，否则主栈的 Lambda 执行角色因缺边界被部署角色拒绝创建。
7. **tsdown 的 local 配置 `clean:true` 会清空 `dist/`** —— 前端静态资源必须在 `pnpm --filter server build` **之后**再拷进 `dist/client`，否则被清掉。`build:lambda` 顺序固定为：web build → server build → copy（见 `scripts/copy-web-to-server.mjs`、根脚本 `build:lambda`）。
8b. **`github_repos` 需 `UNIQUE(user_id, repo_id)`** —— 同步采用「先删后插」，并发同账户 sync 会产生重复仓库行、撑大 stats 计数。加复合唯一约束 + insert `onConflictDoNothing` 兜底。
8c. **SPA fallback 必须排除 `/api/*`** —— 否则未匹配的 `GET /api/xxx` 被兜底当页面返回 `index.html`(200)，前端 `res.json()` 解析 HTML 抛 SyntaxError。在 serveStatic 前加 `app.all("/api/*", → 404 json)`。
8d. **手写 migration 的唯一约束前要先去重** —— drizzle 生成的 migration 不含数据级去重；在 `ADD CONSTRAINT UNIQUE` 前手动补 `DELETE ... USING ...`，否则含重复行的库跑 `db:migrate` 会失败回滚（与 ensureSchema 的顺序保持一致）。
8e. **语言占比分母用「有语言的仓库数」** —— 用全部仓库数（含 language=null）作分母会让各语言占比之和 <100%，进度条视觉偏短。

8. **`serveStatic({ root: "./client" })` 相对启动时 cwd** —— Lambda 内 cwd=`/var/task`，故静态目录解析为 `/var/task/client`（CodeUri 内）。本地验证 Hono 自身托管静态时须从 `apps/server/dist/` 目录启动才能命中；日常本地开发走 Vite(5173) proxy，不依赖 Hono 出静态。

### Go 服务上 ECS / PR 预览（作业二）

9. **Go 迁移「一部分」不能只搬读路径** —— Vite 把 `POST /api/github` 抢路由到 Go 后，Go 的 sync 必须与 Node 完全等价（同步仓库 + 返回 `created/reposCount/truncated` + 201/200），否则前端加账户后仓库列表/统计静默为空。迁移接口要么整条对齐、要么别抢路由。
10. **ALB 是多 AZ 资源** —— 主栈原本只有 1 个公有子网，ALB 至少要横跨 2 个 AZ 的公有子网；为此在 `template.yaml` 补了 `PublicSubnet2`（10.0.3.0/24, AZ-c）。
11. **ECS 首次部署的先有鸡问题** —— ECR 尚无镜像时创建 `DesiredCount>0` 的服务会因无法稳定而回滚。先 `DesiredCount=0` 建栈 → 推镜像 → 再置 1。
12. **ECS 角色需独立权限边界** —— 复用 Lambda 边界会因缺 `ecr:*`/`secretsmanager:GetSecretValue` 让任务执行角色失效。新增 `${stack}-ecs-boundary`，并放开部署角色「挂 Lambda 或 ECS 边界之一 + PassRole 给 ecs-tasks」。
13. **ALB → Lambda 目标组** —— `hono/aws-lambda` 的 `handle()` 会自动识别 ALB 事件（`requestContext.elb`），故同一个 Hono Lambda 可同时被 API Gateway 与 ALB 触发；注册 Lambda 目标前必须先建 `AWS::Lambda::Permission`（principal `elasticloadbalancing.amazonaws.com`），用 `DependsOn` 排序，permission 不设 `SourceArn` 以免与目标组循环依赖。
14. **PR 预览用 Postgres 边车做隔离** —— 每个 PR 的 Fargate 任务内跑一次性 `postgres:16-alpine`（`@localhost:5432`），随任务生死，避免预览代码碰生产 Aurora；`go-api` 容器用 `DependsOn: {postgres, HEALTHY}` 等库就绪再冷启动建表。
15. **CloudMap 私有 DNS 不支持 CNAME** —— CNAME 记录只在公有命名空间可用；私有命名空间只能 A/AAAA/SRV。要让内网按名发现 Lambda 只能走 HTTP 命名空间 + DiscoverInstances，或改用 ALB 目标组挂 Lambda。

### 数据流倒置 + Next.js + OpenRouter（对齐架构图）

16. **职责倒置：Lambda 薄代理、Go 唯一连库** —— 为贴合架构图，把 Hono Lambda 改成只做「Basic Auth 校验 + 转发 + OpenRouter」，DATABASE_URL 从 Lambda 移除、安全组删掉 Lambda→RDS 入站（网络层坐实「Lambda 不连库」）。Lambda 经 `GO_API_URL`(Cloud Map 内网 DNS `go-api.<stack>.internal:8080`) 转发；建表由 Go 冷启动 `ensureSchema` 负责。ALB 从生产入口降级为 `Scheme:internal` 的仅测试资源。
17. **Lambda 代理实现** —— `app.all("/api/*")` 用 `fetch` 转发；请求体用 `await c.req.arrayBuffer()` 缓冲再发（跨 API Gateway/ALB 适配器比透传 `ReadableStream`+`duplex:"half"` 稳，反正体积都小）；透传 `Authorization` 头让 Go 二次校验，去掉 `host`/`content-length` 头。
18. **OpenRouter 带模板兜底** —— `generateBio` 无 `OPENROUTER_API_KEY`（或非 2xx/异常）时回退到原模板串；SAM 里 secret 占位 `{"apiKey":""}`，`emptyStringAsUndefined` 让空串视为未配置，直接走模板（不发无谓请求）。填真 key 后需重部署（resolve 是部署期解析）。
19. **Next.js 迁移三个坑** ——（a）pnpm 11.9 起 `package.json` 的 `pnpm.onlyBuiltDependencies` 不再读，构建脚本白名单要写在 `pnpm-workspace.yaml` 的 `allowBuilds:`（`sharp: true`，Next 依赖它），否则 `pnpm run` 前的 deps 检查直接失败；（b）`output:"export"` 下 tsc 对 `import "./globals.css"` 报「找不到副作用模块声明」，加一行 `declare module "*.css";`；（c）`react-router` 的 `NavLink` → `next/link` 的 `Link` + `usePathname`。共享 `packages/ui` 需在 `next.config` 里 `transpilePackages`。

## 线上验证记录（as-built）

- 线上地址：`https://e7qrl1cohh.execute-api.ap-northeast-1.amazonaws.com`
- 已验证：`/health` 200；无凭据 401 / 正确凭据 200；`/api/users` 返回 `[]`（私有子网连库 + 自动建表）；假 token 拿到真实 GitHub 401（经 NAT 出网）；空 token 400。
