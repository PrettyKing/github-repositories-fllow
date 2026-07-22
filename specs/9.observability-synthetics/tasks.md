# observability-synthetics — 任务清单

## 任务版本

| 日期 | 版本 | 说明 |
| --- | --- | --- |
| 2026-07-21 | v1 | 初始任务 |

## 任务列表

### 功能 1: 权限与巡检

- [x] T-001: 扩展 `infra/github-oidc.yaml`，增加观测栈部署权限、Canary 执行角色权限边界和最小权限策略 ~45min
- [x] T-002: 创建 `synthetics/api-journey.js`，实现 `/health` 浅层检查和带 Secret 鉴权的 `/api/stats` 深层检查、脱敏错误处理 ~45min
- [x] T-003: 创建 `infra/observability.yaml` 的 artifact Bucket、Canary、执行角色和 Schedule ~45min

### 功能 2: 告警与可视化

- [x] T-004: 创建 SuccessPercent/Duration/API 5xx/Lambda Errors 告警和 `OpsAlertTopic` ~30min
- [x] T-005: 创建 CloudWatch Dashboard，接入关键巡检与服务指标 ~30min

### 集成与测试

- [x] T-006: 更新部署工作流和部署文档，保证 bootstrap → 主栈/ECS → observability 顺序 ~30min
- [ ] T-007: 完成正常、ECS 不可达、恢复三阶段演练，核验通知、产物脱敏和 AC-001~AC-005 ~45min

## 依赖关系

- T-002、T-003 依赖 T-001。
- T-004、T-005 依赖 T-003。
- T-006 依赖 T-001~T-005。
- T-007 依赖 T-006 和现有 ECS 生产链路。

## 风险点

- 仅检查 `/health` 会产生假健康 → 必须保留 `/api/stats` 深层检查。
- 邮件订阅未确认不会收到通知 → 验收清单显式检查订阅状态。
- 1 分钟巡检会产生持续费用 → 验收后允许通过参数停用 Schedule，不删除定义。
