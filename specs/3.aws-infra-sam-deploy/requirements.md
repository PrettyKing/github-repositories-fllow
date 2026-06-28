# aws-infra-sam-deploy — 需求规格

## 概述

用 SAM（基础设施即代码）把 Hono 应用部署到 AWS：自建 VPC（1 个公有子网出网 + 2 个私有子网部署 Lambda 与 Aurora），Lambda(Hono) 经 NAT 出网调 GitHub，经私有网络连 Aurora PostgreSQL Serverless v2。对应作业要求 1（部署）与 3（同 VPC、子网划分），区域 `ap-northeast-1`。

## 项目信息

- 项目名: github-repositories-fllow
- 架构类型: AWS Serverless（SAM）+ 自建 VPC

## 需求版本

| 日期       | 版本 | 说明     |
| ---------- | ---- | -------- |
| 2026-06-28 | v1   | 初始需求 |

## 用户故事

- 作为运维，我想用一条 `sam deploy` 拉起全部基础设施，以便环境可复制、可拆除。
- 作为安全负责人，我希望 Lambda 与数据库在同一 VPC 的私有子网，且只有 Lambda 能访问 5432，以便数据库不暴露公网。
- 作为成本负责人，我希望验收后能一条命令删栈释放 NAT/Aurora，以便不留长期计费资源。

## 功能需求

1. [F-001] VPC `10.0.0.0/16`（开启 DNS）+ IGW + 1 个公有子网 `10.0.0.0/24` + 2 个私有子网 `10.0.1.0/24`、`10.0.2.0/24`（跨 2 AZ）。
2. [F-002] NAT 网关（含 EIP）置于公有子网；公有路由表 `0.0.0.0/0→IGW`，私有路由表 `0.0.0.0/0→NAT`，子网关联正确。
3. [F-003] 安全组：Lambda SG 全出网；DB SG 仅允许来自 Lambda SG 的 5432 入站。
4. [F-004] Secrets Manager 自动生成 DB 主密码与 Basic Auth 密码（纯字母数字、不入仓库）。
5. [F-005] Aurora PostgreSQL Serverless v2（0.5–2 ACU）+ DBSubnetGroup（2 私有子网），`DeletionPolicy: Delete` 不留快照。
6. [F-006] Lambda(Hono) 函数：nodejs22.x/arm64/30s/256MB，VpcConfig 入 2 私有子网，挂权限边界，注入 env（DATABASE_URL/SSL、CORS、BASIC_AUTH、NODE_ENV），HttpApi 事件 `/` 与 `/{proxy+}` ANY。
7. [F-007] tsdown 把 Lambda 打成自包含单文件 `apps/server/dist/lambda.mjs`（依赖内联），SAM `CodeUri` 仅打包 dist；`samconfig.toml` 固化 region/stack；Outputs 暴露 `ApiUrl`/`DBEndpoint`/`AuthSecretArn`。

## 非功能需求

- 安全: 数据库无公网入口；凭据走 Secrets Manager 与 `{{resolve:secretsmanager:...}}`；Lambda 角色挂权限边界。
- 成本: Serverless v2 最小 0.5 ACU；NAT/Aurora 可随删栈释放（`DeletionPolicy: Delete`）。
- 可移植: 全部基础设施由 `template.yaml` 描述，单命令可重建；AZ 用 `!GetAZs` 自适应。

## 验收标准

- [ ] [AC-001] `sam validate --lint` 通过；`sam deploy` 在 ap-northeast-1 成功建栈。
- [ ] [AC-002] `/health` 经 API Gateway 返回 200；无凭据 401、正确凭据 200。
- [ ] [AC-003] `/api/users` 返回 `[]`（证明 Lambda 在私有子网连通 Aurora 且自动建表成功）。
- [ ] [AC-004] 用假 token `POST /api/github` 拿到真实 GitHub 401（证明经 NAT 出网成功）。
- [ ] [AC-005] `sam delete` 能删除主栈并释放 NAT/Aurora（无残留快照）。

## 依赖

- 2.hono-api-and-page（产出 `lambda.handler`）
- AWS SAM CLI、AWS 账号与 ap-northeast-1 配额；权限边界 policy 由 4.cicd-oidc-deploy 的 bootstrap 预创建
- tsdown 打包

## 开放问题

- 无（as-built，已线上验证，线上地址 `https://e7qrl1cohh.execute-api.ap-northeast-1.amazonaws.com`）。
