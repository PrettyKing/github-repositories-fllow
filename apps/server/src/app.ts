import { env } from "@github-repositories-fllow/env/server";
import { Hono } from "hono";
import { basicAuth } from "hono/basic-auth";
import { cors } from "hono/cors";
import { logger } from "hono/logger";

import { generateBio } from "./openrouter";
import type { RawProfile } from "./openrouter";

export const app = new Hono();

// Go 服务地址（云端为 Cloud Map 内网 DNS）。Lambda 只做校验/转发/OpenRouter，不连库。
const goBase = env.GO_API_URL.replace(/\/$/, "");

app.use(logger());
app.use(
  "/api/*",
  cors({
    origin: env.CORS_ORIGIN,
    allowMethods: ["GET", "POST", "DELETE", "OPTIONS"],
  }),
);

// 鉴权：配置了 Basic Auth 凭据时保护页面与所有接口（/health 放行给监控）。
// 这是 Lambda 侧的「校验」职责；更细的业务校验由 Go（最终校验方）负责。
if (env.BASIC_AUTH_USER && env.BASIC_AUTH_PASSWORD) {
  const guard = basicAuth({
    username: env.BASIC_AUTH_USER,
    password: env.BASIC_AUTH_PASSWORD,
  });
  app.use("*", (c, next) => (c.req.path === "/health" ? next() : guard(c, next)));
}

// 转发时复用来路请求头（含 Authorization 透传给 Go），去掉会导致目标不一致的头。
function forwardHeaders(h: Headers): Headers {
  const out = new Headers(h);
  out.delete("host");
  out.delete("content-length");
  return out;
}

// 健康检查：反映 Lambda 自身存活；数据库探活由 Go 的 /health 负责，Lambda 不连库。
app.get("/health", (c) => c.json({ status: "ok", role: "proxy" }));

// profile：转发到 Go 取原始公开信息后，调 OpenRouter 生成 introduction 合并返回。
// 这是「Lambda 调 OpenRouter 生成 bio」的落点。注册在通用代理之前，优先匹配。
app.get("/api/profile/:username", async (c) => {
  const target = `${goBase}/api/profile/${encodeURIComponent(c.req.param("username"))}`;
  try {
    const res = await fetch(target, { headers: forwardHeaders(c.req.raw.headers) });
    if (!res.ok) {
      const text = await res.text();
      return new Response(text, {
        status: res.status,
        headers: { "content-type": "application/json" },
      });
    }
    const raw = (await res.json()) as RawProfile;
    const introduction = await generateBio(raw);
    return c.json({ ...raw, introduction });
  } catch {
    return c.json({ error: "Go 服务不可达" }, 502);
  }
});

// 其余 /api/* 透明转发到 Go（Go 是唯一 DB 访问方）。
app.all("/api/*", async (c) => {
  const url = new URL(c.req.url);
  const target = `${goBase}${url.pathname}${url.search}`;
  const method = c.req.method;
  const init: RequestInit = { method, headers: forwardHeaders(c.req.raw.headers) };
  if (method !== "GET" && method !== "HEAD") {
    // 缓冲 body 再转发：跨 API Gateway/ALB 适配器比透传流更稳（请求体都很小）。
    init.body = await c.req.arrayBuffer();
  }
  try {
    const res = await fetch(target, init);
    return new Response(res.body, { status: res.status, headers: res.headers });
  } catch {
    return c.json({ error: "Go 服务不可达" }, 502);
  }
});

// 前端已迁到 Cloudflare Pages（Next.js 静态导出），Lambda 不再托管任何静态资源，
// 只做「校验 + 转发 + OpenRouter」的纯 API 网关。根路径无内容返回 JSON 提示。
app.get("/", (c) => c.json({ service: "api-gateway", web: "https://app.faithcal.xyz" }));
