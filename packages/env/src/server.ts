import "dotenv/config";
import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

export const env = createEnv({
  server: {
    DATABASE_URL: z.string().min(1),
    // Aurora/RDS 需要 SSL；本地 Postgres 可不设。接受 "true"/"1" 开启。
    DATABASE_SSL: z
      .union([z.string(), z.boolean()])
      .optional()
      .transform((v) => v === true || v === "true" || v === "1"),
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
