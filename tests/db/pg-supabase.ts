/**
 * Postgres en memoria (PGlite) con un "stub" mínimo de Supabase:
 * roles anon/authenticated/service_role, esquema auth con auth.users y auth.uid().
 * Permite validar migraciones, triggers y RLS sin Docker.
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";

const MIGRATIONS_DIR = path.resolve(__dirname, "../../supabase/migrations");

const SUPABASE_STUB = `
  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin bypassrls;
  create schema auth;
  create schema extensions;
  create table auth.users (
    id uuid primary key,
    email text unique
  );
  create function auth.uid() returns uuid
    language sql stable
    as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  grant usage on schema auth, public to anon, authenticated, service_role;
  grant execute on function auth.uid() to anon, authenticated, service_role;
`;

export async function crearBaseDePruebas(): Promise<PGlite> {
  const db = new PGlite();
  await db.exec(SUPABASE_STUB);
  const archivos = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();
  for (const archivo of archivos) {
    const sql = readFileSync(path.join(MIGRATIONS_DIR, archivo), "utf8");
    try {
      await db.exec(sql);
    } catch (error) {
      throw new Error(`Falló la migración ${archivo}: ${(error as Error).message}`);
    }
  }
  return db;
}

/** Crea un usuario en auth.users (dispara la inicialización de datos). */
export async function crearUsuario(db: PGlite, id: string, email: string) {
  await db.exec("reset role;");
  await db.query("insert into auth.users (id, email) values ($1, $2)", [id, email]);
}

/** Ejecuta como un usuario autenticado (RLS activo). */
export async function comoUsuario(db: PGlite, id: string) {
  await db.exec("reset role;");
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [id]);
  await db.exec("set role authenticated;");
}

/** Ejecuta como anónimo (RLS activo, sin sesión). */
export async function comoAnonimo(db: PGlite) {
  await db.exec("reset role;");
  await db.query("select set_config('request.jwt.claim.sub', '', false)");
  await db.exec("set role anon;");
}
