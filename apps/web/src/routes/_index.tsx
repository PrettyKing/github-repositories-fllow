import { Button } from "@github-repositories-fllow/ui/components/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@github-repositories-fllow/ui/components/card";
import { Input } from "@github-repositories-fllow/ui/components/input";
import {
  ChevronDown,
  ChevronUp,
  GitFork,
  RefreshCw,
  Star,
  Trash2,
} from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import StatsPanel from "@/components/stats-panel";
import type { GithubRepo, GithubUser, Stats } from "@/lib/api";
import {
  addUser,
  deleteUser,
  getStats,
  listUserRepos,
  listUsers,
  refreshUser,
} from "@/lib/api";

import type { Route } from "./+types/_index";

/** 仓库加载状态（按需展开加载，存 Map 中避免重复请求） */
type RepoState =
  | { status: "loading" }
  | { status: "loaded"; repos: GithubRepo[] }
  | { status: "error"; message: string };

/** 将 ISO 时间串格式化为「相对时间」，如「3 小时前」 */
function formatRelativeTime(dateStr: string): string {
  const diffMs = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return "刚刚";
  if (minutes < 60) return `${minutes.toString()} 分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours.toString()} 小时前`;
  const days = Math.floor(hours / 24);
  return `${days.toString()} 天前`;
}

/** 渲染某账户的仓库列表内容（定义在组件外，避免每渲染创建新组件） */
function renderRepoContent(state: RepoState | undefined): React.ReactNode {
  if (!state || state.status === "loading") {
    return (
      <p className="py-2 text-xs text-muted-foreground">加载仓库中…</p>
    );
  }
  if (state.status === "error") {
    return (
      <p className="py-2 text-xs text-destructive">{state.message}</p>
    );
  }
  if (state.repos.length === 0) {
    return (
      <p className="py-2 text-xs text-muted-foreground">
        该账户暂无仓库记录。
      </p>
    );
  }
  return (
    <ul className="divide-y divide-border">
      {state.repos.map((repo) => (
        <li key={repo.id} className="py-2">
          <div className="flex items-start gap-2">
            <div className="min-w-0 flex-1">
              <a
                href={repo.htmlUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs font-medium text-primary hover:underline"
              >
                {repo.name}
              </a>
              {repo.description !== null && (
                <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">
                  {repo.description}
                </p>
              )}
            </div>
            <div className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
              {repo.language !== null && (
                <span className="flex items-center gap-1">
                  <span className="inline-block h-2 w-2 rounded-full bg-primary" />
                  {repo.language}
                </span>
              )}
              <span className="flex items-center gap-0.5">
                <Star className="h-3 w-3" />
                {repo.stargazersCount}
              </span>
              <span className="flex items-center gap-0.5">
                <GitFork className="h-3 w-3" />
                {repo.forksCount}
              </span>
              {repo.pushedAt !== null && (
                <span title={repo.pushedAt}>
                  {formatRelativeTime(repo.pushedAt)}
                </span>
              )}
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}

export function meta({}: Route.MetaArgs) {
  return [
    { title: "GitHub 账户信息收集" },
    { name: "description", content: "GitHub 账户收集与管理" },
  ];
}

export default function Home() {
  const [users, setUsers] = useState<GithubUser[]>([]);
  // 首次加载时显示 loading，后续刷新列表不再置 true，避免列表闪烁
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  // 受控输入；token 不持久化到 localStorage 等任何存储
  const [token, setToken] = useState("");

  const [stats, setStats] = useState<Stats | null>(null);

  // 哪些账户 ID 已展开仓库列表
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());
  // 仓库缓存：userId → RepoState；undefined 表示尚未加载
  const [repoCache, setRepoCache] = useState<Map<number, RepoState>>(new Map());

  // 当前显示刷新 token 表单的账户 ID（同时只有一个）
  const [refreshUserId, setRefreshUserId] = useState<number | null>(null);
  // 刷新表单的 token 输入值；不持久化
  const [refreshToken, setRefreshToken] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  /** 并发拉取账户列表和统计数据，重置展开与仓库缓存状态 */
  async function reloadAll() {
    const [usersResult, statsResult] = await Promise.allSettled([
      listUsers(),
      getStats(),
    ]);

    if (usersResult.status === "fulfilled") {
      setUsers(usersResult.value);
      // 数据刷新后折叠所有展开行，清空仓库缓存，避免展示陈旧数据
      setExpandedIds(new Set());
      setRepoCache(new Map());
    } else {
      const reason = usersResult.reason;
      toast.error(reason instanceof Error ? reason.message : "加载账户列表失败");
    }

    if (statsResult.status === "fulfilled") {
      setStats(statsResult.value);
    }
    // stats 失败静默处理，不阻断主要功能

    setLoading(false);
  }

  useEffect(() => {
    void reloadAll();
    // 组件挂载时加载一次；reloadAll 引用稳定，空依赖数组正确
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** 按需加载指定账户的仓库并更新缓存 */
  async function fetchUserRepos(userId: number) {
    setRepoCache((prev) => new Map(prev).set(userId, { status: "loading" }));
    try {
      const repos = await listUserRepos(userId);
      setRepoCache((prev) =>
        new Map(prev).set(userId, { status: "loaded", repos }),
      );
    } catch (err) {
      setRepoCache((prev) =>
        new Map(prev).set(userId, {
          status: "error",
          message: err instanceof Error ? err.message : "加载仓库失败",
        }),
      );
    }
  }

  /** 切换账户仓库展开/收起；展开时若缓存不存在则立即拉取 */
  function toggleExpand(userId: number) {
    if (expandedIds.has(userId)) {
      setExpandedIds((prev) => {
        const next = new Set(prev);
        next.delete(userId);
        return next;
      });
    } else {
      setExpandedIds((prev) => new Set(prev).add(userId));
      if (!repoCache.has(userId)) {
        void fetchUserRepos(userId);
      }
    }
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const trimmedToken = token.trim();
    if (!trimmedToken) return;
    setSubmitting(true);
    try {
      const result = await addUser(trimmedToken);
      toast.success(
        result.created ? `已添加账户 @${result.login}` : `已更新账户 @${result.login}`,
      );
      if (result.truncated) {
        toast.info(`@${result.login} 仓库较多，仅同步前 ${(result.reposCount ?? 300).toString()} 个`);
      }
      setToken("");
      await reloadAll();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "提交失败");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(id: number, login: string) {
    try {
      await deleteUser(id);
      toast.success(`已删除账户 @${login}`);
      await reloadAll();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "删除失败");
    }
  }

  /** 切换刷新表单；同一账户二次点击则关闭表单 */
  function handleRefreshToggle(userId: number) {
    if (refreshUserId === userId) {
      setRefreshUserId(null);
      setRefreshToken("");
    } else {
      setRefreshUserId(userId);
      setRefreshToken("");
    }
  }

  async function handleRefreshSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (refreshUserId === null) return;
    const trimmedToken = refreshToken.trim();
    if (!trimmedToken) return;
    setRefreshing(true);
    try {
      const result = await refreshUser(refreshUserId, trimmedToken);
      toast.success(`账户 @${result.login} 数据已刷新`);
      if (result.truncated) {
        toast.info(`@${result.login} 仓库较多，仅同步前 ${(result.reposCount ?? 300).toString()} 个`);
      }
      setRefreshUserId(null);
      setRefreshToken("");
      await reloadAll();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "刷新失败");
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <div className="container mx-auto max-w-3xl px-4 py-6">
      <h1 className="mb-6 text-xl font-semibold">GitHub 账户信息收集</h1>

      {/* 统计区：首屏加载及增删刷新后自动更新 */}
      <StatsPanel stats={stats} loading={loading} />

      {/* Token 提交表单 */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>添加账户</CardTitle>
        </CardHeader>
        <CardContent>
          <form
            onSubmit={(e) => {
              void handleSubmit(e);
            }}
            className="flex gap-2"
          >
            <Input
              type="password"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="粘贴你的 GitHub Personal Access Token"
              autoComplete="off"
              required
              disabled={submitting}
              className="flex-1"
            />
            <Button type="submit" disabled={submitting}>
              {submitting ? "获取中…" : "获取并保存"}
            </Button>
          </form>
          <p className="mt-2 text-xs text-muted-foreground">
            Token 仅一次性调用 GitHub API 拉取账户信息，不会被保存。
          </p>
        </CardContent>
      </Card>

      {/* 已保存账户列表 */}
      <Card>
        <CardHeader>
          <CardTitle>已保存账户</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-xs text-muted-foreground">加载中…</p>
          ) : users.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              还没有记录，先在上面提交一个 token。
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {users.map((u) => (
                <li key={u.id} className="py-3">
                  {/* 账户主行：头像 / 基本信息 / 操作按钮 */}
                  <div className="flex items-start gap-3">
                    {u.avatarUrl !== null && (
                      <img
                        src={u.avatarUrl}
                        alt={u.login}
                        className="mt-0.5 h-10 w-10 shrink-0 rounded-full"
                      />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">
                        {u.name ?? u.login}{" "}
                        <span className="font-normal text-muted-foreground">
                          @{u.login}
                        </span>
                      </p>
                      <p className="text-xs text-muted-foreground">
                        仓库 {u.publicRepos} · 粉丝 {u.followers} · 关注{" "}
                        {u.following}
                        {" · "}更新{" "}
                        {formatRelativeTime(u.updatedAt)}
                      </p>
                    </div>
                    {/* 操作按钮组 */}
                    <div className="flex shrink-0 items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => handleRefreshToggle(u.id)}
                        aria-label={`刷新 @${u.login}`}
                        title="刷新账户数据"
                      >
                        <RefreshCw />
                      </Button>
                      <Button
                        variant="destructive"
                        size="icon-sm"
                        onClick={() => {
                          void handleDelete(u.id, u.login);
                        }}
                        aria-label={`删除 @${u.login}`}
                      >
                        <Trash2 />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => toggleExpand(u.id)}
                        aria-label={
                          expandedIds.has(u.id) ? "收起仓库" : "展开仓库"
                        }
                        title={expandedIds.has(u.id) ? "收起仓库" : "展开仓库"}
                      >
                        {expandedIds.has(u.id) ? (
                          <ChevronUp />
                        ) : (
                          <ChevronDown />
                        )}
                      </Button>
                    </div>
                  </div>

                  {/* 刷新 token 内联表单（点击刷新按钮后显示） */}
                  {refreshUserId === u.id && (
                    <form
                      onSubmit={(e) => {
                        void handleRefreshSubmit(e);
                      }}
                      className="mt-2 flex gap-1"
                    >
                      <Input
                        type="password"
                        value={refreshToken}
                        onChange={(e) => setRefreshToken(e.target.value)}
                        placeholder="重新输入 GitHub Token"
                        autoComplete="off"
                        disabled={refreshing}
                        className="h-7 flex-1 text-xs"
                      />
                      <Button
                        type="submit"
                        size="sm"
                        disabled={refreshing || refreshToken.trim() === ""}
                      >
                        {refreshing ? "刷新中…" : "确认"}
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={refreshing}
                        onClick={() => {
                          setRefreshUserId(null);
                          setRefreshToken("");
                        }}
                      >
                        取消
                      </Button>
                    </form>
                  )}

                  {/* 展开的仓库列表（按需加载，收起后保留缓存直到下次 reloadAll） */}
                  {expandedIds.has(u.id) && (
                    <div className="mt-2 border-l border-border pl-3">
                      {renderRepoContent(repoCache.get(u.id))}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
