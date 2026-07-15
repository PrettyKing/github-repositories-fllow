package model

import "time"

type GitHubUser struct {
	ID          int64     `json:"id"`
	GitHubID    int64     `json:"githubId"`
	Login       string    `json:"login"`
	Name        *string   `json:"name"`
	AvatarURL   *string   `json:"avatarUrl"`
	Bio         *string   `json:"bio"`
	Company     *string   `json:"company"`
	Location    *string   `json:"location"`
	PublicRepos int       `json:"publicRepos"`
	Followers   int       `json:"followers"`
	Following   int       `json:"following"`
	HTMLURL     *string   `json:"htmlUrl"`
	CreatedAt   time.Time `json:"createdAt"`
	UpdatedAt   time.Time `json:"updatedAt"`
}

// GitHubRepo 字段与前端 GithubRepo 接口对齐（apps/web/src/lib/api.ts）。
type GitHubRepo struct {
	ID              int64      `json:"id"`
	UserID          int64      `json:"userId"`
	RepoID          int64      `json:"repoId"`
	Name            string     `json:"name"`
	FullName        string     `json:"fullName"`
	HTMLURL         string     `json:"htmlUrl"`
	Description     *string    `json:"description"`
	Language        *string    `json:"language"`
	StargazersCount int        `json:"stargazersCount"`
	ForksCount      int        `json:"forksCount"`
	IsPrivate       bool       `json:"isPrivate"`
	PushedAt        *time.Time `json:"pushedAt"`
	CreatedAt       time.Time  `json:"createdAt"`
}

// 统计面板聚合结果，字段与前端 Stats 接口对齐。
type Stats struct {
	Users            int        `json:"users"`
	Repos            int        `json:"repos"`
	TotalFollowers   int        `json:"totalFollowers"`
	TotalPublicRepos int        `json:"totalPublicRepos"`
	TopUsers         []TopUser  `json:"topUsers"`
	Languages        []Language `json:"languages"`
}

type TopUser struct {
	Login     string  `json:"login"`
	Name      *string `json:"name"`
	Followers int     `json:"followers"`
}

type Language struct {
	Name    string `json:"name"`
	Count   int    `json:"count"`
	Percent int    `json:"percent"`
}
