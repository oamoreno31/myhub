"use client";

import { Loader2Icon, MailIcon } from "lucide-react";
import { useActionState, useState } from "react";
import { type EstadoLogin, enviarEnlaceMagico, iniciarSesion } from "@/actions/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Modo = "password" | "enlace";

export function FormularioLogin({ next, errorInicial }: { next?: string; errorInicial?: string }) {
  const [modo, setModo] = useState<Modo>("password");
  const [estadoPassword, accionPassword, enviandoPassword] = useActionState<EstadoLogin, FormData>(iniciarSesion, {
    error: errorInicial,
  });
  const [estadoEnlace, accionEnlace, enviandoEnlace] = useActionState<EstadoLogin, FormData>(enviarEnlaceMagico, {});

  const estado = modo === "password" ? estadoPassword : estadoEnlace;
  const enviando = modo === "password" ? enviandoPassword : enviandoEnlace;

  return (
    <div className="flex flex-col gap-5">
      <form action={modo === "password" ? accionPassword : accionEnlace} className="flex flex-col gap-4" noValidate>
        {next ? <input type="hidden" name="next" value={next} /> : null}

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="email">Correo</Label>
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            inputMode="email"
            required
            defaultValue={estado.email}
            key={`email-${modo}`}
            aria-invalid={Boolean(estado.error) || undefined}
          />
        </div>

        {modo === "password" ? (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="password">Contraseña</Label>
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              aria-invalid={Boolean(estado.error) || undefined}
            />
          </div>
        ) : null}

        {estado.error ? (
          <p role="alert" className="rounded-lg bg-destructive-soft px-3 py-2 text-sm font-semibold text-destructive">
            {estado.error}
          </p>
        ) : null}
        {estado.mensaje ? (
          <p role="status" className="rounded-lg bg-success-soft px-3 py-2 text-sm font-semibold text-success">
            {estado.mensaje}
          </p>
        ) : null}

        <Button type="submit" size="lg" disabled={enviando}>
          {enviando ? <Loader2Icon className="animate-spin" /> : modo === "enlace" ? <MailIcon /> : null}
          {modo === "password" ? "Entrar" : "Enviarme un enlace"}
        </Button>
      </form>

      <Button
        type="button"
        variant="link"
        className="self-center"
        onClick={() => setModo(modo === "password" ? "enlace" : "password")}
      >
        {modo === "password" ? "Prefiero un enlace por correo" : "Entrar con contraseña"}
      </Button>
    </div>
  );
}
