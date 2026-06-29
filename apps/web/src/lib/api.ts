/** GitHub 用户账户行（对应后端 github_users 表的 camelCase 映射） */
export interface GithubUser {
  id: number;
  githubId: number;
  login: string;
  name: string | null;
  avatarUrl: string | null;
  bio: string | null;
  company: string | null;
  location: string | null;
  publicRepos: number;
  followers: number;
  following: number;
  htmlUrl: string | null;
  createdAt: string;
  /** 账户最近一次 upsert/refresh 的时间（ISO 字符串） */
  updatedAt: string;
}

/** add/refresh 返回的账户行 + 同步元信息（新建/更新、仓库数、是否截断） */
export interface SyncResult extends GithubUser {
  created?: boolean;
  reposCount?: number;
  truncated?: boolean;
}

/** GitHub 仓库行（对应后端 github_repos 表的 camelCase 映射） */
export interface GithubRepo {
  id: number;
  userId: number;
  repoId: number;
  name: string;
  fullName: string;
  htmlUrl: string;
  description: string | null;
  language: string | null;
  stargazersCount: number;
  forksCount: number;
  isPrivate: boolean;
  pushedAt: string | null;
  createdAt: string;
}

/** 全局统计数据（账户数/仓库数/followers/语言分布等） */
export interface Stats {
  users: number;
  repos: number;
  totalFollowers: number;
  totalPublicRepos: number;
  topUsers: { login: string; name: string | null; followers: number }[];
  languages: { name: string; count: number; percent: number }[];
}

/**
 * 统一请求封装：fetch → 非 2xx 读 { error } 字段抛出 → 2xx 返回 JSON。
 * 基础地址使用相对路径 /api：生产同源直接访问，dev 经 Vite proxy 转发到 Hono(3000)，零 CORS 暴露面。
 */
async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `请求失败 (${res.status})`);
  }
  return res.json() as Promise<T>;
}

/** 列出已保存账户（createdAt 倒序） */
export function listUsers(): Promise<GithubUser[]> {
  return request<GithubUser[]>("/users");
}

/** 用 token 拉 GitHub 账户信息并入库；token 不持久化，一次性透传给 GitHub API */
export function addUser(token: string): Promise<SyncResult> {
  return request<SyncResult>("/github", {
    method: "POST",
    body: JSON.stringify({ token }),
  });
}

/** 删除一条账户记录（级联删除其仓库） */
export function deleteUser(id: number): Promise<{ ok: boolean }> {
  return request<{ ok: boolean }>(`/users/${id}`, { method: "DELETE" });
}

/** 列出指定账户的仓库（按 pushedAt 倒序，展开时按需加载） */
export function listUserRepos(id: number): Promise<GithubRepo[]> {
  return request<GithubRepo[]>(`/users/${id}/repos`);
}

/** 用新 token 刷新指定账户数据及其仓库；token 仅一次性透传，不持久化 */
export function refreshUser(id: number, token: string): Promise<SyncResult> {
  return request<SyncResult>(`/users/${id}/refresh`, {
    method: "POST",
    body: JSON.stringify({ token }),
  });
}

/** 获取全局统计数据 */
export function getStats(): Promise<Stats> {
  return request<Stats>("/stats");
}
