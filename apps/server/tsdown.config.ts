import { defineConfig } from "tsdown";

// 本地开发产物：依赖保持 external（用本地 node_modules）。
const local = defineConfig({
  entry: "./src/index.ts",
  format: "esm",
  outDir: "./dist",
  clean: true,
  noExternal: [/@github-repositories-fllow\/.*/],
});

// Lambda 产物：自包含，把所有 npm 依赖一起打进 lambda.mjs，
// 这样 SAM 只需打包 dist 目录，无需在 Lambda 里安装 node_modules。
const lambda = defineConfig({
  entry: "./src/lambda.ts",
  format: "esm",
  platform: "node",
  outDir: "./dist",
  clean: false,
  noExternal: [/.*/],
  // pg 的可选原生绑定 / 非 Node 运行时分支，打包时忽略。
  external: ["pg-native", "cloudflare:sockets"],
});

export default [local, lambda];
