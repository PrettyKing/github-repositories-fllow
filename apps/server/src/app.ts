import type { GithubUser } from "@github-repositories-fllow/db";
import { db, ensureSchema, githubRepos, githubUsers } from "@github-repositories-fllow/db";
import { env } from "@github-repositories-fllow/env/server";
import { serveStatic } from "@hono/node-server/serve-static";
import { desc, eq, isNotNull, sql } from "drizzle-orm";
import { Hono } from "hono";
import { basicAuth } from "hono/basic-auth";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { z } from "zod";

import type { GithubApiUser } from "./github";
import { fetchGithubRepos, fetchGithubUser, toNewGithubRepos, toNewGithubUser } from "./github";

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

// 健康检查（API Gateway / 监控用）
app.get("/health", (c) => c.json({ status: "ok" }));

const tokenSchema = z.object({ token: z.string().min(1, "token 不能为空") });

/**
 * 共享：upsert 账户 + 事务内重置仓库，返回更新后的账户行。
 * POST /api/github 与 POST /api/users/:id/refresh 都走此函数，避免重复逻辑。
 */
interface SyncResult {
  row: GithubUser;
  created: boolean;
  reposCount: number;
  truncated: boolean;
}

async function syncGithubData(ghUser: GithubApiUser, token: string): Promise<SyncResult> {
  const newUser = toNewGithubUser(ghUser);

  // 先判断是新建还是更新（供响应区分 created）
  const [existing] = await db
    .select({ id: githubUsers.id })
    .from(githubUsers)
    .where(eq(githubUsers.githubId, ghUser.id))
    .limit(1);
  const created = !existing;

  // 单语句 upsert 避免并发竞态；conflict 时更新业务字段，不改 created_at
  const [row] = await db
    .insert(githubUsers)
    .values(newUser)
    .onConflictDoUpdate({
      target: githubUsers.githubId,
      set: {
        login: newUser.login,
        name: newUser.name ?? null,
        avatarUrl: newUser.avatarUrl ?? null,
        bio: newUser.bio ?? null,
        company: newUser.company ?? null,
        location: newUser.location ?? null,
        publicRepos: newUser.publicRepos ?? 0,
        followers: newUser.followers ?? 0,
        following: newUser.following ?? 0,
        htmlUrl: newUser.htmlUrl ?? null,
        updatedAt: sql`now()`,
      },
    })
    .returning();

  if (!row) throw new Error("账户 upsert 异常");

  // 翻页拉取自有仓库（上限 300）
  const { repos: apiRepos, truncated } = await fetchGithubRepos(token);
  const newRepos = toNewGithubRepos(row.id, apiRepos);

  // 先删后插必须在事务内，避免删成功插失败导致仓库数据丢失；
  // onConflictDoNothing 兜并发：复合唯一约束 (user_id, repo_id) 下不硬失败
  await db.transaction(async (tx) => {
    await tx.delete(githubRepos).where(eq(githubRepos.userId, row.id));
    if (newRepos.length > 0) {
      await tx.insert(githubRepos).values(newRepos).onConflictDoNothing();
    }
  });

  return { row, created, reposCount: newRepos.length, truncated };
}

// 新增/更新账户：用 token 拉 GitHub 账户信息并 upsert，同步仓库
app.post("/api/github", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const parsed = tokenSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: parsed.error.issues[0]?.message ?? "参数错误" }, 400);
  }

  try {
    const ghUser = await fetchGithubUser(parsed.data.token);
    const { row, created, reposCount, truncated } = await syncGithubData(
      ghUser,
      parsed.data.token,
    );
    return c.json({ ...row, created, reposCount, truncated }, created ? 201 : 200);
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : "未知错误" }, 502);
  }
});

// 账户列表（select * 含 updatedAt，createdAt 倒序）
app.get("/api/users", async (c) => {
  const rows = await db.select().from(githubUsers).orderBy(desc(githubUsers.createdAt));
  return c.json(rows);
});

// 删除账户（仓库由 DB 外键 ON DELETE CASCADE 自动清除，无需应用层手删）
app.delete("/api/users/:id", async (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id) || id <= 0) return c.json({ error: "id 非法" }, 400);
  await db.delete(githubUsers).where(eq(githubUsers.id, id));
  return c.json({ ok: true });
});

// 查询账户仓库列表，按 pushedAt 倒序，未推送的仓库排最后
app.get("/api/users/:id/repos", async (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id) || id <= 0) return c.json({ error: "id 非法" }, 400);

  const rows = await db
    .select()
    .from(githubRepos)
    .where(eq(githubRepos.userId, id))
    .orderBy(sql`${githubRepos.pushedAt} DESC NULLS LAST`);
  return c.json(rows);
});

// 刷新账户：用新 token 重新同步该账户的 GitHub 信息与仓库
app.post("/api/users/:id/refresh", async (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id) || id <= 0) return c.json({ error: "id 非法" }, 400);

  const body = await c.req.json().catch(() => ({}));
  const parsed = tokenSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: parsed.error.issues[0]?.message ?? "参数错误" }, 400);
  }
  const { token } = parsed.data;

  try {
    // 确认目标账户存在
    const [target] = await db
      .select({ githubId: githubUsers.githubId })
      .from(githubUsers)
      .where(eq(githubUsers.id, id))
      .limit(1);
    if (!target) return c.json({ error: "用户不存在" }, 400);

    const ghUser = await fetchGithubUser(token);

    // 校验 token 对应的 GitHub 账户与目标记录一致，防止用别的 token 错刷
    if (ghUser.id !== target.githubId) {
      return c.json({ error: "Token 与目标账户不匹配" }, 400);
    }

    const { row, reposCount, truncated } = await syncGithubData(ghUser, token);
    return c.json({ ...row, reposCount, truncated });
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : "未知错误" }, 502);
  }
});

// 统计面板：聚合账户数、仓库数、followers 合计、语言分布
app.get("/api/stats", async (c) => {
  try {
    const TOP_LANG = 8;

    const [[userAgg], [repoAgg], topUsers, langRows] = await Promise.all([
      // 账户汇总（空表时 count=0，sum 用 coalesce 兜 null）
      db
        .select({
          users: sql<number>`count(*)::int`,
          totalFollowers: sql<number>`coalesce(sum(${githubUsers.followers}), 0)::int`,
          totalPublicRepos: sql<number>`coalesce(sum(${githubUsers.publicRepos}), 0)::int`,
        })
        .from(githubUsers),
      // 仓库总数
      db.select({ repos: sql<number>`count(*)::int` }).from(githubRepos),
      // Top 5 账户（followers 倒序）
      db
        .select({
          login: githubUsers.login,
          name: githubUsers.name,
          followers: githubUsers.followers,
        })
        .from(githubUsers)
        .orderBy(desc(githubUsers.followers))
        .limit(5),
      // 语言分布（仅非 null，按出现次数倒序）
      db
        .select({
          name: githubRepos.language,
          count: sql<number>`count(*)::int`,
        })
        .from(githubRepos)
        .where(isNotNull(githubRepos.language))
        .groupBy(githubRepos.language)
        .orderBy(sql`count(*) desc`),
    ]);

    const totalRepoCount = repoAgg?.repos ?? 0;

    // 语言占比分母用「有语言的仓库总数」（排除 language=null），确保各占比之和≈100%
    const languagedTotal = langRows.reduce((acc, r) => acc + r.count, 0);

    // 取前 TOP_LANG 语言，其余归并为「其他」
    const topLangs = langRows.slice(0, TOP_LANG);
    const otherCount = langRows.slice(TOP_LANG).reduce((acc, r) => acc + r.count, 0);

    const languages = [
      ...topLangs.map((r) => ({
        name: r.name ?? "Unknown",
        count: r.count,
        percent: languagedTotal > 0 ? Math.round((r.count / languagedTotal) * 100) : 0,
      })),
      ...(otherCount > 0
        ? [
            {
              name: "其他",
              count: otherCount,
              percent:
                languagedTotal > 0 ? Math.round((otherCount / languagedTotal) * 100) : 0,
            },
          ]
        : []),
    ];

    return c.json({
      users: userAgg?.users ?? 0,
      repos: totalRepoCount,
      totalFollowers: userAgg?.totalFollowers ?? 0,
      totalPublicRepos: userAgg?.totalPublicRepos ?? 0,
      topUsers,
      languages,
    });
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : "统计查询失败" }, 502);
  }
});

// 未匹配的 /api 路径返回 JSON 404，避免被下方 SPA fallback 当作页面返回 HTML
// （否则前端 fetch 见 200 后用 res.json() 解析 HTML 抛 SyntaxError）。
app.all("/api/*", (c) => c.json({ error: "Not Found" }, 404));

// ── 前端 React SPA（同 Lambda 托管静态）─────────────────────────
// 静态资源置于部署包内的 client/（构建时由 web 产出拷入 dist/client）。
// root 相对启动时 cwd：Lambda = /var/task，故解析为 /var/task/client。
// 注册在 /api 与 /health 之后，确保接口优先匹配、不被静态/兜底吞掉。
app.use("*", serveStatic({ root: "./client", index: "index.html" }));
// SPA fallback：未命中静态文件的客户端路由统一回 index.html，由前端接管路由。
app.get("*", serveStatic({ path: "./client/index.html" }));
