# 代码规范

## TypeScript

- 全仓 `strict`，额外开启 `noUncheckedIndexedAccess`、`noUnusedLocals`、`noUnusedParameters`、`noFallthroughCasesInSwitch`（见 `packages/config/tsconfig.base.json`）。新代码不得引入未使用变量/参数、不得忽略索引可空性。
- `verbatimModuleSyntax` + `isolatedModules`：只用 `import type` 导入类型；ESM only（`"type": "module"`）。
- 模块解析 `bundler`，导入路径不带扩展名；跨包用 `@github-repositories-fllow/*` 别名。

## 命名与结构

- 文件 kebab-case；导出值/函数 camelCase；类型/接口 PascalCase。
- DB 列名 snake_case（`github_id`），TS 字段 camelCase（`githubId`），映射集中在 `toNewGithubUser()` 一类纯函数里。
- 后端按职责分文件：路由（`app.ts`）/ 页面（`page.ts`）/ 外部取数（`github.ts`）/ 运行入口（`lambda.ts`、`index.ts`），不要把它们揉成一个文件。

## 错误处理

- 外部调用（GitHub API、DB）失败抛出**带友好信息**的 `Error`，由路由层统一转 `{ error: message }` + 合适状态码（入参错 400 / 上游错 502）。
- 解析不可信输入用 zod `safeParse`，失败返回首条 issue message；body 可能非 JSON 时用 `.catch(() => ({}))` 兜底再交 zod。

## 注释

- 用中文注释解释「为什么」（如幂等建表的动机、踩坑约束），不复述「做了什么」。保持与现有文件相当的注释密度。

## 格式化

- 仓库未配置 biome/eslint/prettier；沿用现有风格（2 空格缩进、双引号、尾随逗号、分号）。提交前跑 `pnpm check-types` 必须零错误。
