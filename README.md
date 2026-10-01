# Plata Clara — Ingresos y gastos personales

Updated

App web personal para registrar ingresos y gastos **mes a mes**: checklist de lo que falta por pagar, histórico de pagos, manejo especial de **tarjetas de crédito** (capital vs otros cargos), deudas, análisis de gasto y salud financiera.

**Stack:** Next.js 16 (App Router, Turbopack) + TypeScript + Tailwind 4 · Supabase (Postgres, Auth, Storage) · Vercel.

**Estado:** ✅ F0 (fundaciones) · ✅ F1 (núcleo mensual) · ✅ F2 (tarjetas de crédito → **MVP usable**) · ✅ F3 (deudas, préstamos y reembolsos Devtopia) · ✅ F4 (análisis, presupuesto e histórico) · ✅ F5 (salud financiera: score, metas, plan de deudas, PILA) · ✅ F6 (PWA, correo de recordatorios, comprobantes, exportación, respaldo/restauración, e2e) → **versión 1.0**.
Para arrancar: [docs/PUESTA-EN-MARCHA.md](docs/PUESTA-EN-MARCHA.md).

## Comandos

| Comando                     | Qué hace                                                   |
| --------------------------- | ---------------------------------------------------------- |
| `pnpm dev`                  | App local en <http://localhost:3000>                       |
| `pnpm check`                | Lint + tipos + pruebas                                     |
| `pnpm test`                 | Pruebas (dominio + migraciones SQL con PGlite, sin Docker) |
| `pnpm e2e` / `e2e:ui`       | Pruebas de extremo a extremo (Playwright) + accesibilidad  |
| `pnpm build`                | Build de producción                                        |
| `pnpm format`               | Formatea con Prettier                                      |
| `pnpm db:start` / `db:stop` | Supabase local (Docker)                                    |
| `pnpm db:reset`             | Reaplica migraciones + `seed.sql` en local                 |
| `pnpm db:types`             | Regenera `src/types/database.ts` desde la BD local         |
| `pnpm db:push`              | Aplica migraciones al proyecto Supabase vinculado          |

## Estructura

```
src/
├─ app/
│  ├─ (auth)/login/          # entrada: contraseña o enlace mágico
│  ├─ (app)/                 # app protegida: layout con barra lateral / inferior
│  ├─ auth/confirm/          # destino del enlace mágico
│  ├─ api/cron/              # generar-mes (día 1) y diario (Vercel Cron: correo + respaldo dominical)
│  ├─ api/export/ api/respaldo/ api/comprobante/   # Excel/CSV, respaldo JSON, comprobantes firmados
│  ├─ manifest.ts robots.ts offline/               # PWA e indexación
├─ actions/                  # server actions: auth, periodo, mes, movimientos, configuracion, bienvenida, tarjetas, deudas, presupuesto, salud
├─ components/
│  ├─ ui/                    # primitivas estilo shadcn (button, sheet, select, campo…)
│  ├─ formularios/           # movimiento, monto, hoja de formulario
│  ├─ mes/ movimientos/ configuracion/ bienvenida/ layout/
│  ├─ tarjetas/              # lista, detalle (5 pestañas) y formularios con vista previa
│  ├─ deudas/                # lo que debo · me deben · Devtopia, detalle de deuda y formularios
│  ├─ graficas/              # columnas apiladas y líneas en SVG (tooltip, teclado, tabla de datos)
│  ├─ analisis/ presupuesto/ historico/
│  ├─ salud/                 # score, acciones, metas, plan de deudas y seguridad social
│  ├─ pwa/                   # registro del service worker (public/sw.js)
├─ hooks/use-accion.ts       # useActionState + toasts + cierre de hojas
├─ lib/
│  ├─ domain/                # lógica pura + pruebas (dinero, periodos, obligaciones, tarjetas, deudas, analisis, salud, simulador, metas, pila)
│  ├─ validaciones.ts        # esquemas Zod de todos los formularios
│  ├─ datos.ts               # lecturas compartidas (catálogos, mes, obligaciones)
│  ├─ tarjetas.ts            # lecturas de tarjetas (estado, libro, cuotas)
│  ├─ deudas.ts              # lecturas de deudas, préstamos otorgados y reembolsos
│  ├─ analisis.ts            # lecturas de consumo, caja, comercios, patrimonio y presupuesto
│  ├─ salud.ts               # insumos de indicadores, metas, deudas para el plan y parámetros
│  ├─ supabase/              # clientes server / client / proxy / admin
│  └─ auth/                  # lista blanca y redirecciones seguras
├─ proxy.ts                  # protección de rutas (Next 16: antes "middleware")
└─ types/database.ts
supabase/
├─ migrations/               # esquema versionado
└─ seed.sql                  # solo desarrollo local
tests/db/                    # pruebas de migraciones, RLS, triggers, cierre de mes y contrato TS↔SQL
tests/e2e/                   # Playwright: flujos clave y accesibilidad (axe)
docs/                        # análisis y plan (01–06) + puesta en marcha
```

## Documentación

| #   | Documento                                                       |
| --- | --------------------------------------------------------------- |
| 01  | [Análisis funcional](docs/01-analisis-funcional.md)             |
| 02  | [Marco teórico financiero](docs/02-marco-teorico-financiero.md) |
| 03  | [Tarjetas de crédito](docs/03-tarjetas-de-credito.md)           |
| 04  | [Arquitectura técnica](docs/04-arquitectura-tecnica.md)         |
| 05  | [Modelo de datos](docs/05-modelo-de-datos.md)                   |
| 06  | [Plan de proyecto](docs/06-plan-de-proyecto.md)                 |
| —   | [Puesta en marcha](docs/PUESTA-EN-MARCHA.md)                    |

Guía para desarrollo asistido: [CLAUDE.md](CLAUDE.md).
