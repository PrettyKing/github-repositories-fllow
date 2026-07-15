package repository

import (
	"context"
	"errors"
	"fmt"
	"math"

	"github.com/PrettyKing/github-repositories-fllow/apps/go-api/internal/github"
	"github.com/PrettyKing/github-repositories-fllow/apps/go-api/internal/model"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type GitHubUserRepository struct {
	db *pgxpool.Pool
}

func NewGitHubUserRepository(db *pgxpool.Pool) *GitHubUserRepository {
	return &GitHubUserRepository{db: db}
}

// SyncUserAndRepos upsert 账户并整表重置其仓库，全程在一个事务内完成。
// 与 Node 端 syncGithubData 对齐：先删后插必须同事务，避免删成功插失败丢数据；
// 返回 created（是否新建，供上层区分 201/200）与实际入库仓库数。
func (r *GitHubUserRepository) SyncUserAndRepos(
	ctx context.Context,
	source github.User,
	repos []github.Repo,
) (model.GitHubUser, bool, int, error) {
	tx, err := r.db.Begin(ctx)
	if err != nil {
		return model.GitHubUser{}, false, 0, fmt.Errorf("begin tx: %w", err)
	}
	defer tx.Rollback(ctx)

	// 先判断新建还是更新（镜像 Node：upsert 无法直接区分，故先查存在性）
	var existingID int64
	created := false
	if err := tx.QueryRow(ctx,
		`SELECT id FROM github_users WHERE github_id = $1`, source.ID,
	).Scan(&existingID); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			created = true
		} else {
			return model.GitHubUser{}, false, 0, fmt.Errorf("check existing user: %w", err)
		}
	}

	var user model.GitHubUser
	if err := tx.QueryRow(ctx, `
		INSERT INTO github_users (
			github_id, login, name, avatar_url, bio, company, location,
			public_repos, followers, following, html_url
		) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
		ON CONFLICT (github_id) DO UPDATE SET
			login = EXCLUDED.login,
			name = EXCLUDED.name,
			avatar_url = EXCLUDED.avatar_url,
			bio = EXCLUDED.bio,
			company = EXCLUDED.company,
			location = EXCLUDED.location,
			public_repos = EXCLUDED.public_repos,
			followers = EXCLUDED.followers,
			following = EXCLUDED.following,
			html_url = EXCLUDED.html_url,
			updated_at = now()
		RETURNING id, github_id, login, name, avatar_url, bio, company, location,
		          public_repos, followers, following, html_url, created_at, updated_at
	`, source.ID, source.Login, source.Name, source.AvatarURL, source.Bio, source.Company,
		source.Location, source.PublicRepos, source.Followers, source.Following, source.HTMLURL,
	).Scan(
		&user.ID, &user.GitHubID, &user.Login, &user.Name, &user.AvatarURL,
		&user.Bio, &user.Company, &user.Location, &user.PublicRepos,
		&user.Followers, &user.Following, &user.HTMLURL, &user.CreatedAt, &user.UpdatedAt,
	); err != nil {
		return model.GitHubUser{}, false, 0, fmt.Errorf("upsert github user: %w", err)
	}

	// 先清空该账户旧仓库，再逐条插入；复合唯一约束下 DO NOTHING 兜并发
	if _, err := tx.Exec(ctx,
		`DELETE FROM github_repos WHERE user_id = $1`, user.ID,
	); err != nil {
		return model.GitHubUser{}, false, 0, fmt.Errorf("clear repos: %w", err)
	}
	for _, repo := range repos {
		if _, err := tx.Exec(ctx, `
			INSERT INTO github_repos (
				user_id, repo_id, name, full_name, html_url, description, language,
				stargazers_count, forks_count, is_private, pushed_at
			) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
			ON CONFLICT (user_id, repo_id) DO NOTHING
		`, user.ID, repo.ID, repo.Name, repo.FullName, repo.HTMLURL, repo.Description,
			repo.Language, repo.StargazersCount, repo.ForksCount, repo.Private, repo.PushedAt,
		); err != nil {
			return model.GitHubUser{}, false, 0, fmt.Errorf("insert repo: %w", err)
		}
	}

	if err := tx.Commit(ctx); err != nil {
		return model.GitHubUser{}, false, 0, fmt.Errorf("commit tx: %w", err)
	}

	return user, created, len(repos), nil
}

func (r *GitHubUserRepository) List(ctx context.Context) ([]model.GitHubUser, error) {
	rows, err := r.db.Query(ctx, `
		SELECT id, github_id, login, name, avatar_url, bio, company, location,
		       public_repos, followers, following, html_url, created_at, updated_at
		FROM github_users
		ORDER BY created_at DESC
	`)
	if err != nil {
		return nil, fmt.Errorf("query github users: %w", err)
	}
	defer rows.Close()

	users := make([]model.GitHubUser, 0)
	for rows.Next() {
		var user model.GitHubUser
		if err := rows.Scan(
			&user.ID, &user.GitHubID, &user.Login, &user.Name, &user.AvatarURL,
			&user.Bio, &user.Company, &user.Location, &user.PublicRepos,
			&user.Followers, &user.Following, &user.HTMLURL, &user.CreatedAt, &user.UpdatedAt,
		); err != nil {
			return nil, fmt.Errorf("scan github user: %w", err)
		}
		users = append(users, user)
	}

	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate github users: %w", err)
	}

	return users, nil
}

// GetGithubID 取账户对应的 github_id，用于 refresh 时校验 token 与目标账户一致。
// 第二返回值表示账户是否存在。
func (r *GitHubUserRepository) GetGithubID(ctx context.Context, id int64) (int64, bool, error) {
	var githubID int64
	err := r.db.QueryRow(ctx, `SELECT github_id FROM github_users WHERE id = $1`, id).Scan(&githubID)
	if errors.Is(err, pgx.ErrNoRows) {
		return 0, false, nil
	}
	if err != nil {
		return 0, false, fmt.Errorf("get github id: %w", err)
	}
	return githubID, true, nil
}

// Delete 删账户；仓库由外键 ON DELETE CASCADE 自动清除，无需应用层手删。
func (r *GitHubUserRepository) Delete(ctx context.Context, id int64) error {
	if _, err := r.db.Exec(ctx, `DELETE FROM github_users WHERE id = $1`, id); err != nil {
		return fmt.Errorf("delete github user: %w", err)
	}
	return nil
}

// ListRepos 按 pushed_at 倒序返回某账户的仓库，未推送的排最后。
func (r *GitHubUserRepository) ListRepos(ctx context.Context, userID int64) ([]model.GitHubRepo, error) {
	rows, err := r.db.Query(ctx, `
		SELECT id, user_id, repo_id, name, full_name, html_url, description, language,
		       stargazers_count, forks_count, is_private, pushed_at, created_at
		FROM github_repos
		WHERE user_id = $1
		ORDER BY pushed_at DESC NULLS LAST
	`, userID)
	if err != nil {
		return nil, fmt.Errorf("query github repos: %w", err)
	}
	defer rows.Close()

	repos := make([]model.GitHubRepo, 0)
	for rows.Next() {
		var repo model.GitHubRepo
		if err := rows.Scan(
			&repo.ID, &repo.UserID, &repo.RepoID, &repo.Name, &repo.FullName, &repo.HTMLURL,
			&repo.Description, &repo.Language, &repo.StargazersCount, &repo.ForksCount,
			&repo.IsPrivate, &repo.PushedAt, &repo.CreatedAt,
		); err != nil {
			return nil, fmt.Errorf("scan github repo: %w", err)
		}
		repos = append(repos, repo)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate github repos: %w", err)
	}
	return repos, nil
}

// Stats 聚合统计：账户/仓库数、followers 合计、Top5 账户、语言分布（Top8 + 其他）。
// 与 Node 端 /api/stats 对齐：语言占比分母用「有语言的仓库数」，确保各占比之和≈100%。
func (r *GitHubUserRepository) Stats(ctx context.Context) (model.Stats, error) {
	const topLang = 8

	var stats model.Stats
	if err := r.db.QueryRow(ctx, `
		SELECT count(*)::int,
		       coalesce(sum(followers), 0)::int,
		       coalesce(sum(public_repos), 0)::int
		FROM github_users
	`).Scan(&stats.Users, &stats.TotalFollowers, &stats.TotalPublicRepos); err != nil {
		return model.Stats{}, fmt.Errorf("aggregate users: %w", err)
	}

	if err := r.db.QueryRow(ctx, `SELECT count(*)::int FROM github_repos`).Scan(&stats.Repos); err != nil {
		return model.Stats{}, fmt.Errorf("count repos: %w", err)
	}

	stats.TopUsers = make([]model.TopUser, 0, 5)
	topRows, err := r.db.Query(ctx, `
		SELECT login, name, followers
		FROM github_users
		ORDER BY followers DESC
		LIMIT 5
	`)
	if err != nil {
		return model.Stats{}, fmt.Errorf("query top users: %w", err)
	}
	defer topRows.Close()
	for topRows.Next() {
		var u model.TopUser
		if err := topRows.Scan(&u.Login, &u.Name, &u.Followers); err != nil {
			return model.Stats{}, fmt.Errorf("scan top user: %w", err)
		}
		stats.TopUsers = append(stats.TopUsers, u)
	}
	if err := topRows.Err(); err != nil {
		return model.Stats{}, fmt.Errorf("iterate top users: %w", err)
	}

	langRows, err := r.db.Query(ctx, `
		SELECT language, count(*)::int
		FROM github_repos
		WHERE language IS NOT NULL
		GROUP BY language
		ORDER BY count(*) DESC
	`)
	if err != nil {
		return model.Stats{}, fmt.Errorf("query languages: %w", err)
	}
	defer langRows.Close()

	type langCount struct {
		name  string
		count int
	}
	all := make([]langCount, 0)
	languagedTotal := 0
	for langRows.Next() {
		var lc langCount
		if err := langRows.Scan(&lc.name, &lc.count); err != nil {
			return model.Stats{}, fmt.Errorf("scan language: %w", err)
		}
		all = append(all, lc)
		languagedTotal += lc.count
	}
	if err := langRows.Err(); err != nil {
		return model.Stats{}, fmt.Errorf("iterate languages: %w", err)
	}

	percent := func(count int) int {
		if languagedTotal == 0 {
			return 0
		}
		return int(math.Round(float64(count) / float64(languagedTotal) * 100))
	}

	stats.Languages = make([]model.Language, 0, topLang+1)
	otherCount := 0
	for i, lc := range all {
		if i < topLang {
			stats.Languages = append(stats.Languages, model.Language{
				Name: lc.name, Count: lc.count, Percent: percent(lc.count),
			})
		} else {
			otherCount += lc.count
		}
	}
	if otherCount > 0 {
		stats.Languages = append(stats.Languages, model.Language{
			Name: "其他", Count: otherCount, Percent: percent(otherCount),
		})
	}

	return stats, nil
}
