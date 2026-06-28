import type { NewGithubUser } from "@github-repositories-fllow/db";

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

/**
 * 用个人 token 调 GitHub API 取当前账户信息。
 * 失败时抛出带有友好信息的错误。
 */
export async function fetchGithubUser(token: string): Promise<GithubApiUser> {
  const res = await fetch("https://api.github.com/user", {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "User-Agent": "github-repositories-fllow",
      "X-GitHub-Api-Version": "2022-11-28",
    },
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
