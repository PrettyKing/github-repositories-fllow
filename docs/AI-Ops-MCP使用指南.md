# AI Ops MCP 使用指南

## 1. 组件定位

`apps/aiops-mcp` 是供 Codex、Claude Desktop 等 MCP Client 调用的本地 AWS 运维工具服务。它通过 `stdio` 通信，没有 Web 页面、HTTP Server 或固定端口。

| 组件 | 用途 |
| --- | --- |
| AI Ops Console | 管理员在浏览器查看监控、日志、Canary、DLQ、部署和 Incident |
| AI Ops MCP | 让本地 Agent 使用自然语言查询项目限定的 AWS 运维数据 |
| AI Ops Agent | 在 AWS 中分析告警、生成 Incident 和处理建议 |
| Approval API | 接收 DLQ 重放、发布回滚申请，等待人工审批 |

调用链路：

```text
用户向 Codex / Claude 提问
  -> Agent 调用本地 AI Ops MCP
  -> MCP 使用本地 AWS Profile 的临时凭据
  -> 查询 CloudWatch / Synthetics / SQS / CodeDeploy / DynamoDB
  -> MCP 返回经过限制和脱敏的结果
  -> Agent 汇总故障原因与处理建议
```

MCP 不会把 AWS 凭据发送给模型。恢复类工具也不会直接修改生产资源，只会创建 `PENDING_APPROVAL` 审批申请。

## 2. MCP 工具

| 工具 | 权限 | 说明 |
| --- | --- | --- |
| `aws_get_system_health` | 只读 | 返回当前区域、资源 allowlist 和安全边界 |
| `aws_get_active_alarms` | 只读 | 查询项目范围内的活跃 CloudWatch 告警 |
| `aws_query_logs` | 只读 | 查询 allowlist 内的日志组，最多回溯 60 分钟、返回 50 条 |
| `aws_get_canary_runs` | 只读 | 查询指定 Synthetics Canary 最近执行结果 |
| `aws_inspect_dlq` | 只读 | 查询 DLQ 可见和处理中消息数量，不读取消息正文 |
| `aws_get_deployments` | 只读 | 查询指定 CodeDeploy 应用/部署组最近 24 小时的发布 |
| `aws_get_incident` | 只读 | 根据 Incident ID 查询 DynamoDB 中的事故详情 |
| `aws_request_dlq_redrive` | 待审批 | 创建 DLQ 重放申请，不直接移动消息 |
| `aws_request_rollback` | 待审批 | 创建发布回滚申请，不直接停止或回滚部署 |

## 3. 环境准备

### 3.1 安装依赖和构建

在仓库根目录执行：

```bash
pnpm install
pnpm --filter aiops-mcp build
pnpm --filter aiops-mcp check-types
pnpm --filter aiops-mcp test
```

构建产物位于：

```text
apps/aiops-mcp/dist/index.js
```

### 3.2 AWS 身份

推荐使用独立的 AWS SSO 只读 Profile，不要为 MCP 保存长期 Access Key：

```bash
aws configure sso --profile github-follow-readonly
aws sso login --profile github-follow-readonly
aws sts get-caller-identity --profile github-follow-readonly
```

当前开发机只有 `default` Profile 时可以临时配置：

```dotenv
AWS_PROFILE=default
```

生产使用建议切换为：

```dotenv
AWS_PROFILE=github-follow-readonly
```

只读 Profile 至少需要以下查询权限，并应按本项目资源进一步收窄：

- `cloudwatch:DescribeAlarms`
- `logs:FilterLogEvents`
- `synthetics:GetCanaryRuns`
- `sqs:GetQueueAttributes`
- `codedeploy:ListDeployments`
- `dynamodb:GetItem`

如果需要创建恢复审批申请，还需要对 Approval Lambda Function URL 具有 `lambda:InvokeFunctionUrl` 权限。

## 4. 当前生产资源配置

创建 `apps/aiops-mcp/.env`，不要提交该文件：

```dotenv
AWS_REGION=ap-northeast-1
AWS_PROFILE=default

AIOPS_INCIDENT_TABLE=github-repositories-fllow-aiops-IncidentTable-19A9X01EGD7O3
AIOPS_ACTION_API_URL=https://txd33x6e4wrpm4qlf2d6qrl34e0oxpmm.lambda-url.ap-northeast-1.on.aws

AIOPS_ALLOWED_ALARMS=github-repositories-fllow-api-5xx,github-repositories-fllow-api-alias-errors
AIOPS_ALARM_PREFIXES=github-repositories-fllow-,prod-api-

AIOPS_ALLOWED_LOG_GROUPS=/aws/lambda/github-repositories-fllow-ApiFunction-SPETtBq3PqWH,/aws/lambda/github-repositories-fllow-event-consumer
AIOPS_ALLOWED_CANARIES=prod-api-journey

AIOPS_ALLOWED_DLQ_ARNS=arn:aws:sqs:ap-northeast-1:151484827428:github-repositories-fllow-github-events-dlq
AIOPS_ALLOWED_SOURCE_QUEUE_ARNS=arn:aws:sqs:ap-northeast-1:151484827428:github-repositories-fllow-github-events

AIOPS_ALLOWED_DEPLOYMENT_GROUPS=github-repositories-fllow-ServerlessDeploymentApplication-1EpBzBcpm5zD/github-repositories-fllow-ApiFunctionDeploymentGroup-hywoRoXb0Hos
```

这些值是资源 allowlist，不是机密。AWS 密钥、Session Token、数据库密码和 GitHub Token 不得写入 `.env` 或 MCP Client 配置。

## 5. 启动方式

开发模式：

```bash
pnpm --filter aiops-mcp dev
```

构建后启动：

```bash
pnpm --filter aiops-mcp build
pnpm --filter aiops-mcp start
```

启动后终端没有页面、URL 或交互提示属于正常现象。MCP 正在等待 Client 通过 stdin/stdout 发送协议消息，不要在该终端直接输入自然语言。

实际使用时一般由 Codex 或 Claude Desktop 自动启动 MCP 进程，不需要手动长期运行以上命令。

## 6. MCP Client 配置

通用 MCP 配置：

```json
{
  "mcpServers": {
    "github-follow-aiops": {
      "command": "node",
      "args": [
        "/Users/chalee/Desktop/JCYD-36/github-repositories-fllow/apps/aiops-mcp/dist/index.js"
      ],
      "env": {
        "AWS_PROFILE": "default",
        "AWS_REGION": "ap-northeast-1",
        "AIOPS_INCIDENT_TABLE": "github-repositories-fllow-aiops-IncidentTable-19A9X01EGD7O3",
        "AIOPS_ACTION_API_URL": "https://txd33x6e4wrpm4qlf2d6qrl34e0oxpmm.lambda-url.ap-northeast-1.on.aws",
        "AIOPS_ALLOWED_ALARMS": "github-repositories-fllow-api-5xx,github-repositories-fllow-api-alias-errors",
        "AIOPS_ALARM_PREFIXES": "github-repositories-fllow-,prod-api-",
        "AIOPS_ALLOWED_LOG_GROUPS": "/aws/lambda/github-repositories-fllow-ApiFunction-SPETtBq3PqWH,/aws/lambda/github-repositories-fllow-event-consumer",
        "AIOPS_ALLOWED_CANARIES": "prod-api-journey",
        "AIOPS_ALLOWED_DLQ_ARNS": "arn:aws:sqs:ap-northeast-1:151484827428:github-repositories-fllow-github-events-dlq",
        "AIOPS_ALLOWED_SOURCE_QUEUE_ARNS": "arn:aws:sqs:ap-northeast-1:151484827428:github-repositories-fllow-github-events",
        "AIOPS_ALLOWED_DEPLOYMENT_GROUPS": "github-repositories-fllow-ServerlessDeploymentApplication-1EpBzBcpm5zD/github-repositories-fllow-ApiFunctionDeploymentGroup-hywoRoXb0Hos"
      }
    }
  }
}
```

配置完成后重启 MCP Client。Client 应显示 `github-follow-aiops` Server 以及 9 个可调用工具。

如果改用 SSO，把 `AWS_PROFILE` 改成 `github-follow-readonly`，并在启动 Client 前完成：

```bash
aws sso login --profile github-follow-readonly
```

## 7. 使用示例

### 7.1 完整系统巡检

向 Agent 提问：

```text
使用 github-follow-aiops MCP 检查当前系统健康状态，包括活跃告警、
Canary、DLQ 和最近发布。先调用系统健康工具确认 allowlist，不要执行任何写操作。
```

推荐调用顺序：

1. `aws_get_system_health`
2. `aws_get_active_alarms`
3. `aws_get_canary_runs`
4. `aws_inspect_dlq`
5. `aws_get_deployments`

### 7.2 查询 Lambda 日志

```text
查询最近 30 分钟 API Lambda 日志，最多返回 30 条，
分析是否存在 5xx、超时或数据库连接错误。
```

对应参数示例：

```json
{
  "logGroup": "/aws/lambda/github-repositories-fllow-ApiFunction-SPETtBq3PqWH",
  "minutes": 30,
  "limit": 30
}
```

### 7.3 查询 Canary

```text
查询 prod-api-journey 最近的 Canary 运行结果，
说明最近一次成功或失败时间，并判断巡检是否稳定。
```

### 7.4 检查 DLQ

```text
检查项目 DLQ 当前可见消息和处理中消息数量，不要读取消息正文。
```

### 7.5 查询灰度发布

```text
查询最近 24 小时 CodeDeploy 发布，找出失败、停止或仍在进行的部署。
```

### 7.6 查询 Incident

```text
查询 Incident inc-example-001，结合告警、日志、Canary 和最近发布给出根因分析。
```

Incident ID 只允许字母、数字、下划线和连字符，长度不超过 128。

### 7.7 创建回滚申请

```text
针对 Incident inc-example-001 创建发布回滚申请，
原因是新版本发布后错误率持续升高。只创建审批申请，不要直接执行。
```

工具需要：

- `incidentId`
- allowlist 内的 `deploymentGroup`
- `deploymentId`
- 10～500 字符的申请原因
- 8～128 字符且稳定唯一的幂等键

正确结果必须是：

```json
{
  "status": "PENDING_APPROVAL"
}
```

如果 API 返回其他状态，MCP 会拒绝把它当成成功申请。

### 7.8 创建 DLQ 重放申请

```text
针对 Incident inc-example-002 创建 DLQ 重放申请，
将项目 DLQ 中的消息恢复到原队列。只创建审批申请，不要直接重放。
```

目标 DLQ 和源队列都必须位于配置的 allowlist 中。MCP 本身不会读取消息正文，也不会调用 SQS redrive API。

## 8. 推荐的故障处理流程

```text
发现异常
  -> 查询活跃告警
  -> 查询 Canary 和最近发布
  -> 查询受限范围内的脱敏日志
  -> 检查 DLQ 数量
  -> 查询或关联 Incident
  -> Agent 形成根因、证据和建议动作
  -> 创建 PENDING_APPROVAL 恢复申请
  -> 人工审批
  -> 云端 Executor 执行
  -> CloudWatch / CloudTrail 保留审计记录
```

建议要求 Agent 在结论中区分：

- 已观察到的事实
- 基于证据的推断
- 尚未验证的假设
- 建议动作及其风险

## 9. 安全边界

- 区域在进程启动时固定，客户端不能传入任意区域。
- 告警、日志组、Canary、队列和部署组必须位于环境变量 allowlist。
- 不提供通用 AWS CLI、任意 AWS API 或任意 ARN 调用能力。
- 日志最多回溯 60 分钟、返回 50 条，并对常见凭据和敏感字段脱敏。
- DLQ 工具只读取数量属性，不读取消息正文。
- 恢复工具只创建待审批申请，不直接执行 redrive 或 rollback。
- 写申请必须包含 Incident ID、原因和幂等键。
- Approval API 使用 AWS IAM 鉴权，MCP 使用本地 Profile 临时凭据进行 SigV4 签名。
- stdout 专用于 MCP 协议；启动诊断只写 stderr，且不输出凭据。
- 云端 Approval API 必须再次校验 allowlist、状态转换、审批有效期和幂等性。

## 10. 常见问题

### 启动后终端没有输出

这是正常状态。MCP 使用 stdio 等待 Client 连接，不提供浏览器页面。

### `AWS_SESSION_UNAVAILABLE`

AWS SSO 会话已过期，重新登录：

```bash
aws sso login --profile github-follow-readonly
```

然后重启 MCP Client。

### `not in the configured allowlist`

Agent 请求了未授权资源。先调用 `aws_get_system_health` 查看当前允许范围；如果确实需要新增资源，应修改 MCP 环境配置并同步最小 IAM 权限。

### 日志范围或数量被拒绝

`minutes` 必须为 1～60，`limit` 必须为 1～50。

### 写申请提示缺少 `AIOPS_ACTION_API_URL`

只读查询仍可使用；需要创建审批申请时，配置生产 Approval API 的 HTTPS Function URL，并确保 Profile 具有调用权限。

### MCP Client 看不到工具

依次检查：

1. `apps/aiops-mcp/dist/index.js` 是否已经构建。
2. MCP Client 中是否使用绝对路径。
3. Node.js 是否可从 Client 的环境中找到。
4. 必需环境变量是否全部配置。
5. Client 是否在修改配置后完全重启。
6. stderr 中是否出现 `mcp_start_failed`。

## 11. 验收标准

1. MCP Client 能发现 `github-follow-aiops` Server 和全部 9 个工具。
2. 系统健康工具只返回配置的项目资源。
3. 日志查询超出 60 分钟或 50 条时在 AWS 请求前被拒绝。
4. 非 allowlist 日志组、Canary、DLQ 和部署组被拒绝。
5. DLQ 查询结果不包含消息正文。
6. Incident ID 非法时被拒绝。
7. SSO 过期时返回重新登录提示。
8. 回滚和重放工具只返回 `PENDING_APPROVAL`。
9. 人工审批前，AWS 生产资源状态不发生变化。

