# 02 · Marco teórico financiero

> Base conceptual que la app implementa. Sirve para que las cifras "cuadren" y para que los indicadores signifiquen algo.

---

## 1. Contabilidad personal simplificada

La app usa una versión ligera de partida doble sin exponerla al usuario. Cada registro cae en uno de estos tipos:

| Tipo de registro | Efecto en caja (cuentas) | Efecto en deuda | ¿Es gasto de consumo? | ¿Es ingreso? |
|---|---|---|---|---|
| Ingreso (sueldo, otros) | + | — | — | Sí |
| Gasto pagado desde cuenta | − | — | Sí | — |
| Compra con tarjeta de crédito | — | + capital TC | Sí | — |
| Pago de tarjeta | − | − capital TC / − otros cargos | Solo la parte de otros cargos | — |
| Cuota de préstamo recibido | − | − capital | Solo intereses/seguros | — |
| Desembolso de préstamo recibido | + | + capital | — | **No** (es deuda) |
| Préstamo otorgado a tercero | − | + cuenta por cobrar | **No** | — |
| Abono de tercero a préstamo | + | − cuenta por cobrar | — | "Recuperación" (separado) |
| Aporte a cooperativa / ahorro | − (sale de la cuenta) | + patrimonio | **No** | — |
| Transferencia entre cuentas | ± | — | No | No |
| Gasto Devtopia reembolsable | − | + cuenta por cobrar a Devtopia | Sí en vista caja; excluible en vista personal | — |

**Consecuencia:** el balance del mes nunca se infla ni se duplica. Una compra de mercado con tarjeta es gasto **una sola vez** (cuando se compra), y el pago de la tarjeta es solo movimiento de deuda — salvo los intereses y cargos, que sí son el "costo de usar la tarjeta".

## 2. Devengo vs caja

- **Devengo (consumo):** el gasto se reconoce cuando ocurre el consumo. Responde "¿en qué se me va la plata?" y alimenta Análisis y Presupuesto.
- **Caja:** el gasto se reconoce cuando sale dinero de una cuenta. Responde "¿me alcanza la plata este mes?" y alimenta el checklist, la proyección de liquidez y el balance de cuentas.

Ambas vistas se calculan con los mismos datos; no se registra nada dos veces.

## 3. Patrimonio neto (foto mensual)

```
Patrimonio = Saldo en cuentas + Ahorros/aportes + Cuentas por cobrar
           − Deuda capital tarjetas − Otros cargos pendientes TC − Saldo de préstamos
```

Se guarda en el snapshot de cierre de cada mes → gráfica de evolución del patrimonio (el indicador más honesto de progreso financiero).

## 4. Indicadores de salud financiera

| Indicador | Fórmula | Sano | Atención | Riesgo |
|---|---|---|---|---|
| **Tasa de ahorro** | (Ingresos operativos − Gastos de consumo) ÷ Ingresos operativos | ≥ 20 % | 10–19 % | < 10 % |
| **Carga de deuda (DTI mensual)** | (Pagos mínimos TC + cuotas de préstamos + cuota crédito cooperativa) ÷ Ingresos operativos | ≤ 30 % | 31–40 % | > 40 % |
| **Utilización de tarjetas** | Deuda total TC ÷ Cupo total | ≤ 30 % | 31–60 % | > 60 % |
| **Costo financiero** | (Intereses + cuota de manejo + seguros + otros cargos) ÷ Ingresos operativos | ≤ 3 % | 3–8 % | > 8 % |
| **Gastos fijos** | Obligaciones fijas ÷ Ingresos operativos | ≤ 50 % | 51–65 % | > 65 % |
| **Fondo de emergencia** | Ahorro líquido ÷ Gasto esencial mensual | ≥ 6 meses | 3–6 meses | < 3 meses |
| **Puntualidad** | Obligaciones pagadas a tiempo ÷ Obligaciones del mes | 100 % | 90–99 % | < 90 % |
| **Pago de TC** | Pagos "total" ÷ Pagos de TC del mes | 100 % total | Otro valor | Mínimo / inferior |

> Los umbrales son referencias de educación financiera ampliamente usadas; quedan como **parámetros editables** en Configuración.

### 4.1 Score de salud financiera (0–100)

Promedio ponderado de sub-puntajes normalizados (cada indicador → 0 a 100 según su banda):

| Indicador | Peso |
|---|---|
| Tasa de ahorro | 20 % |
| Carga de deuda | 20 % |
| Utilización TC | 15 % |
| Fondo de emergencia | 15 % |
| Costo financiero | 10 % |
| Puntualidad | 10 % |
| Forma de pago TC | 10 % |

Bandas de lectura: **80–100 Sólida · 60–79 Estable · 40–59 Frágil · < 40 Crítica.**
Cada mes la app muestra las **3 acciones de mayor impacto** (p. ej. "Si pagas el total de la Visa en vez de otro valor, dejas de pagar ≈ $X de intereses al mes").

## 5. Regla 50/30/20 adaptada

Cada categoría tiene una clasificación configurable:

| Bolsa | Meta sobre ingreso | Categorías por defecto |
|---|---|---|
| **Necesidades (50 %)** | ≤ 50 % | Arriendo, servicios públicos, internet, celular, seguridad social, mercado, transporte, salud, pagos mínimos de deuda |
| **Deseos (30 %)** | ≤ 30 % | Restaurantes, ocio, suscripciones, ropa, viajes, regalos |
| **Ahorro y deuda extra (20 %)** | ≥ 20 % | Aportes cooperativa, ahorro, metas, abonos a capital por encima del mínimo |

El módulo Presupuesto propone montos iniciales con esta regla y el ingreso promedio de los últimos 3 meses.

## 6. Estrategias para salir de deudas

| Método | Orden de pago extra | Ventaja | Cuándo recomendarlo |
|---|---|---|---|
| **Avalancha** | Deuda con mayor tasa primero | Paga menos intereses totales | Disciplina alta; tarjetas con tasa alta |
| **Bola de nieve** | Deuda con menor saldo primero | Victorias rápidas, motivación | Muchas deudas pequeñas |

El simulador (Salud financiera → Plan de deudas) toma: saldos de capital, tasa EA de cada deuda, pago mínimo y un **monto extra mensual** que el usuario define, y devuelve para ambos métodos: meses hasta quedar libre, intereses totales, y el calendario mes a mes.

### Conversión de tasas (Colombia)
Las tasas se expresan en **Efectiva Anual (EA)**. Para simular mes a mes:

```
tasa_mensual = (1 + EA) ^ (1/12) − 1
```

La tasa de las tarjetas se registra como referencia por tarjeta (dato del extracto). La app puede mostrar un recordatorio para comparar con la **tasa de usura vigente** que certifica la Superintendencia Financiera (dato editable, no se consulta automáticamente).

## 7. Contexto colombiano relevante

| Tema | Cómo lo aborda la app |
|---|---|
| **Extracto de tarjeta** | Los bancos reportan *pago total* (saldo total a la fecha de corte) y *pago mínimo* (cuota del periodo + intereses + cargos). Es la base de la conciliación. |
| **Compras a cuotas** | El capital se difiere en N cuotas; el mínimo incluye la cuota de capital del mes. La app genera el calendario de capital. |
| **Compras en dólares** | Se registra monto en USD y TRM aplicada; el capital en COP se ajusta con el extracto (la diferencia cambiaria cae en "otros cargos/ajustes"). |
| **4x1000 (GMF)** | Opcional: se puede registrar como gasto financiero, o activar cálculo estimado por movimiento desde cuentas no exentas. |
| **Servicios públicos** | Agua frecuentemente bimestral; energía/gas mensual; montos variables → estimado por promedio. |
| **Seguridad social (independientes)** | Calculadora con parámetros editables (IBC como % del ingreso, % salud, % pensión, clase de riesgo ARL, SMMLV del año). No se hardcodean valores: cambian cada año. |
| **Cooperativas** | Separa **aportes sociales** (ahorro/patrimonio) de **créditos** (deuda). Muchas descuentan ambos en una sola cuota: la app permite desglosar. |
| **Reporte en centrales de riesgo** | Alerta de pago "inferior al mínimo" o vencido, porque es lo que impacta el historial crediticio. |

## 8. Hábitos que la app promueve (diseño conductual)

1. **Registro inmediato** (botón +, ≤ 10 s) → datos confiables.
2. **Revisión semanal** (notificación opcional los domingos: "te quedan $X por pagar esta semana").
3. **Cierre mensual** como ritual: la app muestra el resumen, las 3 acciones sugeridas y el avance de metas.
4. **Pagar el total de la tarjeta** como norma: la app hace visible el costo de no hacerlo ("este mes pagaste $X en otros cargos").
5. **Pagarse primero**: la meta de ahorro aparece como obligación del mes, no como sobrante.
