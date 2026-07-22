# api-canary-release — 需求规格

## 概述

使用 Lambda Version/Alias、AWS CodeDeploy 和 SAM DeploymentPreference 对 Hono API Lambda 实施 10% Canary 灰度，结合 Pre/Post Hook 与 CloudWatch Alarm 自动终止或回滚故障版本。

## 需求版本

| 日期 | 版本 | 说明 |
| --- | --- | --- |
| 2026-07-21 | v1 | 初始需求 |

## 用户故事

- 作为发布负责人，我希望先让少量流量进入新版本，降低全量发布风险。
- 作为运维，我希望关键指标恶化时自动回滚，无需等待人工发现。

## 功能需求

1. [F-001] Hono Lambda 开启自动版本发布和稳定别名 `live`，API Gateway 始终调用别名而非 `$LATEST`。
2. [F-002] 使用 `Canary10Percent10Minutes`：10% 观察 10 分钟，通过后切到 100%。
3. [F-003] PreTraffic Hook 验证候选版本；PostTraffic Hook 验证全量切换后的服务。
4. [F-004] 部署组关联 Lambda Alias Errors、API 5xx 和 Synthetics 完整链路告警；任一告警触发自动停止并回滚。
5. [F-005] GitHub Actions 等待 CodeDeploy 最终状态，失败时输出 deployment ID 和诊断入口并使 workflow 失败。
6. [F-006] 提供可控故障版本演练，验证 10% 切流、自动回滚和稳定版本恢复。

## 非功能需求

- 发布安全: 不直接更新 `$LATEST` 生产流量；Hook 使用最小权限且有超时。
- 可观测性: 每次发布能关联 commit SHA、Lambda version 和 CodeDeploy deployment ID。
- 兼容性: 不改变 API 契约和 Cloudflare 前端地址。

## 验收标准

- [ ] [AC-001] 正常版本按 10%→100% 完成发布。
- [ ] [AC-002] PreTraffic 失败时不向候选版本切入生产流量。
- [ ] [AC-003] 观察窗内触发关键 Alarm 时自动回滚。
- [ ] [AC-004] 回滚后 `/health`、`/api/stats` 和 Synthetics 恢复。
- [ ] [AC-005] GitHub Actions 准确反映 CodeDeploy 成功或失败。

## 依赖

- 4.cicd-oidc-deploy 的部署角色和 Lambda 权限边界。
- 9.observability-synthetics 的关键告警与 1 分钟巡检。
- 3.aws-infra-sam-deploy 的 `ApiFunction` 和 HTTP API。

## 开放问题

- ECS Go API 仍采用 rolling deployment；ECS 蓝绿不属于本 feature。

