# 03 · Tarjetas de crédito — diseño detallado

> Es el módulo con más lógica del sistema. Todo lo de aquí se implementa en **funciones puras** (`lib/domain/tarjetas.ts`) con pruebas unitarias, y se refleja en la función SQL `recalcular_tarjeta()`.

---

## 1. Principio

La app lleva **solo el capital** (lo que compraste). El banco cobra capital **más** "otros cargos" (intereses corrientes, intereses de mora, cuota de manejo, seguros, comisiones de avance, diferencia cambiaria). La app **no intenta calcular** esos cargos: los **deduce** comparando lo que dice el banco con lo que lleva el sistema.

```
Otros cargos del corte = Pago total según el banco − Saldo que lleva el sistema al corte
```

Así, con solo 3 datos del extracto (fecha de corte, pago total, pago mínimo) la app sabe cuánto de lo que pagas se va en capital y cuánto en cargos.

## 2. Entidades

| Entidad | Campos principales | Notas |
|---|---|---|
| **Tarjeta** | nombre, banco, franquicia, últimos 4, cupo, día de corte, día límite de pago, tasa EA de referencia, cuota de manejo de referencia, cuenta de pago por defecto, activa | Es también una *cuenta* de tipo `tarjeta_credito`. |
| **Compra TC** | fecha, descripción, comercio, categoría, tipo (`compra`, `avance`, `devolucion`, `ajuste`), monto COP, n.º de cuotas, moneda, monto en origen, TRM | Aumenta capital (devolución lo reduce). Es gasto de consumo en su categoría (excepto `ajuste`). |
| **Cuota de capital** (derivada) | compra, n.º de cuota, corte al que pertenece, valor | Calendario: `monto / n` por corte; la última absorbe el redondeo. |
| **Extracto** | fecha de corte, fecha límite de pago, pago total banco, pago mínimo banco, desglose opcional (intereses, cuota de manejo, seguros, otros), estado | Una fila por tarjeta y corte. |
| **Pago TC** | fecha, monto, cuenta origen, tipo de pago (`total`, `minimo`, `otro`, `inferior_minimo`), extracto al que aplica, imputado a otros cargos, imputado a capital, saldo a favor | Genera un movimiento de salida de caja. |

## 3. Cálculos

### 3.1 Saldos en cualquier fecha *f*

```
Capital(f)        = Σ compras.monto (fecha ≤ f) − Σ pagos.imputado_capital (fecha ≤ f)
OtrosCargos(f)    = Σ extractos.otros_generados (corte ≤ f) − Σ pagos.imputado_otros (fecha ≤ f)
SaldoSistema(f)   = Capital(f) + OtrosCargos(f)
CupoDisponible    = Cupo − SaldoSistema(hoy)
Utilización       = SaldoSistema(hoy) ÷ Cupo
```

### 3.2 Al registrar un extracto

```
saldo_sistema_al_corte  = SaldoSistema(fecha_corte)          -- antes de sumar cargos nuevos
otros_generados         = pago_total_banco − saldo_sistema_al_corte
capital_facturado_corte = Σ cuotas de capital cuyo corte = este corte
minimo_estimado         = capital_facturado_corte + OtrosCargos después del corte
```

- `otros_generados > 0` → son los cargos nuevos del periodo. Se registran como **gasto financiero** del mes (categoría *Costos financieros TC*).
- `otros_generados < 0` → **alerta de conciliación**: el banco dice que debes *menos* de lo que lleva el sistema. Causas típicas: devolución o pago no registrado, compra duplicada, compra en USD con TRM distinta. La app ofrece: *revisar compras del periodo* o *registrar ajuste*.
- Si el usuario llenó el desglose opcional: `diferencia_no_explicada = otros_generados − (intereses + manejo + seguros + otros)`. Si supera el umbral (por defecto $20.000 o 5 %) → alerta "posible compra no registrada".

### 3.3 Al registrar un pago — clasificación

El formulario pide **tipo de pago** con tres opciones y precarga el monto:

| Opción elegida | Monto precargado | Validación |
|---|---|---|
| **Pago total** | Pendiente del extracto = pago total banco − pagos ya hechos a ese extracto | Editable; si queda por debajo, se reclasifica y avisa. |
| **Pago mínimo** | Pago mínimo banco − pagos ya hechos a ese extracto | — |
| **Otro valor** | Vacío | Debe ser > mínimo y < total. Si es menor al mínimo se guarda como **inferior al mínimo** con alerta roja (riesgo de mora y reporte). |

Clasificación automática de respaldo (acumulando pagos al mismo extracto, tolerancia $1.000):

```
si acumulado ≥ total − tol                 → total
si |acumulado − mínimo| ≤ tol              → minimo
si mínimo < acumulado < total              → otro
si acumulado < mínimo                      → inferior_minimo
sin extracto registrado                    → otro (se reclasifica al registrar el extracto)
```

### 3.4 Al registrar un pago — imputación

Orden por defecto (práctica bancaria habitual; configurable):

```
imputado_otros   = min(monto, OtrosCargos(fecha_pago))
imputado_capital = min(monto − imputado_otros, Capital(fecha_pago))
saldo_a_favor    = monto − imputado_otros − imputado_capital
```

En pantalla, tras guardar:

> **Pagaste $1.500.000** · $48.500 fueron **otros cargos** (3,2 %) · $1.451.500 abonaron a **capital** · Deuda de capital restante: $1.448.500.

### 3.5 Recalculo determinístico (libro mayor)

Porque un pago puede registrarse **antes** que el extracto (o un extracto tarde, o se edita una compra), la imputación **no se congela**: la función `recalcular_tarjeta(tarjeta_id)` recorre cronológicamente compras → extractos → pagos y reescribe `otros_generados`, `imputado_otros`, `imputado_capital`, `tipo_pago` y estados. Se ejecuta después de cualquier alta, edición o borrado en esa tarjeta. Es barata (cientos de filas por tarjeta).

Orden de eventos del mismo día: compras → extracto (corte) → pagos.

## 4. Ejemplo completo

**Tarjeta Visa** · cupo $8.000.000 · corte día 15 · límite de pago día 30.

**Compras del periodo 16-sep → 15-oct (capital inicial $0):**

| Fecha | Descripción | Monto | Cuotas | Capital facturado este corte |
|---|---|---|---|---|
| 20-sep | Mercado | 320.000 | 1 | 320.000 |
| 28-sep | Portátil | 2.400.000 | 12 | 200.000 |
| 03-oct | Restaurante | 180.000 | 1 | 180.000 |
| | **Total** | **2.900.000** | | **700.000** |

**Extracto corte 15-oct:** pago total banco **$2.948.500** · pago mínimo **$748.500**.

```
saldo_sistema_al_corte = 2.900.000
otros_generados        = 2.948.500 − 2.900.000 = 48.500   (p. ej. manejo 32.900 + seguro 15.600)
minimo_estimado        = 700.000 + 48.500 = 748.500  ✔ coincide con el banco
```

**Tres escenarios de pago (antes del 30-oct):**

| Escenario | Tipo | Monto | A otros cargos | A capital | Capital restante | Otros cargos restantes |
|---|---|---|---|---|---|---|
| A | Total | 2.948.500 | 48.500 | 2.900.000 | 0 | 0 |
| B | Mínimo | 748.500 | 48.500 | 700.000 | 2.200.000 | 0 |
| C | Otro valor | 1.500.000 | 48.500 | 1.451.500 | 1.448.500 | 0 |

**Siguiente corte (escenario B):** nuevas compras $450.000 → sistema = 2.200.000 + 450.000 = **2.650.000**. El banco reporta pago total **$2.711.300** → `otros_generados = 61.300` (ahora aparecen intereses por financiar $2,2 M: p. ej. 28.400 + manejo 32.900). La app muestra: *"Por pagar el mínimo en octubre, este mes pagas $28.400 de intereses."*

## 5. Pantallas del módulo

1. **Lista de tarjetas** — tarjeta visual por cada una: deuda de capital, otros cargos pendientes, barra de utilización (verde ≤ 30 %, ámbar ≤ 60 %, rojo), próxima fecha límite con mínimo y total.
2. **Detalle de tarjeta** — pestañas:
   - *Resumen*: KPIs, gráfica capital vs otros cargos (12 cortes), costo financiero acumulado del año.
   - *Compras*: tabla filtrable, cuotas pendientes por compra.
   - *Cuotas futuras*: calendario de capital por corte (cuánto "ya está comprometido" de los próximos meses).
   - *Extractos*: cada corte con banco vs sistema, otros cargos, estado de pago y alerta de conciliación.
   - *Pagos*: historial con tipo (chip de color) e imputación.
3. **Registrar extracto** — 3 campos obligatorios + desglose opcional; vista previa del cálculo antes de guardar.
4. **Registrar pago** — selector Total / Mínimo / Otro valor, monto precargado, cuenta origen, vista previa de la imputación.
5. **Registrar compra** — desde el botón "+" al elegir una TC como medio de pago: cuotas (1–48), moneda/TRM opcional.

## 6. Indicadores de tarjeta

| Indicador | Uso |
|---|---|
| Deuda de capital / otros cargos pendientes | Estado real |
| Utilización por tarjeta y total | Salud crediticia (≤ 30 %) |
| Costo financiero del mes, del año y por tarjeta | "Cuánto me cuesta la tarjeta" |
| % de mis pagos que se fue en otros cargos | Hace visible el costo de no pagar total |
| Capital comprometido en cuotas futuras | Evita sobre-endeudarse con compras diferidas |
| Proyección "si solo pago el mínimo" | Meses y cargos estimados con la tasa EA de referencia |
| Mejor día para comprar | Día siguiente al corte = más días hasta el pago |
| Racha de pagos totales | Refuerzo positivo |

## 7. Casos borde cubiertos

| Caso | Tratamiento |
|---|---|
| Pago antes de registrar el extracto | Se imputa a capital; al registrar extracto se recalcula todo el libro. |
| Varios pagos al mismo extracto | Se acumulan para clasificar total/mínimo/otro. |
| Pago mayor a la deuda | `saldo_a_favor`; se muestra en la tarjeta y se consume con compras siguientes. |
| Devolución / reverso | Compra tipo `devolucion` (monto negativo): reduce capital y el gasto de su categoría. |
| Avance en efectivo | Tipo `avance`: suma capital, **no** es gasto de consumo (es plata que pasa a una cuenta); la comisión aparece como otros cargos. |
| Compra en USD | Se registra USD × TRM estimada; la diferencia real cae en otros cargos del extracto (se etiqueta "posible diferencia cambiaria" si hay compras en USD en el periodo). |
| Cambio de número de cuotas después | Edición de la compra → recalculo del calendario. |
| Extracto no registrado a tiempo | La obligación del mes muestra "mínimo estimado" y alerta "registra tu extracto". |
| Diferencia negativa | Alerta de conciliación con acciones sugeridas. |
| Tarjeta cancelada | Se inactiva; conserva histórico. |
| Reversión de cuota de manejo | Queda reflejada como `otros_generados` menor (o negativo) en el siguiente corte. |

## 8. Integración con el resto del sistema

- La **obligación del mes** "Pago Visa" se crea con la fecha límite; su monto esperado = pago total del extracto (meta) y muestra el mínimo como referencia. Queda *pagada* con pago total, *parcial* con mínimo u otro valor (con etiqueta del tipo).
  - **Implementado (F2):** el monto esperado es el **pago mínimo**; la obligación queda *pagada* ("Mínimo cubierto") al cubrirlo y la UI muestra "Pago total" cuando se paga el total. La nota de la obligación y el detalle en Mes muestran el total. Motivo: pagar el mínimo cumple la obligación con el banco (no hay mora) y el checklist no debe marcarlo como incumplido; que convenga pagar el total lo muestran la vista previa del pago y el costo financiero.
- Las **compras** alimentan Análisis y Presupuesto por su categoría (vista consumo).
- Los **otros cargos** alimentan el indicador de costo financiero y la categoría *Costos financieros TC*.
- El **pago** alimenta la vista de caja y el saldo de la cuenta origen.

## 9. Pruebas unitarias mínimas (definición de terminado)

1. Ejemplo de la sección 4, los tres escenarios, cifras exactas.
2. Pago previo al extracto → recalculo correcto.
3. Dos pagos parciales que suman el total → clasificado `total`.
4. Pago inferior al mínimo → `inferior_minimo` + alerta.
5. Devolución que deja saldo a favor.
6. Compra a 12 cuotas: calendario y redondeo de la última cuota.
7. Diferencia negativa → alerta, sin cargos negativos imputados a pagos.
8. Idempotencia: recalcular dos veces produce el mismo resultado.
