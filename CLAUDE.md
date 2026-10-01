# CLAUDE.md — Plata Clara

Guía para desarrollar este proyecto con asistencia de IA. Leer antes de escribir código.

@AGENTS.md

## Contexto

- App personal (un usuario: Omar) de ingresos, gastos, obligaciones mensuales, tarjetas de crédito y deudas. Colombia, COP, `es-CO`, zona `America/Bogota`.
- La especificación completa está en `docs/01` a `docs/06`. **El doc 03 (tarjetas) es la fuente de verdad de la lógica financiera**; no inventar reglas distintas.
- Idioma: UI, mensajes de error, nombres de tablas/columnas y dominio en **español**; código de infraestructura (hooks, utils genéricos) puede estar en inglés.
- Estado y siguiente paso: `docs/06-plan-de-proyecto.md` (marcar casillas al cerrar tareas).

## Stack (versiones reales)

Next.js 16.3 (App Router, Turbopack por defecto) · React 19.2 · TypeScript 5.9 estricto · Tailwind 4 · componentes estilo shadcn/ui sobre `radix-ui` · react-hook-form + Zod 4 · date-fns 4 + `@date-fns/tz` · Supabase (`@supabase/ssr` 0.12, `@supabase/supabase-js` 2) · Vitest 5 + PGlite · pnpm 10 · Node ≥ 22.

## Particularidades de Next 16 (ver AGENTS.md)

- `middleware.ts` ahora es **`src/proxy.ts`** (exporta `proxy`, runtime Node).
- `params`, `searchParams`, `cookies()` y `headers()` son **asíncronos** (`await`).
- Tipos globales `PageProps<"/ruta">` y `LayoutProps<"/">` generados por `next typegen` (lo corre `pnpm typecheck`).
- `next lint` ya no existe: usar `pnpm lint` (ESLint CLI).

## Reglas de implementación

1. **Lógica financiera pura** en `src/lib/domain/*` sin dependencias de React ni Supabase, con pruebas Vitest al lado (`*.test.ts`). Si existe espejo en SQL (`recalcular_tarjeta`), mantener la prueba de contrato.
2. **Dinero:** BD `numeric(14,2)`; en TS operar en centavos enteros (`lib/domain/dinero.ts`), nunca sumar floats. Mostrar siempre con `formatearCOP()`.
3. **Fechas:** columnas `date` para hechos contables; periodos "YYYY-MM" con `lib/domain/periodos.ts` (zona Bogotá explícita).
4. **Lecturas** desde tablas/vistas en Server Components con `lib/supabase/server.ts`; **escrituras** con Server Actions en `src/actions/*` validadas con Zod; luego `revalidatePath`.
5. **RLS en toda tabla nueva** (política `propietario` + `grant` explícito a `authenticated`, `revoke` a `anon`). `user_id default auth.uid()`. El cliente admin (`lib/supabase/admin.ts`) solo en `/api/cron/*`.
6. **Migraciones** en `supabase/migrations/<timestamp>_<nombre>.sql`, una por cambio, nunca editar una ya aplicada en producción. Cada migración nueva lleva pruebas en `tests/db/` (PGlite con stub de Supabase). Regenerar tipos con `pnpm db:types`.
7. **No doble conteo:** compras TC = gasto de consumo; pagos TC = caja (solo `imputado_otros` es gasto). Préstamos otorgados, aportes y transferencias no son gasto.
8. Meses **cerrados** son de solo lectura (trigger). No saltarse el bloqueo desde la app.
9. Móvil primero (375 px). Estados siempre con ícono/símbolo + texto, no solo color. Tokens de color en `globals.css` (claro/oscuro); no usar hex sueltos en componentes.
10. Todo formulario muestra vista previa del efecto (p. ej. imputación de pago TC) antes de guardar.
11. Componentes nuevos de shadcn: `pnpm dlx shadcn@latest add <componente>` y ajustar a los tokens del proyecto.

## Comandos

```
pnpm dev                 # Next local
pnpm check               # lint + typecheck + test
pnpm build
pnpm db:start            # Supabase local (Docker)
pnpm db:reset            # migraciones + seed
pnpm db:types            # regenerar src/types/database.ts
```

## Orden de trabajo

Seguir `docs/06-plan-de-proyecto.md` fase por fase. Definición de terminado en la sección 4 de ese documento.
