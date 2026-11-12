import { defineConfig } from "@playwright/test";
import { resolve } from "node:path";
export default defineConfig({
  testDir: "./tests",
  fullyParallel: false,
  workers: 1,
  timeout: 120000,
  expect: { timeout: 15000 },
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:3101",
    viewport: { width: 1440, height: 1000 },
    actionTimeout: 15000,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  globalTeardown: "./tests/teardown.ts",
  webServer: [
    {
      command: "node --import tsx scripts/e2e-server.ts",
      cwd: resolve("../backend"),
      url: "http://127.0.0.1:4101/v1/health",
      timeout: 120000,
      reuseExistingServer: false,
    },
    {
      command:
        "node node_modules/next/dist/bin/next dev --hostname 127.0.0.1 --port 3101",
      url: "http://127.0.0.1:3101",
      timeout: 120000,
      reuseExistingServer: false,
      env: {
        API_URL: "http://127.0.0.1:4101",
        NEXT_PUBLIC_SOCKET_URL: "http://127.0.0.1:4101",
      },
    },
  ],
});
