# cicd-oidc-deploy — 技术设计

## 设计版本

| 日期       | 版本 | 说明     |
| ---------- | ---- | -------- |
| 2026-06-28 | v1   | 初始设计 |

## 项目架构

- 架构类型: GitHub Actions（OIDC 免密钥）+ AWS IAM（部署角色 + 权限边界）+ SAM
- 涉及层: IAM（OIDC Provider / Role / ManagedPolicy）、CI（GitHub Actions workflow）、构建（pnpm monorepo + tsdown）
- 文件: `infra/github-oidc.yaml`、`.github/workflows/deploy.yml`、`samconfig.toml`、`apps/server/tsdown.config.ts`

> 设计目标：仓库零长期密钥 + 防提权。bootstrap 栈与主栈分离——边界由 admin 持有，CI 部署角色只能用、不能改。

## 功能模块设计

### 模块 1: OIDC Provider（F-001）

`infra/github-oidc.yaml` 的 `GitHubOidcProvider`（`AWS::IAM::OIDCProvider`）：Url `token.actions.githubusercontent.com`，ClientId `sts.amazonaws.com`，保留指纹兼容旧区域。`CreateOidcProvider=false` 时复用账号已有 Provider（`Condition: ShouldCreateOidcProvider`）。

### 模块 2: 部署角色与信任（F-002 / F-003）

`DeployRole`（RoleName `${GitHubRepo}-github-deployer`）：

- 信任策略 `sts:AssumeRoleWithWebIdentity`，`aud=sts.amazonaws.com`，`sub` `StringLike` 仅 `repo:${Org}/${Repo}:ref:refs/heads/main|master`。
- 内联策略 `sam-deploy`：
  - `RegionalServices`：`cloudformation/lambda/apigateway/ec2/rds/secretsmanager/logs:*`，`Condition aws:RequestedRegion = DeployRegion`。
  - `SamArtifactBucket`：`s3:*` 限 `aws-sam-cli-managed-*`。
  - `PassRoleToLambda`：`iam:PassRole` 限本栈前缀角色且 `PassedToService=lambda.amazonaws.com`。
  - `ServiceLinkedRoles`：`iam:CreateServiceLinkedRole`（RDS 等首用需要）。

### 模块 3: 权限边界与防提权（F-004）

- `LambdaPermissionsBoundary`（ManagedPolicy，名 `${DeployStackName}-lambda-boundary`）：仅 `logs:Create*/PutLogEvents` + `ec2` 的 ENI 增删查与 Describe 子网/VPC/SG。
- 部署角色的 `CreateOrModifyBoundedRoles`：`iam:CreateRole/PutRolePolicy/...PutRolePermissionsBoundary`，Resource 限 `role/${DeployStackName}-*`，**Condition `iam:PermissionsBoundary = LambdaPermissionsBoundary`**（建角色必须挂边界）。
- `ReadDeleteStackRoles`：读/删/打标限本栈前缀；**未授予 `DeleteRolePermissionsBoundary`**，故边界无法被剥离。
- 主栈 `template.yaml` 的 Lambda 用 `LambdaBoundaryName` 按名引用该边界（跨栈解耦）。

### 模块 4: 部署工作流（F-005）

`.github/workflows/deploy.yml`：`on push [main,master] + workflow_dispatch`；`permissions: id-token:write, contents:read`；`env AWS_REGION=ap-northeast-1`。Steps：checkout → `pnpm/action-setup@v4`(11.9.0) → `setup-node@v4`(22, cache pnpm) → `pnpm install --frozen-lockfile` → `pnpm --filter server build` → `configure-aws-credentials@v4`(role-to-assume `secrets.AWS_DEPLOY_ROLE_ARN`) → `setup-sam@v2` → `sam validate --lint` → `sam deploy --no-confirm-changeset --no-fail-on-empty-changeset`。

### 模块 5: bootstrap 与 JS 工作流（F-006）

- bootstrap 命令：`aws cloudformation deploy --stack-name github-oidc-deployer --capabilities CAPABILITY_NAMED_IAM --template-file infra/github-oidc.yaml --parameter-overrides GitHubOrg=<user> GitHubRepo=github-repositories-fllow`。
- 把 Output `DeployRoleArn` 存入仓库 Secret `AWS_DEPLOY_ROLE_ARN`。
- 「自己的 JS 工作流」（作业要求 5）：pnpm workspace（`apps/*`、`packages/*`）+ tsdown 把 Lambda 打成自包含 `lambda.mjs`，CI 复用同一构建脚本 `pnpm --filter server build`。

## 接口契约

- bootstrap Parameters：`GitHubOrg`、`GitHubRepo`、`DeployRegion`、`DeployStackName`、`CreateOidcProvider`。
- bootstrap Outputs：`DeployRoleArn`、`LambdaBoundaryArn`。
- 工作流读取 Secret：`AWS_DEPLOY_ROLE_ARN`。

## 数据模型

无数据表；IAM 资源拓扑：OIDCProvider → DeployRole（信任收窄）+ LambdaPermissionsBoundary（封顶）。

## 安全考虑

- 零长期密钥：CI 临时假设角色，仓库不存 AccessKey/SecretKey。
- 信任收窄到 main/master，拒绝其它 ref/PR/仓库。
- 防提权：建角色强制挂边界 + 无权删边界 + 资源前缀 + PassRole 限 lambda。

## 技术决策

| 决策 | 选项 | 理由 |
| ---- | ---- | ---- |
| OIDC vs 长期密钥 | OIDC | 仓库零密钥，降低泄露面 |
| 权限边界跨栈引用 | bootstrap 建、主栈按名用 | admin 持边界、CI 无权改，防提权 |
| sub 收窄到分支 | main/master | 不放开所有 ref/PR |
| 区域 + 前缀 + PassRole 三收窄 | 最小权限 | 缩小爆炸半径 |
| bootstrap 独立栈 | 一次性、免费 IAM | 与主栈生命周期解耦，可长期保留 |
