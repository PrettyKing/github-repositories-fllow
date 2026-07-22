# AWS AI Ops Console

独立的 AWS 运维管理控制台，使用 React 19、TypeScript、Vite 和 Tailwind CSS v4。它与 `apps/aiops-mcp` 完全解耦：Console 面向浏览器管理员，MCP 面向本地 Agent Client 的 stdio 调用。

## 本地开发

```bash
pnpm --filter aiops-console dev
```

打开 `http://127.0.0.1:4322/`。仓库中的 `public/config.js` 默认启用 `demoMode`，页面直接显示 Mock 告警、Canary、DLQ、部署、日志和 Incident；不会登录 Cognito、调用 AWS API 或执行真实队列测试。

生产构建：

```bash
pnpm --filter aiops-console check-types
pnpm --filter aiops-console build
```

产物位于 `apps/aiops-console/dist/`。

## 线上部署

`.github/workflows/deploy-aiops-console.yml` 完成以下流程：

1. 构建 `aiops-agent` 的 Console API Lambda。
2. 构建 React/Vite 静态资源。
3. 使用 `infra/aiops-console.yaml` 部署 S3、CloudFront、Cognito、HTTP API 和 Lambda。
4. 根据 CloudFormation 输出生成生产 `dist/config.js`，其中 `demoMode=false`。
5. 同步 `dist/` 到私有 S3，并刷新 CloudFront。

必需 GitHub Secrets：

| 名称 | 用途 |
| --- | --- |
| `AWS_DEPLOY_ROLE_ARN` | GitHub Actions 通过 OIDC 部署 AWS 资源 |
| `AIOPS_ADMIN_EMAIL` | 创建首个 Cognito 管理员；Cognito 会发送临时密码 |

## 认证与安全

- 浏览器通过 Cognito OAuth2 Authorization Code + PKCE 登录。
- React 只在 `sessionStorage` 保存 ID Token，不保存 AWS Access Key、Secret 或 GitHub Token。
- HTTP API 使用 Cognito JWT Authorizer；Lambda 仅有项目 allowlist 内的只读权限和向测试 Topic 发布安全事件的权限。
- 日志接口限制时间窗和条数，并在返回前脱敏。
- “消息链路验证”只发布固定结构、无用户数据的测试事件。

## 运行时配置

`window.AIOPS_CONFIG` 字段：

| 字段 | 说明 |
| --- | --- |
| `apiUrl` | Console HTTP API 地址 |
| `cognitoDomain` | Cognito Hosted UI 域名 |
| `clientId` | Cognito User Pool Client ID |
| `redirectUri` | CloudFront Console URL |
| `demoMode` | 本地为 `true`，生产必须为 `false` |
