# Feature 14: ECS Go Canary Release Design

## 架构

```text
API Gateway -> Hono Lambda -> go-api-alb.<stack>.internal
  -> Internal ALB Production Listener :80
     -> Blue Target Group (90%)
     -> Green Target Group (10%)
  -> ECS Fargate Go API -> Aurora

ECS POST_TEST_TRAFFIC_SHIFT -> Validation Lambda (private subnet)
  -> Internal ALB Test Listener :8081 -> Green Target Group only
  -> GET /health + authenticated GET /api/stats
```

使用 Amazon ECS 原生 `CANARY` Deployment Strategy，Deployment Controller 保持 `ECS`。ECS Infrastructure Role 挂载 AWS 托管的 Load Balancer 策略，并受项目 ECS permissions boundary 限制。

## Green 主动验证

- ECS 将测试流量规则切到 Green 后，在 `POST_TEST_TRAFFIC_SHIFT` 调用 Lambda Hook。
- Hook 从 Secrets Manager 读取现有 Basic Auth 密码，经内网测试 Listener 依次请求 `/health` 与 `/api/stats`。
- 两个接口都返回 200 才返回 `{ "hookStatus": "SUCCEEDED" }`；失败或 2 分钟超时返回/触发回滚。
- 8081 测试 Listener 仅允许 Hook Security Group 访问；浏览器、Hono Lambda 和公网均不能访问。
- 生产 Synthetics 仍每分钟检查公网完整链路，负责真实用户视角；Hook 负责确定性命中 Green，两者职责互补。

## 无中断迁移

现有 Lambda 通过 `go-api.<stack>.internal:8080` 直连 Cloud Map。为避免基础设施升级中断：

1. 保留原 Cloud Map Service 和旧 DNS。
2. 新增 `go-api-alb.<stack>.internal` Route 53 Alias 指向 Internal ALB。
3. 先完成双 Target Group 和 ECS Canary 部署。
4. ECS 稳定后再次部署主栈，通过 Lambda 自身的 10% Canary 修改 `GO_API_URL`。
5. 旧 DNS 继续作为紧急回退入口，仅 Lambda Security Group 可访问。

## 告警与回滚

- `HTTPCode_Target_5XX_Count >= 1`
- `HTTPCode_ELB_5XX_Count >= 1`
- 可用时加入 `prod-api-journey` Synthetics SuccessPercent Alarm

ECS Deployment Alarms 设置 `Enable=true`、`Rollback=true`。

## 部署参数

| 参数 | 值 |
| --- | --- |
| Strategy | `CANARY` |
| CanaryPercent | `10` |
| CanaryBakeTimeInMinutes | `10` |
| BakeTimeInMinutes | `5` |
| MinimumHealthyPercent | `100` |
| MaximumPercent | `200` |
