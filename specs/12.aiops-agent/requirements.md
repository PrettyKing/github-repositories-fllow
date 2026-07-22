# aiops-agent — 需求规格

## 概述

在 AWS 上实现面向本项目的 AI Ops Agent：由告警驱动收集限定范围内的运维证据，生成根因和恢复建议，并通过人审流程执行 DLQ redrive 或 Lambda 回滚。

## 需求版本

| 日期 | 版本 | 说明 |
| --- | --- | --- |
| 2026-07-21 | v1 | 初始需求 |

## 用户故事

- 作为运维，我希望告警触发后自动获得指标、日志和部署记录的关联分析。
- 作为负责人，我希望 Agent 的写操作先审批、可追踪、可撤销或可安全重试。

## 功能需求

1. [F-001] EventBridge 接收本项目 CloudWatch Alarm 状态变化，启动 AIOps Orchestrator，并为同一告警窗口去重。
2. [F-002] 使用 Amazon Bedrock Agent 和 Action Group Lambda，提供系统健康、活跃告警、受限日志查询、Canary 运行、DLQ 摘要、最近部署等只读工具。
3. [F-003] Agent 输出结构化 Incident：证据、时间线、根因假设、置信/不确定性、影响范围和建议动作；不得把推断表述为已验证事实。
4. [F-004] DynamoDB 持久化 Incident、工具调用摘要、审批状态和执行结果，并设置合理保留期。
5. [F-005] 支持 `request_dlq_redrive` 和 `request_rollback`，只创建待审批动作；批准后由独立执行角色调用 allowlist API。
6. [F-006] Hono/前端提供受 Basic Auth 保护的 Incident 列表、详情、Agent 对话和审批接口。
7. [F-007] 对 Agent 调用量、错误、延迟、Token 使用和恢复动作建立指标、告警和审计。

## 非功能需求

- 安全: 默认只读；写操作人审；工具参数受 allowlist/时间窗/结果大小约束。
- 可审计: 每次工具调用、审批和执行可关联 Incident ID 与调用主体。
- 隐私: 日志、消息和模型输入先脱敏；不发送 Token、Secret 或完整 DLQ body。
- 可靠性: 告警风暴去重；Agent 失败不能影响生产请求链路。
- 成本: 设置最大工具轮次、日志查询范围、模型 Token 上限和 Incident TTL。

## 验收标准

- [ ] [AC-001] Synthetics/5xx/DLQ 告警能创建且去重 Incident。
- [ ] [AC-002] Agent 能引用真实指标、日志、巡检和部署证据给出结论。
- [ ] [AC-003] 任意 ARN、日志组或 AWS API 请求被工具层拒绝。
- [ ] [AC-004] 未审批动作不能执行；过期、重复或越权审批被拒绝。
- [ ] [AC-005] 批准后的 redrive/rollback 可执行并记录结果。
- [ ] [AC-006] Agent 不可用时生产 API、队列消费和自动回滚仍正常。

## 依赖

- 9.observability-synthetics 的告警和巡检证据。
- 10.event-driven-sns-sqs 的 DLQ、redrive 和事件指标。
- 11.api-canary-release 的 CodeDeploy deployment 与回滚能力。
- 4.cicd-oidc-deploy 的 OIDC 和权限边界。

## 开放问题

- 部署前确认 `ap-northeast-1` 可用的目标 Bedrock 模型及账号模型访问；模型 ID 必须参数化，不能写死到业务代码。

