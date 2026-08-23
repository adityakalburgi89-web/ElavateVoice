import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const envSchema = z.object({
  PORT: z.string().transform((val) => parseInt(val, 10)).default('3000'),
  HOST: z.string().default('0.0.0.0'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),

  DEFAULT_TARGET_PHONE_NUMBER: z.string().optional().default('+919876543210'),
  DEVELOPER_PHONE_NUMBER: z.string().optional().default('+919876543210'),

  TELEPHONY_PROVIDER: z.string().default('omnidimension'),
  OMNIDIMENSION_API_KEY: z.string().optional().default(''),
  OMNIDIMENSION_AGENT_ID: z.string().optional().default(''),

  STT_PROVIDER: z.string().default('sarvam'),
  SARVAM_API_KEY: z.string().optional().default(''),

  TTS_PROVIDER: z.string().default('sarvam'),

  PRIMARY_LLM_PROVIDER: z.string().default('gemini'),
  FALLBACK_LLM_PROVIDER: z.string().default('groq'),
  GEMINI_API_KEY: z.string().optional().default(''),
  GROQ_API_KEY: z.string().optional().default(''),

  WHATSAPP_PHONE_NUMBER_ID: z.string().optional().default(''),
  WHATSAPP_ACCESS_TOKEN: z.string().optional().default(''),

  GOOGLE_CALENDAR_CLIENT_ID: z.string().optional().default(''),
  GOOGLE_CALENDAR_CLIENT_SECRET: z.string().optional().default(''),
  GOOGLE_CALENDAR_REFRESH_TOKEN: z.string().optional().default(''),
  GOOGLE_CALENDAR_ID: z.string().optional().default('primary'),

  SUPABASE_URL: z.string().optional().default(''),
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional().default(''),
  DATABASE_URL: z.string().optional().default(''),

  RESUME_URL: z.string().optional().default('https://elevatebox.io/assets/aditya_kalburgi_resume.pdf'),
  ARCHITECTURE_IMAGE_URL: z.string().optional().default('https://elevatebox.io/assets/elevate_voice_architecture.png'),
});

export type EnvConfig = z.infer<typeof envSchema>;

export const env: EnvConfig = envSchema.parse(process.env);
