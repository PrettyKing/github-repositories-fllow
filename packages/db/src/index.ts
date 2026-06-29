import { env } from "@github-repositories-fllow/env/server";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import * as schema from "./schema";

export * from "./schema";

export function createDb() {
  const pool = new Pool({
    connectionString: env.DATABASE_URL,
    // Aurora/RDS 强制 TLS；VPC 内连接用 rejectUnauthorized:false 即可。
    ssl: env.DATABASE_SSL ? { rejectUnauthorized: false } : undefined,
  });
  return drizzle(pool, { schema });
}

export const db = createDb();

/**
 * 幂等建表。Lambda 在私有子网内，CI 无法直连 Aurora，
 * 因此首次用库前由运行时确保表存在（DDL 与 drizzle migration 保持一致）。
 * 用 module 级 promise 缓存，整个容器生命周期只执行一次。
 *
 * 执行顺序约束（不可乱序）：
 * 1. 建 github_users 表（原始列）
 * 2. 补 updated_at 列（ALTER ADD COLUMN IF NOT EXISTS 幂等）
 * 3. 去重：保留每个 github_id 最大 id，删除其余（必须在建唯一索引前完成）
 * 4. 建 github_id 唯一索引（去重后才能安全建，重复行会导致此步失败）
 * 5. 建 github_repos 表（含 user_id 外键级联删除）
 * 6. 建 user_id 索引（加速按账户查仓库）
 */
let schemaReady: Promise<void> | undefined;
export function ensureSchema(): Promise<void> {
  if (!schemaReady) {
    schemaReady = db
      .execute(
        sql`CREATE TABLE IF NOT EXISTS "github_users" (
          "id" serial PRIMARY KEY NOT NULL,
          "github_id" integer NOT NULL,
          "login" text NOT NULL,
          "name" text,
          "avatar_url" text,
          "bio" text,
          "company" text,
          "location" text,
          "public_repos" integer DEFAULT 0 NOT NULL,
          "followers" integer DEFAULT 0 NOT NULL,
          "following" integer DEFAULT 0 NOT NULL,
          "html_url" text,
          "created_at" timestamp DEFAULT now() NOT NULL
        )`,
      )
      .then(() =>
        db.execute(
          sql`ALTER TABLE "github_users" ADD COLUMN IF NOT EXISTS "updated_at" timestamp DEFAULT now() NOT NULL`,
        ),
      )
      // 去重必须在建唯一索引前：保留每个 github_id 最大 id（最新行），删除其余
      .then(() =>
        db.execute(
          sql`DELETE FROM github_users a USING github_users b WHERE a.github_id = b.github_id AND a.id < b.id`,
        ),
      )
      .then(() =>
        db.execute(
          sql`CREATE UNIQUE INDEX IF NOT EXISTS github_users_github_id_key ON github_users (github_id)`,
        ),
      )
      .then(() =>
        db.execute(
          sql`CREATE TABLE IF NOT EXISTS "github_repos" (
            "id" serial PRIMARY KEY NOT NULL,
            "user_id" integer NOT NULL REFERENCES "github_users"("id") ON DELETE CASCADE,
            "repo_id" integer NOT NULL,
            "name" text NOT NULL,
            "full_name" text NOT NULL,
            "html_url" text NOT NULL,
            "description" text,
            "language" text,
            "stargazers_count" integer DEFAULT 0 NOT NULL,
            "forks_count" integer DEFAULT 0 NOT NULL,
            "is_private" boolean DEFAULT false NOT NULL,
            "pushed_at" timestamp,
            "created_at" timestamp DEFAULT now() NOT NULL
          )`,
        ),
      )
      .then(() =>
        db.execute(
          sql`CREATE INDEX IF NOT EXISTS github_repos_user_id_idx ON github_repos (user_id)`,
        ),
      )
      // 同账户同仓库唯一：防并发同步产生重复仓库行
      .then(() =>
        db.execute(
          sql`CREATE UNIQUE INDEX IF NOT EXISTS github_repos_user_id_repo_id_unique ON github_repos (user_id, repo_id)`,
        ),
      )
      .then(() => undefined)
      .catch((err: unknown) => {
        // 失败时重置，下次请求可重试
        schemaReady = undefined;
        throw err;
      });
  }
  return schemaReady;
}
