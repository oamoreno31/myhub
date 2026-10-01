# 06 · Plan de proyecto

---

## 1. Estrategia

Desarrollo incremental en **7 fases**. Al terminar la **Fase 2** la app ya es usable en el día a día (MVP): checklist mensual, movimientos y tarjetas de crédito completas. Las fases siguientes agregan análisis y planificación sobre datos reales ya registrados.

Supuesto de dedicación: ~12 h/semana (en paralelo con Devtopia). Ajustable.

## 2. Fases, entregables y estimación

| Fase | Nombre | Entregables | Horas | Acumulado |
|---|---|---|---|---|
| **F0** | Fundaciones | Repo Git, Next.js + TS + Tailwind + shadcn, Supabase local (CLI) y producción, Auth con registro deshabilitado + lista blanca, layout (sidebar/bottom-nav/FAB), CI (lint, typecheck, test), deploy en Vercel, migración base + RLS + seed | 10 | 10 |
| **F1** | Núcleo mensual | Configuración: cuentas, categorías, obligaciones recurrentes (con frecuencias), parámetros. `generar_periodo` + cron día 1. Pantalla **Mes actual** (checklist, semáforo, pagar, pago parcial, omitir, arrastre). **Movimientos** (CRUD, filtros, búsqueda). **Quick-add** "+". Ingresos esperados. **Inicio** básico. **Cierre de mes** con snapshot y bloqueo. Asistente de configuración inicial | 30 | 40 |
| **F2** | Tarjetas de crédito | Tarjetas (CRUD), compras (contado/cuotas/avance/devolución/USD), calendario de cuotas, extractos con cálculo de otros cargos y conciliación, pagos total/mínimo/otro con imputación, `recalcular_tarjeta` + espejo TS + 8 pruebas del doc 03, integración con obligación del mes y con Inicio | 26 | **66 → MVP** |
| **F3** | Deudas y cuentas por cobrar | Préstamos recibidos (amortización, desglose capital/intereses), cooperativas (aporte + crédito), préstamos otorgados (entrega, abonos, alertas), reembolsos Devtopia | 16 | 82 |
| **F4** | Análisis y presupuesto | Análisis (categorías, subcategorías, 12 meses, fijo vs variable, top comercios, mes vs promedio, vistas Consumo/Caja, excluir reembolsables), Presupuesto (plantilla, copia de mes, alertas 80/100 %, propuesta 50/30/20), Histórico (meses cerrados, historial por obligación, patrimonio) | 22 | 104 |
| **F5** | Salud financiera y planificación | Indicadores + score + 3 acciones sugeridas, metas (ahorro, fondo de emergencia, deuda) con aporte sugerido, simulador avalancha vs bola de nieve, proyección "solo mínimo" por tarjeta, calculadora de seguridad social | 16 | 120 |
| **F6** | Complementos y pulido | PWA instalable, recordatorios por correo (Resend) + cron diario, adjuntos (Storage), exportación CSV/Excel, respaldo semanal JSON + restauración, modo oscuro, accesibilidad, e2e Playwright de flujos clave, afinamiento móvil | 18 | **138** |

**Calendario indicativo** (12 h/semana, arrancando la semana del 28-sep-2026):

| Hito | Semana | Fecha aprox. |
|---|---|---|
| F0 lista, app desplegada vacía | 1 | 2-oct-2026 |
| F1 lista — empiezas a registrar octubre | 3–4 | 23-oct-2026 |
| **MVP (F2)** — tarjetas conciliando el primer extracto | 6 | 6-nov-2026 |
| F3 + F4 | 9–10 | 4-dic-2026 |
| F5 + F6 — versión 1.0 | 12 | 18-dic-2026 |
| Primer cierre anual con datos reales | — | ene-2027 |

> Recomendación: empezar a registrar **desde el 1 de octubre** aunque sea en la versión F1, para que el análisis de la F4 ya tenga 2–3 meses de datos.

## 3. Backlog por fase (tareas técnicas)

### F0 — Fundaciones ✅ (25-sep-2026)
- [x] Next.js 16.3 (App Router, TS estricto, Turbopack, `src/`) + Tailwind 4
- [x] Componentes base estilo shadcn/ui escritos en el repo (button, card, input, label, badge, sheet, dropdown-menu, sonner). El resto se agrega por fase con `pnpm dlx shadcn@latest add …`
- [x] Supabase CLI (`supabase/config.toml`: registro deshabilitado, contraseña ≥ 10)
- [x] Migración `20260925000100_base.sql`: enums, `parametros`, `cuentas`, `categorias`, `periodos`, `updated_at`, RLS + permisos explícitos, inicialización automática del usuario (trigger en `auth.users`)
- [x] `seed.sql`: usuario de desarrollo + cuentas de ejemplo (las categorías las crea el trigger)
- [x] `@supabase/ssr`: clientes server/client/proxy/admin; login con contraseña y enlace mágico; lista blanca
- [x] Layout responsive (barra lateral / barra inferior + botón "+"), selector de periodo global, tema claro/oscuro, pantallas reservadas por fase
- [x] Cron diario `/api/cron/diario` (mantiene activo Supabase) + `vercel.json`
- [x] Vitest: 31 pruebas (dominio + migraciones SQL con PGlite, incluida RLS); GitHub Actions (lint, formato, tipos, pruebas, build)
- [ ] **Pendiente de Omar:** crear proyecto Supabase, aplicar migraciones, crear usuario y conectar Vercel (ver `docs/PUESTA-EN-MARCHA.md`)
- [ ] Regenerar tipos con `pnpm db:types` al tener Supabase local corriendo

### F1 — Núcleo mensual ✅ (26-sep-2026)
- [x] Migración `20260926000100_nucleo_mensual.sql`: `obligaciones` (plantillas), `obligaciones_periodo`, `movimientos`, `bitacora`; triggers de periodo automático, validación y **bloqueo de meses cerrados**; vistas `v_obligaciones_mes`, `v_movimientos`, `v_resumen_periodo`, `v_saldos_cuentas`, `v_gasto_categoria_mes` (todas `security_invoker`)
- [x] Funciones `generar_periodo` (idempotente, frecuencias mensual→anual, día 31 → último día, estimado por promedio de 3 pagos), `generar_periodo_todos` (cron), `cerrar_periodo` (decisión por pendiente: pasar al mes siguiente u omitir + snapshot), `reabrir_periodo` (con motivo y bitácora)
- [x] `lib/domain/obligaciones.ts` + pruebas (estados, agrupación, resumen, vista previa de pago, frecuencias) y **prueba de contrato TS ↔ SQL**
- [x] Configuración: obligaciones recurrentes (con vista previa de los próximos meses), cuentas (saldo inicial y archivo), categorías y subcategorías, preferencias
- [x] Mes: grupos vencidas / próximos 7 días / resto / pagadas / cerradas, avance, pagar (total o parcial con vista previa), ajustar monto o fecha, omitir con motivo, restaurar, obligación puntual, ingresos esperados
- [x] Movimientos: lista por día, filtros (mes, tipo, categoría, cuenta, texto, obligación), editar y eliminar con confirmación
- [x] Registro rápido "+": gasto, ingreso, pago de obligación y transferencia; validación Zod compartida y vista previa de saldo
- [x] Inicio v1: KPIs, por pagar, saldos por cuenta, gasto por categoría, últimos movimientos, alertas (vencidas, meses anteriores sin cerrar)
- [x] Cierre de mes: asistente con decisiones y resumen; reapertura
- [x] Cron `/api/cron/generar-mes` (día 1) + respaldo en `/api/cron/diario`; `vercel.json` con ambos
- [x] Asistente inicial `/bienvenida` (cuentas con saldo → pagos del mes → ingreso mensual). Las tarjetas se agregan en F2.
- Cambios frente al diseño: `presupuestos` pasa a F4 (donde se usa); `estado_manual` del doc 05 quedó como `resolucion` (`omitida` | `arrastrada`) + `motivo`; el estado visual (vencida, vence pronto) se calcula en TypeScript.

### F2 — Tarjetas ✅ (26-sep-2026) → **MVP**
- [x] Migración `20260927000100_tarjetas.sql`: `tarjetas_credito` (cada tarjeta es también una cuenta tipo tarjeta), `compras_tc`, `extractos_tc`, `pagos_tc`; vistas `v_estado_tarjetas`, `v_compras_tc`, `v_cuotas_tc`; funciones `recalcular_tarjeta`, `cuotas_de_compra`, `corte_de_compra`, `crear_tarjeta`; triggers de validación, bloqueo de meses cerrados y recálculo automático
- [x] `lib/domain/tarjetas.ts`: cortes, cuotas, clasificación, imputación, libro mayor, simulaciones para vistas previas + pruebas del doc 03 §9 (ejemplo completo, escenarios A/B/C, pago antes del extracto, pagos parciales, inferior al mínimo, saldo a favor, 12 cuotas, diferencia negativa, idempotencia)
- [x] **Prueba de contrato TS ↔ SQL**: 12 escenarios aleatorios reproducibles (compras, avances, devoluciones, ajustes, 6 extractos, pagos) + cuotas en 600 combinaciones; cubre todas las ramas
- [x] Pantallas: `/tarjetas` (deuda, cupo, costo financiero del año, estado del extracto) y `/tarjetas/[id]` (resumen, compras, cuotas, extractos, pagos) con editar/eliminar
- [x] Formularios con vista previa: tarjeta (días para pagar, tasa mensual), compra (primer corte, cuotas, cupo disponible; contado, cuotas, avance, devolución, ajuste, USD con TRM), extracto (conciliación en vivo: otros cargos, capital facturado, mínimo estimado vs banco, alertas) y pago (Total / Mínimo / Otro prellenados, clasificación, imputación, % que se va en costos, saldo de la cuenta)
- [x] Integración: cada pago crea su movimiento de caja (`pago_tc`); cada extracto crea la obligación "Pago <tarjeta>" en el mes de su fecha límite; compras = gasto de consumo por categoría; otros cargos → *Costos financieros TC*; sin doble conteo en `v_resumen_periodo`; avances entran a la cuenta destino
- [x] Mes: "Pagar" en la obligación de tarjeta abre el pago en su tarjeta; etiqueta "Mínimo cubierto" / "Pago total". Movimientos: compras con tarjeta y pagos mezclados (se editan en la tarjeta). Registro rápido: "Compra con tarjeta"
- [x] Alertas en Inicio y en la tarjeta: extracto no registrado, conciliación, pago inferior al mínimo/vencido, utilización > 60 %
- [x] E2E en navegador con el ejemplo del doc 03 (cortes 15-ago y 15-sep): todos los valores coinciden; móvil 375 px sin desbordes; tema oscuro
- Cambios frente al diseño: la obligación del mes toma como **monto esperado el pago mínimo** (no el total): "pagada" = mínimo cubierto y la UI distingue "Pago total"; así el checklist no marca como incumplido un pago del mínimo. Solo se implementa la imputación `cargos_primero` (la `proporcional` queda para cuando haga falta). `v_cuotas_futuras_tc` se llama `v_cuotas_tc` (todas las cuotas; la UI filtra las futuras). El modelo de pagos no tiene campo `extracto_id` editable: se asigna solo al recalcular (extracto vigente a la fecha del pago).

### F3 — Deudas y cuentas por cobrar ✅ (26-sep-2026)
- [x] Migración `20260928000100_deudas.sql`: `deudas` (con desembolso opcional a una cuenta), `pagos_deuda` (desglose capital / intereses / seguros / aporte), `prestamos_otorgados` (+ abonos como movimientos `recuperacion_prestamo`), reembolsos Devtopia (`reembolsado_por_id` en gastos y compras TC + función `registrar_reembolso`); vistas `v_estado_deudas`, `v_prestamos_otorgados`, `v_reembolsos_pendientes`, `v_reembolsos`; `v_resumen_periodo`, `v_gasto_categoria_mes`, `v_movimientos`, `v_obligaciones_mes` y `v_compras_tc` ampliadas (columnas al final)
- [x] Todos los tipos de movimiento habilitados: los que nacen de un módulo (`pago_tc`, `pago_deuda`, `aporte`, `desembolso_deuda`, `prestamo_otorgado`) solo se crean y editan desde él (trigger)
- [x] `lib/domain/deudas.ts`: cuota fija (EA → mensual), proyección/tabla de amortización, saldo tras k cuotas, desglose sugerido, efecto de un abono extra, estado de préstamos otorgados + pruebas
- [x] Pantallas: `/deudas` (Lo que debo · Me deben · Devtopia) y `/deudas/[id]` (resumen, proyección, pagos) con formularios con vista previa: deuda (cuota calculada, "ya la venía pagando" con saldo estimado, fecha fin e intereses por pagar), pago de cuota (desglose sugerido editable, % en costos, saldo después), abono extra (meses e intereses ahorrados), préstamo, abono, castigo y reembolso
- [x] Cooperativa: la cuota incluye el aporte social, que va a la cuenta de aportes (ahorro, no gasto); el crédito es una deuda tipo cooperativa
- [x] Integración: cuota de cada deuda en el checklist del mes (plantilla ligada, desde la próxima cuota); "Pagar" en Mes abre el pago en la deuda; intereses y seguros → gasto *Intereses de préstamos*; desembolso, préstamos, abonos y reembolsos no son ingreso ni gasto; registro rápido "Me pagaron"; Movimientos muestra y enlaza todos los tipos; Inicio con deudas, por cobrar, Devtopia, **patrimonio neto** (doc 02 §3) y alertas (préstamo vencido, reembolso Devtopia > 30 días)
- [x] E2E en navegador (préstamo bancario con desembolso, cuota, abono extra, cooperativa en curso pagada desde Mes, préstamo a Juan con abono, reembolso Devtopia) + regresión F1 y F2; móvil 375 px sin desbordes
- Cambios frente al diseño: `metas` pasa a F5 (donde se usa, como `presupuestos` a F4). En `deudas` el campo `incluye_seguro` se reemplazó por `seguro_mensual` y se agregan `aporte_mensual` + `cuenta_aportes_id` (cooperativas), `saldo_inicial`/`fecha_saldo_inicial` (deudas que ya venías pagando) y `cuenta_desembolso_id`. Una deuda que llega a saldo 0 se archiva sola con su obligación mensual. El estado "vencido" de un préstamo otorgado se calcula en TS; "castigado" deja de sumar como por cobrar.

### F4 — Análisis y presupuesto ✅ (30-sep-2026)
- [x] Migración `20260930000100_analisis.sql`: vistas `v_consumo_mes` (consumo por categoría hoja y mes: gastos + compras TC − devoluciones + otros cargos TC + intereses/seguros de préstamos; cuadra con `v_resumen_periodo.gastos`), `v_caja_mes` (salidas de caja por concepto; cuadra con `salidas_caja`), `v_comercios_mes` (une mayúsculas, espacios y tildes) y `v_patrimonio`; tabla `presupuestos` (mes o plantilla, bloqueo de mes cerrado, solo categorías de gasto) + función `guardar_presupuesto`; `cerrar_periodo` guarda el patrimonio en la foto del mes (versión 2)
- [x] `lib/domain/analisis.ts` + pruebas: ventana de meses, totales por categoría, series apiladas (top 5 + Otras), mes vs promedio de 3 meses, fijo/variable, reparto 50/30/20, estado del presupuesto (80 % atención · 100 % tope · > 100 % excedido), gasto por línea (el padre cubre subcategorías sin línea propia), propuesta 50/30/20
- [x] **Análisis** (`/analisis`): vistas Consumo / Caja, incluir o no reembolsables Devtopia (en la URL), indicadores con variación vs promedio, ranking de categorías, columnas apiladas 12 meses, ingresos vs gasto, tabla mes vs promedio, medidores 50/30/20 y top 10 comercios
- [x] **Presupuesto** (`/presupuesto`): edición por categoría con gastado, restante y medidor con símbolo + texto; copiar mes anterior, aplicar plantilla, proponer 50/30/20 (vista previa antes de usarla); resumen vs ingresos y bolsas antes de guardar; guardar para el mes y/o como plantilla; mes cerrado de solo lectura
- [x] **Histórico** (`/historico`): patrimonio de hoy y su evolución (fotos de cierre), comparativo vs mes anterior y mismo mes del año pasado, tabla mes a mes con enlace al detalle, historial por obligación (HU-14: pagado por mes + tabla con estado)
- [x] Inicio: alertas de presupuesto (≥ 80 % y excedido) y patrimonio desde `v_patrimonio` (misma fórmula que Histórico y el cierre)
- [x] E2E en navegador con 4 meses de datos (3 cerrados) + regresión F1–F3; móvil 375 px sin desbordes; tema oscuro
- Cambios frente al diseño: gráficas en **SVG propio** (sin Recharts: menos peso, tooltips con teclado, tabla de datos en cada gráfica y paleta validada para daltonismo en claro y oscuro). La **dona** por categoría se reemplazó por **barras ordenadas** (se comparan mejor). El presupuesto es **por categoría**; la línea de una categoría padre cubre sus subcategorías sin línea propia, y se compara con el consumo **sin** gastos reembolsables. Gastar exactamente lo presupuestado ("tope", p. ej. el arriendo) no genera alerta. En lugar de `v_gasto_categoria_mes` para análisis se usa `v_consumo_mes` (incluye intereses de préstamos y origen). El patrimonio de cada mes es la foto **al momento del cierre**; los meses cerrados antes de F4 no la tienen.

### F5 — Salud financiera ✅ (30-sep-2026)
- [x] Migración `20261001000100_salud.sql`: `metas` (+ `v_metas` con el avance), función `insumos_salud(periodo)` con las cifras de los indicadores, `parametros.tasa_usura_ea` y `cerrar_periodo` que guarda los insumos en la foto del mes (versión 3)
- [x] `lib/domain/salud.ts` + pruebas: 8 indicadores del doc 02 §4 con umbrales editables, bandas (sano · atención · riesgo), puntaje 0–100 por tramos, score ponderado con lectura (Sólida · Estable · Frágil · Crítica) y las 3 acciones de mayor impacto con cifras concretas
- [x] `lib/domain/simulador.ts` (avalancha, bola de nieve y solo mínimos), `lib/domain/metas.ts` (avance, aporte para la fecha, fecha estimada, objetivo del fondo) y `lib/domain/pila.ts` (IBC, salud, pensión, Fondo de Solidaridad Pensional, ARL) + pruebas
- [x] **Salud financiera** (`/salud`): Resumen (score, acciones, indicadores con fórmula y peso, evolución del score, umbrales y tasa de usura editables), Metas (crear con vista previa, fondo sugerido = 6 meses de gasto esencial, pagar una deuda, archivar), Plan de deudas (tasa y mínimo editables, extra mensual, comparación de los 3 escenarios, gráfica de saldos, orden y mes de salida, aviso de usura) y Seguridad social (calculadora PILA con parámetros guardables y comparación con lo registrado)
- [x] Inicio muestra el score y el primer paso sugerido; Histórico agrega la columna de score de cada mes cerrado
- [x] E2E en navegador (score, acciones, umbrales, metas con fecha atrasada, simulador, PILA) + regresión F1–F4; móvil 375 px sin desbordes; tema oscuro
- Cambios frente al diseño: en lugar de la vista `v_indicadores_mes`, la BD calcula los **insumos** (`insumos_salud`) y TypeScript aplica umbrales y pesos: así cambiar un umbral recalcula también los meses cerrados sin tocar su foto. La tasa de ahorro usa el **consumo personal** (sin gastos reembolsables por Devtopia ni lo registrado en la bolsa de ahorro). "Gastos fijos" se muestra pero no pesa en el score (el doc 02 §4.1 no le asigna peso). El fondo de emergencia usa la plata en cuentas líquidas (sin aportes de cooperativa) sobre el gasto esencial promedio de los 3 meses anteriores. La forma de pago de tarjetas se mide por extracto vencido (total 100 · otro valor 50 · mínimo 0). El avance de una meta es el saldo de su cuenta (o lo pagado de la deuda); los aportes se registran como transferencias. El simulador supone mínimos fijos. La calculadora PILA no trae el salario mínimo precargado: se escribe cada año.

### F6 — Complementos ✅ (30-sep-2026)
- [x] Migración `20261002000100_complementos.sql`: buckets privados `comprobantes` y `respaldos` con políticas por carpeta, `exportar_respaldo` / `restaurar_respaldo` (JSON versión 1), `recordatorios_hoy` para el correo; `v_movimientos` y `v_compras_tc` exponen el comprobante
- [x] PWA: manifest (nombre, colores, accesos directos a Mes y Movimientos), íconos 192/512/maskable y de Apple, service worker que solo guarda el cascarón estático (nunca datos) y página "Estás sin conexión"
- [x] Cron diario: asegura el mes (keep-alive de Supabase), correo de recordatorios con Resend (vencidas y ≤ 3 días; `lib/domain/recordatorios.ts` + pruebas) y respaldo dominical en Storage con retención de 8 semanas; cada paso independiente
- [x] Comprobantes: adjuntar foto o PDF al registrar o editar un gasto o una compra con tarjeta (compresión de fotos en el navegador, ≤ 5 MB), verlos desde Movimientos con URL firmada de 60 s
- [x] Exportación a Excel (movimientos de cuentas y tarjetas, obligaciones y resumen mensual) y CSV (UTF-8 con BOM y `;`) por rango de meses; respaldo JSON descargable, lista de respaldos automáticos y restauración con vista previa y confirmación (Configuración → Datos y respaldo)
- [x] E2E en el repositorio con Playwright (`pnpm e2e`): inicio de sesión, pagar una obligación, compra con tarjeta → extracto → pago total, cerrar y reabrir el mes, exportar y respaldar; más auditoría de accesibilidad con axe (WCAG 2.1 A/AA, sin violaciones graves) en 11 pantallas, escritorio y móvil, tema claro y oscuro
- [x] Rendimiento y accesibilidad: formularios pesados y pestañas secundarias cargados al abrirse, fuentes con `next/font`, tablas desplazables enfocables, gráficas con un control accesible (slider) en vez de elementos interactivos dentro del SVG, `robots.txt`. Lighthouse móvil (mediana de 3): rendimiento ≥ 90 en todas las pantallas, accesibilidad 100, buenas prácticas 100
- Cambios frente al diseño: exportación con `exceljs` (no SheetJS). El respaldo semanal se dispara desde el cron diario los domingos (Vercel Hobby permite un cron diario). Los comprobantes no viajan en el respaldo JSON. La restauración está limitada a ~4 MB por el tamaño máximo de cuerpo de Vercel (respaldos mayores, desde la base de datos). El SEO de Lighthouse es bajo a propósito: la app es privada y no se indexa.

## 4. Definición de terminado (por historia)

1. Cumple criterios de aceptación del doc 01.
2. Validación Zod cliente + servidor; errores en español.
3. RLS verificada (otro usuario no ve datos — prueba con segundo usuario local).
4. Lógica financiera con prueba unitaria.
5. Funciona en móvil (375 px) y escritorio.
6. Sin errores de TypeScript ni ESLint; CI en verde; desplegado en preview.

## 5. Riesgos y mitigación

| Riesgo | Prob. | Impacto | Mitigación |
|---|---|---|---|
| Disciplina de registro (datos incompletos) | Alta | Alto | Quick-add ≤ 10 s, recordatorio diario/semanal, obligaciones precargadas. |
| Diferencias de conciliación TC difíciles de explicar | Media | Medio | Desglose opcional, alertas con acciones, ajuste manual trazable. |
| Pausa del proyecto Supabase gratuito por inactividad | Media | Medio | Cron diario hace una consulta; respaldo semanal. |
| Pérdida de datos | Baja | Alto | Respaldo JSON semanal + exportación manual + migraciones en Git. |
| Crecimiento de alcance | Alta | Medio | MVP cerrado en F2; nuevas ideas al backlog "Futuro". |
| Lógica duplicada TS/SQL divergente | Media | Alto | Prueba de contrato con el mismo dataset. |
| Zona horaria (fechas corridas un día) | Media | Medio | `date` sin hora en BD; conversión explícita America/Bogota en UI y cron. |

## 6. Backlog "Futuro" (después de v1)

- Importar extractos/movimientos desde CSV del banco con mapeo de columnas.
- OCR de facturas de servicios (monto y fecha de vencimiento).
- Open Finance cuando los bancos lo habiliten.
- Modo compartido (pareja/familia) con gastos compartidos.
- Reporte anual para declaración de renta.
- Asistente con IA: "¿en qué puedo recortar este mes?" sobre los datos propios.
- Widgets/atajos del celular para registrar gasto.

## 7. Decisiones que conviene confirmar antes de F1

1. ¿"Luz" y "Energía" son un solo servicio? (por defecto: sí).
2. ¿"Préstamos" en ingresos = lo que te devuelven? (por defecto: sí; los que tú recibes van a Deudas).
3. ¿Mes calendario o mes alineado al pago del sueldo? (por defecto: calendario).
4. ¿Recordatorios por correo? (por defecto: sí, opcional desde Configuración).
5. ¿Subdominio propio (p. ej. `plata.devtopia.co`) o `*.vercel.app`?
