"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { correoPermitido, rutaSegura } from "@/lib/auth/lista-blanca";
import { serverEnv } from "@/lib/env.server";
import { createClient } from "@/lib/supabase/server";

export type EstadoLogin = {
  error?: string;
  mensaje?: string;
  email?: string;
};

const credencialesSchema = z.object({
  email: z.email("Escribe un correo válido").trim().toLowerCase(),
  password: z.string().min(1, "Escribe tu contraseña"),
  next: z.string().optional(),
});

const enlaceSchema = z.object({
  email: z.email("Escribe un correo válido").trim().toLowerCase(),
  next: z.string().optional(),
});

const ERROR_GENERICO = "Correo o contraseña incorrectos.";

export async function iniciarSesion(_prev: EstadoLogin, formData: FormData): Promise<EstadoLogin> {
  const parsed = credencialesSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message, email: String(formData.get("email") ?? "") };
  }
  const { email, password, next } = parsed.data;

  // Mismo mensaje para correos no autorizados: no se revela quién tiene acceso.
  if (!correoPermitido(email, serverEnv().ALLOWED_EMAILS)) {
    return { error: ERROR_GENERICO, email };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    return { error: ERROR_GENERICO, email };
  }

  redirect(rutaSegura(next));
}

export async function enviarEnlaceMagico(_prev: EstadoLogin, formData: FormData): Promise<EstadoLogin> {
  const parsed = enlaceSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message, email: String(formData.get("email") ?? "") };
  }
  const { email, next } = parsed.data;
  const mensaje = "Si el correo tiene acceso, te llegará un enlace para entrar.";

  if (!correoPermitido(email, serverEnv().ALLOWED_EMAILS)) {
    return { mensaje, email };
  }

  const h = await headers();
  const origen = h.get("origin") ?? `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host")}`;
  const destino = new URL("/auth/confirm", origen);
  destino.searchParams.set("next", rutaSegura(next));

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { shouldCreateUser: false, emailRedirectTo: destino.toString() },
  });
  if (error && error.status !== 422) {
    return { error: "No se pudo enviar el enlace. Intenta de nuevo en un minuto.", email };
  }
  return { mensaje, email };
}

export async function cerrarSesion() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
