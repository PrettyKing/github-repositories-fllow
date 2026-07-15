package github

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"strings"
	"time"
)

type User struct {
	ID          int64   `json:"id"`
	Login       string  `json:"login"`
	Name        *string `json:"name"`
	AvatarURL   *string `json:"avatar_url"`
	Bio         *string `json:"bio"`
	Company     *string `json:"company"`
	Location    *string `json:"location"`
	PublicRepos int     `json:"public_repos"`
	Followers   int     `json:"followers"`
	Following   int     `json:"following"`
	HTMLURL     *string `json:"html_url"`
}

type Repo struct {
	ID              int64      `json:"id"`
	Name            string     `json:"name"`
	FullName        string     `json:"full_name"`
	HTMLURL         string     `json:"html_url"`
	Description     *string    `json:"description"`
	Language        *string    `json:"language"`
	StargazersCount int        `json:"stargazers_count"`
	ForksCount      int        `json:"forks_count"`
	Private         bool       `json:"private"`
	PushedAt        *time.Time `json:"pushed_at"`
}

type Client struct {
	httpClient *http.Client
	direct     *http.Client
}

func NewClient(httpClient *http.Client) *Client {
	return &Client{
		httpClient: httpClient,
		direct: &http.Client{
			Timeout: httpClient.Timeout,
			Transport: &http.Transport{
				Proxy: nil,
			},
		},
	}
}

func (c *Client) FetchCurrentUser(ctx context.Context, token string) (User, error) {
	return c.fetchUser(ctx, "https://api.github.com/user", token)
}

func (c *Client) FetchUser(ctx context.Context, username string) (User, error) {
	return c.fetchUser(ctx, "https://api.github.com/users/"+url.PathEscape(username), "")
}

// FetchRepos 翻页取当前 token 账户的自有仓库（type=owner），最多累计 300 条。
// 与 Node 端 fetchGithubRepos 对齐：靠 Link 头 rel="next" 判断是否还有下一页，
// 达上限即截断并置 truncated=true，避免超大账户拖慢同步。
func (c *Client) FetchRepos(ctx context.Context, token string) ([]Repo, bool, error) {
	const maxRepos = 300
	const perPage = 100

	all := make([]Repo, 0)
	page := 1

	for {
		endpoint := fmt.Sprintf(
			"https://api.github.com/user/repos?per_page=%d&sort=updated&type=owner&page=%d",
			perPage, page,
		)
		req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
		if err != nil {
			return nil, false, fmt.Errorf("create GitHub repos request: %w", err)
		}
		c.setHeaders(req, token)

		res, err := c.do(ctx, req)
		if err != nil {
			return nil, false, err
		}

		if res.StatusCode == http.StatusUnauthorized {
			res.Body.Close()
			return nil, false, fmt.Errorf("token invalid or expired")
		}
		if res.StatusCode < 200 || res.StatusCode >= 300 {
			res.Body.Close()
			return nil, false, fmt.Errorf("GitHub repos API returned status %d", res.StatusCode)
		}

		var pageRepos []Repo
		if err := json.NewDecoder(res.Body).Decode(&pageRepos); err != nil {
			res.Body.Close()
			return nil, false, fmt.Errorf("decode GitHub repos: %w", err)
		}
		link := res.Header.Get("Link")
		res.Body.Close()

		all = append(all, pageRepos...)

		// 无 rel="next" 即已取全（恰好 300 条也不算截断）
		if !strings.Contains(link, `rel="next"`) {
			break
		}
		// 仍有下一页但已达上限：截断返回
		if len(all) >= maxRepos {
			return all[:maxRepos], true, nil
		}
		page++
	}

	if len(all) > maxRepos {
		all = all[:maxRepos]
	}
	return all, false, nil
}

func (c *Client) fetchUser(ctx context.Context, endpoint string, token string) (User, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return User{}, fmt.Errorf("create GitHub request: %w", err)
	}
	c.setHeaders(req, token)

	res, err := c.do(ctx, req)
	if err != nil {
		return User{}, err
	}
	defer res.Body.Close()

	if res.StatusCode == http.StatusUnauthorized {
		return User{}, fmt.Errorf("token invalid or expired")
	}
	if res.StatusCode == http.StatusNotFound {
		return User{}, fmt.Errorf("GitHub user not found")
	}
	if res.StatusCode < 200 || res.StatusCode >= 300 {
		return User{}, fmt.Errorf("GitHub API returned status %d", res.StatusCode)
	}

	var user User
	if err := json.NewDecoder(res.Body).Decode(&user); err != nil {
		return User{}, fmt.Errorf("decode GitHub user: %w", err)
	}
	return user, nil
}

func (c *Client) setHeaders(req *http.Request, token string) {
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	req.Header.Set("Accept", "application/vnd.github+json")
	req.Header.Set("User-Agent", "github-repositories-fllow-go")
	req.Header.Set("X-GitHub-Api-Version", "2022-11-28")
}

// do 发起请求；本机（尤其 macOS）常设 HTTP(S)_PROXY，代理不可用时回退一次直连再报错。
func (c *Client) do(ctx context.Context, req *http.Request) (*http.Response, error) {
	res, err := c.httpClient.Do(req)
	if err != nil {
		res, err = c.direct.Do(req.Clone(ctx))
		if err != nil {
			return nil, fmt.Errorf("call GitHub API: %w", err)
		}
	}
	return res, nil
}
