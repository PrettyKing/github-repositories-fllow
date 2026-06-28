import { integer, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

/**
 * 保存通过个人 token 拉取到的 GitHub 账户信息。
 * 每提交一次 token 就「增」一条记录，列表里可「删」一条记录。
 */
export const githubUsers = pgTable("github_users", {
  id: serial("id").primaryKey(),
  githubId: integer("github_id").notNull(),
  login: text("login").notNull(),
  name: text("name"),
  avatarUrl: text("avatar_url"),
  bio: text("bio"),
  company: text("company"),
  location: text("location"),
  publicRepos: integer("public_repos").notNull().default(0),
  followers: integer("followers").notNull().default(0),
  following: integer("following").notNull().default(0),
  htmlUrl: text("html_url"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type GithubUser = typeof githubUsers.$inferSelect;
export type NewGithubUser = typeof githubUsers.$inferInsert;
