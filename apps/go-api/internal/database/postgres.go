package database

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5/pgxpool"
)

func Connect(ctx context.Context, databaseURL string) (*pgxpool.Pool, error) {
	if databaseURL == "" {
		return nil, fmt.Errorf("DATABASE_URL is required")
	}

	pool, err := pgxpool.New(ctx, databaseURL)
	if err != nil {
		return nil, fmt.Errorf("create database pool: %w", err)
	}

	if err := pool.Ping(ctx); err != nil {
		pool.Close()
		return nil, fmt.Errorf("ping database: %w", err)
	}

	return pool, nil
}

// EnsureSchema mirrors the existing Node runtime DDL so both services share one schema.
func EnsureSchema(ctx context.Context, pool *pgxpool.Pool) error {
	statements := []string{
		`CREATE TABLE IF NOT EXISTS github_users (
			id serial PRIMARY KEY,
			github_id integer NOT NULL,
			login text NOT NULL,
			name text,
			avatar_url text,
			bio text,
			company text,
			location text,
			public_repos integer DEFAULT 0 NOT NULL,
			followers integer DEFAULT 0 NOT NULL,
			following integer DEFAULT 0 NOT NULL,
			html_url text,
			created_at timestamp DEFAULT now() NOT NULL
		)`,
		`ALTER TABLE github_users ADD COLUMN IF NOT EXISTS updated_at timestamp DEFAULT now() NOT NULL`,
		`DELETE FROM github_users a USING github_users b WHERE a.github_id = b.github_id AND a.id < b.id`,
		`CREATE UNIQUE INDEX IF NOT EXISTS github_users_github_id_key ON github_users (github_id)`,
		`CREATE TABLE IF NOT EXISTS github_repos (
			id serial PRIMARY KEY,
			user_id integer NOT NULL REFERENCES github_users(id) ON DELETE CASCADE,
			repo_id integer NOT NULL,
			name text NOT NULL,
			full_name text NOT NULL,
			html_url text NOT NULL,
			description text,
			language text,
			stargazers_count integer DEFAULT 0 NOT NULL,
			forks_count integer DEFAULT 0 NOT NULL,
			is_private boolean DEFAULT false NOT NULL,
			pushed_at timestamp,
			created_at timestamp DEFAULT now() NOT NULL
		)`,
		`CREATE INDEX IF NOT EXISTS github_repos_user_id_idx ON github_repos (user_id)`,
		`CREATE UNIQUE INDEX IF NOT EXISTS github_repos_user_id_repo_id_unique ON github_repos (user_id, repo_id)`,
	}

	for _, statement := range statements {
		if _, err := pool.Exec(ctx, statement); err != nil {
			return fmt.Errorf("ensure schema: %w", err)
		}
	}

	return nil
}
