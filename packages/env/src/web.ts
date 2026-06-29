import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

export const env = createEnv({
  clientPrefix: "VITE_",
  client: {
    // 生产前端与接口同源、走相对 /api，不依赖该变量；保留为可选仅供需要时覆盖。
    VITE_SERVER_URL: z.url().optional(),
  },
  runtimeEnv: (import.meta as any).env,
  skipValidation: !!process.env.SKIP_ENV_VALIDATION,
  emptyStringAsUndefined: true,
});
