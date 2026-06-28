# github-repositories-fllow

This project was created with [Better-T-Stack](https://github.com/AmanVarshney01/create-better-t-stack), a modern TypeScript stack that combines React, React Router, Hono, and more.

## Features

- **TypeScript** - For type safety and improved developer experience
- **React Router** - Declarative routing for React
- **TailwindCSS** - Utility-first CSS for rapid UI development
- **Shared UI package** - shadcn/ui primitives live in `packages/ui`
- **Hono** - Lightweight, performant server framework
- **Node.js** - Runtime environment
- **Drizzle** - TypeScript-first ORM
- **PostgreSQL** - Database engine

## Getting Started

First, install the dependencies:

```bash
pnpm install
```

## Database Setup

This project uses PostgreSQL with Drizzle ORM.

1. Make sure you have a PostgreSQL database set up.
2. Update your `apps/server/.env` file with your PostgreSQL connection details.

3. Apply the schema to your database:

```bash
pnpm run db:push
```

Then, run the development server:

```bash
pnpm run dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser to see the web application.
The API is running at [http://localhost:3000](http://localhost:3000).

## UI Customization

React web apps in this stack share shadcn/ui primitives through `packages/ui`.

- Change design tokens and global styles in `packages/ui/src/styles/globals.css`
- Update shared primitives in `packages/ui/src/components/*`
- Adjust shadcn aliases or style config in `packages/ui/components.json` and `apps/web/components.json`

### Add more shared components

Run this from the project root to add more primitives to the shared UI package:

```bash
npx shadcn@latest add accordion dialog popover sheet table -c packages/ui
```

Import shared components like this:

```tsx
import { Button } from "@github-repositories-fllow/ui/components/button";
```

### Add app-specific blocks

If you want to add app-specific blocks instead of shared primitives, run the shadcn CLI from `apps/web`.

## Project Structure

```
github-repositories-fllow/
├── apps/
│   ├── web/         # Frontend application (React + React Router)
│   └── server/      # Backend API (Hono)
├── packages/
│   ├── ui/          # Shared shadcn/ui components and styles
│   └── db/          # Database schema & queries
```

## Available Scripts

- `pnpm run dev`: Start all applications in development mode
- `pnpm run build`: Build all applications
- `pnpm run dev:web`: Start only the web application
- `pnpm run dev:server`: Start only the server
- `pnpm run check-types`: Check TypeScript types across all apps
- `pnpm run db:push`: Push schema changes to database
- `pnpm run db:generate`: Generate database client/types
- `pnpm run db:migrate`: Run database migrations
- `pnpm run db:studio`: Open database studio UI

## 功能：GitHub 账户信息收集

Hono 同时提供「一个页面」和「一组接口」（`apps/server/src/app.ts`）：

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/` | 表单页面（填入 GitHub Personal Token） |
| POST | `/api/github` | 用 token 调 `api.github.com/user`，把账户信息用 Drizzle **增**一条记录 |
| GET | `/api/users` | 列出已保存账户 |
| DELETE | `/api/users/:id` | **删**一条记录 |
| GET | `/health` | 健康检查 |

数据表定义在 `packages/db/src/schema/github-users.ts`。

## 部署到 AWS（SAM）

整套基础设施由 `template.yaml` 定义，一条命令拉起：**VPC（1 个公有子网 + IGW + NAT，2 个私有子网）+ Aurora PostgreSQL Serverless v2 + Lambda(Hono) + HTTP API**。Lambda 与 Aurora 同 VPC、在两个私有子网里；Lambda 经 NAT 出网调用 GitHub API。

```
Internet → API Gateway → Lambda(私有子网×2, Hono) → Aurora(私有子网×2)
                              └→ NAT(公有子网) → api.github.com
```

### 手动部署（本地需 AWS CLI + SAM CLI）

```bash
pnpm install
pnpm --filter server build        # 产出自包含的 apps/server/dist/lambda.mjs
sam deploy                         # 读取 samconfig.toml（region: ap-northeast-1）
```

部署完成后，输出的 `ApiUrl` 即页面/接口地址。Lambda 冷启动时会幂等建表（`ensureSchema()`），无需手动跑 migration。

### 访问鉴权（Basic Auth）

页面与所有接口都受 Basic Auth 保护（`/health` 除外），避免任何人公开读写/删除数据。用户名默认 `admin`，密码由 SAM 自动生成在 `AuthSecret` 里。打开 `ApiUrl` 时浏览器会弹出登录框。取密码：

```bash
aws secretsmanager get-secret-value --region ap-northeast-1 \
  --secret-id <部署输出的 AuthSecretArn> --query SecretString --output text
```

> 本地开发不设 `BASIC_AUTH_USER`/`BASIC_AUTH_PASSWORD` 时鉴权自动关闭。

### CI 自动部署（GitHub Actions + OIDC，无长期密钥）

1. **一次性** 创建 OIDC Provider 和部署角色（`infra/github-oidc.yaml`）：

   ```bash
   aws cloudformation deploy \
     --region ap-northeast-1 \
     --stack-name github-oidc-deployer \
     --capabilities CAPABILITY_NAMED_IAM \
     --template-file infra/github-oidc.yaml \
     --parameter-overrides GitHubOrg=<你的GitHub用户名> GitHubRepo=github-repositories-fllow
   ```

2. 把输出的 `DeployRoleArn` 存到 GitHub 仓库 Secret：`AWS_DEPLOY_ROLE_ARN`。
3. push 到 `main`/`master` 即触发 `.github/workflows/deploy.yml`：构建 → OIDC 假设角色 → `sam validate` → `sam deploy`。

### 作业要求对照

| 要求 | 实现 |
| --- | --- |
| 1. Hono 接口 + 页面，SAM 部署到 AWS | `apps/server/src/{app,page}.ts` + `template.yaml` |
| 2. 表单用 token 取 GitHub 信息 + Drizzle 增删 | `apps/server/src/github.ts` + `packages/db/src/schema` |
| 3. 服务与数据库同 VPC（1 子网出网，2 子网部署 Lambda） | `template.yaml` 的 VPC/NAT/子网/Aurora/Lambda |
| 4. GitHub Actions + IAM 部署权限 | `infra/github-oidc.yaml` + `.github/workflows/deploy.yml` |
| 5. 自己的 JS 工作流完成开发 | pnpm monorepo + tsdown 打包（`apps/server/tsdown.config.ts`） |

> 成本提示：NAT 网关和 Aurora 实例按时计费。验收完用 `sam delete` 删除主栈即可释放资源（DB 已设 `DeletionPolicy: Delete`，不留快照）。
