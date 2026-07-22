# local-aiops-mcp — 技术设计（选做）

## 设计版本

| 日期 | 版本 | 说明 |
| --- | --- | --- |
| 2026-07-21 | v1 | 初始设计 |

## 项目架构

- 目录: `apps/aiops-mcp/`
- 技术: TypeScript、MCP TypeScript SDK、AWS SDK v3、stdio transport。
- 认证: AWS SDK default credential provider chain，推荐 SSO/Profile 临时会话。

## 功能模块设计

### 模块 1: Server 与工具注册（F-001 / F-002）

Server 注册 `aws_get_system_health`、`aws_get_active_alarms`、`aws_query_logs`、`aws_get_canary_runs`、`aws_inspect_dlq`、`aws_get_deployments`、`aws_get_incident`、`aws_request_dlq_redrive`、`aws_request_rollback`。输入使用 schema 校验，输出使用稳定 JSON envelope。

### 模块 2: 认证与安全边界（F-003 / F-004）

配置只接受 region、profile 名和项目环境，不接受 Access Key。资源标识由本地项目配置映射，Client 不能传任意 ARN。日志查询限制最大回溯时间、结果数和查询模板；DLQ 只返回云端脱敏摘要。

### 模块 3: 写操作（F-005）

写工具调用 12 的受保护 request action API，必须提供 Incident ID、动作理由和幂等键。返回 `PENDING_APPROVAL`，本地 MCP 不持有 Executor 权限。

### 模块 4: 客户端接入（F-006）

文档提供通用 MCP Client stdio 配置、AWS SSO 登录前置步骤、健康检查和常见错误。配置示例不包含真实账号、Secret 或生产 URL。

## 安全考虑

- 不提供通用 `aws_cli`、任意 SDK 调用或任意 Logs Insights 查询工具。
- stdout 仅输出 MCP 协议数据，诊断日志写 stderr 并脱敏。
- 子进程环境不打印 credential provider 结果。

## 技术决策

| 决策 | 选项 | 理由 |
| --- | --- | --- |
| 传输 | stdio | 本地部署简单，无需再暴露网络服务 |
| 凭据 | SSO/Profile | 使用短期凭据，避免长期密钥 |
| 工具契约 | 复用 12 | 云端 Agent 与本地 Agent 行为一致 |
| 写权限 | 仅申请 | 保持人审和云端审计边界 |

