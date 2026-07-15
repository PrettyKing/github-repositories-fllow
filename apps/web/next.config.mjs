/** @type {import('next').NextConfig} */
const nextConfig = {
  // 纯静态导出到 out/，部署到 Cloudflare Pages（无 Node 运行时）。
  output: "export",
  // 共享 UI 包以 .tsx 源码导出，需让 Next 编译它。
  transpilePackages: ["@github-repositories-fllow/ui"],
  // 静态导出下关闭图片优化（无服务端）。
  images: { unoptimized: true },
};

export default nextConfig;
