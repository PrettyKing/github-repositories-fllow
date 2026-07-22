# Feature 14: ECS Go Canary Release Requirements

## 目标

对 ECS Fargate Go API 实施真实生产流量 Canary：新 Service Revision 先承接 10% 流量，观察 10 分钟，通过后切换 100%；关键告警触发自动回滚。

## 功能需求

1. [F-001] Hono Lambda 的生产代理流量必须经过 Internal ALB，不能绕过灰度入口直连任务。
2. [F-002] ECS Service 使用原生 `CANARY` 策略、两个 Target Group 和 10%/10 分钟流量配置。
3. [F-003] ALB 5xx 与 Synthetics 完整链路告警参与自动回滚。
4. [F-004] 新旧 Service Revision 在最终切流后共同保留 5 分钟，再终止旧 Revision。
5. [F-005] GitHub Actions 等待部署稳定并输出 ECS Service Deployment 诊断信息。
6. [F-006] 迁移期间保留旧 Cloud Map 直连入口，ECS 稳定后再通过 Lambda Canary 切换代理地址。
7. [F-007] Green Revision 在接收生产 Canary 流量前，必须通过私有 Test Listener 的 `/health` 与带认证 `/api/stats` 主动验证。
8. [F-008] 测试入口不得公网暴露，只允许发布验证 Lambda 的 Security Group 访问；验证失败或超时必须回滚。

## 验收标准

- [ ] [AC-001] 新镜像部署时可观察到 90% Blue / 10% Green 流量权重。
- [ ] [AC-002] 10 分钟无告警后 Green 承接 100% 流量。
- [ ] [AC-003] Green 返回 5xx 时 ECS 自动回滚到 Blue。
- [ ] [AC-004] `/health` 与 `/api/stats` 在正常发布中持续通过。
- [ ] [AC-005] CI 输出最新 Service Deployment ARN、状态、策略、告警状态和目标 Revision。
- [ ] [AC-006] `POST_TEST_TRAFFIC_SHIFT` Hook 只命中 Green Target Group，成功返回 `hookStatus=SUCCEEDED`。
- [ ] [AC-007] Green 的健康或数据库深检失败时 Hook 返回 `FAILED`，生产流量保持在 Blue。
