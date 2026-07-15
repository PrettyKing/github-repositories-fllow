import "dotenv/config";
import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

export const env = createEnv({
  server: {
    // 仅 packages/db（本地 migration/studio 工具）与 Go 服务用；Lambda 薄代理不连库，故可选。
    DATABASE_URL: z.string().min(1).optional(),
    // Aurora/RDS 需要 SSL；本地 Postgres 可不设。接受 "true"/"1" 开启。
    DATABASE_SSL: z
      .union([z.string(), z.boolean()])
      .optional()
      .transform((v) => v === true || v === "true" || v === "1"),
    // Lambda 薄代理把 /api/* 转发到的 Go 服务地址（云端为 Cloud Map 内网 DNS）。
    GO_API_URL: z.url().default("http://localhost:8080"),
    // OpenRouter：Lambda 调它生成 profile 的个人介绍；未配置则回退到模板串。
    OPENROUTER_API_KEY: z.string().optional(),
    OPENROUTER_MODEL: z.string().default("openai/gpt-4o-mini"),
    // 允许 "*"（同源页面放开跨域）或具体 URL
    CORS_ORIGIN: z.union([z.literal("*"), z.url()]),
    // 配置后启用 Basic Auth 保护页面与接口；本地开发可不设。
    BASIC_AUTH_USER: z.string().optional(),
    BASIC_AUTH_PASSWORD: z.string().optional(),
    NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  },
  runtimeEnv: process.env,
  skipValidation: !!process.env.SKIP_ENV_VALIDATION,
  emptyStringAsUndefined: true,
});
