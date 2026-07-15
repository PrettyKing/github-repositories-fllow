package main

import (
	"context"
	"crypto/subtle"
	"encoding/json"
	"log"
	"net/http"
	"os"
	"time"

	"github.com/PrettyKing/github-repositories-fllow/apps/go-api/internal/config"
	"github.com/PrettyKing/github-repositories-fllow/apps/go-api/internal/database"
	"github.com/PrettyKing/github-repositories-fllow/apps/go-api/internal/github"
	"github.com/PrettyKing/github-repositories-fllow/apps/go-api/internal/handler"
	"github.com/PrettyKing/github-repositories-fllow/apps/go-api/internal/repository"
)

func main() {
	if err := config.LoadEnv(".env"); err != nil {
		log.Println(".env not found, using system environment variables")
	}

	databaseURL := os.Getenv("DATABASE_URL")

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	db, err := database.Connect(ctx, databaseURL)
	if err != nil {
		log.Fatalf("database connection failed: %v", err)
	}
	defer db.Close()

	log.Println("PostgreSQL connection established")
	if err := database.EnsureSchema(context.Background(), db); err != nil {
		log.Fatalf("schema initialization failed: %v", err)
	}
	log.Println("Database schema is ready")

	mux := http.NewServeMux()
	githubClient := github.NewClient(&http.Client{Timeout: 15 * time.Second})
	userHandler := handler.NewGitHubUserHandler(repository.NewGitHubUserRepository(db), githubClient)

	mux.HandleFunc("GET /health", func(w http.ResponseWriter, r *http.Request) {
		ctx, cancel := context.WithTimeout(r.Context(), 2*time.Second)
		defer cancel()

		if err := db.Ping(ctx); err != nil {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusServiceUnavailable)

			_ = json.NewEncoder(w).Encode(map[string]string{
				"status":   "error",
				"service":  "go-api",
				"database": "unavailable",
			})
			return
		}

		w.Header().Set("Content-Type", "application/json")

		_ = json.NewEncoder(w).Encode(map[string]string{
			"status":   "ok",
			"service":  "go-api",
			"database": "connected",
		})
	})
	mux.HandleFunc("GET /api/users", userHandler.List)
	mux.HandleFunc("POST /api/github", userHandler.Sync)
	mux.HandleFunc("DELETE /api/users/{id}", userHandler.Delete)
	mux.HandleFunc("GET /api/users/{id}/repos", userHandler.ListRepos)
	mux.HandleFunc("POST /api/users/{id}/refresh", userHandler.Refresh)
	mux.HandleFunc("GET /api/stats", userHandler.Stats)
	mux.HandleFunc("GET /api/profile/{username}", userHandler.Profile)

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	log.Printf("Go API listening on http://localhost:%s", port)

	// 与 Node 端对齐：配置了 Basic Auth 凭据时保护全部 /api/*（/health 放行给探活）；
	// 本地开发可不设，云端（ECS）经环境变量/Secrets Manager 注入后自动启用。
	// 生产入口是 API Gateway→Lambda→Cloud Map→本服务，Lambda 会透传 Authorization。
	rootHandler := withBasicAuth(mux, os.Getenv("BASIC_AUTH_USER"), os.Getenv("BASIC_AUTH_PASSWORD"))

	if err := http.ListenAndServe(":"+port, rootHandler); err != nil {
		log.Fatal(err)
	}
}

// withBasicAuth 在配置了用户名与密码时校验 Basic Auth；未配置则原样放行（本地开发）。
// /health 始终放行，供负载均衡/监控探活。凭据比较用 constant-time 防时序侧信道。
func withBasicAuth(next http.Handler, user, pass string) http.Handler {
	if user == "" || pass == "" {
		return next
	}
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/health" {
			next.ServeHTTP(w, r)
			return
		}

		reqUser, reqPass, ok := r.BasicAuth()
		userOK := subtle.ConstantTimeCompare([]byte(reqUser), []byte(user)) == 1
		passOK := subtle.ConstantTimeCompare([]byte(reqPass), []byte(pass)) == 1
		if !ok || !userOK || !passOK {
			w.Header().Set("WWW-Authenticate", `Basic realm="Restricted"`)
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusUnauthorized)
			_ = json.NewEncoder(w).Encode(map[string]string{"error": "unauthorized"})
			return
		}

		next.ServeHTTP(w, r)
	})
}
