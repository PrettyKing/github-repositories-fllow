import type { NewGithubRepo, NewGithubUser } from "@github-repositories-fllow/db";

export interface GithubApiUser {
  id: number;
  login: string;
  name: string | null;
  avatar_url: string | null;
  bio: string | null;
  company: string | null;
  location: string | null;
  public_repos: number;
  followers: number;
  following: number;
  html_url: string | null;
}

export interface GithubApiRepo {
  id: number;
  name: string;
  full_name: string;
  html_url: string;
  description: string | null;
  language: string | null;
  stargazers_count: number;
  forks_count: number;
  private: boolean;
  pushed_at: string | null;
}

/** 复用请求头，避免分散维护。token 不入日志，只透传给 GitHub API。 */
function githubHeaders(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "User-Agent": "github-repositories-fllow",
    "X-GitHub-Api-Version": "2022-11-28",
  };
}

/**
 * 用个人 token 调 GitHub API 取当前账户信息。
 * 失败时抛出带有友好信息的错误。
 */
export async function fetchGithubUser(token: string): Promise<GithubApiUser> {
  const res = await fetch("https://api.github.com/user", {
    headers: githubHeaders(token),
  });

  if (res.status === 401) {
    throw new Error("Token 无效或已过期 (401)");
  }
  if (!res.ok) {
    throw new Error(`GitHub API 调用失败: ${res.status} ${res.statusText}`);
  }

  return (await res.json()) as GithubApiUser;
}

/** 把 GitHub API 返回的账户信息映射成入库记录。 */
export function toNewGithubUser(u: GithubApiUser): NewGithubUser {
  return {
    githubId: u.id,
    login: u.login,
    name: u.name,
    avatarUrl: u.avatar_url,
    bio: u.bio,
    company: u.company,
    location: u.location,
    publicRepos: u.public_repos ?? 0,
    followers: u.followers ?? 0,
    following: u.following ?? 0,
    htmlUrl: u.html_url,
  };
}

/**
 * 翻页取该账户的所有自有仓库（type=owner），最多累计 300 条。
 * 达到上限即截断并置 truncated=true，防止超大账户拖慢请求速率。
 * 通过 Link 头 rel="next" 判断是否还有下一页。
 */
export async function fetchGithubRepos(
  token: string,
): Promise<{ repos: GithubApiRepo[]; truncated: boolean }> {
  const MAX = 300;
  const PER_PAGE = 100;
  const all: GithubApiRepo[] = [];
  let page = 1;

  while (true) {
    const url = `https://api.github.com/user/repos?per_page=${PER_PAGE}&sort=updated&type=owner&page=${page}`;
    const res = await fetch(url, { headers: githubHeaders(token) });

    if (res.status === 401) {
      throw new Error("Token 无效或已过期 (401)");
    }
    if (!res.ok) {
      throw new Error(`GitHub 仓库拉取失败: ${res.status} ${res.statusText}`);
    }

    const data = (await res.json()) as GithubApiRepo[];
    all.push(...data);

    // 先判断是否最后一页：无 rel="next" 即已取全（即使恰好 300 条也不算截断）
    const link = res.headers.get("Link") ?? "";
    if (!link.includes('rel="next"')) {
      break;
    }

    // 仍有下一页但已达上限：截断返回，不再翻页
    if (all.length >= MAX) {
      return { repos: all.slice(0, MAX), truncated: true };
    }

    page++;
  }

  return { repos: all.slice(0, MAX), truncated: false };
}

/** 把 GitHub API 仓库列表映射成入库记录（snake→camel，缺失计数补 0）。 */
export function toNewGithubRepos(userId: number, apiRepos: GithubApiRepo[]): NewGithubRepo[] {
  return apiRepos.map((r) => ({
    userId,
    repoId: r.id,
    name: r.name,
    fullName: r.full_name,
    htmlUrl: r.html_url,
    description: r.description ?? null,
    language: r.language ?? null,
    stargazersCount: r.stargazers_count ?? 0,
    forksCount: r.forks_count ?? 0,
    isPrivate: r.private,
    // pushed_at 是 ISO 字符串，转 Date；从未被推送的仓库置 null
    pushedAt: r.pushed_at ? new Date(r.pushed_at) : null,
  }));
}
