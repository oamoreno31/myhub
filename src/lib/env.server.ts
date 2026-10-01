import "server-only";
import { z } from "zod";

const serverSchema = z.object({
  /** Correos autorizados, separados por coma. Nadie más puede entrar aunque exista en Auth. */
  ALLOWED_EMAILS: z
    .string()
    .min(1, "Falta ALLOWED_EMAILS")
    .transform((v) =>
      v
        .split(",")
        .map((e) => e.trim().toLowerCase())
        .filter(Boolean),
    ),
  APP_TIMEZONE: z.string().default("America/Bogota"),
  /** Solo para rutas de cron y tareas administrativas. */
  SUPABASE_SECRET_KEY: z.string().optional(),
  CRON_SECRET: z.string().optional(),
});

export type ServerEnv = z.infer<typeof serverSchema>;

let cache: ServerEnv | null = null;

export function serverEnv(): ServerEnv {
  cache ??= serverSchema.parse({
    ALLOWED_EMAILS: process.env.ALLOWED_EMAILS ?? process.env.ALLOWED_EMAIL,
    APP_TIMEZONE: process.env.APP_TIMEZONE || undefined,
    SUPABASE_SECRET_KEY: process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY,
    CRON_SECRET: process.env.CRON_SECRET,
  });
  return cache;
}
