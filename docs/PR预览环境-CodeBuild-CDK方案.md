# PR 预览环境：CodeBuild + CDK 方案讨论总结

## 1. 目标

为每个 Pull Request 创建一套可独立访问的临时预览环境：

- PR 打开、重新打开或提交更新时，自动构建并部署。
- 根据 PR 编号计算稳定、唯一的环境名称和访问 URL。
- 将前端、API 访问地址展示在本次 GitHub Actions、GitHub Deployment 和 PR 评论中。
- PR 合并或关闭后，通过 CDK 立即销毁该 PR 对应的资源。
- 预览环境不访问生产数据库，且具备失败重试、并发控制和残留资源清扫能力。

本文是目标方案讨论，不代表仓库已经切换到 CDK。仓库当前 PR Preview 仍以 CodeBuild + CloudFormation 模板实现。

## 2. 推荐流程

```mermaid
flowchart LR
    PR["PR opened / reopened / synchronize"] --> Guard["Jira Guard / DB Guard"]
    Guard --> Name["计算 Preview ID、Stack 名和 URL"]
    Name --> Build["CodeBuild 构建镜像"]
    Build --> ECR["推送 ECR"]
    ECR --> API["CDK deploy API Preview Stack"]
    Name --> Web["部署 Web Preview"]
    API --> Test["URL 健康检查"]
    Web --> Test
    Test --> Publish["GitHub Environment / Summary / PR Comment"]

    Close["PR closed（包括 merged）"] --> Destroy["CDK destroy Preview Stack"]
    Destroy --> Verify["确认 CloudFormation Stack 已不存在"]
```

建议把部署和销毁拆成两条工作流：

1. `preview-deploy.yml`
   - 监听 `opened`、`reopened`、`synchronize`。
   - 计算环境名称和 URL。
   - 构建镜像，部署 API 与 Web。
   - 做健康检查并发布访问地址。
2. `preview-destroy.yml`
   - 监听 `closed`。
   - 从默认分支获取可信 CDK 程序。
   - 销毁该 PR 的 Stack，并验证删除结果。

GitHub 中合并 PR 也会触发 `closed`，因此通常不需要单独处理 `merged`；无论合并还是放弃 PR，都应清理预览环境。

## 3. 命名与 URL 计算

应使用 PR number 作为资源主键。分支名可能包含 `/`、`_`、大写字母或过长的描述，不适合直接用于 AWS 资源命名。

例如 PR `#222`：

```text
PREVIEW_ID=pr-222
STACK_NAME=yideng-preview-pr-222
IMAGE_TAG=pr-222-<commit-sha>

WEB_URL=https://pr-222.preview.yideng.ai
API_URL=https://api-pr-222.preview.yideng.ai
```

如果必须沿用现有命名，可以计算为：

```text
API_URL=https://yideng-q222-de-rd.yideng.ai
WEB_URL=https://yideng-q222-dev-fe.yideng.ai
```

但推荐使用 `preview.yideng.ai` 作为统一预览域，便于配置 wildcard DNS 和证书：

```text
*.preview.yideng.ai
*.api.preview.yideng.ai
```

只要 URL 完全由 PR number 决定，就可以在部署开始前计算。前后端可并行部署，不必等待 CDK 输出后才开始构建前端。

## 4. 在 GitHub 中展示 URL

建议同时使用以下三种方式。

### 4.1 GitHub Environment URL

部署 Job 绑定动态 Environment：

```text
Environment: preview-pr-222
URL: https://pr-222.preview.yideng.ai
```

GitHub 会将其记录为 Deployment，并显示 `View deployment`。URL 最好由前置 `prepare` Job 计算，再通过 Job Output 传给部署 Job。

CDK 只能删除 AWS 资源，不能自动删除 GitHub Environment。如需同时清理 Environment，需要调用 GitHub API。

### 4.2 Actions Job Summary

部署完成后向 `$GITHUB_STEP_SUMMARY` 写入：

```markdown
## PR Preview

| Component | URL |
| --- | --- |
| Web | https://pr-222.preview.yideng.ai |
| API | https://api-pr-222.preview.yideng.ai |
```

### 4.3 PR 固定评论

创建或更新同一条机器人评论，而不是每次提交都新增评论：

```text
Preview deployed

Web: https://pr-222.preview.yideng.ai
API: https://api-pr-222.preview.yideng.ai
Commit: <sha>
```

评论中可加入隐藏标识，供后续查找和更新：

```html
<!-- pr-preview-environment -->
```

PR 关闭并完成清理后，将评论更新为 `Preview removed`。

## 5. CDK Stack 划分

不建议每个 PR 重建 VPC、NAT、ECR、ALB 等昂贵资源。应分为长期共享层和临时 PR 层。

### 5.1 共享基础设施

`PreviewPlatformStack` 长期存在：

- VPC 和子网。
- 共享 ECS Cluster。
- 共享 ALB 或 API Gateway。
- ECR Repository。
- Wildcard DNS 和 ACM Certificate。
- CodeBuild 项目。
- IAM Role。

### 5.2 每 PR 临时资源

`PreviewPr222Stack` 随 PR 创建和销毁：

- ECS Task Definition。
- ECS Service。
- ALB Target Group 和 Host Listener Rule。
- CloudWatch Log Group。
- 临时数据库、独立 database/schema 或 mock 数据。
- 必要的 Parameter 和 Secret。

生命周期示意：

```text
cdk deploy PreviewPr222Stack
cdk destroy PreviewPr222Stack --force
```

如果使用 API Gateway，可根据域名或路径路由。浏览器预览更推荐 Host 路由：

```text
api-pr-222.preview.yideng.ai -> PR #222 API
```

Header 分发适合服务间调用，但不利于用户直接打开链接，也会增加前端和调试工具的特殊配置。

## 6. CodeBuild、GitHub Actions 与 CDK 的职责

```text
GitHub Actions
├── 读取 PR 事件
├── 计算 Preview ID 和 URL
├── 执行 Jira/DB Guard
├── 触发并等待 CodeBuild
├── 触发 CDK deploy/destroy
└── 发布 Deployment URL 和 PR 评论

CodeBuild
├── 构建业务镜像
├── 推送 ECR
└── 返回 Image URI

CDK
├── 创建或更新每 PR Stack
├── 配置 ECS、ALB/API Gateway、DNS 和日志
├── 输出访问地址
└── 销毁每 PR Stack
```

CDK 最终仍通过 CloudFormation 管理资源。所谓“使用 CDK 清理”，本质是让 CDK 用相同的 PR 参数构造出相同 Stack，并请求 CloudFormation 删除。

## 7. 数据库策略与 DB Guard

预览环境不得获得生产数据库的连接 Secret。可选方案如下：

| 方案 | 优点 | 缺点 | 适用场景 |
| --- | --- | --- | --- |
| Fargate Postgres sidecar | 成本低、PR 间隔离、不会碰生产库 | Task 替换后数据丢失 | 接口验证、短期预览 |
| 共享 RDS，每 PR 独立 database/schema | 数据相对稳定、成本可控 | 权限和清理逻辑更复杂 | 持续数日的业务验收 |
| 每 PR 独立 RDS/Aurora | 隔离最强 | 慢且昂贵 | 高隔离要求 |
| Mock/seed 数据 | 安全、快速 | 无法覆盖真实数据库行为 | 前端和多数展示场景 |

结合当前项目，短期预览优先考虑 Postgres sidecar。需要明确：它是 Task 生命周期内的临时数据库，不保证整个 PR 生命周期内持久。

DB Guard 至少检查：

- Preview 任务没有生产数据库 Secret。
- `DATABASE_URL` 明确指向临时数据库。
- Migration 是否包含高风险、破坏性变更。
- 数据库或 schema 名包含 PR number。
- PR 关闭后存在对应清理动作。

## 8. PR 关闭后的可靠清理

销毁工作流应执行以下步骤：

1. 从 `pull_request.closed` 事件读取 PR number。
2. Checkout 默认分支；关闭后 PR merge ref 可能已经不存在。
3. 使用与部署时相同的命名算法得到 Stack 名。
4. 执行 `cdk destroy <stack> --force`。
5. 等待 CloudFormation 删除完成。
6. 确认 Stack 已不存在。
7. 更新 PR 评论和 GitHub Deployment 状态。
8. 可选：通过 GitHub API 删除动态 Environment。

不能无条件忽略 `destroy` 或 CloudFormation wait 的错误。只有“Stack 原本不存在”可视为幂等成功；`DELETE_FAILED` 必须让工作流失败并报警。

CDK 中还需明确临时资源的删除策略：

- Preview 资源使用 `RemovalPolicy.DESTROY`。
- 非空 S3 Bucket 需要自动清空。
- 临时数据库不创建最终快照。
- Secret 如需立即删除，应避免默认恢复窗口阻塞清理。
- Log Group 不应默认永久保留。
- 删除 ECS Service 后，需要等待 Task 停止和 ENI 释放。

这些策略只能用于 Preview Stack，不应复用到生产 Stack。

## 9. 并发与最终一致性

必须处理以下竞态：

```text
Build A：PR synchronize，开始部署
Build B：PR closed，开始销毁
Build B：销毁完成
Build A：稍后部署完成，重新创建环境
```

建议至少采用三层保护：

1. GitHub Actions 按 `preview-pr-<number>` 设置 concurrency。
2. 部署前再次查询 PR 状态，只有 PR 仍为 open 才允许部署。
3. 定时 Reconciler 扫描带 Preview 标签的 Stack，清除已关闭或已过期的环境。

推荐给所有临时资源添加标签：

```text
Environment=preview
Repository=<owner>/<repo>
PullRequest=222
CommitSha=<sha>
ExpiresAt=<timestamp>
```

即使 GitHub Webhook、Action 或 CDK destroy 偶发失败，定时清扫也能限制资源残留和成本泄漏。

## 10. 安全边界

PR 中的代码是不可信输入，尤其需要避免以下模式：

- 从 PR 分支读取拥有部署权限的 CodeBuild buildspec。
- 直接运行 PR 分支修改过的 CDK App。
- 在构建不可信 Dockerfile 的同一权限域中暴露 Cloudflare、数据库或高权限 AWS Secret。
- 允许 fork PR 自动获得部署权限。

推荐做法：

- Buildspec、CDK App 和部署控制逻辑来自可信默认分支。
- PR commit 只作为被构建的业务代码输入。
- 构建镜像和部署资源使用不同角色，必要时拆为两个 CodeBuild 项目。
- fork PR 默认不创建环境，或使用无 Secret、极低权限的隔离项目。
- GitHub OIDC Trigger Role 只允许启动指定 CodeBuild 项目。
- CDK Deploy Role 的权限限制到 Preview 资源前缀和指定 Runtime Role。

## 11. 推荐落地版本

综合成本、体验和隔离性，推荐：

- `preview-pr-<number>` 作为统一环境标识。
- 共享 VPC、ECS Cluster、ALB、ECR、wildcard DNS。
- 每 PR 独立 ECS Service、Task Definition、Target Group、Listener Rule 和日志。
- API 使用 `api-pr-222.preview.yideng.ai`。
- Web 使用 `pr-222.preview.yideng.ai`。
- 静态前端优先使用 Cloudflare Pages Preview，不放入 ECS。
- `prepare` Job 提前计算 URL，API 与 Web 并行部署。
- 成功后写入 GitHub Environment、Actions Summary 和 PR 固定评论。
- `pull_request.closed` 触发 CDK destroy，并严格验证删除结果。
- 每晚运行一次孤儿 Stack 清扫作为兜底。

## 12. 与仓库当前实现的关系

仓库当前已经具备每 PR 独立预览环境的雏形：

- GitHub Actions 通过 OIDC 触发 CodeBuild。
- CodeBuild 构建 Go 镜像并推送 ECR。
- 每个 PR 创建独立 CloudFormation Stack。
- Fargate Task 内运行 Go API 和临时 Postgres sidecar。
- PR 关闭后删除 Stack 和 Cloudflare DNS。

如果向本文目标架构演进，优先级建议为（✅=已落地 / ⚠️=部分 / ⬜=待做）：

1. ✅ 修复不可信 PR 修改 buildspec/控制代码的安全边界。
   → CodeBuild 改**内联 buildspec + Build 角色仅 ECR、无密钥**；部署/销毁/DNS 移到 `pull_request_target` 的**可信 workflow**（逻辑来自 base 分支），密钥集中在 **Ops 角色**；**fork PR 被 same-repo guard 挡掉**。见 `infra/pr-preview.yaml`、`.github/workflows/preview-deploy.yml`、`preview-destroy.yml`。
2. ✅ 正式接入 PR 事件并正确读取字段。→ `pull_request_target`（opened/reopened/synchronize / closed），读 `pull_request.number`、`head.sha`、`head.repo.full_name`。
3. ✅ CodeBuild 完成等待、健康检查、URL 展示。→ 轮询 `batch-get-builds`；curl `IP:8080/health`；写 **Actions Summary + PR 固定评论(锚点)+ 动态 GitHub Environment**。
4. ✅ 删除失败可见，不吞 `DELETE_FAILED`。→ destroy 仅把「栈本不存在」当幂等成功，其余非成功状态 `::error::` 并让工作流失败。
5. ✅ 部署/销毁并发竞态。→ 同一 concurrency 组 `preview-pr-<n>` 串行 + 部署前 open-guard + **`preview-reconcile.yml` 每晚孤儿清扫**（按 `Environment=preview` 标签 + PR 状态/`ExpiresAt`）。
6. ✅ 动态公网 IP → 稳定入口。→ **长期共享 ALB**（`infra/pr-preview.yaml` 内，Host 路由）；每 PR 任务改**私有子网+目标组+Host 监听规则**；Cloudflare **DNS-only CNAME → ALB**，`http://api-pr-<n>.faithcal.xyz`（无端口，任务 IP 变化被目标组屏蔽）。仍为 HTTP（免证书）；要 HTTPS 需给 ALB 挂 ACM。
7. ✅ 每 PR 模板迁 CDK。→ `infra/cdk`（`PreviewPrStack`，L2 构造，等价原 `pr-preview-env.yaml`）。用 **`CliCredentialsStackSynthesizer`**：`cdk deploy/destroy` 直接用 Actions 假设的 **Ops 角色**部署，**免 `cdk bootstrap`、不引入宽权限 CDK 角色**（贴合 §10 安全边界）。`preview-deploy.yml` → `cdk deploy`，`preview-destroy.yml` → `cdk destroy --force`；夜间 reconciler 仍按栈名 `delete-stack`（CDK 产出的就是普通 CFN 栈）。

> 注 1：共享 ALB 常驻计费（~$16/mo，无 PR 时也在），故只放在**可选**的 PR 预览平台栈里；不启用 PR 预览就没有这笔成本。启用前主栈需先重部署一次（新增 `PublicSubnet2` 导出供 ALB 跨 2 AZ）。
> 注 2：CDK app 在 `infra/cdk`，本地体验：`cd infra/cdk && npm install && npx cdk synth -c prNumber=1 -c imageUri=... -c runtimeRoleArn=...`。它**不在 pnpm workspace 里**（独立 npm 项目），避免污染共享 TS 配置。

