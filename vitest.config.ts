import { playwright } from "@vitest/browser-playwright";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    typecheck: { enabled: true },
    projects: [
      {
        test: {
          name: "node",
          include: ["test/**/*.test.ts"],
          exclude: ["**/*.browser.test.ts"],
        },
      },
      {
        test: {
          name: "webkit",
          include: ["test/**/*.browser.test.ts"],
          browser: {
            enabled: true,
            provider: playwright(),
            headless: true,
            instances: [{ browser: "webkit" }],
          },
        },
      },
    ],
  },
});
