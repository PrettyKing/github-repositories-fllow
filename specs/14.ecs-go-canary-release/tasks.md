# Feature 14: ECS Go Canary Release Tasks

- [x] T-001: 将 ECS Service 改为原生 `CANARY` 策略并配置 10%/10 分钟。
- [x] T-002: 增加 Alternate Target Group、Production Listener Rule 和 ECS Infrastructure Role。
- [x] T-003: 增加 ALB 5xx 告警并接入 Synthetics Alarm 自动回滚。
- [x] T-004: 新增私有 ALB DNS，同时保留旧 Cloud Map 回退入口。
- [x] T-005: 为主栈增加 `GoApiUrl` 参数并让 CI 在 ECS 稳定后切换生产代理。
- [x] T-006: 增加 Green 专用 Test Listener、Security Group 和 `POST_TEST_TRAFFIC_SHIFT` Lambda Hook。
- [x] T-007: Hook 主动执行 `/health` 与带认证 `/api/stats`，失败或超时触发回滚。
- [x] T-008: CI 输出 ECS Service Deployment 诊断信息。
- [x] T-009: 更新需求、设计、部署清单和架构说明。
- [ ] T-010: 先部署 bootstrap 权限边界，再上线 ECS Canary 基础设施。
- [ ] T-011: 执行正常 10%→100% 发布演练并保存证据。
- [ ] T-012: 执行受控 5xx 故障注入，验证 Alarm 自动回滚。
