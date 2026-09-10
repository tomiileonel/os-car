import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  oxc: { jsx: { runtime: "automatic" } },
  resolve: {
    alias: [
      { find: /^@\//, replacement: `${path.resolve(import.meta.dirname, "src")}/` },
      { find: /^~\//, replacement: `${path.resolve(import.meta.dirname)}/` },
    ],
  },
  test: {
    environment: "node",
    globals: true,
    setupFiles: ["./tests/setup.ts"],
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
    pool: "forks",
    isolate: true,
    fileParallelism: false,
    testTimeout: 20000,
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "lcov"],
      include: [
        "src/server/services/**",
        "src/shared/**",
        "src/lib/**",
        "lib/**",
        "middleware.ts",
        "app/api/**",
      ],
    },
  },
});
