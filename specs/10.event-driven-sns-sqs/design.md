# event-driven-sns-sqs — 技术设计

## 设计版本

| 日期 | 版本 | 说明 |
| --- | --- | --- |
| 2026-07-21 | v1 | 初始设计 |

## 项目架构

- 涉及文件: `apps/go-api/internal/events/*`、`apps/go-api/internal/handler/github_user.go`、`apps/event-consumer/*`、`infra/messaging.yaml`、`infra/ecs-fargate.yaml`、`infra/github-oidc.yaml`。
- 数据流: Go API → SNS → SQS → Consumer Lambda → DLQ。

## 功能模块设计

### 模块 1: 事件生产（F-001 / F-002）

Go 定义显式版本化事件结构。`SyncUserAndRepos` 成功提交后由 handler/service 层发布事件，避免在数据库事务内等待外部服务。SNS Topic ARN 由环境变量注入；本地未配置时使用 no-op publisher，便于开发。

发布采用有限超时，错误日志只记录 `eventId/correlationId` 和错误类别。鉴于缺少 outbox 表，第一版采用“数据库成功、事件尽力发布”的一致性模型，并以 `EventPublishFailures` 指标告警；如后续要求不丢事件，再单独引入 transactional outbox。

### 模块 2: 消息基础设施（F-003 / F-005）

- Standard SNS Topic 和 Standard SQS Queue。
- Queue Policy 条件 `aws:SourceArn` 绑定唯一 Topic。
- 主队列 VisibilityTimeout 大于 Consumer Lambda 超时，RedrivePolicy `maxReceiveCount: 3`。
- DLQ RedriveAllowPolicy 只允许主队列；DLQ retention 14 天，长于主队列 4 天。
- Topic 到 Queue 使用原始消息投递，避免额外 SNS envelope；消息属性包含 `eventType/eventVersion`。

### 模块 3: Consumer 与幂等（F-004）

Consumer 校验事件 schema/version，支持 SQS partial batch failure。幂等记录使用 DynamoDB 表，以 `eventId` 为主键并设置 TTL；首次处理条件写入，重复消息记指标后视为成功。成功处理输出结构化审计日志和自定义指标。

### 模块 4: 故障与恢复（F-006）

测试发布脚本可构造 `testMode=force-consumer-failure`，仅在非生产参数启用时生效。DLQ 可见消息数大于 0 触发告警。Redrive 由 AWS 控制面或 12 的审批动作执行，初始速度从低值开始。

## 接口契约

事件契约以 `eventVersion=1` 固定字段为准；消费者遇到未知版本必须失败并进入 DLQ，不能静默丢弃。

## 安全考虑

- Producer 在构造事件时使用 allowlist 字段，不对请求 body 做透传序列化。
- Queue 使用服务端加密；Consumer 不在日志输出完整 message body。
- ECS Task Role 仅有指定 Topic 的 `sns:Publish`。

## 技术决策

| 决策 | 选项 | 理由 |
| --- | --- | --- |
| Topic/Queue 类型 | Standard | 本场景允许至少一次和无严格顺序，吞吐与扩展更简单 |
| Token 入队 | 禁止 | 延续一次性透传、不持久化安全约束 |
| 幂等存储 | DynamoDB + TTL | 适合按 eventId 条件写入，无需让 Consumer 连接 Aurora |
| 一致性 | 首版尽力发布 | 控制范围；通过指标显式暴露丢事件风险，outbox 留作增强 |

