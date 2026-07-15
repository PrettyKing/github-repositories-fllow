// Cloudflare Pages 高级模式 worker（Next 会把 public/_worker.js 拷进 out/，部署后即生效）。
// - /api/* 同源代理到后端 API Gateway，并注入 Basic Auth（凭据只在 Pages 环境变量里，前端不暴露、API 仍受保护）
// - 其余请求交给静态资源（Next.js 静态导出）
export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname.startsWith("/api/")) {
      const origin = (env.API_ORIGIN || "").replace(/\/$/, "");
      if (!origin) {
        return new Response(JSON.stringify({ error: "API_ORIGIN 未配置" }), {
          status: 500,
          headers: { "content-type": "application/json" },
        });
      }
      const target = origin + url.pathname + url.search;
      const headers = new Headers(request.headers);
      headers.delete("host");
      // 注入 Basic Auth（配了才注入；这样浏览器无需弹框，API 仍受保护）
      if (env.BASIC_AUTH_USER && env.BASIC_AUTH_PASSWORD) {
        headers.set(
          "Authorization",
          "Basic " + btoa(`${env.BASIC_AUTH_USER}:${env.BASIC_AUTH_PASSWORD}`),
        );
      }
      const init = { method: request.method, headers };
      if (request.method !== "GET" && request.method !== "HEAD") {
        init.body = request.body;
      }
      return fetch(target, init);
    }

    // 非 /api：静态资源（首页 index.html 等）
    return env.ASSETS.fetch(request);
  },
};
