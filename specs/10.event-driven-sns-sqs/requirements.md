# event-driven-sns-sqs — 需求规格

## 概述

在 GitHub 账户/仓库同步成功后发布无敏感信息的领域事件，通过 SNS、SQS、Consumer Lambda 和 DLQ 实现异步解耦、失败隔离与可控重放。

## 需求版本

| 日期 | 版本 | 说明 |
| --- | --- | --- |
| 2026-07-21 | v1 | 初始需求 |

## 用户故事

- 作为开发者，我希望同步完成后的统计/审计处理与主请求解耦。
- 作为运维，我希望失败消息进入 DLQ 并可在修复后安全重放。

## 功能需求

1. [F-001] 定义版本化 `GitHubUserSynced` 事件，包含 `eventId/correlationId/userId/githubId/username/reposCount/created/occurredAt`，禁止包含 GitHub Token 和任何凭据。
2. [F-002] Go API 在数据库事务成功后向 SNS 发布事件；发布失败不回滚已提交业务数据，但必须记录脱敏错误、指标和 correlation ID。
3. [F-003] SNS Topic 通过受限 Subscription 投递到 SQS 主队列，Queue Policy 只允许指定 Topic 发送。
4. [F-004] Consumer Lambda 批量消费 SQS，按 `eventId` 幂等处理，输出审计日志/自定义指标，并启用 partial batch response。
5. [F-005] 主队列处理失败超过 3 次进入 DLQ；主队列保留 4 天，DLQ 保留 14 天，并限制允许的源队列。
6. [F-006] DLQ 有消息时触发 CloudWatch Alarm；提供受控测试故障和 redrive 操作说明。

## 非功能需求

- 安全: 消息和日志不含 Token/Secret；队列启用服务端加密；IAM 按 Topic/Queue 收窄。
- 可靠性: Standard Topic/Queue，消费至少一次，业务通过幂等抵抗重复。
- 可追踪性: API、SNS 消息、Consumer 日志共享 correlation ID。
- 性能: 发布事件不显著增加同步接口延迟，Consumer 支持批处理。

## 验收标准

- [ ] [AC-001] 成功同步后 SNS/SQS 收到符合契约且不含 Token 的事件。
- [ ] [AC-002] 正常消息被 Consumer 处理并产生指标/审计日志。
- [ ] [AC-003] 重复 `eventId` 不产生重复副作用。
- [ ] [AC-004] 故障消息处理 3 次后进入 DLQ 并触发告警。
- [ ] [AC-005] 修复故障后 redrive 成功，消息被正常消费。

## 依赖

- 4.cicd-oidc-deploy 的 OIDC、权限边界和部署工作流。
- 6.github-repos-collection、7.user-dedup-refresh 的同步事务与响应数据。
- 9.observability-synthetics 的告警 Topic 可选复用。

## 开放问题

- 第一版 Consumer 仅做审计和指标；未来新增通知/分析消费者时通过 SNS fan-out 扩展，不修改生产者契约。

