# api-canary-release — 任务清单

## 任务版本

| 日期 | 版本 | 说明 |
| --- | --- | --- |
| 2026-07-21 | v1 | 初始任务 |

## 任务列表

### 功能 1: 权限与版本发布

- [x] T-001: 扩展 bootstrap 的 CodeDeploy、Alias、Version、Hook Role 部署权限和对应权限边界 ~45min
- [x] T-002: 为 `ApiFunction` 增加 `AutoPublishAlias: live`，核验 HTTP API 集成指向别名 ~30min
- [x] T-003: 配置 `Canary10Percent10Minutes`、CodeDeploy DeploymentGroup 和来自 9 的 Alarm 引用 ~45min

### 功能 2: Hook 与 CI

- [x] T-004: 实现 PreTraffic/PostTraffic Hook、最小权限角色、超时与状态回报 ~60min
- [x] T-005: 更新 GitHub Actions，等待 CodeDeploy 最终状态并输出 deployment/alarms/logs 诊断信息 ~45min

### 集成与测试

- [ ] T-006: 验证正常版本 10%→100% 发布和 API 契约不变 ~30min
- [ ] T-007: 部署可控故障版本，验证 PreTraffic 拦截或观察窗 Alarm 自动回滚及 Synthetics 恢复 ~60min

## 依赖关系

- T-002~T-004 依赖 T-001。
- T-003 依赖 `9.T-004`。
- T-005 依赖 T-002~T-004。
- T-006、T-007 依赖 T-005 和 `9.T-007`。

## 风险点

- API Gateway 若仍调用未限定函数 ARN，可能绕过 Alias → 部署前检查生成模板与实际 integration URI。
- 低流量错误率没有足够样本 → 用 Synthetics 主动流量和绝对错误数补足。
- 跨栈 Alarm 名称/ARN 引用可能形成生命周期耦合 → 通过参数传入并规定反向删除顺序。
