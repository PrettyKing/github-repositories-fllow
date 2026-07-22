# aiops-agent — 技术设计

## 设计版本

| 日期 | 版本 | 说明 |
| --- | --- | --- |
| 2026-07-21 | v1 | 初始设计 |

## 项目架构

- 涉及文件: `infra/aiops.yaml`、`apps/aiops-agent/*`、`apps/server/src/ops.ts`、`apps/web/app/ops/*`、`infra/github-oidc.yaml`。
- 数据流: Alarm → EventBridge → Orchestrator → Bedrock Agent → Action Lambda → Incident DynamoDB → SNS/UI。

## 功能模块设计

### 模块 1: Incident 编排（F-001 / F-004）

EventBridge Rule 只匹配本项目前缀的 CloudWatch Alarm。Orchestrator 以 `alarmArn + stateChangeTime bucket` 作为幂等键，条件写入 Incident 表，收集基础上下文后调用 Agent。告警风暴通过幂等键、保留窗口和并发限制抑制。

Incident 状态：`OPEN → INVESTIGATING → ACTION_PROPOSED → APPROVED/REJECTED → EXECUTING → RESOLVED/FAILED`。所有状态转换使用条件更新，避免重复审批和重复执行。

### 模块 2: Bedrock Agent 与工具（F-002 / F-003）

Action Group Lambda 采用函数定义，首版工具：

- `get_system_health`
- `get_active_alarms`
- `query_service_logs`
- `get_canary_runs`
- `inspect_dlq`
- `get_recent_deployments`
- `request_dlq_redrive`
- `request_rollback`

工具层不接受任意资源 ARN：环境配置中维护 Stack/Alarm/LogGroup/Queue/DeploymentGroup allowlist。Logs 查询限制时间范围、返回行数和扫描字节；DLQ 只返回脱敏摘要。Agent 提示词要求明确区分 evidence、hypothesis 和 unknown。

### 模块 3: 审批与执行（F-005）

建议动作写入 Incident 表并生成不可预测的 action ID。审批接口要求 Basic Auth，记录审批主体和过期时间。Executor 使用独立角色，仅允许：指定 DLQ 的 `StartMessageMoveTask`，或指定 CodeDeploy/Lambda 发布资源的受控回滚流程。

执行前再次校验 Incident 状态、动作类型、目标 allowlist、有效期和幂等键。高风险动作不允许由 Agent Action Lambda 直接执行。

### 模块 4: API/UI 与 Agent 自监控（F-006 / F-007）

Hono 新增 `/api/ops/incidents`、`/api/ops/incidents/:id`、`/api/ops/chat`、`/api/ops/actions/:id/approve|reject`，继续受现有 Basic Auth。数据读写通过独立 Ops Lambda/API 或 AWS SDK 完成，不让 Hono Lambda 获得广泛运维权限。

前端 `/ops` 展示健康摘要、Incident 时间线、证据、建议动作和审批按钮。Agent 自身指标包含调用次数、失败、耗时、Token、工具错误和动作执行结果。

## 数据模型

Incident 表主键 `incidentId`，索引支持按状态和创建时间查询；字段包含 alarm、evidence、hypotheses、timeline、proposedActions、approval、executionResult、expiresAt。大日志不存表，只存脱敏摘要和 CloudWatch deep link。

## 安全考虑

- Bedrock/Action/Executor/Orchestrator 使用四个职责分离角色并挂权限边界。
- 模型输入和持久化前统一脱敏；提示词不作为权限控制，权限由工具代码和 IAM 双重限制。
- 对话输入按不可信数据处理，防止日志内容或 DLQ 内容中的 prompt injection 驱动写操作。

## 技术决策

| 决策 | 选项 | 理由 |
| --- | --- | --- |
| Agent 平台 | Amazon Bedrock Agent | 满足 AWS 必做并原生支持 Lambda Action Group |
| 事故触发 | EventBridge Alarm 事件 | 与生产链路解耦、可重试 |
| 写操作 | 人审 + 独立 Executor | 降低模型误判和提示注入风险 |
| Incident 存储 | DynamoDB + TTL | 无需数据库网络连接，适合状态机条件更新 |
| 诊断结果 | 证据/假设/未知分离 | 避免将模型推断包装成事实 |

