# 01 · Análisis funcional — Plata Clara

> Nombre de trabajo del proyecto: **Plata Clara** — control personal de ingresos, gastos, obligaciones y deudas, mes a mes.
> Versión del análisis: 1.0 · 25-sep-2026 · Autor: Omar (con Claude)

---

## 1. Objetivo

Tener en un solo lugar, y mes a mes:

1. **Qué entra** (sueldos, recuperación de préstamos, otros ingresos).
2. **Qué hay que pagar** este mes y **qué falta por pagar** (checklist con vencimientos).
3. **Qué se pagó**, cuándo, con qué medio y con qué soporte (histórico).
4. **Cuánto se debe** en tarjetas de crédito (solo capital) y **cuánto se ha ido en "otros cargos"** (intereses, cuota de manejo, seguros).
5. **En qué se gasta más** y **cómo mejorar la salud financiera** (indicadores, presupuesto, metas, plan de salida de deudas).

## 2. Alcance

### Dentro del alcance (v1)
- Usuario único (Omar), con arquitectura lista para multiusuario (RLS por `user_id`).
- Moneda principal **COP**; compras en USD en tarjeta con TRM opcional.
- Registro manual rápido (móvil primero) — sin integración bancaria.
- Ciclo mensual: apertura automática del mes, checklist de obligaciones, cierre de mes con foto (snapshot) de indicadores.
- Tarjetas de crédito con manejo especial (ver `03-tarjetas-de-credito.md`).
- Préstamos recibidos, préstamos otorgados a terceros y cooperativas.
- Gastos de Devtopia pagados con dinero personal, marcados como **reembolsables**.
- Análisis, presupuestos, indicadores de salud financiera, metas y simulador de deudas.
- Exportación CSV/Excel y respaldo.

### Fuera del alcance (v1) — candidatos a futuro
- Conexión automática con bancos (Open Finance Colombia aún en despliegue).
- Lectura automática (OCR) de extractos/facturas.
- Declaración de renta (sí se deja la data lista para exportar: ingresos, aportes, intereses).
- Inversiones con valorización de mercado (CDT/acciones) — solo se registran como aportes/ahorro.

## 3. Actores

| Actor | Descripción |
|---|---|
| **Omar (dueño)** | Único usuario autenticado. Registra, consulta, cierra meses. |
| **Sistema (cron)** | Genera el mes nuevo, marca vencidos, envía recordatorios, mantiene activo el proyecto Supabase. |

## 4. Mapa de módulos

```
Plata Clara
├── Inicio (Dashboard del mes)
├── Mes actual (Checklist de obligaciones + pagos)
├── Movimientos (ingresos y gastos, filtros, búsqueda)
├── Tarjetas de crédito
│   ├── Resumen por tarjeta (cupo, deuda capital, utilización)
│   ├── Compras (contado / cuotas / avances / devoluciones)
│   ├── Extractos (corte: pago total y mínimo del banco)
│   └── Pagos (total / mínimo / otro valor) + conciliación "otros cargos"
├── Deudas y préstamos
│   ├── Préstamos recibidos (bancos, libranza, cooperativa)
│   ├── Préstamos otorgados (cuentas por cobrar)
│   └── Cooperativas (aportes + créditos)
├── Análisis (en qué gasto, tendencias, fijo vs variable)
├── Presupuesto (por categoría, alertas 80/100 %)
├── Salud financiera (score, indicadores, metas, simulador bola de nieve / avalancha)
├── Histórico (meses cerrados, historial por obligación)
└── Configuración (categorías, obligaciones recurrentes, cuentas, tarjetas, parámetros, respaldo)
```

## 5. Catálogo de ingresos y gastos

### 5.1 Ingresos

| Grupo | Categoría | Notas de negocio |
|---|---|---|
| Laborales | Sueldo / Honorarios Devtopia | Recurrente mensual; puede ser quincenal. Se crea como *ingreso esperado* del mes. |
| Laborales | Otros laborales (bonos, primas) | Eventual. |
| Recuperación | Abono de préstamo otorgado | **No es ingreso "real"**: reduce una cuenta por cobrar. Se muestra aparte para no inflar el ingreso operativo. |
| Otros | Freelance / proyectos | Eventual. |
| Otros | Rendimientos, ventas, devoluciones, regalos | Eventual, con descripción obligatoria. |

> **Supuesto tomado:** "Préstamos a otras personas" en ingresos se interpreta como **dinero que te devuelven** de préstamos que tú hiciste. El préstamo que *entregas* se registra como salida hacia una *cuenta por cobrar* (no es gasto). Si además recibes préstamos de otros, eso vive en **Deudas → Préstamos recibidos**.

### 5.2 Gastos

| Grupo | Categoría | Tipo | Periodicidad típica | Regla especial |
|---|---|---|---|---|
| Vivienda | Arriendo | Fijo | Mensual | Obligación con día de pago. |
| Servicios públicos | Energía / Luz | Variable | Mensual | Monto estimado = promedio últimos 3 meses. |
| Servicios públicos | Agua | Variable | **Bimestral** (común en Bogotá) | La plantilla soporta frecuencia bimestral. |
| Servicios públicos | Gas | Variable | Mensual | — |
| Telecomunicaciones | Internet | Fijo | Mensual | — |
| Telecomunicaciones | Plan de celular | Fijo | Mensual | — |
| Financiero | Tarjetas de crédito | Especial | Mensual por corte | Ver documento 03. El pago **no** es gasto de consumo (evita doble conteo); solo los "otros cargos" son gasto financiero. |
| Financiero | Cooperativas | Mixto | Mensual | Se divide en **aporte** (ahorro, es tuyo) y **cuota de crédito** (capital + intereses). |
| Financiero | Préstamos | Deuda | Mensual | Cuota = capital (reduce deuda) + intereses (gasto financiero). |
| Empresa | Devtopia – otros gastos | Variable | Eventual | Bandera **reembolsable** → genera cuenta por cobrar a Devtopia hasta que se marque reembolsado. |
| Seguridad social | Salud / Pensión / ARL (PILA) | Fijo/variable | Mensual | Calculadora opcional con parámetros configurables (IBC, %). |
| Otros | Otros gastos | Variable | Eventual | **Descripción obligatoria** + subcategoría libre (ej.: mercado, transporte, salud, ocio, educación, mascotas, regalos). |

> **Punto a validar:** en tu lista aparecen **"Luz"** y **"Energía"**. En Colombia suelen ser el mismo servicio (p. ej. Enel). Se deja por defecto **una sola categoría "Energía (luz)"**; si pagas dos (otro inmueble, oficina), se crean dos *obligaciones* distintas bajo la misma categoría.

### 5.3 Subcategorías sugeridas para "Otros gastos" (sembradas por defecto, editables)
Mercado · Restaurantes y domicilios · Transporte / gasolina / parqueadero · Salud y droguería · Educación · Ocio y suscripciones (streaming, apps) · Ropa · Hogar · Mascotas · Regalos · Viajes · Impuestos y trámites · Imprevistos.

Estas subcategorías son las que más valor dan al módulo de Análisis ("¿en qué se me va la plata?").

## 6. Conceptos clave del modelo funcional

| Concepto | Qué es | Ejemplo |
|---|---|---|
| **Periodo (mes)** | Unidad de trabajo. Estado *abierto* o *cerrado*. | 2026-10 |
| **Obligación recurrente (plantilla)** | Algo que se paga periódicamente. Define monto estimado, día de vencimiento y frecuencia. | Arriendo, $1.800.000, día 5, mensual |
| **Obligación del mes (instancia)** | Copia de la plantilla para un periodo. Tiene estado: *pendiente, parcial, pagada, vencida, omitida*. | Arriendo oct-2026 — pendiente — vence 5-oct |
| **Movimiento** | Entrada o salida real de dinero de una cuenta. Puede estar ligado a una obligación del mes. | Pago arriendo $1.800.000 desde Bancolombia |
| **Cuenta / medio de pago** | Dónde está o por dónde sale la plata. | Ahorros Bancolombia, Nequi, Efectivo, TC Visa |
| **Compra con tarjeta** | Consumo que **aumenta la deuda de capital** de la tarjeta; no mueve caja. | Mercado $320.000 en Visa, 1 cuota |
| **Extracto (corte)** | Lo que el banco dice que debes a la fecha de corte: *pago total* y *pago mínimo*. | Corte 15-oct: total $2.140.000, mínimo $410.000 |
| **Pago de tarjeta** | Salida de caja que se imputa primero a *otros cargos* y luego a *capital*. | $1.000.000 — "otro valor" |
| **Cuenta por cobrar** | Plata que te deben (préstamos otorgados, reembolsos Devtopia). | Préstamo a Juan $500.000 |

## 7. Flujos principales

### F1. Inicio de mes (automático)
1. El día 1 (cron) o en la primera visita del mes, el sistema crea el periodo.
2. Genera las **obligaciones del mes** a partir de las plantillas activas (respetando frecuencia bimestral/trimestral/anual).
3. Crea las obligaciones de tarjeta con base en su día de pago (monto se completa al registrar el extracto).
4. Crea las cuotas de préstamos y cooperativas.
5. Crea los **ingresos esperados** (sueldo).
6. Obligaciones no pagadas del mes anterior se muestran como **arrastradas** (con bandera y enlace al mes de origen).

### F2. Registrar un pago de obligación (≤ 10 segundos en móvil)
1. En *Mes actual* toco la obligación → "Pagar".
2. Se precarga monto esperado, cuenta por defecto y fecha de hoy.
3. Ajusto monto real (si es variable), adjunto comprobante (opcional) y guardo.
4. La obligación cambia a *pagada* (o *parcial* si el monto es menor); el dashboard se recalcula.

### F3. Registrar un gasto no planeado
Botón flotante **"+"** → Gasto → categoría → monto → medio de pago (si es tarjeta de crédito, se convierte en **compra con tarjeta** y pide número de cuotas) → guardar.

### F4. Registrar ingreso
"+" → Ingreso → tipo → monto → cuenta destino. Si coincide con un ingreso esperado, lo concilia.

### F5. Tarjeta de crédito (resumen — detalle en doc 03)
Compra → suma capital · Extracto → registra pago total/mínimo del banco → el sistema calcula "otros cargos" = total banco − capital del sistema · Pago → se clasifica total / mínimo / otro / inferior al mínimo, se imputa a otros cargos y capital.

### F6. Préstamo otorgado
Registrar préstamo (deudor, monto, fecha esperada) → sale de una cuenta, **no es gasto** → abonos del deudor entran como "Recuperación" → saldo por cobrar baja → alerta si pasa la fecha esperada.

### F7. Gasto Devtopia reembolsable
Gasto con bandera *reembolsable* → aparece en "Por cobrar a Devtopia" → al recibir el reembolso se marca y se liga al ingreso. En Análisis se puede **excluir** para ver el gasto personal real.

### F8. Cierre de mes
1. Muestra pendientes: obligaciones sin pagar, extractos sin registrar, ingresos esperados sin recibir.
2. Opciones por pendiente: *arrastrar al siguiente mes*, *marcar omitida* (con motivo) o *registrar pago*.
3. Guarda **snapshot** de indicadores (ingresos, gastos, ahorro, deuda TC, score).
4. El mes queda **cerrado** (solo lectura). Se puede reabrir con registro en bitácora.

## 8. Historias de usuario (backlog funcional)

Prioridad: **M** = MVP · **S** = siguiente · **C** = complemento de valor.

| ID | Como Omar quiero… | Para… | Prio | Criterios de aceptación clave |
|---|---|---|---|---|
| HU-01 | Iniciar sesión solo yo | Proteger mis datos | M | Registro público deshabilitado; solo mi correo; sesión persistente en el móvil. |
| HU-02 | Configurar mis cuentas y medios de pago | Saber de dónde sale la plata | M | Tipos: ahorros, corriente, efectivo, billetera, tarjeta de crédito, cooperativa. |
| HU-03 | Definir obligaciones recurrentes | No olvidar pagos | M | Monto estimado, variable sí/no, día de vencimiento, frecuencia, cuenta por defecto, referencia de pago. |
| HU-04 | Que cada mes se generen solas las obligaciones | Tener el checklist listo | M | Idempotente (no duplica), respeta frecuencia, arrastra pendientes. |
| HU-05 | Ver qué falta por pagar y qué vence pronto | Priorizar | M | Orden por fecha; semáforo: vencida (rojo), vence ≤ 3 días (ámbar), al día (verde). Total pendiente visible. |
| HU-06 | Registrar pago de una obligación en pocos toques | Rapidez | M | Precarga; soporta pago parcial; adjunto opcional. |
| HU-07 | Registrar gastos y "otros gastos" con descripción | Saber en qué gasto | M | Descripción obligatoria en "Otros". Subcategoría. |
| HU-08 | Registrar ingresos (sueldo, recuperación, otros) | Conocer mi flujo | M | Recuperación de préstamos separada del ingreso operativo. |
| HU-09 | Registrar compras con tarjeta (contado o cuotas) | Llevar la deuda de capital | M | Suma a capital; genera calendario de cuotas; cuenta como gasto de la categoría en el mes de compra. |
| HU-10 | Registrar el extracto de la tarjeta | Comparar con lo que llevo | M | Pago total, mínimo, fechas; cálculo automático de "otros cargos" y alerta de conciliación. |
| HU-11 | Registrar pago de tarjeta indicando total / mínimo / otro | Controlar cómo pago | M | Clasificación sugerida y validada; imputación otros cargos → capital; muestra cuánto se fue en cargos. |
| HU-12 | Ver dashboard del mes | Estado de un vistazo | M | Ingresos, gastos, balance, % obligaciones pagadas, deuda TC, alertas. |
| HU-13 | Cerrar el mes | Tener histórico confiable | M | Validaciones de pendientes, snapshot, solo lectura. |
| HU-14 | Consultar histórico por obligación | Ver evolución (p. ej. luz) | S | Gráfica 12 meses + tabla de pagos. |
| HU-15 | Gestionar préstamos recibidos | Saber cuánto debo | S | Saldo capital, cuotas, intereses pagados, fecha estimada de fin. |
| HU-16 | Gestionar préstamos otorgados | Cobrar a tiempo | S | Saldo por cobrar, abonos, alertas de vencimiento. |
| HU-17 | Cooperativa: aportes vs crédito | No confundir ahorro con gasto | S | Aportes suman a patrimonio; cuota de crédito se desglosa. |
| HU-18 | Gastos Devtopia reembolsables | Recuperar lo que pongo | S | Lista por cobrar; marcar reembolsado; excluir del análisis personal. |
| HU-19 | Análisis por categoría y tendencias | Saber en qué gasto más | S | Torta/barras por categoría, top 10 comercios, 12 meses, fijo vs variable, mes vs promedio. |
| HU-20 | Presupuesto mensual por categoría | Controlar | S | Alertas al 80 % y 100 %; copiar presupuesto del mes anterior. |
| HU-21 | Score e indicadores de salud financiera | Mejorar hábitos | S | Tasa de ahorro, carga de deuda, utilización TC, fondo de emergencia, costo financiero. |
| HU-22 | Metas (ahorro, fondo de emergencia, pagar deuda) | Planificar | C | Progreso, aporte mensual sugerido, fecha estimada. |
| HU-23 | Simulador bola de nieve vs avalancha | Salir de deudas más rápido | C | Compara meses e intereses totales entre métodos. |
| HU-24 | Recordatorios de vencimiento | No pagar tarde | C | Correo diario con lo que vence en ≤ 3 días (opcional). |
| HU-25 | Exportar CSV/Excel y respaldo | No perder datos | C | Exportación por rango; respaldo completo JSON. |
| HU-26 | App instalable en el celular (PWA) | Registrar desde cualquier lado | C | Ícono, pantalla completa, carga rápida. |
| HU-27 | Adjuntar comprobantes | Soportes | C | Imagen/PDF en almacenamiento privado. |
| HU-28 | Calculadora de seguridad social | Saber cuánto pagar | C | Parámetros editables (IBC, %, SMMLV del año). |

## 9. Reglas de negocio (RN)

| ID | Regla |
|---|---|
| RN-01 | Todo movimiento pertenece a un periodo según su **fecha** (zona horaria America/Bogota). |
| RN-02 | Un periodo **cerrado** no admite cambios; reabrir deja registro. |
| RN-03 | La generación del mes es **idempotente**: una obligación del mes por plantilla y periodo. |
| RN-04 | Estado de obligación: `pagada` si Σ pagos ≥ esperado; `parcial` si 0 < Σ < esperado; `vencida` si hoy > vencimiento y no pagada; `omitida` por decisión (requiere motivo). |
| RN-05 | Las **compras con tarjeta** son gasto de consumo en la fecha de compra; **no** son salida de caja. |
| RN-06 | Los **pagos de tarjeta** son salida de caja; **no** son gasto de consumo, excepto la porción imputada a *otros cargos* (gasto financiero). |
| RN-07 | Pagos de tarjeta y de préstamos se imputan primero a otros cargos/intereses y luego a capital (configurable). |
| RN-08 | Préstamos otorgados, aportes a cooperativa, ahorro y transferencias entre cuentas **no** son gasto. |
| RN-09 | "Otros gastos" exige descripción. |
| RN-10 | Montos en COP con 2 decimales en BD; en pantalla sin decimales y con separador de miles (`$ 1.250.000`). |
| RN-11 | Gasto reembolsable de Devtopia: cuenta como gasto en vista "caja", se puede excluir en vista "personal". |
| RN-12 | Cualquier diferencia de conciliación de tarjeta mayor al umbral configurado (por defecto $20.000 o 5 %) genera alerta. |

## 10. Dos vistas de la plata (clave para no engañarse)

| Vista | Pregunta que responde | Qué cuenta como gasto |
|---|---|---|
| **Consumo (devengo)** | ¿En qué gasté este mes? | Compras (incluidas las de tarjeta) por su categoría + intereses y cargos financieros. |
| **Caja (flujo)** | ¿Cuánta plata salió de mis cuentas? | Todo lo pagado desde cuentas: servicios, arriendo, **pagos de tarjeta completos**, cuotas de préstamos. |

El dashboard muestra por defecto **Consumo** para análisis y **Caja** para el checklist; un selector permite cambiar. Así no se duplica una compra de mercado (cuando se compra y cuando se paga la tarjeta).

## 11. Requisitos no funcionales

| Área | Requisito |
|---|---|
| Usabilidad | Móvil primero. Registrar gasto ≤ 10 s. Botón "+" siempre visible. Teclado numérico en montos. |
| Rendimiento | Dashboard < 1,5 s en 4G. Agregaciones en vistas SQL, no en el cliente. |
| Seguridad | Auth Supabase, registro deshabilitado, RLS en todas las tablas, bucket de adjuntos privado, llaves de servicio solo en servidor. |
| Disponibilidad | Vercel + Supabase. Cron diario que además evita la **pausa por inactividad** del plan gratuito de Supabase. |
| Datos | Respaldo semanal exportable; exportación manual CSV/JSON. |
| Localización | Español (Colombia), `es-CO`, COP, semana inicia lunes, fechas `dd/mm/aaaa`. |
| Accesibilidad | Contraste AA, modo oscuro, colores nunca como único indicador (íconos + texto en estados). |
| Mantenibilidad | Lógica financiera en funciones puras testeadas (tarjetas, imputación, indicadores). |

## 12. Supuestos y decisiones abiertas

| # | Tema | Decisión por defecto tomada | ¿Validar? |
|---|---|---|---|
| D1 | Luz vs Energía | Una categoría "Energía (luz)" | Sí |
| D2 | "Préstamos" en ingresos | Recuperación de préstamos otorgados | Sí |
| D3 | Uso "local" | Uso personal privado, alojado en Vercel + Supabase; desarrollo local con Supabase CLI | Sí |
| D4 | Inicio de mes | Mes calendario (día 1). Configurable si prefieres alinearlo al día de pago del sueldo | Opcional |
| D5 | Imputación de pagos TC | Otros cargos primero, luego capital | No (estándar) |
| D6 | Registro de extracto | Manual, 3 datos obligatorios (fecha corte, pago total, pago mínimo) | No |
| D7 | Multiusuario (pareja/familia) | No en v1, pero modelo preparado | Opcional |
