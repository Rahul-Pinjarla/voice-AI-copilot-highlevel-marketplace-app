import "dotenv/config";
import { z } from "zod";

const schema = z.object({
  GHL_CLIENT_ID: z.string().min(1),
  GHL_CLIENT_SECRET: z.string().min(1),
  GHL_SSO_KEY: z.string().min(1),
  GHL_REDIRECT_URI: z.string().url(),

  PORT: z.string().default("3000"),
  SESSION_SECRET: z.string().min(16),
  HTTPS_ENABLED: z
    .string()
    .optional()
    .transform((v) => v === "true"),
  DB_PATH: z.string().default("./data/app.db"),
  ANTHROPIC_API_KEY: z.string().min(1),
  LLM_MODEL: z.string().optional(),
  NODE_ENV: z.string().default("development"),
});

const result = schema.safeParse(process.env);

if (!result.success) {
  console.error("❌ Invalid environment configuration:");
  for (const issue of result.error.issues) {
    console.error(`  ${issue.path.join(".")}: ${issue.message}`);
  }
  process.exit(1);
}

export const env = result.data;
