# local-aiops-mcp — 需求规格（选做）

## 概述

开发本地 TypeScript MCP Server，将云端 AI Ops 的受限只读能力提供给 Codex、Claude Desktop 等 MCP Client；生产写操作只创建审批申请。

## 需求版本

| 日期 | 版本 | 说明 |
| --- | --- | --- |
| 2026-07-21 | v1 | 初始需求 |

## 功能需求

1. [F-001] 通过 stdio 启动 MCP Server，支持标准初始化、工具发现、调用和结构化错误。
2. [F-002] 提供健康、告警、日志、Canary、DLQ、部署、Incident 查询工具，语义与 12 的 Action Group 契约一致。
3. [F-003] AWS 凭据使用本地 SSO/Profile 临时会话，不保存 Access Key，不在响应中返回凭据。
4. [F-004] 所有资源参数经过项目 allowlist、区域、时间范围、数量和大小限制。
5. [F-005] redrive/rollback 工具只调用云端 request action API，返回待审批状态，不直接执行。
6. [F-006] 提供 MCP Client 配置示例、威胁模型和本地验收脚本。

## 验收标准

- [ ] [AC-001] MCP Client 能发现并调用全部只读工具。
- [ ] [AC-002] 未登录/会话过期时返回可操作错误，不回显凭据。
- [ ] [AC-003] 任意 ARN、跨区域、超范围日志查询被拒绝。
- [ ] [AC-004] 写工具只产生待审批动作，不能直接改变 AWS 状态。

## 依赖

- 12.aiops-agent 的工具契约、Incident API 和审批流程。

## 开放问题

- 首版以 stdio 为唯一传输；远程 HTTP MCP 不在本期范围。

