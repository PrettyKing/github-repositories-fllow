# cicd-oidc-deploy — 任务清单

## 任务版本

| 日期       | 版本 | 说明     |
| ---------- | ---- | -------- |
| 2026-06-28 | v1   | 初始任务 |

## 项目信息

- 项目名: github-repositories-fllow
- 架构类型: GitHub Actions（OIDC）+ AWS IAM（权限边界）+ SAM
- specs 路径: specs/4.cicd-oidc-deploy/

## 任务列表

### 功能 1: OIDC 与部署角色

- [ ] T-001: `infra/github-oidc.yaml` 的 OIDC Provider（可条件复用）+ DeployRole 信任策略（sub 收窄 main/master）+ sam-deploy 内联策略（区域/S3/PassRole/ServiceLinkedRole 收窄）~30min

### 功能 2: 权限边界（防提权）

- [ ] T-002: LambdaPermissionsBoundary ManagedPolicy（封顶 logs+ec2/ENI）+ DeployRole 的 CreateOrModifyBoundedRoles（强制挂边界、限前缀）与 ReadDeleteStackRoles（不授予 DeleteRolePermissionsBoundary）+ Outputs ~15min

### 功能 3: 部署工作流

- [ ] T-003: `.github/workflows/deploy.yml`（push main/master + dispatch、id-token 权限、pnpm/node、install/build、OIDC 假设角色、sam validate + deploy）~30min

### 功能 4: bootstrap 与文档

- [ ] T-004: bootstrap 流程 + `AWS_DEPLOY_ROLE_ARN` secret 配置 + pnpm/tsdown「自己的 JS 工作流」说明（README/docs）~15min

### 集成与测试

- [ ] T-005: 跑通一次 bootstrap 建栈 + push 触发工作流绿灯 + 核验 AC-002/AC-004（分支收窄、强制边界）~30min

## 依赖关系

- T-002 依赖 T-001（同一 bootstrap 模板）
- `3.T-006`（主栈 Lambda 的 `LambdaBoundaryName`）依赖 T-002 先创建边界
- T-003 依赖 `AWS_DEPLOY_ROLE_ARN`（来自 T-001 Output），并依赖 3.aws-infra-sam-deploy 的 `template.yaml`/`samconfig.toml`
- T-005 依赖 T-001~T-004 与 feature 3 全部完成

## 风险点

- 账号已有 GitHub OIDC Provider 时重复创建会失败 → 设 `CreateOidcProvider=false` 复用。
- 边界未先建就部署主栈 → Lambda 角色创建被拒：先跑 bootstrap，再部署主栈。
- sub 条件写错（如用 `*`）会放开所有 ref/PR → 严格列 main/master。
- 删除角色不支持边界条件 → 靠资源前缀约束，且不授予 DeleteRolePermissionsBoundary，边界无法被剥离。
