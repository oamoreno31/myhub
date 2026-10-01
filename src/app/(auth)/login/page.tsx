import type { Metadata } from "next";
import { Logo } from "@/components/marca/logo";
import { FormularioLogin } from "./formulario-login";

export const metadata: Metadata = { title: "Entrar" };

const ERRORES: Record<string, string> = {
  "no-autorizado": "Este correo no tiene acceso a Plata Clara.",
  "enlace-invalido": "El enlace expiró o ya se usó. Pide uno nuevo.",
};

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const params = await searchParams;
  const next = typeof params.next === "string" ? params.next : undefined;
  const error = typeof params.error === "string" ? ERRORES[params.error] : undefined;

  return (
    <main className="grid min-h-dvh lg:grid-cols-2">
      <section className="hidden flex-col justify-between bg-sidebar p-12 text-sidebar-foreground lg:flex">
        <div className="flex items-center gap-3">
          <Logo className="text-brand" />
          <span className="font-display text-2xl font-semibold text-white">Plata Clara</span>
        </div>
        <div className="flex max-w-md flex-col gap-4">
          <p className="font-display text-4xl leading-tight font-semibold text-white">
            Lo que entra, lo que sale y lo que falta por pagar, mes a mes.
          </p>
          <p className="text-sidebar-muted">
            Obligaciones, tarjetas de crédito con capital y otros cargos, deudas y salud financiera en un solo lugar.
          </p>
        </div>
        <p className="text-sm text-sidebar-muted">Uso personal · acceso restringido</p>
      </section>

      <section className="flex items-center justify-center px-4 py-12">
        <div className="flex w-full max-w-sm flex-col gap-8">
          <div className="flex items-center gap-3 lg:hidden">
            <Logo className="text-primary" />
            <span className="font-display text-2xl font-semibold">Plata Clara</span>
          </div>
          <div className="flex flex-col gap-2">
            <h1 className="font-display text-3xl font-semibold">Entrar</h1>
            <p className="text-sm text-muted-foreground">Accede con tu correo autorizado.</p>
          </div>
          <FormularioLogin next={next} errorInicial={error} />
        </div>
      </section>
    </main>
  );
}
