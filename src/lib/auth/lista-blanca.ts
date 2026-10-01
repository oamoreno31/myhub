/** Verifica si un correo está en la lista blanca (comparación sin mayúsculas ni espacios). */
export function correoPermitido(email: string | null | undefined, permitidos: readonly string[]): boolean {
  if (!email) return false;
  const normalizado = email.trim().toLowerCase();
  return permitidos.includes(normalizado);
}

/** Solo permite redirecciones internas (evita open redirects tras el login). */
export function rutaSegura(destino: string | null | undefined, porDefecto = "/"): string {
  if (!destino) return porDefecto;
  if (!destino.startsWith("/") || destino.startsWith("//") || destino.startsWith("/\\")) return porDefecto;
  if (destino.startsWith("/login") || destino.startsWith("/auth")) return porDefecto;
  return destino;
}
