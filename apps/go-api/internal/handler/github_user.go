package handler

import (
	"encoding/json"
	"net/http"
	"strconv"
	"strings"

	"github.com/PrettyKing/github-repositories-fllow/apps/go-api/internal/github"
	"github.com/PrettyKing/github-repositories-fllow/apps/go-api/internal/model"
	"github.com/PrettyKing/github-repositories-fllow/apps/go-api/internal/repository"
)

type GitHubUserHandler struct {
	repository *repository.GitHubUserRepository
	github     *github.Client
}

func NewGitHubUserHandler(repository *repository.GitHubUserRepository, githubClient *github.Client) *GitHubUserHandler {
	return &GitHubUserHandler{repository: repository, github: githubClient}
}

// syncResponse 与 Node 的 { ...row, created, reposCount, truncated } 保持一致：
// 内嵌账户行字段被 JSON 提升到顶层，再附带三个同步元信息。
type syncResponse struct {
	model.GitHubUser
	Created    bool `json:"created"`
	ReposCount int  `json:"reposCount"`
	Truncated  bool `json:"truncated"`
}

func (h *GitHubUserHandler) List(w http.ResponseWriter, r *http.Request) {
	users, err := h.repository.List(r.Context())
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed to list users"})
		return
	}

	writeJSON(w, http.StatusOK, users)
}

func (h *GitHubUserHandler) Sync(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Token string `json:"token"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || strings.TrimSpace(body.Token) == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "token is required"})
		return
	}
	token := strings.TrimSpace(body.Token)

	githubUser, err := h.github.FetchCurrentUser(r.Context(), token)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}

	repos, truncated, err := h.github.FetchRepos(r.Context(), token)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}

	user, created, reposCount, err := h.repository.SyncUserAndRepos(r.Context(), githubUser, repos)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed to save user"})
		return
	}

	status := http.StatusOK
	if created {
		status = http.StatusCreated
	}
	writeJSON(w, status, syncResponse{
		GitHubUser: user,
		Created:    created,
		ReposCount: reposCount,
		Truncated:  truncated,
	})
}

func (h *GitHubUserHandler) Profile(w http.ResponseWriter, r *http.Request) {
	username := strings.TrimSpace(r.PathValue("username"))
	if username == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "username is required"})
		return
	}

	user, err := h.github.FetchUser(r.Context(), username)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}

	// 只返回原始公开信息；个人介绍（introduction）由上游 Lambda 调 OpenRouter 生成，
	// Go 不再负责文案拼接，保持「Go = 数据、Lambda = 校验/转发/OpenRouter」的职责边界。
	writeJSON(w, http.StatusOK, map[string]any{
		"username":    user.Login,
		"name":        user.Name,
		"avatarUrl":   user.AvatarURL,
		"bio":         user.Bio,
		"location":    user.Location,
		"publicRepos": user.PublicRepos,
		"followers":   user.Followers,
		"following":   user.Following,
		"htmlUrl":     user.HTMLURL,
	})
}

// parseID 解析路径里的正整数 id，非法返回 false。
func parseID(r *http.Request) (int64, bool) {
	id, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
	if err != nil || id <= 0 {
		return 0, false
	}
	return id, true
}

func (h *GitHubUserHandler) Delete(w http.ResponseWriter, r *http.Request) {
	id, ok := parseID(r)
	if !ok {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "id 非法"})
		return
	}
	if err := h.repository.Delete(r.Context(), id); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed to delete user"})
		return
	}
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func (h *GitHubUserHandler) ListRepos(w http.ResponseWriter, r *http.Request) {
	id, ok := parseID(r)
	if !ok {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "id 非法"})
		return
	}
	repos, err := h.repository.ListRepos(r.Context(), id)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed to list repos"})
		return
	}
	writeJSON(w, http.StatusOK, repos)
}

func (h *GitHubUserHandler) Refresh(w http.ResponseWriter, r *http.Request) {
	id, ok := parseID(r)
	if !ok {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "id 非法"})
		return
	}

	var body struct {
		Token string `json:"token"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || strings.TrimSpace(body.Token) == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "token is required"})
		return
	}
	token := strings.TrimSpace(body.Token)

	// 确认目标账户存在
	targetGithubID, found, err := h.repository.GetGithubID(r.Context(), id)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed to load user"})
		return
	}
	if !found {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "用户不存在"})
		return
	}

	githubUser, err := h.github.FetchCurrentUser(r.Context(), token)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}
	// 校验 token 对应账户与目标记录一致，防止用别的 token 错刷
	if githubUser.ID != targetGithubID {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Token 与目标账户不匹配"})
		return
	}

	repos, truncated, err := h.github.FetchRepos(r.Context(), token)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}

	user, created, reposCount, err := h.repository.SyncUserAndRepos(r.Context(), githubUser, repos)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed to save user"})
		return
	}

	writeJSON(w, http.StatusOK, syncResponse{
		GitHubUser: user,
		Created:    created,
		ReposCount: reposCount,
		Truncated:  truncated,
	})
}

func (h *GitHubUserHandler) Stats(w http.ResponseWriter, r *http.Request) {
	stats, err := h.repository.Stats(r.Context())
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "统计查询失败"})
		return
	}
	writeJSON(w, http.StatusOK, stats)
}

func writeJSON(w http.ResponseWriter, status int, value any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(value)
}
