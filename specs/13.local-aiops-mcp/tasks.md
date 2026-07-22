# local-aiops-mcp — 任务清单（选做）

## 任务版本

| 日期 | 版本 | 说明 |
| --- | --- | --- |
| 2026-07-21 | v1 | 初始任务 |

## 任务列表

### 功能 1: MCP 基座与只读工具

- [x] T-001: 创建 `apps/aiops-mcp` workspace、stdio Server、配置/env 校验和结构化错误 ~60min
- [x] T-002: 抽取/复用 12 的工具 schema，注册健康、告警、日志、Canary、DLQ、部署、Incident 查询工具 ~90min
- [x] T-003: 实现 AWS SSO/Profile 凭据链、会话过期提示、资源 allowlist 和查询配额 ~60min

### 功能 2: 审批动作与文档

- [x] T-004: 实现 redrive/rollback request 工具，仅创建 `PENDING_APPROVAL` 动作 ~45min
- [x] T-005: 编写 MCP Client 配置示例、威胁模型、AWS SSO 前置步骤和排错指南 ~45min

### 集成与测试

- [x] T-006: 测试工具发现/调用、凭据过期、任意 ARN、跨区域、超范围查询和写操作不直执 ~60min
- [ ] T-007: 用一个 MCP Client 完成“查询告警→查看证据→创建恢复申请”的演示 ~30min

## 依赖关系

- T-002 依赖 `12.T-004` 的工具契约和 T-001。
- T-004 依赖 `12.T-006`、`12.T-007` 的审批 API。
- T-005、T-006 依赖 T-001~T-004；T-007 依赖 T-006。

## 风险点

- MCP stdout 混入日志会破坏协议 → 诊断日志只写 stderr。
- 本地 Profile 权限过大 → 推荐独立只读 Profile，写操作仍只走审批 API。
- 云端和本地 schema 漂移 → 抽取共享 package 或以同一 schema 文件生成两端定义。
