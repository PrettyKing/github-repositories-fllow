import { Button } from "@github-repositories-fllow/ui/components/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@github-repositories-fllow/ui/components/card";
import { Input } from "@github-repositories-fllow/ui/components/input";
import { ExternalLink, Loader2, MapPin, Users } from "lucide-react";
import { useState } from "react";

import type { GithubProfile } from "@/lib/api";
import { getGithubProfile } from "@/lib/api";

export default function ProfileCard() {
  const [username, setUsername] = useState("PrettyKing");
  const [profile, setProfile] = useState<GithubProfile | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = username.trim();
    if (!value) return;

    setLoading(true);
    setError("");
    try {
      setProfile(await getGithubProfile(value));
    } catch (err) {
      setProfile(null);
      setError(err instanceof Error ? err.message : "加载个人介绍失败");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card className="mb-6 overflow-hidden">
      <CardHeader>
        <CardTitle>Go 生成个人介绍</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <form onSubmit={(event) => void submit(event)} className="flex gap-2">
          <Input
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            placeholder="输入 GitHub 用户名"
            aria-label="GitHub 用户名"
          />
          <Button type="submit" disabled={loading || !username.trim()}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "生成介绍"}
          </Button>
        </form>

        {error && <p className="text-sm text-destructive">{error}</p>}

        {profile && (
          <div className="rounded-xl border bg-muted/30 p-4">
            <div className="flex items-start gap-4">
              {profile.avatarUrl && (
                <img
                  src={profile.avatarUrl}
                  alt={`${profile.username} 的头像`}
                  className="h-16 w-16 rounded-full border"
                />
              )}
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="font-semibold">{profile.name ?? profile.username}</h2>
                  <a
                    href={profile.htmlUrl ?? `https://github.com/${profile.username}`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
                  >
                    @{profile.username} <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
                <div className="mt-1 flex flex-wrap gap-3 text-xs text-muted-foreground">
                  {profile.location && (
                    <span className="inline-flex items-center gap-1">
                      <MapPin className="h-3 w-3" /> {profile.location}
                    </span>
                  )}
                  <span className="inline-flex items-center gap-1">
                    <Users className="h-3 w-3" /> {profile.followers} 关注者
                  </span>
                  <span>{profile.publicRepos} 个公开仓库</span>
                </div>
              </div>
            </div>
            <p className="mt-4 text-sm leading-6">{profile.introduction}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
