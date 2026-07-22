# aiops-agent — 任务清单

## 任务版本

| 日期 | 版本 | 说明 |
| --- | --- | --- |
| 2026-07-21 | v1 | 初始任务 |
| 2026-07-22 | v2 | 独立 React Console 实现与部署纳入 Feature 12 |

## 任务列表

### 功能 1: 基础设施与 Incident

- [ ] T-001: 确认可用 Bedrock 模型并参数化 Model ID；扩展 bootstrap 的 Bedrock/AIOps/EventBridge/DynamoDB 权限和四类角色边界 ~60min
- [x] T-002: 创建 `infra/aiops.yaml` 的 Incident 表、EventBridge Rule、Orchestrator、Agent、Alias、Action Lambda 和角色 ~90min
- [x] T-003: 实现 Incident 状态机、告警幂等/风暴抑制、TTL 和结构化时间线 ~60min

### 功能 2: Agent 工具与分析

- [x] T-004: 实现健康、告警、Canary、日志、DLQ、部署六类只读工具及资源 allowlist/结果限制 ~120min
- [x] T-005: 编写 Agent instruction，输出 evidence/hypothesis/unknown、影响和建议动作；实现模型输入脱敏 ~60min
- [x] T-006: 实现 redrive/rollback 申请、审批状态机、独立 Executor、过期与幂等校验 ~120min

### 功能 3: API、UI 与可观测性

- [x] T-007: 实现 Cognito JWT 保护的 Console API：Overview、日志、Incident 详情和安全消息链路测试 ~90min
- [x] T-008: 实现独立 React/TypeScript/Tailwind Console，支持本地 Mock、Cloudflare Pages 部署与 Cognito PKCE 登录 ~120min
- [ ] T-009: 增加 Agent 调用、错误、延迟、Token、工具失败和动作执行指标/告警/审计（已交付 Lambda 错误告警和结构化审计；Token/自定义指标待补） ~60min

### 集成与测试

- [ ] T-010: 完成 Synthetics 失败→诊断→自动回滚报告，以及 DLQ→建议→审批→redrive 两条端到端演练 ~120min
- [ ] T-011: 完成越权、任意 ARN、prompt injection、重复审批、过期动作和 Agent 不可用降级测试 ~90min

## 依赖关系

- T-002、T-003 依赖 T-001。
- T-004 依赖 `9.T-004`、`10.T-007`、`11.T-003` 和 T-002。
- T-005 依赖 T-004；T-006 依赖 T-003~T-005。
- T-007、T-008 依赖 T-003、T-006。
- T-009 依赖 T-002~T-007。
- T-010、T-011 依赖 T-001~T-009。

## 风险点

- 区域/账号未开通目标 Bedrock 模型 → T-001 必须在编码前验证并允许替换模型。
- 日志和消息可能包含 prompt injection → 当作数据展示，工具权限不能由模型文本决定。
- 告警风暴导致成本和并发失控 → Incident 幂等、并发限制、Token/轮次上限共同控制。
- Agent 写操作误执行 → Action Lambda 只能提案，Executor 独立角色并强制人工审批。
