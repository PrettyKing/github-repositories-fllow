# 安全规范

## 凭据与机密

- DB 密码、Basic Auth 密码、GitHub token **永不入仓、不硬编码、不打日志**。
- 运行时机密走环境变量（经 `packages/env` 校验）；云端走 Secrets Manager + `{{resolve:secretsmanager:...}}` 注入。
- GitHub 个人 token 仅一次性透传给 `api.github.com`，**不持久化**（页面亦明示）。
- `DATABASE_URL` 内含密码：日志/错误信息里不得回显该连接串。

## 鉴权

- 页面与全部 `/api/*` 受 Basic Auth 保护，仅 `/health` 放行（监控探活）。新增路由默认在鉴权之后，确需公开须显式放行并说明理由。
- 鉴权中间件 `app.use("*")` 必须注册在路由之前。

## 网络与数据库

- Aurora 只在私有子网，安全组仅放行来自 Lambda SG 的 5432，**无公网入口**。新增对外连通须最小化端口与来源。
- Lambda 经 NAT 出网；不要给私有子网直接挂 IGW。

## IAM / CI（最小权限 + 防提权）

- CI 用 OIDC 假设角色，**仓库不存任何长期 AccessKey/SecretKey**。
- 部署角色信任收窄到本仓库 `main`/`master` 分支（不放开所有 ref/PR）。
- 部署角色建/改 Lambda 角色时**强制挂权限边界**且限本栈前缀；边界由 admin（bootstrap 栈）持有，CI 无权删除/剥离（不授予 `DeleteRolePermissionsBoundary`）。
- 权限按区域 + 资源前缀收窄；`PassRole` 仅限 `lambda.amazonaws.com`。

## 输入校验

- 所有外部输入（请求 body、路径参数、env）先校验：body 用 zod，`:id` 用 `Number.isInteger` 校验，env 用 `@t3-oss/env-core`。
