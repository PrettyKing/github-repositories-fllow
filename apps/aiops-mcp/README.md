# GitHub Follow AI Ops MCP

本地 stdio MCP Server，为 Codex、Claude Desktop 等客户端提供项目限定的 AWS 运维查询能力。它没有通用 AWS/CLI 工具，也不会读取消息正文。redrive 与 rollback 工具只向云端审批 API 创建 `PENDING_APPROVAL` 申请。

## 准备

1. 使用独立的只读 AWS SSO Profile；不要配置长期 Access Key。
2. 执行 `aws sso login --profile github-follow-readonly`。
3. 复制 `.env.example` 中的变量到 MCP Client 的 `env`，将所有资源替换为实际项目资源。
4. `pnpm --filter aiops-mcp build`。

通用客户端配置示例：

```json
{
  "mcpServers": {
    "github-follow-aiops": {
      "command": "node",
      "args": ["/absolute/path/apps/aiops-mcp/dist/index.js"],
      "env": {
        "AWS_PROFILE": "github-follow-readonly",
        "AWS_REGION": "ap-northeast-1",
        "AIOPS_INCIDENT_TABLE": "github-follow-incidents",
        "AIOPS_ALLOWED_LOG_GROUPS": "/aws/lambda/github-follow-api"
      }
    }
  }
}
```

写操作还必须配置 HTTPS `AIOPS_ACTION_API_URL`。MCP 使用同一 SSO/Profile 临时凭据对 `AWS_IAM` Function URL 自动执行 SigV4 签名。本地进程不会调用 SQS redrive 或 CodeDeploy stop API；审批 API 必须认证调用方并审计请求。

## 工具

只读：`aws_get_system_health`、`aws_get_active_alarms`、`aws_query_logs`、`aws_get_canary_runs`、`aws_inspect_dlq`、`aws_get_deployments`、`aws_get_incident`。

待审批：`aws_request_dlq_redrive`、`aws_request_rollback`。两者要求原因和幂等键，并且只接受 allowlist 中的资源。

## 威胁模型与边界

- 客户端不能传任意 ARN、区域、日志查询表达式或任意 AWS API；区域由服务启动配置固定。
- 日志最多回溯 60 分钟、返回 50 条，敏感字段和常见凭据形式会脱敏。
- DLQ 只查询数量，不读取消息正文；Incident ID 有严格格式限制。
- stdout 专用于 MCP 协议，启动诊断仅写入 stderr，且不会输出凭据。
- SSO 过期时返回重新登录提示。MCP 仍应使用最小权限只读 Profile；审批 API 使用独立身份验证。
- 客户端和本地用户仍被视为不可信输入。云端审批 API 必须再次校验 allowlist、状态转换、幂等键和审批有效期。

## 验收演示

在 MCP Client 中依次调用：查询活跃告警 → 查询 allowlist 日志或 Canary 证据 → 查询 Incident → 请求 redrive/rollback。最后一步应只返回 `PENDING_APPROVAL`；在人工审批前，AWS 资源状态不得改变。

常见错误：`AWS_SESSION_UNAVAILABLE` 表示需重新执行 SSO 登录；`not in the configured allowlist` 表示资源未获准；日志范围或条数超限会在发出 AWS 请求前被拒绝。
