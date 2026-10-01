# 04 · Arquitectura técnica

---

## 1. Visión general

```
┌──────────────────────────── Vercel ────────────────────────────┐
│  Next.js (App Router, TypeScript)                              │
│  ├─ Server Components  → lecturas (vistas SQL)                 │
│  ├─ Server Actions     → escrituras validadas con Zod          │
│  ├─ Route Handlers     → /api/cron/*  /api/export/*            │
│  └─ PWA (manifest + service worker ligero)                     │
│  Vercel Cron: generar-mes (día 1) · diario (vencidos, alertas) │
└───────────────┬────────────────────────────────────────────────┘
                │ @supabase/ssr (cookies, sesión)
┌───────────────▼──────────────── Supabase ──────────────────────┐
│  Auth (email + contraseña / magic link, registro deshabilitado) │
│  Postgres: tablas + RLS + vistas + funciones (plpgsql)          │
│  Storage: bucket privado "comprobantes"                         │
└─────────────────────────────────────────────────────────────────┘
```

**Por qué así:** es la combinación que pediste (Vercel + Supabase), cabe en planes gratuitos para un usuario, y pone la lógica pesada (agregaciones, recalculo de tarjetas) en Postgres, cerca de los datos, con la lógica financiera duplicada en TypeScript puro solo para vistas previas en formularios y pruebas.

## 2. Stack

| Capa | Elección | Motivo |
|---|---|---|
| Framework | **Next.js** (versión estable actual, App Router) + **TypeScript** estricto | Despliegue nativo en Vercel, Server Actions evitan una API aparte. |
| UI | **Tailwind CSS** + **shadcn/ui** (Radix) + **lucide-react** | Componentes accesibles, rápidos de construir, fáciles de personalizar. |
| Gráficas | **SVG propio** (`components/graficas`) | Decidido en F4 en vez de Recharts: sin dependencia, tooltip con teclado, tabla de datos por gráfica y paleta validada para daltonismo (claro y oscuro). |
| Formularios | **react-hook-form** + **Zod** | Mismo esquema valida cliente y servidor. |
| Tablas | **TanStack Table** | Filtros, orden, paginación en Movimientos e Histórico. |
| Fechas | **date-fns** + `date-fns-tz` (locale `es`, zona America/Bogota) | Cortes de tarjeta y periodos exactos. |
| Montos | `Intl.NumberFormat('es-CO', {style:'currency', currency:'COP', maximumFractionDigits:0})`; en BD `numeric(14,2)` | Sin errores de coma flotante en BD; aritmética en TS con enteros (centavos) o `decimal.js`. |
| Notificaciones UI | **sonner** | Toasts. |
| Datos | **Supabase** (Postgres 15+, Auth, Storage) + `@supabase/ssr` + tipos generados (`supabase gen types`) | — |
| Correo (opcional) | **Resend** | Recordatorios de vencimiento. |
| Exportación | `xlsx` (SheetJS) / CSV nativo | Excel y CSV. |
| Pruebas | **Vitest** (dominio) · **Playwright** (e2e de flujos clave) | — |
| Calidad | ESLint, Prettier, Husky + lint-staged, GitHub Actions (lint, typecheck, test) | — |
| Gestor de paquetes | **pnpm** | — |

## 3. Estructura de carpetas propuesta

```
ingresosYgastos/
├─ CLAUDE.md                     # guía para desarrollo asistido
├─ docs/                         # este análisis
├─ supabase/
│  ├─ config.toml
│  ├─ migrations/                # 0001_base.sql, 0002_tarjetas.sql, ...
│  └─ seed.sql                   # categorías y parámetros por defecto
├─ src/
│  ├─ app/
│  │  ├─ (auth)/login/page.tsx
│  │  ├─ (app)/layout.tsx        # shell: sidebar desktop / bottom-nav móvil + FAB "+"
│  │  ├─ (app)/page.tsx          # Inicio (dashboard)
│  │  ├─ (app)/mes/[periodo]/page.tsx
│  │  ├─ (app)/movimientos/page.tsx
│  │  ├─ (app)/tarjetas/page.tsx
│  │  ├─ (app)/tarjetas/[id]/page.tsx
│  │  ├─ (app)/deudas/page.tsx
│  │  ├─ (app)/analisis/page.tsx
│  │  ├─ (app)/presupuesto/page.tsx
│  │  ├─ (app)/salud/page.tsx
│  │  ├─ (app)/historico/page.tsx
│  │  ├─ (app)/configuracion/[seccion]/page.tsx
│  │  └─ api/
│  │     ├─ cron/generar-mes/route.ts
│  │     ├─ cron/diario/route.ts
│  │     └─ export/[formato]/route.ts
│  ├─ actions/                   # server actions por módulo (movimientos.ts, tarjetas.ts, ...)
│  ├─ components/
│  │  ├─ ui/                     # shadcn
│  │  ├─ forms/                  # QuickAdd, PagoTarjetaForm, ExtractoForm, ...
│  │  ├─ charts/
│  │  └─ layout/
│  ├─ lib/
│  │  ├─ domain/                 # ⚠ lógica pura + tests
│  │  │  ├─ tarjetas.ts          # clasificación, imputación, libro mayor, cuotas
│  │  │  ├─ periodos.ts          # generación, estados, arrastre
│  │  │  ├─ deudas.ts            # amortización, simulador avalancha/bola de nieve
│  │  │  ├─ indicadores.ts       # KPIs y score
│  │  │  └─ dinero.ts            # formateo, redondeo, conversión EA→mensual
│  │  ├─ supabase/{server,client,proxy,admin}.ts   # Next 16: proxy.ts reemplaza a middleware.ts
│  │  ├─ validations/            # esquemas Zod compartidos
│  │  └─ utils/
│  └─ types/database.ts          # generado por Supabase CLI
├─ tests/e2e/
├─ public/{manifest.webmanifest, icons/}
├─ vercel.json                   # crons
└─ .env.example
```

## 4. Patrón de datos

| Operación | Mecanismo |
|---|---|
| Lecturas de pantalla | Server Components consultan **vistas** (`v_resumen_periodo`, `v_obligaciones_mes`, `v_estado_tarjetas`, ...) con el cliente de servidor (sesión del usuario → RLS aplica). |
| Escrituras | Server Actions: validan con Zod → insert/update → llaman función SQL si aplica (`recalcular_tarjeta`) → `revalidatePath`. |
| Cálculo de tarjetas | Función `recalcular_tarjeta(p_tarjeta uuid)` (plpgsql, `security invoker`). Espejo en `lib/domain/tarjetas.ts` para vista previa y pruebas; una prueba de contrato compara ambos con el mismo dataset. |
| Generación de mes | Función `generar_periodo(p_user uuid, p_mes date)` idempotente (`on conflict do nothing`). La llama el cron y también el layout si el mes actual no existe. |
| Cierre de mes | Función `cerrar_periodo(p_periodo uuid)` → guarda `snapshot jsonb`, bloquea. |
| Bloqueo de mes cerrado | Trigger `before insert/update/delete` en `movimientos`, `compras_tc`, `pagos_tc` que rechaza si el periodo está cerrado. |
| Estado de obligaciones | Vista que suma pagos ligados; el estado `vencida` se calcula por fecha (no requiere cron), el cron solo dispara alertas. |

## 5. Seguridad

1. **Registro deshabilitado** en Supabase Auth (solo se crea tu usuario desde el panel). Adicionalmente, lista blanca de correo en `src/proxy.ts` (Next 16 renombró middleware → proxy) y en la acción de login.
2. **RLS en todas las tablas**: `using (user_id = auth.uid()) with check (user_id = auth.uid())`. `user_id` con `default auth.uid()`.
3. **Service role key** solo en rutas de cron (servidor), protegidas con `Authorization: Bearer ${CRON_SECRET}`.
4. **Storage** privado con políticas por carpeta `{user_id}/...`; URLs firmadas de corta duración.
5. Opcional: **MFA TOTP** de Supabase Auth.
6. No se guardan números completos de tarjeta ni cuentas: solo últimos 4.
7. Encabezados de seguridad (CSP básica) en `next.config`.

## 6. Tareas programadas (Vercel Cron)

| Ruta | Programación (UTC) | Hora Bogotá | Qué hace |
|---|---|---|---|
| `/api/cron/generar-mes` | `5 5 1 * *` | día 1, 00:05 | Crea el periodo y sus obligaciones. |
| `/api/cron/diario` | `0 12 * * *` | 07:00 | Marca alertas (vence ≤ 3 días, vencidas, extracto no registrado tras el corte), envía correo resumen (opcional) y **mantiene activo** el proyecto Supabase (el plan gratuito pausa proyectos inactivos). |

> En el plan Hobby de Vercel los cron se ejecutan como máximo una vez al día: suficiente para este diseño.

## 7. Entornos

| Entorno | Front | BD |
|---|---|---|
| Local | `pnpm dev` | **Supabase CLI** (`supabase start`, Docker) con `seed.sql` |
| Preview | Vercel Preview por PR | Proyecto Supabase de pruebas (opcional) o el local |
| Producción | Vercel (dominio `*.vercel.app` o subdominio propio, p. ej. `plata.devtopia.co`) | Proyecto Supabase producción |

Variables (`.env.example`):
```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=   # llave publicable sb_publishable_… (reemplaza a la anon key)
SUPABASE_SECRET_KEY=                    # sb_secret_…, solo servidor (cron)
CRON_SECRET=
ALLOWED_EMAILS=oamoreno31@gmail.com     # lista separada por comas
RESEND_API_KEY=                   # opcional
APP_TIMEZONE=America/Bogota
```

## 8. Respaldo y recuperación

- **Semanal (cron diario los domingos):** exporta todas las tablas del usuario a JSON en el bucket `respaldos/` (retención 8 semanas).
- **Manual:** Configuración → Respaldo → Descargar JSON / Excel completo.
- **Restauración:** importador del JSON de respaldo (fase 6).
- Migraciones versionadas en Git: el esquema siempre es reproducible.

## 9. UX / UI

- **Navegación:** sidebar en escritorio; **barra inferior** en móvil (Inicio · Mes · + · Tarjetas · Más).
- **FAB "+"**: hoja inferior con 4 accesos: *Gasto · Ingreso · Pago de obligación · Compra con tarjeta*.
- **Selector de periodo** global (‹ Oct 2026 ›) en la cabecera.
- **Selector de vista** Consumo / Caja en Inicio y Análisis.
- Modo claro/oscuro, `es-CO`, montos sin decimales.
- Estados con color + ícono + texto: pagada ✓ verde · parcial ◐ ámbar · pendiente ○ gris · vencida ! rojo · omitida — tachado.
- Estados vacíos con acción ("Aún no registras tu extracto de Visa → Registrar").

## 10. Rendimiento y límites

- Volumen esperado: < 3.000 movimientos/año → sin necesidad de particionar.
- Índices: `(user_id, fecha)`, `(user_id, periodo_id)`, `(tarjeta_id, fecha)`, `(obligacion_periodo_id)`.
- Vistas simples; si alguna agregación anual se vuelve lenta, vista materializada refrescada al cerrar mes.
