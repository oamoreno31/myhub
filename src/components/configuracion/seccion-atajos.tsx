"use client";

import {
  ActivityIcon,
  CheckIcon,
  CopyIcon,
  KeyRoundIcon,
  Loader2Icon,
  PlugZapIcon,
  SmartphoneIcon,
  SparklesIcon,
  Trash2Icon,
} from "lucide-react";
import { useState, useSyncExternalStore, useTransition } from "react";
import { toast } from "sonner";
import { cambiarAlias, crearTokenApi, eliminarAlias, revocarTokenApi } from "@/actions/atajos";
import { BotonConfirmar } from "@/components/formularios/boton-confirmar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Campo, ariaCampo } from "@/components/ui/campo";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { useAccion } from "@/hooks/use-accion";
import type { AliasUI, CapturaUI, TokenUI } from "@/lib/atajos-datos";
import { ETIQUETA_ALIAS, ETIQUETA_FUENTE, estadoToken, haceCuanto, RESULTADO_CAPTURA } from "@/lib/domain/atajos";

const ESTADO_TOKEN = {
  activo: { etiqueta: "✓ Activo", tono: "success" },
  revocado: { etiqueta: "Revocado", tono: "neutral" },
  vencido: { etiqueta: "Vencido", tono: "warning" },
} as const;

const fechaCorta = (iso: string) =>
  new Date(iso).toLocaleString("es-CO", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Bogota" });

/** Origen de la app en el navegador (la URL base del atajo). Vacío al renderizar en el servidor. */
function useOrigen() {
  return useSyncExternalStore(
    () => () => {},
    () => window.location.origin,
    () => "",
  );
}

async function copiar(texto: string, que: string) {
  try {
    await navigator.clipboard.writeText(texto);
    toast.success(`${que} copiado.`);
  } catch {
    toast.error("No se pudo copiar; selecciónalo y cópialo a mano.");
  }
}

export function SeccionAtajos({
  tokens,
  alias,
  capturas,
  cuentas,
}: {
  tokens: TokenUI[];
  alias: AliasUI[];
  capturas: CapturaUI[];
  cuentas: { id: string; nombre: string; tipo: string; activa: boolean }[];
}) {
  const origen = useOrigen();
  const urlBase = origen ? `${origen}/api/atajos/v1` : "";
  const [tokenNuevo, setTokenNuevo] = useState<string | null>(null);
  const { onSubmit, pendiente, errores } = useAccion(crearTokenApi, (e) => setTokenNuevo(e.token ?? null));
  const activos = tokens.filter((t) => estadoToken(t) === "activo").length;

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <Card className="gap-4 lg:col-span-2">
        <div className="flex items-start gap-3">
          <SmartphoneIcon className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden="true" />
          <div className="flex flex-col gap-1">
            <h2 className="font-bold">Registrar desde el iPhone</h2>
            <p className="text-sm text-muted-foreground">
              Un atajo de iPhone puede registrar tus gastos al pagar con Wallet, al recibir el SMS del banco o con Siri.
              Solo pregunta origen, monto y descripción; la fecha es la de hoy. Lo que no se pueda clasificar solo queda
              en <strong>Por revisar</strong>.
            </p>
          </div>
        </div>
        <ol className="flex list-decimal flex-col gap-1.5 pl-5 text-sm">
          <li>Crea un token para tu iPhone (abajo) y cópialo: solo se muestra una vez.</li>
          <li>
            En el atajo, usa la dirección{" "}
            <code className="rounded bg-muted px-1.5 py-0.5 text-xs break-all">{urlBase || "…/api/atajos/v1"}</code> y
            el encabezado{" "}
            <code className="rounded bg-muted px-1.5 py-0.5 text-xs">Authorization: Bearer &lt;token&gt;</code>.
          </li>
          <li>Prueba la conexión y listo. Si pierdes el iPhone, revoca su token aquí.</li>
        </ol>
        {urlBase ? (
          <Button variant="outline" size="sm" className="self-start" onClick={() => copiar(urlBase, "Dirección")}>
            <CopyIcon /> Copiar dirección
          </Button>
        ) : null}
      </Card>

      <Card className="gap-4">
        <div className="flex items-start gap-3">
          <KeyRoundIcon className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden="true" />
          <div className="flex flex-col gap-1">
            <h2 className="font-bold">Tokens</h2>
            <p className="text-sm text-muted-foreground">
              Uno por dispositivo. Un token solo permite registrar: no lee saldos ni tu historial. Máximo 5 activos.
            </p>
          </div>
        </div>

        {tokenNuevo ? (
          <TokenRecienCreado token={tokenNuevo} urlBase={urlBase} onListo={() => setTokenNuevo(null)} />
        ) : (
          <form
            onSubmit={onSubmit}
            className="flex flex-col gap-3 min-[420px]:flex-row min-[420px]:items-end"
            noValidate
          >
            <Campo id="tk-nombre" etiqueta="Nombre del dispositivo" error={errores.nombre} className="flex-1">
              <Input
                {...ariaCampo("tk-nombre", errores.nombre)}
                name="nombre"
                maxLength={40}
                placeholder="iPhone de Omar"
                required
              />
            </Campo>
            <Button type="submit" disabled={pendiente || activos >= 5}>
              {pendiente ? <Loader2Icon className="animate-spin" /> : <KeyRoundIcon />} Crear token
            </Button>
          </form>
        )}

        {tokens.length > 0 ? (
          <ul className="flex flex-col divide-y">
            {tokens.map((t) => (
              <FilaToken key={t.id} token={t} />
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">Aún no has creado tokens.</p>
        )}
      </Card>

      <Card className="gap-4">
        <div className="flex items-start gap-3">
          <SparklesIcon className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden="true" />
          <div className="flex flex-col gap-1">
            <h2 className="font-bold">Lo que el atajo aprendió</h2>
            <p className="text-sm text-muted-foreground">
              Cuando eliges el origen de un pago, se recuerda qué tarjeta de Wallet, qué últimos 4 dígitos del SMS o qué
              nombre dictado corresponden a esa cuenta. Corrígelo si se equivocó.
            </p>
          </div>
        </div>
        {alias.length > 0 ? (
          <ul className="flex flex-col divide-y">
            {alias.map((a) => (
              <FilaAlias key={a.id} alias={a} cuentas={cuentas} />
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">Todavía nada: se llena con el uso.</p>
        )}
      </Card>

      <Card className="gap-4 lg:col-span-2">
        <div className="flex items-start gap-3">
          <ActivityIcon className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden="true" />
          <div className="flex flex-col gap-1">
            <h2 className="font-bold">Actividad reciente</h2>
            <p className="text-sm text-muted-foreground">
              Lo que llegó desde el iPhone en los últimos 30 días (sin saldos). Sirve para ver qué SMS no se
              entendieron.
            </p>
          </div>
        </div>
        {capturas.length > 0 ? (
          <ul className="flex flex-col divide-y">
            {capturas.map((c) => (
              <FilaCaptura key={c.id} captura={c} />
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">Sin actividad todavía.</p>
        )}
      </Card>
    </div>
  );
}

function TokenRecienCreado({ token, urlBase, onListo }: { token: string; urlBase: string; onListo: () => void }) {
  const [probando, setProbando] = useState(false);
  const [prueba, setPrueba] = useState<{ ok: boolean; texto: string } | null>(null);

  const probar = async () => {
    setProbando(true);
    setPrueba(null);
    try {
      const res = await fetch("/api/atajos/v1/contexto", {
        method: "POST",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify({ fuente: "rapido" }),
      });
      const r = (await res.json()) as { ok?: boolean; mensaje?: string; origenes_lista?: string[] };
      setPrueba(
        res.ok && r.ok
          ? { ok: true, texto: `Conexión correcta: el atajo verá ${r.origenes_lista?.length ?? 0} orígenes de pago.` }
          : { ok: false, texto: r.mensaje ?? `Error ${res.status}` },
      );
    } catch {
      setPrueba({ ok: false, texto: "No hubo respuesta. Revisa tu conexión." });
    } finally {
      setProbando(false);
    }
  };

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-warning bg-warning-soft p-4" role="status">
      <p className="text-sm font-bold text-warning">! Copia el token ahora: no se vuelve a mostrar.</p>
      <code className="rounded-lg bg-card px-3 py-2 font-mono text-xs break-all select-all">{token}</code>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={() => copiar(token, "Token")}>
          <CopyIcon /> Copiar token
        </Button>
        {urlBase ? (
          <Button size="sm" variant="outline" onClick={() => copiar(urlBase, "Dirección")}>
            <CopyIcon /> Copiar dirección
          </Button>
        ) : null}
        <Button size="sm" variant="outline" onClick={probar} disabled={probando}>
          {probando ? <Loader2Icon className="animate-spin" /> : <PlugZapIcon />} Probar conexión
        </Button>
        <Button size="sm" variant="ghost" onClick={onListo}>
          <CheckIcon /> Ya lo guardé
        </Button>
      </div>
      {prueba ? (
        <p className={prueba.ok ? "text-sm font-semibold text-success" : "text-sm font-semibold text-destructive"}>
          {prueba.ok ? "✓ " : "! "}
          {prueba.texto}
        </p>
      ) : null}
    </div>
  );
}

function FilaToken({ token: t }: { token: TokenUI }) {
  const [pendiente, startTransition] = useTransition();
  const estado = ESTADO_TOKEN[estadoToken(t)];
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1 py-3">
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="flex items-center gap-2 font-semibold">
          <span className="truncate">{t.nombre}</span>
          <Badge variant={estado.tono}>{estado.etiqueta}</Badge>
        </span>
        <span className="text-xs text-muted-foreground">
          <code>{t.prefijo}…</code> · creado {fechaCorta(t.created_at)} · último uso {haceCuanto(t.ultimo_uso_en)}
          {t.ultimo_uso_fuente ? ` (${ETIQUETA_FUENTE[t.ultimo_uso_fuente] ?? t.ultimo_uso_fuente})` : ""} ·{" "}
          {t.usos.toLocaleString("es-CO")} {t.usos === 1 ? "uso" : "usos"}
        </span>
      </div>
      {estadoToken(t) === "activo" ? (
        <BotonConfirmar
          etiqueta="Revocar"
          titulo={`¿Revocar "${t.nombre}"?`}
          detalle="Los atajos que usan este token dejan de funcionar de inmediato. No se puede deshacer: tendrás que crear otro token."
          confirmar="Revocar"
          disabled={pendiente}
          onConfirmar={() =>
            startTransition(async () => {
              const r = await revocarTokenApi(t.id);
              if (r.ok) toast.success(r.mensaje);
              else toast.error(r.error);
            })
          }
        />
      ) : null}
    </li>
  );
}

function FilaAlias({
  alias: a,
  cuentas,
}: {
  alias: AliasUI;
  cuentas: { id: string; nombre: string; tipo: string; activa: boolean }[];
}) {
  const [pendiente, startTransition] = useTransition();
  const opciones = cuentas.filter((c) => c.activa || c.id === a.cuenta_id);
  const valor = a.tipo === "sms_ultimos4" ? `·${a.valor}` : `“${a.valor}”`;
  return (
    <li className="flex flex-col gap-2 py-3 min-[480px]:flex-row min-[480px]:items-center">
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="truncate font-semibold">{valor}</span>
        <span className="text-xs text-muted-foreground">
          {ETIQUETA_ALIAS[a.tipo] ?? a.tipo} · {a.usos} {a.usos === 1 ? "vez" : "veces"} · {haceCuanto(a.ultimo_uso)}
        </span>
      </div>
      <div className="flex items-center gap-1">
        <Select
          aria-label={`Cuenta para ${valor}`}
          value={a.cuenta_id}
          disabled={pendiente}
          className="min-w-40"
          onChange={(e) => {
            const cuenta = e.target.value;
            startTransition(async () => {
              const r = await cambiarAlias(a.id, cuenta);
              if (r.ok) toast.success(r.mensaje);
              else toast.error(r.error);
            });
          }}
        >
          {opciones.map((c) => (
            <option key={c.id} value={c.id}>
              {c.tipo === "tarjeta_credito" ? "💳 " : ""}
              {c.nombre}
            </option>
          ))}
        </Select>
        <Button
          variant="ghost"
          size="icon"
          aria-label={`Olvidar ${valor}`}
          disabled={pendiente}
          onClick={() =>
            startTransition(async () => {
              const r = await eliminarAlias(a.id);
              if (r.ok) toast.success(r.mensaje);
              else toast.error(r.error);
            })
          }
        >
          <Trash2Icon />
        </Button>
      </div>
    </li>
  );
}

function FilaCaptura({ captura: c }: { captura: CapturaUI }) {
  const resultado = RESULTADO_CAPTURA[c.resultado] ?? { etiqueta: c.resultado, tono: "neutral" as const };
  return (
    <li className="flex flex-col gap-1 py-2.5">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Badge variant={resultado.tono}>{resultado.etiqueta}</Badge>
        <span className="font-semibold">{ETIQUETA_FUENTE[c.fuente] ?? c.fuente}</span>
        <span className="text-muted-foreground">· {c.etapa === "contexto" ? "consulta" : "registro"}</span>
        <span className="ml-auto text-xs text-muted-foreground">{fechaCorta(c.creado_en)}</span>
      </div>
      {c.mensaje ? <p className="text-sm text-destructive">{c.mensaje}</p> : null}
      {c.texto_enmascarado ? (
        <details className="text-xs text-muted-foreground">
          <summary className="cursor-pointer font-semibold">Ver SMS (sin saldos)</summary>
          <p className="mt-1 rounded-lg bg-muted px-3 py-2 break-words">{c.texto_enmascarado}</p>
        </details>
      ) : null}
    </li>
  );
}
