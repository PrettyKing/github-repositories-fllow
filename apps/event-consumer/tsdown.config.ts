import { defineConfig } from "tsdown";
export default defineConfig({ entry: ["src/handler.ts"], format: "esm", outDir: "dist", clean: true, minify: true, sourcemap: true, noExternal: [/.*/] });
