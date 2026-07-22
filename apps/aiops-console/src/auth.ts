const config = window.AIOPS_CONFIG;
const tokenKey = "aiops_id_token";
const verifierKey = "aiops_pkce_verifier";

const base64Url = (buffer: ArrayBuffer | Uint8Array) =>
  btoa(String.fromCharCode(...new Uint8Array(buffer)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

export const getToken = () => sessionStorage.getItem(tokenKey);

export async function beginLogin() {
  if (config.demoMode) return;
  const verifier = base64Url(crypto.getRandomValues(new Uint8Array(48)));
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  sessionStorage.setItem(verifierKey, verifier);
  const url = new URL(`https://${config.cognitoDomain}/oauth2/authorize`);
  url.search = new URLSearchParams({
    client_id: config.clientId,
    response_type: "code",
    scope: "openid email",
    redirect_uri: config.redirectUri,
    code_challenge_method: "S256",
    code_challenge: base64Url(digest),
  }).toString();
  window.location.assign(url);
}

export async function completeLogin() {
  const url = new URL(window.location.href);
  const code = url.searchParams.get("code");
  if (!code) return false;
  const response = await fetch(`https://${config.cognitoDomain}/oauth2/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      client_id: config.clientId,
      code,
      redirect_uri: config.redirectUri,
      code_verifier: sessionStorage.getItem(verifierKey) ?? "",
    }),
  });
  const body = await response.json() as { id_token?: string; error?: string; error_description?: string };
  if (!response.ok || !body.id_token) throw new Error(body.error_description ?? body.error ?? "登录失败");
  sessionStorage.setItem(tokenKey, body.id_token);
  sessionStorage.removeItem(verifierKey);
  window.history.replaceState({}, "", window.location.pathname);
  return true;
}

export function logout() {
  sessionStorage.clear();
  if (config.demoMode) {
    window.location.reload();
    return;
  }
  const url = new URL(`https://${config.cognitoDomain}/logout`);
  url.search = new URLSearchParams({ client_id: config.clientId, logout_uri: config.redirectUri }).toString();
  window.location.assign(url);
}
