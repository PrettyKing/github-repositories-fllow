# AI Ops Agent 运维手册

## 部署前检查

1. 在目标区域确认账号已获准使用 `BedrockFoundationModel`。模型 ID 通过参数传入，不修改代码。
2. 先部署 bootstrap 权限边界，再部署消息、巡检和 Canary 栈，最后部署本栈。
3. 显式传入 `AllowedLogGroups`、`AllowedCanaries`、`AllowedDlqArns`、`AllowedSourceQueueArns` 与 `AllowedDeploymentGroups`。生产环境禁止保留空白或示例值。
4. `AllowedDeploymentGroups` 格式为 `application/deployment-group`。所有 ARN 使用同一账号和区域的完整 ARN。

```bash
pnpm --filter aiops-agent build
sam deploy --template-file infra/aiops.yaml \
  --stack-name github-repositories-fllow-aiops \
  --capabilities CAPABILITY_IAM \
  --parameter-overrides \
    BedrockFoundationModel='<approved-model-id>' \
    AllowedDlqArns='<dlq-arn>' \
    AllowedSourceQueueArns='<source-queue-arn>' \
    AllowedDeploymentGroups='<application/deployment-group>'
```

## 工作方式与安全边界

- CloudWatch 告警进入 `ALARM` 后，五分钟窗口内相同告警只创建一个 Incident。
- Agent 只能读取部署时 allowlist 中的资源。日志最多查询 60 分钟、50 条，并在返回和持久化前脱敏。
- `request_dlq_redrive` 和 `request_rollback` 只创建 `ACTION_PROPOSED`，不会调用恢复 API。
- 审批 API 使用 Lambda Function URL 的 `AWS_IAM` 鉴权，请求必须使用 SigV4。审批主体 ARN会写入 Incident。
- 动作过期、重复审批、状态不匹配、目标不在 allowlist 时均拒绝执行。
- Executor 只接受审批 API 的异步调用，并在执行前重新读取 Incident 和重新校验目标。

## 查看与审批

从 CloudFormation 输出获取 `ApprovalApiUrl`。使用具有 `lambda:InvokeFunctionUrl` 权限的人工运维角色签名请求：

```text
GET  /incidents
GET  /incidents/{incidentId}
POST /incidents/{incidentId}/actions
POST /incidents/{incidentId}/approve
POST /incidents/{incidentId}/reject
```

推荐通过 AWS CLI/SDK SigV4 客户端调用，禁止把 Function URL 改为匿名访问。

## 演练

### DLQ 恢复

1. 使用非生产故障消息触发 DLQ 告警。
2. 确认 Incident 包含真实告警证据，Agent 仅生成 redrive 提案。
3. 检查 DLQ 与源队列 ARN、动作过期时间，然后由人工角色批准。
4. 确认状态依次为 `APPROVED → EXECUTING → RESOLVED`，并验证源队列成功消费。

### Canary 回滚

1. 在非生产 Canary 发布中触发可控 5xx。
2. 检查 Agent 引用的巡检、日志和 CodeDeploy 证据。
3. 只有部署仍属于 allowlist 的 application/deployment-group 时才批准。
4. Executor 调用 `StopDeployment(autoRollbackEnabled=true)`，并记录返回结果。

## 故障处理

- Agent 或 Bedrock 不可用：Incident 标记 `FAILED`，生产 API、SQS 消费和 CodeDeploy 自带告警回滚不受影响。
- 审批返回 `409`：动作已过期、已审批，或 Incident 状态已变化；不要绕过条件更新，重新调查并创建新提案。
- Executor 失败：Incident 标记 `FAILED` 并保存脱敏错误；人工核验 AWS 状态后决定是否开启新 Incident。
- 告警风暴：Orchestrator 并发固定为 2，同一告警按五分钟窗口去重。必要时先处理根告警，不扩大并发。
