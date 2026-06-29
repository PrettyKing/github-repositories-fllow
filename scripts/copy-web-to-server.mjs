// 把 web 的 SPA 构建产物拷进 server 的部署目录，随 SAM CodeUri(apps/server/dist) 一起打包。
// tsdown 的 local 配置 clean:true 会清 dist，故本脚本须在 server 构建「之后」执行。
// Lambda 内 cwd=/var/task，app.ts 用 serveStatic({ root: "./client" }) 读取本目录。
import { cpSync, existsSync, rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const src = resolve(root, "apps/web/build/client");
const dest = resolve(root, "apps/server/dist/client");

if (!existsSync(src)) {
  console.error(`[copy-web] 源目录不存在: ${src}\n请先构建 web：pnpm --filter web build`);
  process.exit(1);
}

rmSync(dest, { recursive: true, force: true });
cpSync(src, dest, { recursive: true });
console.log(`[copy-web] 已复制 ${src} -> ${dest}`);
