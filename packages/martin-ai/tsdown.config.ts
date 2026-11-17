import { defineConfig } from "tsdown"

export default defineConfig({
  entry: {
    index: "src/index.ts",
    elements: "src/elements/index.ts",
  },
  format: "esm",
  platform: "browser",
  dts: true,
  // tailwindcss CLI가 같은 dist에 styles.css를 쓰므로 지우지 않는다
  clean: false,
  inputOptions: {
    // shadcn 컴포넌트의 "use client"는 SPA에서 의미가 없으므로 경고를 숨긴다
    onLog(level, log, defaultHandler) {
      if (log.code === "MODULE_LEVEL_DIRECTIVE") return
      defaultHandler(level, log)
    },
  },
})
