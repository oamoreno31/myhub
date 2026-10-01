import {
  AlertTriangleIcon,
  ArrowRightIcon,
  CreditCardIcon,
  HandCoinsIcon,
  LandmarkIcon,
  LockIcon,
  PiggyBankIcon,
  SparklesIcon,
  WalletIcon,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { EncabezadoPagina } from "@/components/layout/encabezado-pagina";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { asegurarPeriodo, necesitaBienvenida, obtenerCatalogos, obtenerObligacionesMes } from "@/lib/datos";
import { formatearCOP } from "@/lib/domain/dinero";
import {
  agruparObligaciones,
  ESTADOS,
  ESTADOS_INGRESO,
  estadoObligacion,
  etiquetaRelativa,
  hoyISO,
  resumirObligaciones,
} from "@/lib/domain/obligaciones";
import { nombrePeriodo, primerDiaDelPeriodo } from "@/lib/domain/periodos";
import { serverEnv } from "@/lib/env.server";
import { obtenerPeriodoActual, obtenerPeriodoSeleccionado } from "@/lib/periodo-seleccionado";
import { extractoPendiente, UMBRAL_UTILIZACION_ALERTA } from "@/lib/domain/tarjetas";
import { createClient } from "@/lib/supabase/server";
import { obtenerTarjetas } from "@/lib/tarjetas";
import { obtenerDeudas, obtenerPrestamos, obtenerReembolsos } from "@/lib/deudas";
import { estadoPrestamo } from "@/lib/domain/deudas";
import { obtenerCategoriasGasto, obtenerConsumo, obtenerPatrimonio, obtenerPresupuesto } from "@/lib/analisis";
import { estadoPresupuesto, filtrarConsumo, gastoPorLinea } from "@/lib/domain/analisis";
import { accionesSugeridas, calcularIndicadores, calcularScore, LECTURAS } from "@/lib/domain/salud";
import { obtenerCargosTarjetasMes, obtenerInsumos, obtenerMetas, obtenerParametrosSalud } from "@/lib/salud";
import { TONOS_LECTURA } from "@/components/salud/piezas-salud";

import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Inicio" };

const diasEntre = (desde: string, hasta: string) => Math.round((Date.parse(hasta) - Date.parse(desde)) / 86_400_000);

const ENTRADAS: string[] = ["ingreso", "recuperacion_prestamo", "reembolso_devtopia", "desembolso_deuda"];

export default async function InicioPage() {
  const periodo = await obtenerPeriodoSeleccionado();
  const actual = obtenerPeriodoActual();
  const hoy = hoyISO(new Date(), serverEnv().APP_TIMEZONE);
  const fila = await asegurarPeriodo(periodo);
  const supabase = await createClient();

  const [
    bienvenida,
    obligaciones,
    catalogos,
    resumen,
    gastoCat,
    ultimos,
    abiertosAnteriores,
    tarjetas,
    deudas,
    prestamos,
    reembolsos,
    patrimonioVista,
    presupuesto,
    consumoMes,
    categoriasGasto,
    saludMes,
    paramsSalud,
    cargosTC,
    metas,
  ] = await Promise.all([
    necesitaBienvenida(),
    obtenerObligacionesMes(fila.id),
    obtenerCatalogos(),
    supabase.from("v_resumen_periodo").select("*").eq("periodo_id", fila.id).maybeSingle(),
    supabase
      .from("v_gasto_categoria_mes")
      .select("categoria_nombre, padre_nombre, total")
      .eq("periodo_id", fila.id)
      .order("total", { ascending: false })
      .limit(6),
    supabase
      .from("v_movimientos")
      .select(
        "id, fecha, tipo, monto, descripcion, categoria_nombre, obligacion_nombre, cuenta_nombre, cuenta_destino_nombre",
      )
      .eq("periodo_id", fila.id)
      .order("fecha", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(6),
    supabase
      .from("v_resumen_periodo")
      .select("mes, obligaciones_pendientes")
      .eq("estado", "abierto")
      .lt("mes", primerDiaDelPeriodo(actual))
      .order("mes"),
    obtenerTarjetas(),
    obtenerDeudas(),
    obtenerPrestamos(),
    obtenerReembolsos(),
    obtenerPatrimonio(),
    obtenerPresupuesto(fila.id),
    obtenerConsumo(periodo, periodo),
    obtenerCategoriasGasto(),
    obtenerInsumos(fila.id, fila.estado, fila.snapshot),
    obtenerParametrosSalud(),
    obtenerCargosTarjetasMes(fila.id),
    obtenerMetas(),
  ]);

  const r = resumen.data;
  const ingresos = Number(r?.ingresos ?? 0);
  const recuperaciones = Number(r?.recuperaciones ?? 0);
  const gastos = Number(r?.gastos ?? 0);
  const reembolsosMes = Number(r?.reembolsos ?? 0);
  // Los reembolsos de Devtopia compensan gastos reembolsables del balance (no son ingreso).
  const balance = ingresos + recuperaciones + reembolsosMes - gastos;
  const tasaAhorro = ingresos > 0 ? (ingresos - gastos) / ingresos : null;

  const egresos = obligaciones.filter((o) => !o.es_ingreso);
  const res = resumirObligaciones(obligaciones, hoy);
  const grupos = agruparObligaciones(egresos, hoy);
  const urgentes = [...grupos.vencidas, ...grupos.proximas, ...grupos.resto].slice(0, 6);
  const porRecibir = obligaciones.filter((o) => o.es_ingreso && !o.resolucion && o.pendiente > 0);
  const totalPorRecibir = porRecibir.reduce((a, o) => a + o.pendiente, 0);

  const categorias = (gastoCat.data ?? []).map((c) => ({
    nombre: c.padre_nombre ? `${c.categoria_nombre}` : (c.categoria_nombre ?? ""),
    total: Number(c.total ?? 0),
  }));
  const maxCategoria = Math.max(1, ...categorias.map((c) => c.total));
  const saldoTotal = catalogos.cuentas.reduce((a, c) => a + c.saldo, 0);
  const mesesSinCerrar = (abiertosAnteriores.data ?? []).map((m) => m.mes!.slice(0, 7));
  const cerrado = fila.estado === "cerrado";
  const gastosTC = Number(r?.gastos_tc ?? 0);
  const costosTC = Number(r?.costos_financieros_tc ?? 0);

  // Alertas de tarjetas (doc 03 §7): extracto sin registrar, conciliación, pago bajo el mínimo, uso alto.
  const activas = tarjetas.filter((t) => t.activa);
  const alertasTC: { id: string; texto: string; href: string; grave: boolean }[] = [];
  for (const t of activas) {
    const u = t.ultimo_extracto;
    const falta = extractoPendiente(hoy, t.dia_corte, u ? [{ fecha_corte: u.fecha_corte }] : [], t.primera_actividad);
    if (falta)
      alertasTC.push({
        id: `${t.id}-ext`,
        texto: `${t.nombre}: registra el extracto del corte ${falta.slice(8)}/${falta.slice(5, 7)}.`,
        href: `/tarjetas/${t.id}?registrar=extracto`,
        grave: false,
      });
    if (u && u.fecha_limite_pago < hoy && u.pagado < u.pago_minimo - 1000)
      alertasTC.push({
        id: `${t.id}-min`,
        texto: `${t.nombre}: ${u.pagado > 0 ? "el pago quedó por debajo del mínimo" : "no se registró pago"} del extracto que venció el ${u.fecha_limite_pago.slice(8)}/${u.fecha_limite_pago.slice(5, 7)}.`,
        href: `/tarjetas/${t.id}?pagar=1`,
        grave: true,
      });
    if (u?.alerta)
      alertasTC.push({
        id: `${t.id}-conc`,
        texto: `${t.nombre}: el último extracto no cuadra con lo registrado. Revísalo.`,
        href: `/tarjetas/${t.id}?tab=extractos`,
        grave: false,
      });
    if (t.utilizacion > UMBRAL_UTILIZACION_ALERTA)
      alertasTC.push({
        id: `${t.id}-uso`,
        texto: `${t.nombre}: usas el ${Math.round(t.utilizacion * 100)} % del cupo.`,
        href: `/tarjetas/${t.id}`,
        grave: false,
      });
  }

  // Deudas y cuentas por cobrar (F3).
  const deudasActivas = deudas.filter((d) => d.activa && d.saldo_capital > 0);
  const totalPrestamos = deudasActivas.reduce((a, d) => a + d.saldo_capital, 0);
  const porCobrar = prestamos.filter((p) => p.saldo > 0 && !p.castigado_en);
  const totalPorCobrar = porCobrar.reduce((a, p) => a + p.saldo, 0);
  const totalDevtopia = reembolsos.pendientes.reduce((a, p) => a + p.monto, 0);
  // Misma fórmula que Histórico y la foto del cierre (vista v_patrimonio, docs/02 §3).
  const patrimonio = patrimonioVista.patrimonio;
  const alertasDeudas: { id: string; texto: string; href: string; grave: boolean }[] = [];
  for (const p of porCobrar) {
    if (estadoPrestamo(p, hoy) === "vencido")
      alertasDeudas.push({
        id: `pr-${p.id}`,
        texto: `${p.deudor} quedó de pagarte el ${p.fecha_esperada!.slice(8)}/${p.fecha_esperada!.slice(5, 7)}: te debe ${formatearCOP(p.saldo)}.`,
        href: `/deudas?prestamo=${p.id}`,
        grave: false,
      });
  }
  const masAntiguo = reembolsos.pendientes[0]?.fecha;
  if (masAntiguo && diasEntre(masAntiguo, hoy) > 30)
    alertasDeudas.push({
      id: "devtopia",
      texto: `Devtopia te debe ${formatearCOP(totalDevtopia)} (lo más antiguo es de hace ${diasEntre(masAntiguo, hoy)} días).`,
      href: "/deudas?tab=devtopia",
      grave: false,
    });

  // Presupuesto (F4): líneas al 80 % o más del tope, comparadas con el consumo sin reembolsables.
  const nombreCategoria = new Map(categoriasGasto.map((c) => [c.id, c.nombre]));
  const gastoLineas = gastoPorLinea(
    filtrarConsumo(consumoMes, { excluirReembolsables: true }),
    periodo,
    presupuesto.lineas,
  );
  const alertasPresupuesto = cerrado
    ? []
    : presupuesto.lineas
        .map((l) => {
          const gastado = gastoLineas.get(l.categoria_id) ?? 0;
          return { ...l, gastado, ...estadoPresupuesto(gastado, l.monto) };
        })
        .filter((l) => l.estado === "atencion" || l.estado === "excedido")
        .sort((a, b) => b.pct - a.pct);

  // Salud financiera (F5): score del mes y la acción de mayor impacto.
  const indicadoresSalud = saludMes.insumos ? calcularIndicadores(saludMes.insumos, paramsSalud.umbrales) : [];
  const scoreSalud = calcularScore(indicadoresSalud);
  const accionSalud =
    saludMes.insumos && scoreSalud.valor !== null
      ? accionesSugeridas(
          indicadoresSalud,
          saludMes.insumos,
          {
            tarjetas: cargosTC,
            deudas: deudasActivas.map((d) => ({
              id: d.id,
              nombre: d.nombre,
              saldo: d.saldo_capital,
              tasaEA: d.tasa_ea,
            })),
            tieneMetaFondo: metas.some((m) => m.activa && m.tipo === "fondo_emergencia"),
            usuraEA: paramsSalud.usuraEA,
          },
          1,
        )[0]
      : undefined;

  return (
    <div className="flex flex-col gap-6">
      <EncabezadoPagina
        titulo="Inicio"
        descripcion={`Resumen de ${nombrePeriodo(periodo)}${periodo === actual ? " · mes en curso" : ""}`}
      />

      {bienvenida ? (
        <Card className="flex-col items-start gap-3 border-primary bg-accent sm:flex-row sm:items-center">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <SparklesIcon className="size-5" aria-hidden="true" />
          </span>
          <div className="flex flex-1 flex-col">
            <span className="font-bold text-accent-foreground">Configura tu mes en 2 minutos</span>
            <span className="text-sm text-accent-foreground">
              Marca tus cuentas, tus pagos fijos (arriendo, servicios, internet…) y tu ingreso mensual.
            </span>
          </div>
          <Button asChild>
            <Link href="/bienvenida">
              Empezar <ArrowRightIcon />
            </Link>
          </Button>
        </Card>
      ) : null}

      {mesesSinCerrar.length > 0 ||
      res.vencidas > 0 ||
      cerrado ||
      alertasTC.length + alertasDeudas.length + alertasPresupuesto.length > 0 ? (
        <div className="flex flex-col gap-2">
          {cerrado ? (
            <p className="flex items-center gap-2 rounded-xl bg-info-soft px-4 py-3 text-sm font-semibold text-info">
              <LockIcon className="size-4 shrink-0" aria-hidden="true" /> {nombrePeriodo(periodo)} está cerrado (solo
              lectura).
            </p>
          ) : null}
          {res.vencidas > 0 && !cerrado ? (
            <Link
              href={`/mes/${periodo}`}
              className="flex items-center gap-2 rounded-xl bg-destructive-soft px-4 py-3 text-sm font-semibold text-destructive hover:underline"
            >
              <AlertTriangleIcon className="size-4 shrink-0" aria-hidden="true" />
              Tienes {res.vencidas} obligación{res.vencidas > 1 ? "es" : ""} vencida{res.vencidas > 1 ? "s" : ""}.
              <span className="ml-auto">Ver →</span>
            </Link>
          ) : null}
          {alertasTC.map((a) => (
            <Link
              key={a.id}
              href={a.href}
              className={cn(
                "flex items-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold hover:underline",
                a.grave ? "bg-destructive-soft text-destructive" : "bg-warning-soft text-warning",
              )}
            >
              <CreditCardIcon className="size-4 shrink-0" aria-hidden="true" />
              {a.texto}
              <span className="ml-auto">Ver →</span>
            </Link>
          ))}
          {alertasPresupuesto.slice(0, 3).map((a) => (
            <Link
              key={`pp-${a.categoria_id}`}
              href="/presupuesto"
              className={cn(
                "flex items-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold hover:underline",
                a.estado === "excedido" ? "bg-destructive-soft text-destructive" : "bg-warning-soft text-warning",
              )}
            >
              <PiggyBankIcon className="size-4 shrink-0" aria-hidden="true" />
              {a.estado === "excedido"
                ? `${nombreCategoria.get(a.categoria_id) ?? "Categoría"}: te pasaste del presupuesto por ${formatearCOP(a.gastado - a.monto)} (${Math.round(a.pct * 100)} %).`
                : `${nombreCategoria.get(a.categoria_id) ?? "Categoría"}: llevas el ${Math.round(a.pct * 100)} % del presupuesto (${formatearCOP(a.gastado)} de ${formatearCOP(a.monto)}).`}
              <span className="ml-auto">Ver →</span>
            </Link>
          ))}
          {alertasPresupuesto.length > 3 ? (
            <Link
              href="/presupuesto"
              className="flex items-center gap-2 rounded-xl bg-warning-soft px-4 py-3 text-sm font-semibold text-warning hover:underline"
            >
              <PiggyBankIcon className="size-4 shrink-0" aria-hidden="true" />Y {alertasPresupuesto.length - 3}{" "}
              categorías más cerca o por encima del presupuesto.
              <span className="ml-auto">Ver →</span>
            </Link>
          ) : null}
          {alertasDeudas.map((a) => (
            <Link
              key={a.id}
              href={a.href}
              className="flex items-center gap-2 rounded-xl bg-warning-soft px-4 py-3 text-sm font-semibold text-warning hover:underline"
            >
              <HandCoinsIcon className="size-4 shrink-0" aria-hidden="true" />
              {a.texto}
              <span className="ml-auto">Ver →</span>
            </Link>
          ))}
          {mesesSinCerrar.map((m) => (
            <Link
              key={m}
              href={`/mes/${m}`}
              className="flex items-center gap-2 rounded-xl bg-warning-soft px-4 py-3 text-sm font-semibold text-warning hover:underline"
            >
              <LockIcon className="size-4 shrink-0" aria-hidden="true" />
              {nombrePeriodo(m)} sigue abierto. Ciérralo para guardar su foto y pasar pendientes.
              <span className="ml-auto">Cerrar →</span>
            </Link>
          ))}
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Card className="gap-1 p-4 sm:p-5">
          <span className="text-xs font-semibold text-muted-foreground sm:text-sm">Ingresos</span>
          <span className="text-xl font-bold text-success sm:text-2xl">{formatearCOP(ingresos)}</span>
          <span className="text-xs text-muted-foreground">
            {recuperaciones > 0
              ? `+ ${formatearCOP(recuperaciones)} recuperados`
              : totalPorRecibir > 0
                ? `${formatearCOP(totalPorRecibir)} por recibir`
                : "Operativos del mes"}
          </span>
        </Card>
        <Card className="gap-1 p-4 sm:p-5">
          <span className="text-xs font-semibold text-muted-foreground sm:text-sm">Gastos</span>
          <span className="text-xl font-bold sm:text-2xl">{formatearCOP(gastos)}</span>
          <span className="text-xs text-muted-foreground">
            {gastosTC + costosTC > 0
              ? `${formatearCOP(gastosTC + costosTC)} con tarjeta${costosTC > 0 ? " (incl. cargos)" : ""}`
              : Number(r?.gastos_reembolsables ?? 0) > 0
                ? `${formatearCOP(Number(r?.gastos_reembolsables))} reembolsables`
                : "Consumo del mes"}
          </span>
        </Card>
        <Card className="gap-1 p-4 sm:p-5">
          <span className="text-xs font-semibold text-muted-foreground sm:text-sm">Balance</span>
          <span className={cn("text-xl font-bold sm:text-2xl", balance < 0 && "text-destructive")}>
            {formatearCOP(balance, { signo: true })}
          </span>
          <span className="text-xs text-muted-foreground">
            {tasaAhorro !== null ? `Tasa de ahorro ${Math.round(tasaAhorro * 100)} %` : "Sin ingresos aún"}
          </span>
        </Card>
        <Card className="gap-1 border-transparent bg-sidebar p-4 text-white sm:p-5">
          <span className="text-xs font-semibold text-sidebar-muted sm:text-sm">Falta por pagar</span>
          <span className="text-xl font-bold sm:text-2xl">{formatearCOP(res.montoPendiente)}</span>
          <span className="text-xs text-sidebar-foreground">
            {res.pendientes} obligacion{res.pendientes === 1 ? "" : "es"}
            {res.vencidas > 0 ? ` · ${res.vencidas} vencida${res.vencidas > 1 ? "s" : ""}` : ""}
          </span>
        </Card>
      </div>

      {scoreSalud.valor !== null && scoreSalud.lectura ? (
        <Link
          href="/salud"
          className="flex flex-col gap-2 rounded-2xl border bg-card p-4 outline-none hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring sm:flex-row sm:items-center sm:gap-4"
        >
          <span className="flex items-baseline gap-2">
            <span className="text-sm font-semibold text-muted-foreground">Salud financiera</span>
            <span className="text-2xl font-bold tabular-nums">{scoreSalud.valor}</span>
            <span className="text-sm text-muted-foreground">/ 100</span>
            <span className={cn("text-sm font-bold", TONOS_LECTURA[scoreSalud.lectura].texto)}>
              {TONOS_LECTURA[scoreSalud.lectura].simbolo} {LECTURAS[scoreSalud.lectura].etiqueta}
            </span>
          </span>
          <span className="min-w-0 flex-1 text-sm">
            {accionSalud ? (
              <>
                <span className="text-muted-foreground">Primer paso: </span>
                <span className="font-semibold">{accionSalud.titulo}</span>
              </>
            ) : (
              <span className="text-success">✓ Todos los indicadores en zona sana.</span>
            )}
          </span>
          <span className="text-sm font-semibold whitespace-nowrap text-primary">Ver detalle →</span>
        </Link>
      ) : null}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>Por pagar</CardTitle>
            <Button asChild variant="link" className="h-auto px-0">
              <Link href={`/mes/${periodo}`}>Ver mes completo →</Link>
            </Button>
          </CardHeader>
          {urgentes.length === 0 ? (
            <p className="rounded-xl bg-success-soft px-4 py-4 text-sm font-semibold text-success">
              {egresos.length === 0 ? "Aún no hay obligaciones configuradas." : "✓ Todo pagado este mes."}
            </p>
          ) : (
            <ul>
              {urgentes.map((o) => {
                const e = ESTADOS[estadoObligacion(o, hoy)];
                return (
                  <li key={o.id} className="flex items-center gap-3 border-t py-3">
                    <div className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate font-bold">{o.nombre}</span>
                      <span className="text-xs text-muted-foreground">
                        Vence {etiquetaRelativa(o.fecha_vencimiento, hoy)}
                      </span>
                    </div>
                    <span className="font-bold whitespace-nowrap">{formatearCOP(o.pendiente || o.monto_esperado)}</span>
                    <Badge variant={e.variante} className="hidden sm:inline-flex">
                      {e.simbolo} {e.etiqueta}
                    </Badge>
                  </li>
                );
              })}
            </ul>
          )}
          {porRecibir.length > 0 ? (
            <div className="flex flex-col gap-1 rounded-xl bg-muted/60 px-4 py-3 text-sm">
              {porRecibir.map((o) => (
                <div key={o.id} className="flex justify-between gap-2">
                  <span>
                    {o.nombre} · {ESTADOS_INGRESO[estadoObligacion(o, hoy)] ?? ""}
                  </span>
                  <strong className="text-success">{formatearCOP(o.pendiente)}</strong>
                </div>
              ))}
            </div>
          ) : null}
        </Card>

        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>Tus cuentas</CardTitle>
            <WalletIcon className="size-5 text-muted-foreground" aria-hidden="true" />
          </CardHeader>
          <span className="text-2xl font-bold">{formatearCOP(saldoTotal)}</span>
          <ul className="flex flex-col">
            {catalogos.cuentas.map((c) => (
              <li key={c.id} className="flex justify-between border-t py-2 text-sm">
                <span>{c.nombre}</span>
                <strong className={cn(c.saldo < 0 && "text-destructive")}>{formatearCOP(c.saldo)}</strong>
              </li>
            ))}
          </ul>
          {activas.length > 0 ? (
            <div className="flex flex-col border-t pt-3">
              <span className="flex items-center justify-between pb-1 text-xs font-extrabold tracking-wider text-muted-foreground uppercase">
                Tarjetas de crédito
                <CreditCardIcon className="size-4" aria-hidden="true" />
              </span>
              <ul className="flex flex-col">
                {activas.map((t) => (
                  <li key={t.id} className="flex justify-between gap-2 py-1.5 text-sm">
                    <Link href={`/tarjetas/${t.id}`} className="min-w-0 truncate hover:underline">
                      {t.nombre}
                    </Link>
                    <span className="flex items-baseline gap-2 whitespace-nowrap">
                      <span
                        className={cn(
                          "text-xs",
                          t.utilizacion > UMBRAL_UTILIZACION_ALERTA
                            ? "font-bold text-destructive"
                            : "text-muted-foreground",
                        )}
                      >
                        {Math.round(t.utilizacion * 100)} %
                      </span>
                      <strong>{formatearCOP(-Math.max(t.deuda_total, 0))}</strong>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {deudasActivas.length + porCobrar.length > 0 || totalDevtopia > 0 ? (
            <div className="flex flex-col border-t pt-3">
              <span className="flex items-center justify-between pb-1 text-xs font-extrabold tracking-wider text-muted-foreground uppercase">
                Deudas y por cobrar
                <LandmarkIcon className="size-4" aria-hidden="true" />
              </span>
              <ul className="flex flex-col text-sm">
                {totalPrestamos > 0 ? (
                  <li className="flex justify-between py-1.5">
                    <Link href="/deudas" className="hover:underline">
                      Préstamos ({deudasActivas.length})
                    </Link>
                    <strong>{formatearCOP(-totalPrestamos)}</strong>
                  </li>
                ) : null}
                {totalPorCobrar > 0 ? (
                  <li className="flex justify-between py-1.5">
                    <Link href="/deudas?tab=me-deben" className="hover:underline">
                      Te deben ({porCobrar.length})
                    </Link>
                    <strong className="text-success">{formatearCOP(totalPorCobrar)}</strong>
                  </li>
                ) : null}
                {totalDevtopia > 0 ? (
                  <li className="flex justify-between py-1.5">
                    <Link href="/deudas?tab=devtopia" className="hover:underline">
                      Devtopia te debe
                    </Link>
                    <strong className="text-success">{formatearCOP(totalDevtopia)}</strong>
                  </li>
                ) : null}
              </ul>
            </div>
          ) : null}
          <div className="flex justify-between border-t pt-3 text-sm">
            <span className="font-semibold">Patrimonio neto</span>
            <strong className={cn(patrimonio < 0 && "text-destructive")}>{formatearCOP(patrimonio)}</strong>
          </div>
          <div className="mt-auto flex flex-wrap gap-x-4">
            <Button asChild variant="link" className="self-start px-0">
              <Link href="/configuracion?seccion=cuentas">Ajustar saldos →</Link>
            </Button>
            <Button asChild variant="link" className="self-start px-0">
              <Link href="/deudas">Deudas →</Link>
            </Button>
            <Button asChild variant="link" className="self-start px-0">
              <Link href="/tarjetas">Tarjetas →</Link>
            </Button>
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>¿En qué se va la plata?</CardTitle>
            <Button asChild variant="link" className="h-auto px-0">
              <Link href="/analisis">Ver análisis →</Link>
            </Button>
          </CardHeader>
          {categorias.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Cuando registres gastos verás aquí tus categorías principales.
            </p>
          ) : (
            <ul className="flex flex-col gap-3">
              {categorias.map((c) => (
                <li key={c.nombre} className="grid grid-cols-[minmax(0,9rem)_1fr_auto] items-center gap-3 text-sm">
                  <span className="truncate font-semibold">{c.nombre}</span>
                  <span className="h-3 overflow-hidden rounded-full bg-secondary" aria-hidden="true">
                    <span
                      className="block h-full rounded-full bg-chart-1"
                      style={{ width: `${Math.max(4, Math.round((c.total / maxCategoria) * 100))}%` }}
                    />
                  </span>
                  <strong className="whitespace-nowrap">{formatearCOP(c.total)}</strong>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>Últimos movimientos</CardTitle>
            <Button asChild variant="link" className="h-auto px-0">
              <Link href="/movimientos">Ver todos →</Link>
            </Button>
          </CardHeader>
          {(ultimos.data ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">Sin movimientos este mes.</p>
          ) : (
            <ul>
              {(ultimos.data ?? []).map((m) => (
                <li key={m.id} className="flex items-center gap-3 border-t py-2.5 text-sm">
                  <span className="w-12 shrink-0 text-xs text-muted-foreground">
                    {m.fecha!.slice(8)}/{m.fecha!.slice(5, 7)}
                  </span>
                  <span className="min-w-0 flex-1 truncate">
                    {m.descripcion ??
                      m.obligacion_nombre ??
                      m.categoria_nombre ??
                      `${m.cuenta_nombre} → ${m.cuenta_destino_nombre}`}
                  </span>
                  <strong className={cn("whitespace-nowrap", ENTRADAS.includes(m.tipo!) && "text-success")}>
                    {ENTRADAS.includes(m.tipo!) ? "+ " : m.tipo === "gasto" ? "− " : ""}
                    {formatearCOP(Number(m.monto))}
                  </strong>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
