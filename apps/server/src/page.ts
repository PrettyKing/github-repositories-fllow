/** 表单页面：填入 GitHub 个人 token -> 拉取账户信息 -> 入库 -> 列表展示，可删除。 */
export const pageHtml = /* html */ `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>GitHub 账户信息收集</title>
  <style>
    * { box-sizing: border-box; }
    body { font-family: -apple-system, system-ui, "Segoe UI", sans-serif; max-width: 760px; margin: 40px auto; padding: 0 16px; color: #1f2328; background: #f6f8fa; }
    h1 { font-size: 22px; }
    .card { background: #fff; border: 1px solid #d0d7de; border-radius: 8px; padding: 16px; margin-bottom: 16px; }
    form { display: flex; gap: 8px; }
    input[type=password] { flex: 1; padding: 8px 10px; border: 1px solid #d0d7de; border-radius: 6px; font-size: 14px; }
    button { padding: 8px 14px; border: 0; border-radius: 6px; background: #1f883d; color: #fff; font-size: 14px; cursor: pointer; }
    button.del { background: #cf222e; padding: 4px 10px; }
    button:disabled { opacity: .6; cursor: default; }
    .hint { color: #57606a; font-size: 12px; margin-top: 8px; }
    .user { display: flex; align-items: center; gap: 12px; border-bottom: 1px solid #eaeef2; padding: 12px 0; }
    .user:last-child { border-bottom: 0; }
    .user img { width: 48px; height: 48px; border-radius: 50%; }
    .user .meta { flex: 1; }
    .user .meta b { font-size: 15px; }
    .user .meta small { color: #57606a; }
    .stats { font-size: 12px; color: #57606a; }
    .empty { color: #57606a; padding: 8px 0; }
    .err { color: #cf222e; font-size: 13px; margin-top: 8px; min-height: 18px; }
  </style>
</head>
<body>
  <h1>GitHub 账户信息收集</h1>
  <div class="card">
    <form id="f">
      <input id="token" type="password" placeholder="粘贴你的 GitHub Personal Access Token" autocomplete="off" required />
      <button id="submit" type="submit">获取并保存</button>
    </form>
    <div class="err" id="err"></div>
    <div class="hint">Token 仅用于一次性调用 GitHub API 拉取账户信息，不会被保存。</div>
  </div>

  <div class="card">
    <h3 style="margin-top:0">已保存账户</h3>
    <div id="list"><div class="empty">加载中…</div></div>
  </div>

  <script>
    const $ = (id) => document.getElementById(id);
    const esc = (s) => (s == null ? "" : String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])));

    async function load() {
      let users;
      try {
        const res = await fetch("/api/users");
        if (!res.ok) throw new Error("加载失败 (" + res.status + ")");
        users = await res.json();
      } catch (err) {
        $("list").innerHTML = '<div class="empty">' + esc(err.message) + '</div>';
        return;
      }
      if (!Array.isArray(users) || !users.length) {
        $("list").innerHTML = '<div class="empty">还没有记录，先在上面提交一个 token。</div>';
        return;
      }
      $("list").innerHTML = users.map((u) => \`
        <div class="user">
          <img src="\${esc(u.avatarUrl)}" alt="" />
          <div class="meta">
            <b>\${esc(u.name || u.login)}</b> <small>@\${esc(u.login)}</small><br/>
            <span class="stats">仓库 \${u.publicRepos} · 粉丝 \${u.followers} · 关注 \${u.following}</span>
          </div>
          <button class="del" data-id="\${u.id}">删除</button>
        </div>\`).join("");
      document.querySelectorAll(".del").forEach((b) =>
        b.addEventListener("click", () => del(b.dataset.id)));
    }

    async function del(id) {
      $("err").textContent = "";
      try {
        const res = await fetch("/api/users/" + id, { method: "DELETE" });
        if (!res.ok) throw new Error("删除失败 (" + res.status + ")");
      } catch (err) {
        $("err").textContent = err.message;
      }
      load();
    }

    $("f").addEventListener("submit", async (e) => {
      e.preventDefault();
      $("err").textContent = "";
      $("submit").disabled = true;
      try {
        const res = await fetch("/api/github", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token: $("token").value.trim() }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "请求失败");
        $("token").value = "";
        await load();
      } catch (err) {
        $("err").textContent = err.message;
      } finally {
        $("submit").disabled = false;
      }
    });

    load();
  </script>
</body>
</html>`;
