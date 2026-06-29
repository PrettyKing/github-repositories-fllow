CREATE TABLE "github_repos" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
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
);
--> statement-breakpoint
ALTER TABLE "github_users" ADD COLUMN "updated_at" timestamp DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "github_repos" ADD CONSTRAINT "github_repos_user_id_github_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."github_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "github_repos_user_id_idx" ON "github_repos" USING btree ("user_id");--> statement-breakpoint
-- 历史去重：保留每个 github_id 最大 id（最新行），删除其余，否则下行唯一约束会失败回滚
DELETE FROM "github_users" a USING "github_users" b WHERE a.github_id = b.github_id AND a.id < b.id;--> statement-breakpoint
ALTER TABLE "github_users" ADD CONSTRAINT "github_users_github_id_unique" UNIQUE("github_id");