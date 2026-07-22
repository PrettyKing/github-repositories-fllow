# api-canary-release — 技术设计

## 设计版本

| 日期 | 版本 | 说明 |
| --- | --- | --- |
| 2026-07-21 | v1 | 初始设计 |

## 项目架构

- 涉及文件: `template.yaml`、`apps/server/src/*`、`infra/github-oidc.yaml`、`.github/workflows/deploy.yml`。
- 发布路径: SAM → Lambda Version/Alias → CodeDeploy traffic shifting → CloudWatch Alarm rollback。

## 功能模块设计

### 模块 1: Version、Alias 与切流（F-001 / F-002）

`ApiFunction` 增加 `AutoPublishAlias: live` 和 `DeploymentPreference: Canary10Percent10Minutes`。SAM 生成 CodeDeploy Application/DeploymentGroup；HTTP API 集成必须指向别名，使 API 请求受 Alias 权重控制。

采用 10 分钟而非 5 分钟观察窗，以容纳 9 的每分钟巡检和连续失败判定。版本描述或部署标签记录 Git commit SHA。

### 模块 2: Hook（F-003）

PreTraffic Hook 接收 CodeDeploy deployment ID，直接调用候选 Version/Alias，校验基础 JSON 响应并向 CodeDeploy 回报状态。PostTraffic Hook 通过正式 API 执行浅层检查。Hook 日志带 deployment ID，不输出 Secret。

深层认证巡检由 Synthetics 承担，Hook 不复制完整凭据逻辑。

### 模块 3: Alarm 与回滚（F-004）

DeploymentPreference 引用：

- 新版本/Alias Lambda Errors；
- API Gateway 5xx；
- `9.T-004` 创建的 Synthetics SuccessPercent Alarm。

Alarm 使用能在观察窗内评估的 1 分钟周期。对低流量下错误率分母不足的问题，保留绝对 Errors/5xx 与 Synthetics 主动请求共同判定。

### 模块 4: CI 与演练（F-005 / F-006）

工作流部署后查询生成的 CodeDeploy deployment，等待 success/failed/stopped。失败输出 deployment ID、Alarm 名称和 CloudWatch 日志组。故障注入通过构建时受控参数或专用测试分支代码实现，不保留公开生产开关。

## 安全考虑

- CodeDeploy 和 Hook Role 均挂权限边界。
- Hook 只允许调用目标函数版本和回报当前 deployment 状态。
- CI 不获得任意 CodeDeploy/IAM 权限。

## 技术决策

| 决策 | 选项 | 理由 |
| --- | --- | --- |
| 灰度对象 | Hono Lambda | 当前 API 入口可直接使用 SAM 原生渐进部署 |
| 策略 | 10% / 10 分钟 | 给每分钟 Synthetics 和告警足够采样时间 |
| 自动回滚信号 | 服务指标 + outside-in 巡检 | 同时覆盖运行时错误与端到端语义故障 |
| ECS 灰度 | 延后 | ECS CodeDeploy 蓝绿需 ALB 双 Target Group，独立范围更安全 |

