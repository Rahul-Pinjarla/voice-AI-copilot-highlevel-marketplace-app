import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    pool: "forks", // forks for native-module (better-sqlite3) compatibility
    env: {
      GHL_CLIENT_ID: "test-client-id",
      GHL_CLIENT_SECRET: "test-client-secret",
      GHL_SSO_KEY: "test-sso-key",
      GHL_REDIRECT_URI: "http://localhost:3000/oauth/callback",
      SESSION_SECRET: "test-session-secret-min-16-chars!!",
      ANTHROPIC_API_KEY: "test-anthropic-key",
      DB_PATH: ":memory:",
      PORT: "3001",
      NODE_ENV: "test",
      SLACK_WEBHOOK_URL: "https://hooks.slack.com/services/test-webhook",
    },
  },
});
