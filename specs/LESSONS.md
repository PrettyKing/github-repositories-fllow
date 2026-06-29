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

## 线上验证记录（as-built）

- 线上地址：`https://e7qrl1cohh.execute-api.ap-northeast-1.amazonaws.com`
- 已验证：`/health` 200；无凭据 401 / 正确凭据 200；`/api/users` 返回 `[]`（私有子网连库 + 自动建表）；假 token 拿到真实 GitHub 401（经 NAT 出网）；空 token 400。
