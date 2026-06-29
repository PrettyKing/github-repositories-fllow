import {
  boolean,
  index,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
  unique,
} from "drizzle-orm/pg-core";

import { githubUsers } from "./github-users";

/**
 * 保存账户的 GitHub 仓库列表。
 * user_id 外键级联删除：删账户时仓库行自动清除，不留孤儿数据。
 */
export const githubRepos = pgTable(
  "github_repos",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => githubUsers.id, { onDelete: "cascade" }),
    repoId: integer("repo_id").notNull(),
    name: text("name").notNull(),
    fullName: text("full_name").notNull(),
    htmlUrl: text("html_url").notNull(),
    description: text("description"),
    language: text("language"),
    stargazersCount: integer("stargazers_count").notNull().default(0),
    forksCount: integer("forks_count").notNull().default(0),
    isPrivate: boolean("is_private").notNull().default(false),
    pushedAt: timestamp("pushed_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    index("github_repos_user_id_idx").on(table.userId),
    // 同一账户下同一仓库唯一：防止并发同步产生重复行、避免 stats 计数膨胀
    unique("github_repos_user_id_repo_id_unique").on(table.userId, table.repoId),
  ],
);

export type GithubRepo = typeof githubRepos.$inferSelect;
export type NewGithubRepo = typeof githubRepos.$inferInsert;
