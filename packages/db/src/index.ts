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
 * 因此首次用库前由运行时确保表存在（DDL 与 drizzle migration 0000 保持一致）。
 * 用 module 级 promise 缓存，整个容器生命周期只执行一次。
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
      .then(() => undefined)
      .catch((err) => {
        // 失败时重置，下次请求可重试
        schemaReady = undefined;
        throw err;
      });
  }
  return schemaReady;
}
