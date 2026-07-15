# Go API

## Local development

```bash
go run ./cmd/server
```

The service loads `DATABASE_URL` and `PORT` from `.env` when present. See `.env.example`.

## Endpoints

Go 是**唯一 DB 访问方**：全部账户/仓库/统计业务都在这里，生产由 Hono Lambda 薄代理经 Cloud Map 内网转发进来。

| 方法 | 路径 | 鉴权 | 说明 |
| --- | --- | --- | --- |
| GET | `/health` | 放行 | 健康检查（含 DB ping） |
| GET | `/api/users` | Basic Auth | 已保存账户列表（createdAt 倒序） |
| POST | `/api/github` | Basic Auth | token 取账户并 upsert + 同步其仓库（事务内先删后插），返回 `{...row, created, reposCount, truncated}`（新建 201/更新 200） |
| DELETE | `/api/users/{id}` | Basic Auth | 删账户（仓库外键级联删） |
| GET | `/api/users/{id}/repos` | Basic Auth | 某账户仓库列表（pushed_at DESC NULLS LAST） |
| POST | `/api/users/{id}/refresh` | Basic Auth | 校验 token 与目标 github_id 一致后重新同步 |
| GET | `/api/stats` | Basic Auth | 聚合统计（Top5 + 语言分布，分母用有语言的仓库数） |
| GET | `/api/profile/{username}` | Basic Auth | 只返回**原始**公开信息；`introduction` 由上游 Lambda 调 OpenRouter 生成 |

## 鉴权

同时配置 `BASIC_AUTH_USER` 与 `BASIC_AUTH_PASSWORD` 即启用 Basic Auth，保护全部 `/api/*`（`/health` 放行给探活）。生产用与 Lambda 相同的凭据，Lambda 会透传 `Authorization`，Go 再做一次校验（纵深防御）。本地开发可留空即不鉴权。

## Docker

Build the same Linux ARM64 image shape used by ECS Fargate:

```bash
docker build --platform linux/arm64 -t github-repositories-fllow-go:local .
```

Run it against PostgreSQL exposed by the host:

```bash
docker run --rm --name github-go-api \
  -p 8081:8080 \
  -e DATABASE_URL='postgresql://app_admin:local_dev_password@host.docker.internal:5432/appdb?sslmode=disable' \
  github-repositories-fllow-go:local
```

Verify:

```bash
curl http://localhost:8081/health
```

The real `.env` file is excluded from the image. ECS must inject `DATABASE_URL` and the `BASIC_AUTH_*` credentials from AWS Secrets Manager.
