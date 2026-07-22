# event-driven-sns-sqs — 任务清单

## 任务版本

| 日期 | 版本 | 说明 |
| --- | --- | --- |
| 2026-07-21 | v1 | 初始任务 |

## 任务列表

### 功能 1: 基础设施与权限

- [x] T-001: 扩展 bootstrap 的 messaging/consumer 部署权限与 Lambda 权限边界，扩展 ECS boundary 的指定 Topic Publish 能力 ~45min
- [x] T-002: 创建 `infra/messaging.yaml`：Topic、主队列、DLQ、Queue Policy、Subscription、加密、redrive 和 Outputs ~45min
- [x] T-003: 创建 Consumer Lambda、SQS EventSourceMapping、幂等 DynamoDB 表和最小权限角色 ~60min

### 功能 2: 生产与消费

- [x] T-004: 在 Go 中定义 v1 事件、Publisher 接口、SNS 实现和本地 no-op 实现 ~45min
- [x] T-005: 在账户/仓库事务提交后发布事件，加入超时、correlation ID、脱敏日志和失败指标 ~45min
- [x] T-006: 实现 Consumer schema 校验、DynamoDB 幂等、审计指标和 partial batch response ~60min

### 功能 3: 故障演练与部署

- [x] T-007: 增加非生产故障消息发布方式、DLQ Alarm 和 redrive 文档 ~30min
- [ ] T-008: 更新 ECS/CI 参数与部署顺序，完成正常、重复、失败、DLQ、redrive 端到端测试 ~60min

## 依赖关系

- T-002、T-003 依赖 T-001。
- T-004 可与 T-002 并行；T-005 依赖 T-004 和 `7.T-003` 的同步事务。
- T-006 依赖 T-003 和 T-004 的事件契约。
- T-007 依赖 T-002、T-006；T-008 依赖 T-001~T-007。

## 风险点

- 数据提交后 SNS 发布失败可能丢事件 → 指标告警并在 design 明确首版一致性；强一致需求需 outbox。
- Lambda 至少一次消费会产生重复 → DynamoDB 条件写入必须先于副作用。
- VisibilityTimeout 小于函数执行时间会并发重复 → 模板中按 Lambda timeout 留足余量。
