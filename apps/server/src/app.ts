import { db, ensureSchema, githubUsers } from "@github-repositories-fllow/db";
import { env } from "@github-repositories-fllow/env/server";
import { desc, eq } from "drizzle-orm";
import { Hono } from "hono";
import { basicAuth } from "hono/basic-auth";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { z } from "zod";

import { fetchGithubUser, toNewGithubUser } from "./github";
import { pageHtml } from "./page";

export const app = new Hono();

app.use(logger());
app.use(
  "/api/*",
  cors({
    origin: env.CORS_ORIGIN,
    allowMethods: ["GET", "POST", "DELETE", "OPTIONS"],
  }),
);

// 鉴权：配置了 Basic Auth 凭据时，保护页面与所有接口（/health 放行给监控）。
// 页面、列表、增、删都在网关之后，避免任何人公开读写/删除数据。
if (env.BASIC_AUTH_USER && env.BASIC_AUTH_PASSWORD) {
  const guard = basicAuth({
    username: env.BASIC_AUTH_USER,
    password: env.BASIC_AUTH_PASSWORD,
  });
  app.use("*", (c, next) => (c.req.path === "/health" ? next() : guard(c, next)));
}

// 用库前确保表存在（幂等，容器内只跑一次）
app.use("/api/*", async (_c, next) => {
  await ensureSchema();
  return next();
});

// 一个页面：返回表单 HTML
app.get("/", (c) => c.html(pageHtml));

// 健康检查（API Gateway / 监控用）
app.get("/health", (c) => c.json({ status: "ok" }));

const tokenSchema = z.object({ token: z.string().min(1, "token 不能为空") });

// 一个接口：用 token 拉 GitHub 账户信息并「增」一条记录
app.post("/api/github", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const parsed = tokenSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: parsed.error.issues[0]?.message ?? "参数错误" }, 400);
  }

  try {
    const ghUser = await fetchGithubUser(parsed.data.token);
    const [row] = await db.insert(githubUsers).values(toNewGithubUser(ghUser)).returning();
    return c.json(row, 201);
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : "未知错误" }, 502);
  }
});

// 列表
app.get("/api/users", async (c) => {
  const rows = await db.select().from(githubUsers).orderBy(desc(githubUsers.createdAt));
  return c.json(rows);
});

// 「删」一条记录
app.delete("/api/users/:id", async (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id)) return c.json({ error: "id 非法" }, 400);
  await db.delete(githubUsers).where(eq(githubUsers.id, id));
  return c.json({ ok: true });
});
