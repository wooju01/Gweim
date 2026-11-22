import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// 밸런스 시뮬레이션 (npm run sim:boss / sim:campaign). 일반 테스트(npm test)에는 들어가지 않는다.
// setup.ts가 mock AI를 강제하고 실제 API 호출을 막는다
export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    include: ["scripts/sim/**/*.sim.ts"],
    setupFiles: ["scripts/sim/setup.ts"],
    testTimeout: 3_600_000,
  },
});
