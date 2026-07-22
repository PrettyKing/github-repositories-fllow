# CloudWatch Synthetics 巡检部署与演练

本文对应 `specs/9.observability-synthetics`，用于部署和验收公网 outside-in API 巡检。

## 前置条件

- 主栈与 ECS 栈已部署，`/health`、带 Basic Auth 的 `/api/stats` 可访问。
- bootstrap 已创建 Canary 执行角色权限边界，并允许部署角色管理本 Feature 的 Synthetics、CloudWatch、SNS、S3 和受边界约束的 IAM 资源。
- AWS 区域使用 `ap-northeast-1`。

## 打包 Canary

Synthetics S3 构件必须保留 `nodejs/node_modules/api-journey.js` 路径。以下命令生成可部署 zip；构件 Bucket 应开启版本控制和加密。

```bash
work_dir="$(mktemp -d)"
mkdir -p "$work_dir/nodejs/node_modules"
cp synthetics/api-journey.js "$work_dir/nodejs/node_modules/api-journey.js"
(cd "$work_dir" && zip -qr api-journey.zip nodejs)
aws s3 cp "$work_dir/api-journey.zip" "s3://<deployment-artifact-bucket>/synthetics/api-journey-<git-sha>.zip" --region ap-northeast-1
```

Canary 使用 AWS SDK for JavaScript v3 的 Secrets Manager client。部署前须确认选定的 Synthetics runtime 自带该模块；若 runtime 不提供，则将 `@aws-sdk/client-secrets-manager` 一并安装到上述 `nodejs/node_modules` 构件中。

## 部署观测栈

```bash
aws cloudformation deploy \
  --region ap-northeast-1 \
  --stack-name github-repositories-fllow-observability \
  --template-file infra/observability.yaml \
  --capabilities CAPABILITY_NAMED_IAM \
  --parameter-overrides \
    MainStackName=github-repositories-fllow \
    EnvironmentName=production \
    CanaryCodeS3Bucket=<deployment-artifact-bucket> \
    CanaryCodeS3Key=synthetics/api-journey-<git-sha>.zip \
    CanaryCodeS3Version=<object-version-id> \
    AlertEmail=<optional-email>
```

配置邮箱后，收件人必须在 AWS 邮件中确认订阅。需要暂停费用时，将 `CanaryEnabled=false` 重新部署；资源和历史记录会保留。

## 三阶段故障演练

### 1. 正常状态

1. 等待至少两次巡检完成。
2. 确认 `shallow-health` 与 `deep-stats` 均成功。
3. 确认 SuccessPercent 为 100%，相关 Alarm 为 `OK`。
4. 在产物 Bucket 的 `canary/` 前缀确认有新对象。

### 2. ECS 不可达

1. 记录 ECS Service 当前 desired count。
2. 在受控验收窗口将 ECS Service desired count 临时设为 0，或用等价的可恢复网络隔离手段。
3. 确认 `shallow-health` 成功、`deep-stats` 失败，证明入口 Lambda 可用而深层链路不可用。
4. 连续两次失败后，确认 SuccessPercent Alarm 进入 `ALARM`，SNS 收到通知。
5. 检查 CloudWatch Logs 与 S3 产物，不得出现 `Authorization` 值、用户名、密码或 Secret 内容。

### 3. 恢复

1. 将 ECS desired count 恢复为演练前值并等待服务稳定。
2. 确认两步重新成功，Alarm 回到 `OK`，SNS 收到恢复通知。
3. 记录演练时间、Alarm 状态变化、通知和产物脱敏检查结果。

## 验收记录

| 检查项 | 预期 | 结果/证据 |
| --- | --- | --- |
| 正常浅层与深层检查 | 连续成功 | 待填写 |
| ECS 不可达 | 浅层成功、深层失败 | 待填写 |
| 连续失败告警 | Alarm + SNS | 待填写 |
| 恢复 | Alarm 回到 OK | 待填写 |
| 产物脱敏 | 无凭据或 Authorization | 待填写 |
| Dashboard | Canary、API、Lambda、ECS、SQS 指标可见 | 待填写 |

> `ArtifactBucket` 使用 `Retain`，删除观测栈不会删除巡检证据。确认不再需要后，应由管理员按数据保留策略清空并删除 Bucket。

