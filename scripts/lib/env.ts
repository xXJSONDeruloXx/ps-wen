import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';
import { z } from 'zod';

const envPath = path.resolve(process.cwd(), '.env');
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath, override: false, quiet: true });
}

const EnvSchema = z.object({
  PSN_EMAIL: z.string().optional(),
  PSN_PASSWORD: z.string().optional(),
  PSN_TOTP_SECRET: z.string().optional(),
  PSN_LOGIN_URL: z.string().optional(),
  PSN_POST_LOGIN_URL: z.string().optional(),
  PSN_STORAGE_STATE: z.string().optional(),
  OFFICIAL_PC_APP_BUNDLE: z.string().optional(),
  CAPTURE_INTERFACE: z.string().optional(),
  CAPTURE_DURATION: z.string().optional(),
  CAPTURE_FILTER: z.string().optional(),
  HEADLESS: z.string().optional(),
  SAVE_HTML: z.string().optional()
});

export type AppEnv = z.infer<typeof EnvSchema>;

export function loadEnv(): AppEnv {
  const parsed = EnvSchema.parse(process.env);
  return Object.fromEntries(
    Object.entries(parsed).map(([key, value]) => [
      key,
      typeof value === 'string' && value.trim() === '' ? undefined : value
    ])
  ) as AppEnv;
}

export function toBoolean(value: string | undefined, fallback = false): boolean {
  if (!value) return fallback;
  return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
}

export function resolveArtifactPath(relativePath: string | undefined, fallback: string): string {
  return path.resolve(process.cwd(), relativePath ?? fallback);
}
