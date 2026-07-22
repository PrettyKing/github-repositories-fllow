# observability-synthetics — 技术设计

## 设计版本

| 日期 | 版本 | 说明 |
| --- | --- | --- |
| 2026-07-21 | v1 | 初始设计 |

## 项目架构

- 涉及文件: `infra/observability.yaml`、`synthetics/api-journey.js`、`infra/github-oidc.yaml`、`.github/workflows/deploy.yml`
- 跨栈输入: `ApiUrl`、`AuthSecretArn`、API/Lambda 资源标识。

## 功能模块设计

### 模块 1: API Canary（F-001 / F-002）

Canary 每分钟执行一次。第一步访问 `/health`；第二步访问 `/api/stats`。第二步在运行时调用 Secrets Manager 读取 Basic Auth，构造请求头但不记录其值。响应校验状态码、JSON 必需字段和最大耗时。

Canary 从公网访问正式 API 域名，不进入 VPC，确保验证的是与用户一致的 outside-in 链路。脚本源码部署到 S3 或以 CloudFormation 支持的内联方式管理，运行角色只允许读取指定 Secret、写指定 artifact prefix 和日志/指标。

### 模块 2: 告警与通知（F-003~F-005）

- Canary SuccessPercent：连续 2 个 1 分钟周期低于 100 进入 ALARM。
- Canary Duration：先以 3000ms 为初始阈值，部署后按实际基线调整。
- API Gateway 5xx、Lambda Errors/Throttles：按现有 API 和函数维度创建。
- `OpsAlertTopic`：Alarm action 和 OK action 均可通知；订阅 endpoint 参数为空时不创建订阅。
- Dashboard：集中展示 SuccessPercent、Duration、5xx、Lambda Errors 和 ECS 服务指标。

S3 Bucket 启用阻止公共访问、服务端加密和生命周期清理；删除策略根据验收环境选择可清空后删除的方式，避免测试产物阻塞拆栈。

### 模块 3: CI 与权限

先在 bootstrap 中增加 Synthetics、CloudWatch、SNS、S3 以及受限 IAM Role 的部署权限和对应权限边界，再部署 `infra/observability.yaml`。工作流在主栈/ECS 可用后部署观测栈。

## 接口契约

| 输入 | 来源 | 用途 |
| --- | --- | --- |
| `ApiUrl` | 主栈 Output | Canary 目标地址 |
| `AuthSecretArn` | 主栈 Output | 深层巡检鉴权 |
| `AlertEmail` | 部署参数 | 可选邮件订阅 |

## 安全考虑

- Canary 名称不含 Secret 或个人信息。
- 请求/异常日志对 Authorization、cookie 和响应敏感字段脱敏。
- 执行角色只读一个 Secret，S3 只写指定 Bucket/prefix。

## 技术决策

| 决策 | 选项 | 理由 |
| --- | --- | --- |
| 巡检视角 | 公网 outside-in | 覆盖真实用户入口、DNS、API Gateway 与后端 |
| 单 Canary 两步骤 | 浅层 + 深层 | 可区分入口和下游故障，减少资源数量 |
| 频率 | 1 分钟 | 能覆盖 11 的 10 分钟 Canary 发布观察窗 |
| 凭据来源 | Secrets Manager 运行时读取 | 不在脚本和模板中硬编码 |

