import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// tsconfig의 "@/*" 경로 별칭을 테스트에서도 쓰게 한다
export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
});
