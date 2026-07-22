# observability-synthetics — 需求规格

## 概述

为生产 API 建立 CloudWatch Synthetics 主动巡检、CloudWatch 告警、Dashboard 和 SNS 通知，分别识别入口存活与 Lambda→ECS→Aurora 完整链路故障。

## 项目信息

- 项目名: github-repositories-fllow
- 架构类型: CloudWatch Synthetics + CloudWatch Alarms + SNS + S3

## 需求版本

| 日期 | 版本 | 说明 |
| --- | --- | --- |
| 2026-07-21 | v1 | 初始需求 |

## 用户故事

- 作为运维，我希望系统主动验证 API，以便在用户报告前发现故障。
- 作为开发者，我希望区分 Lambda 入口故障与 ECS/数据库链路故障，以便缩短定位时间。

## 功能需求

1. [F-001] 创建 API Canary，每分钟执行 `GET /health`，校验 200 与 `{ status: "ok" }`。
2. [F-002] 同一 Canary 执行受 Basic Auth 保护的 `GET /api/stats`，凭据来自 Secrets Manager，校验 200、响应结构与耗时，覆盖 Lambda→ECS→Aurora。
3. [F-003] Canary 运行日志和产物写入专用加密 S3 Bucket，配置生命周期；日志不得输出 Authorization 或 Secret 内容。
4. [F-004] 创建 SuccessPercent、Duration、API 5xx 等 CloudWatch Alarm；连续失败触发告警并在恢复后回到 OK。
5. [F-005] 创建运维 SNS Topic 和 CloudWatch Dashboard，展示 Canary、Lambda、API Gateway、ECS、SQS 预留指标；订阅地址通过参数配置，不硬编码。
6. [F-006] 提供浅层成功/深层失败的故障演练与验收说明。

## 非功能需求

- 安全: Basic Auth 只从 Secrets Manager 读取，不进入模板明文和日志。
- 可观测性: 告警名称、维度和资源标签能定位环境与链路阶段。
- 成本: 默认单 Canary、1 分钟频率；产物设置生命周期。
- IaC: 所有资源通过 CloudFormation 创建，区域固定 `ap-northeast-1`。

## 验收标准

- [ ] [AC-001] `/health` 和 `/api/stats` 正常时 Canary 连续成功。
- [ ] [AC-002] 停止/隔离 ECS 后浅层检查成功、深层检查失败。
- [ ] [AC-003] 连续失败触发 Alarm 和 SNS 通知，恢复后 Alarm 回到 OK。
- [ ] [AC-004] S3 中存在运行产物且不包含凭据。
- [ ] [AC-005] Dashboard 能展示巡检成功率、耗时、API/Lambda 错误指标。

## 依赖

- 3.aws-infra-sam-deploy 的 API、VPC 和 Secrets 输出。
- 4.cicd-oidc-deploy 的 OIDC 部署角色与权限边界。
- 当前 ECS Go API 的 `/api/stats` 和数据库健康链路。

## 开放问题

- SNS 邮件订阅需要收件人在 AWS 邮件中手工确认；IaC 只能创建订阅，不能代替确认。

