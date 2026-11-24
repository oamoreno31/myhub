"use client";

import { BookOpenIcon, CopyIcon, CreditCardIcon, MessageSquareTextIcon, WorkflowIcon, ZapIcon } from "lucide-react";
import type { ReactNode } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

/**
 * Guía para armar los atajos en el iPhone (docs/08 §6, F8.4). Se lee en el iPhone mientras se arman.
 * Los nombres de acciones son los de Atajos en español; pueden variar un poco según la versión de iOS.
 */

/** Nombre de una acción de Atajos. */
const A = ({ children }: { children: ReactNode }) => <strong className="font-bold text-foreground">{children}</strong>;
/** Valor que se escribe tal cual. */
const V = ({ children }: { children: ReactNode }) => (
  <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[0.8em] break-all">{children}</code>
);
/** Variable del atajo. */
const Var = ({ children }: { children: ReactNode }) => (
  <span className="rounded bg-info-soft px-1.5 py-0.5 text-[0.85em] font-semibold whitespace-nowrap text-info">
    {children}
  </span>
);

function Seccion({
  id,
  icono,
  titulo,
  resumen,
  children,
}: {
  id: string;
  icono: ReactNode;
  titulo: string;
  resumen: string;
  children: ReactNode;
}) {
  return (
    <details id={id} className="group rounded-xl border bg-card open:shadow-sm">
      <summary className="flex cursor-pointer list-none items-start gap-3 p-4 outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <span className="mt-0.5 text-primary">{icono}</span>
        <span className="flex flex-1 flex-col">
          <span className="font-bold">{titulo}</span>
          <span className="text-sm text-muted-foreground">{resumen}</span>
        </span>
        <span className="text-sm font-semibold text-primary group-open:hidden">Ver pasos</span>
        <span className="hidden text-sm font-semibold text-muted-foreground group-open:inline">Ocultar</span>
      </summary>
      <div className="flex flex-col gap-3 border-t px-4 pt-3 pb-4 text-sm leading-relaxed">{children}</div>
    </details>
  );
}

function Pasos({ children }: { children: ReactNode }) {
  return (
    <ol className="flex list-decimal flex-col gap-2.5 pl-5 marker:font-bold marker:text-muted-foreground">
      {children}
    </ol>
  );
}

function Nota({ children, tono = "info" }: { children: ReactNode; tono?: "info" | "alerta" }) {
  return (
    <p
      className={
        tono === "alerta"
          ? "rounded-lg bg-warning-soft px-3 py-2 text-warning"
          : "rounded-lg bg-info-soft px-3 py-2 text-info"
      }
    >
      {children}
    </p>
  );
}

async function copiar(texto: string) {
  try {
    await navigator.clipboard.writeText(texto);
    toast.success("Copiado.");
  } catch {
    toast.error("No se pudo copiar; selecciónalo y cópialo a mano.");
  }
}

export function GuiaAtajos({ urlBase }: { urlBase: string }) {
  const url = urlBase || "https://<tu-dominio>/api/atajos/v1";
  return (
    <Card className="gap-4 lg:col-span-2" id="guia">
      <div className="flex items-start gap-3">
        <BookOpenIcon className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden="true" />
        <div className="flex flex-col gap-1">
          <h2 className="font-bold">Guía: arma los atajos en tu iPhone</h2>
          <p className="text-sm text-muted-foreground">
            Son 4 piezas en la app <strong>Atajos</strong>: un atajo principal que hace todo y tres formas de
            dispararlo. Se arman una sola vez (unos 20 minutos). Abre esta página en el iPhone para copiar los valores
            mientras armas.
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-xl bg-muted/60 p-3 text-sm">
        <span className="font-semibold">Dirección:</span>
        <V>{url}</V>
        {urlBase ? (
          <Button size="sm" variant="outline" onClick={() => copiar(urlBase)}>
            <CopyIcon /> Copiar
          </Button>
        ) : null}
      </div>

      <Nota>
        Convenciones: <A>Negrita</A> = acción de Atajos (búscala por su nombre con «Agregar acción»). <V>código</V> =
        escríbelo tal cual. <Var>Variable</Var> = toca el campo y elige esa variable. Para guardar algo en una variable
        usa la acción <A>Establecer variable</A> justo después.
      </Nota>

      <div className="flex flex-col gap-3">
        <Seccion
          id="guia-principal"
          icono={<WorkflowIcon className="size-5" aria-hidden="true" />}
          titulo="1 · Atajo principal «Plata Clara»"
          resumen="Pregunta origen, monto y descripción y registra. Los demás atajos lo llaman."
        >
          <p>
            Atajos → <A>+</A> → nómbralo exactamente <V>Plata Clara</V> (los otros atajos lo buscan por ese nombre).
          </p>
          <h3 className="font-bold">Configuración</h3>
          <Pasos>
            <li>
              <A>Texto</A> con la dirección <V>{url}</V> → <A>Establecer variable</A> <Var>URL</Var>.
            </li>
            <li>
              <A>Texto</A> con tu token (<V>pc_…</V>, el que copiaste arriba) → <A>Establecer variable</A>{" "}
              <Var>Token</Var>.
            </li>
          </Pasos>

          <h3 className="font-bold">Consultar a Plata Clara</h3>
          <Pasos>
            <li>
              <A>Obtener contenido de URL</A>: en URL pon <Var>URL</Var> seguido de <V>/contexto</V>. Toca{" "}
              <A>Mostrar más</A>:
              <ul className="mt-1 ml-4 list-disc">
                <li>
                  Método: <V>POST</V>
                </li>
                <li>
                  Encabezados: clave <V>Authorization</V>, valor <V>Bearer </V> (con espacio) seguido de{" "}
                  <Var>Token</Var>
                </li>
                <li>
                  Cuerpo de la solicitud: <V>Archivo</V> → <Var>Entrada del atajo</Var>. Arriba aparece «Recibir…
                  entrada de…»: deja <V>Cualquiera</V> y en «Si no hay entrada» elige <V>Continuar</V>.
                </li>
              </ul>
              Luego <A>Establecer variable</A> <Var>Contexto</Var>.
            </li>
            <li>
              <A>Obtener valor del diccionario</A> <V>mensaje</V> en <Var>Contexto</Var> → <A>Si</A>{" "}
              <Var>Valor del diccionario</Var> <V>tiene algún valor</V>: <A>Mostrar notificación</A> con ese valor y{" "}
              <A>Detener este atajo</A>. <A>Finalizar si</A>. (Así ves errores como «Token inválido».)
            </li>
            <li>
              <A>Obtener valor del diccionario</A> <V>clave</V> en <Var>Contexto</Var> → <A>Establecer variable</A>{" "}
              <Var>Clave</Var>.
            </li>
            <li>
              <A>Obtener valor del diccionario</A> <V>accion</V> en <Var>Contexto</Var> → <A>Establecer variable</A>{" "}
              <Var>Accion</Var>. <A>Si</A> <Var>Accion</Var> <V>es</V> <V>ignorar</V>: <A>Detener este atajo</A>.{" "}
              <A>Finalizar si</A>. (Los SMS de claves o publicidad terminan aquí, sin molestar.)
            </li>
          </Pasos>

          <h3 className="font-bold">Preguntar</h3>
          <Pasos>
            <li>
              <A>Si</A> <Var>Accion</Var> <V>es</V> <V>registrar_directo</V> (solo pasa con Wallet en modo automático):
              <ul className="mt-1 ml-4 list-disc">
                <li>
                  <A>Obtener valor del diccionario</A> <V>origen_sugerido_valor</V> → variable <Var>Origen</Var>
                </li>
                <li>
                  <A>Obtener valor del diccionario</A> <V>monto</V> → variable <Var>Monto</Var>
                </li>
                <li>
                  <A>Obtener valor del diccionario</A> <V>descripcion</V> → variable <Var>Descripcion</Var>
                </li>
                <li>
                  <A>Texto</A> <V>auto</V> → variable <Var>Categoria</Var> · <A>Texto</A> <V>true</V> → variable{" "}
                  <Var>Revisar</Var>
                </li>
              </ul>
            </li>
            <li>
              <A>De lo contrario</A>:
              <ol className="mt-1 ml-4 flex list-[lower-alpha] flex-col gap-1.5">
                <li>
                  <strong>Duplicado:</strong> <A>Obtener valor del diccionario</A> <V>duplicado</V> → <A>Si</A> tiene
                  algún valor: <A>Elegir del menú</A> con la indicación <Var>Valor del diccionario</Var> y dos opciones:{" "}
                  <V>No, es otro</V> (vacía) y <V>Sí, ya lo registré</V> (adentro: <A>Detener este atajo</A>
                  ). <A>Finalizar si</A>.
                </li>
                <li>
                  <strong>Origen:</strong> <A>Obtener valor del diccionario</A> <V>origenes_lista</V> →{" "}
                  <A>Elegir de la lista</A> (indicación <V>¿Con qué pagaste?</V>). Luego{" "}
                  <A>Obtener valor del diccionario</A> <V>origenes</V> en <Var>Contexto</Var> y otra{" "}
                  <A>Obtener valor del diccionario</A> con clave <Var>Elemento elegido</Var> en ese resultado → variable{" "}
                  <Var>Origen</Var>.
                </li>
                <li>
                  <strong>Monto:</strong> <A>Obtener valor del diccionario</A> <V>monto</V> → <A>Solicitar entrada</A>{" "}
                  tipo <V>Número</V>, indicación <V>¿Cuánto?</V>, respuesta predeterminada{" "}
                  <Var>Valor del diccionario</Var> → variable <Var>Monto</Var>.
                </li>
                <li>
                  <strong>Descripción:</strong> igual con <V>descripcion</V>, tipo <V>Texto</V>, indicación{" "}
                  <V>¿En qué?</V> → variable <Var>Descripcion</Var>.
                </li>
                <li>
                  <strong>Cuotas (solo tarjeta de crédito):</strong> <A>Si</A> <Var>Origen</Var> <V>empieza por</V>{" "}
                  <V>t:</V>: <A>Solicitar entrada</A> <V>Número</V> <V>¿Cuántas cuotas?</V> con predeterminado <V>1</V>{" "}
                  → variable <Var>Cuotas</Var>. <A>Finalizar si</A>.
                </li>
                <li>
                  <strong>Categoría (opcional):</strong> si quieres que pregunte, <A>Obtener valor del diccionario</A>{" "}
                  <V>pedir_categoria</V> → <A>Si</A> es <V>si</V>: <A>Obtener valor del diccionario</A>{" "}
                  <V>categorias_lista</V> → <A>Elegir de la lista</A> <V>¿Categoría?</V> → valor de{" "}
                  <Var>Elemento elegido</Var> en <V>categorias</V> → variable <Var>Categoria</Var>.{" "}
                  <A>De lo contrario</A>: <A>Texto</A> <V>auto</V> → <Var>Categoria</Var>. Si no quieres esa pregunta,
                  pon solo <A>Texto</A> <V>auto</V> → <Var>Categoria</Var>: se clasifica sola o queda en «Por revisar».
                </li>
                <li>
                  <A>Texto</A> <V>false</V> → variable <Var>Revisar</Var>.
                </li>
              </ol>
            </li>
            <li>
              <A>Finalizar si</A>.
            </li>
          </Pasos>

          <h3 className="font-bold">Registrar</h3>
          <Pasos>
            <li>
              <A>Obtener contenido de URL</A>: <Var>URL</Var> + <V>/registrar</V>, método <V>POST</V>, el mismo
              encabezado <V>Authorization</V>, y Cuerpo de la solicitud <V>JSON</V> con estos campos de tipo{" "}
              <V>Texto</V>:
              <div className="mt-2 overflow-x-auto rounded-lg border">
                <table className="w-full text-left text-xs">
                  <thead className="bg-muted">
                    <tr>
                      <th className="px-3 py-1.5">Clave</th>
                      <th className="px-3 py-1.5">Valor</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {[
                      ["clave", "Clave"],
                      ["origen", "Origen"],
                      ["monto", "Monto"],
                      ["descripcion", "Descripcion"],
                      ["categoria", "Categoria"],
                      ["cuotas", "Cuotas"],
                      ["revisar", "Revisar"],
                    ].map(([k, v]) => (
                      <tr key={k}>
                        <td className="px-3 py-1.5">
                          <V>{k}</V>
                        </td>
                        <td className="px-3 py-1.5">
                          <Var>{v}</Var>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </li>
            <li>
              <A>Obtener valor del diccionario</A> <V>mensaje</V> del resultado → <A>Mostrar notificación</A> con ese
              valor. Verás algo como <V>✓ Compra de $ 45.900 · Visa ·1234 · Mercado · 1 cuota</V>.
            </li>
          </Pasos>
          <Nota>
            La primera vez, iOS pregunta si «Plata Clara» puede conectarse a tu dominio: elige{" "}
            <strong>Permitir siempre</strong>. Pruébalo tocando el atajo: debe preguntarte origen, monto y descripción.
          </Nota>
          <Nota tono="alerta">
            ¿Error al consultar o «Elige el origen del pago» siempre? Cambia el cuerpo de la primera consulta de{" "}
            <V>Archivo</V> a <V>JSON</V> con los campos de texto <V>fuente</V>, <V>tipo</V>, <V>texto</V>,{" "}
            <V>tarjeta</V>, <V>comercio</V>, <V>monto</V> y <V>modo</V>, cada uno con{" "}
            <A>Obtener valor del diccionario</A> de esa clave en <Var>Entrada del atajo</Var>.
          </Nota>
        </Seccion>

        <Seccion
          id="guia-rapido"
          icono={<ZapIcon className="size-5" aria-hidden="true" />}
          titulo="2 · «Gasto rápido» (Siri, botón de acción, pantalla de inicio)"
          resumen="Para registrar a mano en 4 toques, o dictando la frase completa."
        >
          <Pasos>
            <li>
              Atajo nuevo llamado <V>Gasto rápido</V>.
            </li>
            <li>
              <A>Elegir del menú</A> con indicación <V>¿Qué registras?</V> y opciones <V>Gasto</V>, <V>Ingreso</V> y{" "}
              <V>Dictar</V>:
              <ul className="mt-1 ml-4 list-disc">
                <li>
                  En <V>Gasto</V>: <A>Diccionario</A> con <V>fuente</V> = <V>rapido</V> y <V>tipo</V> = <V>gasto</V>.
                </li>
                <li>
                  En <V>Ingreso</V>: <A>Diccionario</A> con <V>fuente</V> = <V>rapido</V> y <V>tipo</V> = <V>ingreso</V>
                  .
                </li>
                <li>
                  En <V>Dictar</V>: <A>Dictar texto</A> y luego <A>Diccionario</A> con <V>fuente</V> = <V>dictado</V> y{" "}
                  <V>texto</V> = <Var>Texto dictado</Var>.
                </li>
              </ul>
              <A>Finalizar menú</A>.
            </li>
            <li>
              <A>Ejecutar atajo</A> → <V>Plata Clara</V>, con entrada <Var>Elegir del menú</Var> (el diccionario de la
              opción elegida).
            </li>
          </Pasos>
          <Nota>
            Úsalo con <strong>Siri</strong> («Oye Siri, gasto rápido»), en la pantalla de inicio (Compartir →{" "}
            <em>Agregar a pantalla de inicio</em>), en el <strong>botón de acción</strong> (Configuración → Botón de
            acción → Atajo), en el centro de control o con <strong>toque posterior</strong> (Accesibilidad → Tocar →
            Toque posterior). Dictado: «Gasté 25 mil en almuerzo con Nequi».
          </Nota>
        </Seccion>

        <Seccion
          id="guia-wallet"
          icono={<CreditCardIcon className="size-5" aria-hidden="true" />}
          titulo="3 · Automatización Wallet (pagos con Apple Pay)"
          resumen="Se dispara sola al pagar con el iPhone o el Watch."
        >
          <Pasos>
            <li>
              Atajos → pestaña <A>Automatización</A> → <A>+</A> → <A>Wallet</A> (en iOS 17 a 25 se llama{" "}
              <A>Transacción</A>) → elige tus tarjetas → <A>Ejecutar inmediatamente</A> → <A>Siguiente</A> →{" "}
              <A>Nueva automatización en blanco</A>.
            </li>
            <li>
              <A>Diccionario</A> con estos campos de texto:
              <ul className="mt-1 ml-4 list-disc">
                <li>
                  <V>fuente</V> = <V>wallet</V>
                </li>
                <li>
                  <V>tarjeta</V> = <Var>Entrada del atajo</Var> (tócala y elige <V>Tarjeta</V>)
                </li>
                <li>
                  <V>comercio</V> = <Var>Entrada del atajo</Var> → <V>Comercio</V>
                </li>
                <li>
                  <V>monto</V> = <Var>Entrada del atajo</Var> → <V>Importe</V> (o <V>Monto</V>)
                </li>
                <li>
                  <V>modo</V> = <V>preguntar</V> (o <V>automatico</V>: si ya conoce la tarjeta, registra sin preguntar y
                  lo deja en «Por revisar»)
                </li>
              </ul>
            </li>
            <li>
              <A>Ejecutar atajo</A> → <V>Plata Clara</V> con entrada <Var>Diccionario</Var>.
            </li>
          </Pasos>
          <Nota tono="alerta">
            Con tarjetas que no son Apple Card el importe a veces llega en 0 o la automatización se demora: por eso el
            monto siempre se muestra para confirmar, y si falla, el SMS del banco sirve de respaldo (no se duplica: te
            pregunta «¿Ya lo registraste?»). Con el iPhone bloqueado no puede preguntar; el modo automático sí registra.
          </Nota>
        </Seccion>

        <Seccion
          id="guia-sms"
          icono={<MessageSquareTextIcon className="size-5" aria-hidden="true" />}
          titulo="4 · Automatización SMS del banco (una por banco)"
          resumen="Lee el SMS de compra, pago o transferencia y prellena todo."
        >
          <Pasos>
            <li>
              Crea un contacto para el número desde el que te escribe el banco: abre un SMS del banco, toca el número →{" "}
              <A>Crear contacto</A> → nómbralo, p. ej. <V>Bancolombia SMS</V>.
            </li>
            <li>
              Atajos → <A>Automatización</A> → <A>+</A> → <A>Mensaje</A> → <A>Remitente</A>: ese contacto (deja «El
              mensaje contiene» vacío) → <A>Ejecutar inmediatamente</A> → <A>Nueva automatización en blanco</A>.
            </li>
            <li>
              <A>Diccionario</A>: <V>fuente</V> = <V>sms</V> y <V>texto</V> = <Var>Entrada del atajo</Var> (si te deja
              elegir, <V>Contenido</V>).
            </li>
            <li>
              <A>Ejecutar atajo</A> → <V>Plata Clara</V> con entrada <Var>Diccionario</Var>.
            </li>
          </Pasos>
          <Nota>
            Los SMS que no son movimientos (claves, publicidad, avisos) se ignoran en silencio. Las notificaciones de
            apps como Nequi o Daviplata no son SMS: para esas usa «Gasto rápido». Lo que el atajo no entienda aparece en{" "}
            <em>Actividad reciente</em> (abajo) con el SMS sin saldos.
          </Nota>
        </Seccion>
      </div>

      <Nota tono="alerta">
        El token queda guardado dentro del atajo «Plata Clara». Si compartes ese atajo, compartes el token: bórralo de
        la acción <A>Texto</A> antes de compartir. Si pierdes el iPhone, revoca su token aquí.
      </Nota>
    </Card>
  );
}
