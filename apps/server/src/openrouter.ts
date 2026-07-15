import { env } from "@github-repositories-fllow/env/server";

/** Go /api/profile 返回的原始公开信息（个人介绍由本模块生成）。 */
export interface RawProfile {
  username: string;
  name: string | null;
  bio: string | null;
  location: string | null;
  publicRepos: number;
  followers: number;
}

/** 模板兜底：无 OpenRouter key 或调用失败时用，与原 Go 拼接逻辑一致。 */
function templateBio(p: RawProfile): string {
  const displayName = p.name?.trim() ? p.name : p.username;
  const location = p.location?.trim() ? p.location : "GitHub";
  let intro = `你好，我是 ${displayName}（@${p.username}），来自 ${location}。我在 GitHub 上维护 ${p.publicRepos} 个公开仓库，并与 ${p.followers} 位关注者分享自己的开发实践。`;
  if (p.bio?.trim()) intro += ` 我的简介是：“${p.bio}”。`;
  return intro;
}

/**
 * 调 OpenRouter 用 LLM 生成个人介绍；未配置 key、非 2xx 或异常时回退到模板串，
 * 保证 profile 接口在任何情况下都能返回一段可用文案。
 */
export async function generateBio(p: RawProfile): Promise<string> {
  if (!env.OPENROUTER_API_KEY) return templateBio(p);

  try {
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: env.OPENROUTER_MODEL,
        max_tokens: 200,
        messages: [
          {
            role: "system",
            content:
              "你是中文文案助手。根据给定的 GitHub 公开资料，用第一人称写一段自然、真诚、80 字以内的开发者个人介绍，不要生硬罗列数字。",
          },
          { role: "user", content: JSON.stringify(p) },
        ],
      }),
    });

    if (!res.ok) return templateBio(p);

    const data = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const text = data.choices?.[0]?.message?.content?.trim();
    return text && text.length > 0 ? text : templateBio(p);
  } catch {
    return templateBio(p);
  }
}
