# aws-infra-sam-deploy — 任务清单

## 任务版本

| 日期       | 版本 | 说明     |
| ---------- | ---- | -------- |
| 2026-06-28 | v1   | 初始任务 |

## 项目信息

- 项目名: github-repositories-fllow
- 架构类型: AWS Serverless（SAM）+ 自建 VPC，ap-northeast-1
- specs 路径: specs/3.aws-infra-sam-deploy/

## 任务列表

### 功能 1: 网络

- [ ] T-001: VPC + IGW + 1 公有子网 + 2 私有子网（跨 2 AZ，`!GetAZs`）~30min
- [ ] T-002: NAT(EIP) + 公有路由表(→IGW) + 私有路由表(→NAT) + 子网关联 ~15min

### 功能 2: 安全组

- [ ] T-003: Lambda SG（全出网）+ DB SG（仅 Lambda SG 来源的 5432 入站），GroupDescription 用英文 ~15min

### 功能 3: 凭据与数据库

- [ ] T-004: DBSecret + AuthSecret（24 位、ExcludePunctuation、用户名模板）~15min
- [ ] T-005: Aurora Serverless v2（DBCluster 0.5–2 ACU + DBInstance + DBSubnetGroup，DeletionPolicy Delete，描述英文）~30min

### 功能 4: 计算与网关

- [ ] T-006: ApiFunction（Globals nodejs22/arm64/30s/256MB、VpcConfig 2 私有子网、权限边界、env 注入、HttpApi `/` 与 `/{proxy+}` ANY）~30min

### 功能 5: 打包与配置

- [ ] T-007: tsdown lambda 自包含打包（noExternal 全内联、external pg-native）+ samconfig.toml + Outputs(ApiUrl/DBEndpoint/AuthSecretArn) ~15min

### 集成与测试

- [ ] T-008: `sam validate --lint` + `sam deploy` 建栈，核验 AC-002~AC-005（health/鉴权/连库/出网/拆栈）~30min

## 依赖关系

- T-002 依赖 T-001
- T-003 依赖 T-001
- T-005 依赖 T-001、T-003、T-004
- T-006 依赖 T-001、T-003、T-004、T-005，且依赖 `2.T-007`（产出 `lambda.handler`）
- T-006 的权限边界依赖 `4.T-002`（boundary policy 须先存在）—— 部署前先跑 4 的 bootstrap
- T-007 依赖 T-006
- T-008 依赖 T-001~T-007

## 风险点

- description 含中文 → 整栈回滚（踩坑记录 1）：所有 RDS/EC2 描述用英文。
- `CORS_ORIGIN="*"` 过不了 `z.url()`（踩坑记录 2）：env 用 union 校验。
- Lambda 私有子网 CI 连不到库（踩坑记录 3）：建表交给运行时 `ensureSchema`，不在 CI 跑 migration。
- 权限边界 policy 未先建 → Lambda 角色创建被拒：先执行 4.cicd-oidc-deploy 的 bootstrap。
- NAT/Aurora 持续计费：验收后 `sam delete` 释放。
