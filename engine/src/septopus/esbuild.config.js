// esbuild.config.js
const esbuild = require("esbuild");

esbuild
  .build({
    entryPoints: ["app.js"], // 入口文件
    bundle: true,            // 打包依赖
    outfile: "dist/septopus.bundle.js", // 输出文件
    format: "esm",           // ✅ React/TS 支持 import
    minify: true,            // 压缩
    sourcemap: true,         // 调试用
    target: ["esnext"],      // 输出目标
    platform: "browser",     // 浏览器环境
    loader: {
      ".png": "file",        // 处理图片
      ".svg": "file",
      ".css": "css",
    },
    define: {
      "process.env.NODE_ENV": '"production"',
    },
  })
  .then(() => {
    console.log("✅ Build finished: dist/septopus.bundle.js");
  })
  .catch(() => process.exit(1));
