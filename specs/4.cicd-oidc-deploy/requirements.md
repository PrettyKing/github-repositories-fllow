# cicd-oidc-deploy — 需求规格

## 概述

用 GitHub Actions + AWS OIDC 实现免长期密钥的自动部署：一次性 bootstrap 建 OIDC Provider、部署角色与 Lambda 权限边界；push 到 main/master 触发工作流构建并 `sam deploy`。对应作业要求 4（GitHub Actions + IAM 权限）与 5（自己的 JS 工作流）。

## 项目信息

- 项目名: github-repositories-fllow
- 架构类型: GitHub Actions（OIDC）+ AWS IAM（权限边界）+ SAM

## 需求版本

| 日期       | 版本 | 说明     |
| ---------- | ---- | -------- |
| 2026-06-28 | v1   | 初始需求 |

## 用户故事

- 作为运维，我想 push 到主分支就自动部署，以便无需手动跑 sam。
- 作为安全负责人，我希望 CI 不持有任何长期 AWS 密钥，以便降低泄露风险。
- 作为安全负责人，我希望部署角色即使被滥用也无法提权，以便守住爆炸半径。

## 功能需求

1. [F-001] OIDC Provider（`token.actions.githubusercontent.com`，aud `sts.amazonaws.com`），可条件复用已有 Provider。
2. [F-002] 部署角色 `DeployRole`：信任策略仅允许本仓库 `main`/`master` 分支假设（收窄 `sub`，不放开所有 ref/PR）。
3. [F-003] 部署角色权限按区域 + 资源前缀收窄：区域内服务限 `DeployRegion`；S3 仅 SAM 托管桶；`PassRole` 仅交给 `lambda.amazonaws.com`。
4. [F-004] Lambda 权限边界 ManagedPolicy（封顶 `logs` + `ec2(ENI/描述)`），由 bootstrap（admin）创建；部署角色建/改角色时**强制挂该边界**且限本栈前缀，且无权删除边界——防提权核心。
5. [F-005] 部署工作流 `.github/workflows/deploy.yml`：push main/master 或手动触发 → checkout → pnpm/node → `pnpm install --frozen-lockfile` → `pnpm --filter server build` → OIDC 假设角色 → `sam validate --lint` → `sam deploy`。
6. [F-006] bootstrap 与 secret 配置流程文档化：建栈命令、把 `DeployRoleArn` 存入仓库 Secret `AWS_DEPLOY_ROLE_ARN`、pnpm monorepo + tsdown 的「自己的 JS 工作流」说明（作业要求 5）。

## 非功能需求

- 安全: 仓库不存任何 AccessKey/SecretKey；信任收窄到分支；权限边界 admin 持有、CI 无权改。
- 可复现: bootstrap 为一次性 CloudFormation 栈（免费 IAM 资源，可长期保留）。
- 最小权限: 区域、资源前缀、PassRole 目标服务三重收窄。

## 验收标准

- [ ] [AC-001] `aws cloudformation deploy`（github-oidc.yaml）成功，输出 `DeployRoleArn` 与 `LambdaBoundaryArn`。
- [ ] [AC-002] 非 main/master 分支或其它仓库无法假设 `DeployRole`（sub 条件拒绝）。
- [ ] [AC-003] push 到 main 后工作流绿灯，主栈被部署/更新（无长期密钥）。
- [ ] [AC-004] 部署角色尝试创建未挂边界的角色被拒（`iam:PermissionsBoundary` 条件不满足）。

## 依赖

- 3.aws-infra-sam-deploy（主栈 `template.yaml`；其 `LambdaBoundaryName` 引用本 feature 创建的边界）
- GitHub 仓库 Secret `AWS_DEPLOY_ROLE_ARN`
- aws-actions/configure-aws-credentials、aws-actions/setup-sam、pnpm/action-setup、actions/setup-node

## 开放问题

- 无（as-built，已线上验证）。
