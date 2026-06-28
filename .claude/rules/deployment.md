# 部署与基础设施规范

## SAM / CloudFormation

- 区域固定 `ap-northeast-1`，栈名 `github-repositories-fllow`（见 `samconfig.toml`）。
- **RDS / EC2 资源的 description / GroupDescription 字段只能用英文 ASCII**——含中文/非 ASCII 会让 CloudFormation 创建失败并整栈回滚（见 LESSONS）。
- 数据库资源 `DeletionPolicy: Delete` + `UpdateReplacePolicy: Delete`，验收后 `sam delete` 不留快照。
- AZ 用 `!Select [n, !GetAZs ""]` 自适应，不硬编码可用区。
- Lambda 必须挂 `PermissionsBoundary`（按名 `${StackName}-lambda-boundary` 引用 bootstrap 栈创建的边界）；缺边界则 CI 部署角色无权创建该 Lambda 角色。

## 构建产物

- Lambda 产物由 tsdown 打成**自包含单文件** `apps/server/dist/lambda.mjs`（`noExternal: [/.*/]`），SAM `CodeUri` 只打包 `dist/`，Lambda 内不装 `node_modules`。
- `external: ["pg-native", "cloudflare:sockets"]`——忽略 pg 的可选原生绑定与非 Node 运行时分支。

## 建表策略

- Lambda 在私有子网，CI 连不到 Aurora：**建表由运行时冷启动 `ensureSchema()` 幂等完成**，不在 CI 跑 migration。
- 改 schema 时 `ensureSchema` 的 DDL 与 drizzle migration `0000` 必须保持一致。

## 部署顺序

1. **先**一次性 bootstrap：`aws cloudformation deploy --stack-name github-oidc-deployer --template-file infra/github-oidc.yaml --capabilities CAPABILITY_NAMED_IAM ...`（建 OIDC Provider + 部署角色 + Lambda 权限边界）。
2. 把输出 `DeployRoleArn` 存入仓库 Secret `AWS_DEPLOY_ROLE_ARN`。
3. **再**部署主栈（`sam deploy` 或 push 触发 workflow）——此时权限边界已存在。

## CI 工作流

- `.github/workflows/deploy.yml`：`permissions: id-token: write`；步骤 install(`--frozen-lockfile`) → `pnpm --filter server build` → OIDC 假设角色 → `sam validate --lint` → `sam deploy`。
- 取 Basic Auth 密码：`aws secretsmanager get-secret-value --region ap-northeast-1 --secret-id <AuthSecretArn> --query SecretString --output text`。
