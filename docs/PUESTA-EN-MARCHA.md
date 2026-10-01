# Puesta en marcha

Guía paso a paso para correr Plata Clara en tu computador y publicarla en Vercel + Supabase.
Tiempo estimado: 30–45 minutos la primera vez.

---

## 0. Requisitos (una sola vez)

| Herramienta | Versión | Cómo verificar |
|---|---|---|
| Node.js | 22 o superior | `node -v` |
| pnpm | 10 (viene con Node vía corepack) | `corepack enable` y luego `pnpm -v` |
| Docker Desktop | reciente, **abierto** | `docker info` (necesario solo para Supabase local) |
| Git | cualquiera | `git --version` |
| Cuentas | GitHub, Supabase, Vercel | — |

## 1. Instalar dependencias

```powershell
cd C:\Users\oamor\Documentos\Personal\ingresosYgastos
pnpm install
```

## 2. Base de datos local (Supabase en Docker)

```powershell
pnpm db:start      # la primera vez descarga las imágenes (varios minutos)
```

Al terminar imprime algo como:

```
API URL: http://127.0.0.1:54321
Studio URL: http://127.0.0.1:54323
Mailpit URL: http://127.0.0.1:54324
Publishable key: sb_publishable_...
Secret key: sb_secret_...
```

Crea el archivo `.env.local` copiando `.env.example` y completa con esos valores:

```env
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
SUPABASE_SECRET_KEY=sb_secret_...
ALLOWED_EMAILS=oamoreno31@gmail.com
CRON_SECRET=cualquier-cadena-local
APP_TIMEZONE=America/Bogota
```

Aplica migraciones + datos de prueba y regenera los tipos:

```powershell
pnpm db:reset
pnpm db:types
```

## 3. Correr la app

```powershell
pnpm dev
```

Abre <http://localhost:3000> y entra con:

- **Correo:** `oamoreno31@gmail.com`
- **Contraseña:** `plata-clara-local` (solo existe en tu base local)

En **Inicio** debes ver "Estado de la instalación · ✓ Todo listo". Los enlaces mágicos locales llegan a Mailpit (<http://127.0.0.1:54324>).

## 4. Verificar calidad

```powershell
pnpm check     # lint + tipos + pruebas (dominio y migraciones SQL, más de 200)
pnpm build
```

Pruebas de extremo a extremo (Playwright) sobre Supabase local con los datos de prueba:

```powershell
pnpm exec playwright install chromium   # una sola vez
pnpm db:reset                           # datos limpios (las pruebas escriben datos)
pnpm e2e                                # levanta la app si no está corriendo; o pnpm e2e:ui
```

Cubren inicio de sesión, pagar una obligación, compra con tarjeta → extracto → pago, cierre y reapertura de mes, exportación y respaldo, y una auditoría de accesibilidad (axe) en las pantallas principales. **Nunca** las apuntes a producción (`E2E_BASE_URL`).

## 5. Repositorio en GitHub

```powershell
git init -b main
git add .
git commit -m "F0: fundaciones de Plata Clara"
```

Crea un repositorio **privado** en GitHub (p. ej. `plata-clara`) y súbelo:

```powershell
git remote add origin https://github.com/<tu-usuario>/plata-clara.git
git push -u origin main
```

GitHub Actions correrá el CI (lint, formato, tipos, pruebas, build) en cada push.

## 6. Supabase en producción

1. **Crear proyecto** en <https://supabase.com/dashboard> → New project.
   - Región: **East US (North Virginia)** — coincide con la región de Vercel configurada (`iad1`).
   - Guarda la contraseña de la base de datos en tu gestor de contraseñas.
2. **Deshabilitar registros:** Authentication → Sign In / Providers → desactiva *Allow new users to sign up*.
3. **URLs:** Authentication → URL Configuration
   - Site URL: `https://<tu-app>.vercel.app` (ajústalo después del paso 7 si aún no la tienes)
   - Redirect URLs: `https://<tu-app>.vercel.app/**`
4. **Aplicar migraciones** desde tu computador:
   ```powershell
   npx supabase login
   npx supabase link --project-ref <ref-del-proyecto>
   pnpm db:push
   ```
   > `db:push` aplica solo las migraciones; `seed.sql` **no** se ejecuta en producción. La migración de F6 crea los buckets privados `comprobantes` y `respaldos` (Storage → Buckets) con sus políticas.
5. **Crear tu usuario:** Authentication → Users → *Add user* → *Create new user* con tu correo y una contraseña fuerte, marcando *Auto Confirm User*. Al crearlo, la base de datos siembra automáticamente tus parámetros, la cuenta "Efectivo" y todas las categorías.
6. (Opcional) Nombre para mostrar — SQL Editor:
   ```sql
   update auth.users
   set raw_user_meta_data = raw_user_meta_data || '{"nombre":"Omar"}'
   where email = 'oamoreno31@gmail.com';
   ```
7. **Llaves:** Project Settings → API Keys → copia la *Publishable key* y la *Secret key*.

## 7. Vercel

1. <https://vercel.com/new> → importa el repositorio de GitHub (framework: Next.js, se detecta solo).
2. **Environment Variables** (Production y Preview):

   | Variable | Valor |
   |---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | `https://<ref>.supabase.co` |
   | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | `sb_publishable_…` |
   | `SUPABASE_SECRET_KEY` | `sb_secret_…` |
   | `ALLOWED_EMAILS` | `oamoreno31@gmail.com` |
   | `CRON_SECRET` | cadena aleatoria (ver abajo) |
   | `APP_TIMEZONE` | `America/Bogota` |
   | `RESEND_API_KEY` | *(opcional)* llave de Resend para el correo de recordatorios |
   | `EMAIL_FROM` | *(opcional)* remitente, p. ej. `Plata Clara <avisos@tu-dominio>` |

   Para generar `CRON_SECRET`:
   ```powershell
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```
3. **Deploy.** Si la URL final difiere de la que pusiste en Supabase (paso 6.3), actualízala allá.
4. Settings → Cron Jobs: debe aparecer `/api/cron/diario` (07:00 Bogotá). Mantiene activo el proyecto gratuito de Supabase, envía el correo de recordatorios y los domingos guarda el respaldo.
5. **Correo (opcional):** crea una cuenta en <https://resend.com> → API Keys → *Create API key* (permiso *Sending access*) y ponla en `RESEND_API_KEY`. Sin dominio propio verificado, Resend solo entrega a tu propio correo usando `onboarding@resend.dev` (suficiente para ti). Con dominio (p. ej. `devtopia.co`), verifícalo en Resend → Domains y cambia `EMAIL_FROM`.

## 8. Checklist de aceptación de la Fase 0

- [ ] `https://<tu-app>.vercel.app` redirige a `/login` sin sesión.
- [ ] Contraseña incorrecta → "Correo o contraseña incorrectos."
- [ ] Con tu usuario entras y **Inicio** muestra "✓ Todo listo" (parámetros, 1 cuenta, 39 categorías).
- [ ] **Configuración** lista cuentas y categorías (gasto con subcategorías de "Otros gastos").
- [ ] El selector de periodo cambia de mes y "Ir a hoy" vuelve al actual.
- [ ] En el celular: barra inferior, botón "+" y menú "Más" funcionan.
- [ ] Tema oscuro desde el menú de usuario (letra inicial arriba a la derecha).
- [ ] Cerrar sesión te devuelve a `/login`.
- [ ] En GitHub, el CI queda en verde.

## 9. Checklist de aceptación de la Fase 1

- [ ] Inicio muestra "Configura tu mes en 2 minutos" → el asistente crea cuentas, pagos e ingreso y te lleva al mes.
- [ ] En **Mes**, "Pagar" registra el pago; con un monto menor queda **parcial** y muestra cuánto falta.
- [ ] "⋮ → Ajustar monto o fecha" cambia solo este mes (p. ej. llegó la factura de la luz).
- [ ] "⋮ → Omitir este mes" exige motivo; "Restaurar" la devuelve.
- [ ] El botón **+** registra gasto, ingreso, pago de obligación o transferencia. "Otros gastos" exige descripción.
- [ ] **Movimientos** filtra por mes, tipo, categoría, cuenta y texto; tocar un movimiento permite editarlo o eliminarlo.
- [ ] **Configuración → Obligaciones recurrentes**: al crear una muestra en qué meses aparecerá (el agua bimestral salta un mes).
- [ ] **Cerrar mes** pide decidir cada pendiente (pasar al mes siguiente u omitir); el mes queda en solo lectura y se puede reabrir con motivo.
- [ ] Llamar el cron a mano genera el mes:
  ```powershell
  curl -H "Authorization: Bearer <CRON_SECRET>" http://localhost:3000/api/cron/generar-mes
  ```

## 10. Checklist de aceptación de la Fase 2 (tarjetas)

Aplica la migración nueva (`pnpm db:push`, o en local `pnpm db:reset`) y prueba con el ejemplo del doc 03:

- [ ] **Tarjetas → Nueva tarjeta**: Visa, cupo 8.000.000, corte 15, pago 30. La vista previa dice cuántos días tienes para pagar.
- [ ] **Compra**: 320.000 (20-jul), 2.400.000 a **12 cuotas** (28-jul, la vista previa muestra 12 × 200.000) y 180.000 (3-ago). Deuda = 2.900.000.
- [ ] **Extracto** corte 15-ago, total 2.948.500, mínimo 748.500 → la vista previa muestra **otros cargos 48.500**, capital facturado 700.000 y el mínimo estimado coincide (✓).
- [ ] **Pagar → Mínimo** (748.500): se registra como "Pago mínimo", 48.500 a otros cargos y 700.000 a capital. En **Movimientos** aparece la salida de Ahorros.
- [ ] Al escribir 300.000 la vista previa advierte **inferior al mínimo** antes de guardar.
- [ ] En **Mes** aparece "Pago Visa…" (monto = mínimo, detalle con el total); "Pagar" lleva a la tarjeta con el pago abierto.
- [ ] **Inicio**: pasado un corte sin extracto aparece "registra el extracto…"; con uso > 60 % aparece la alerta de cupo.
- [ ] El botón **+ → Compra con tarjeta** registra una compra sin salir de la pantalla.
- [ ] Borrar un pago borra también su movimiento y la obligación vuelve a pendiente.

## 11. Checklist de aceptación de la Fase 3 (deudas y préstamos)

Aplica la migración nueva (`pnpm db:push`, o en local `pnpm db:reset`):

- [ ] **Deudas → Nueva deuda**: banco, 10.000.000 al 26,82 % E.A., 24 meses, día 5, seguro 12.000. La cuota se calcula sola y la vista previa dice cuándo terminas y cuántos intereses te faltan. Marca "El dinero entró a una de mis cuentas": el saldo de la cuenta sube sin contar como ingreso.
- [ ] **Pagar cuota**: el desglose sugerido (intereses del mes, seguro, capital) se puede corregir con el recibo; el saldo de capital baja solo con la parte de capital.
- [ ] **Abono extra**: la vista previa dice cuántos meses antes terminas y cuántos intereses te ahorras.
- [ ] **Cooperativa** que ya venías pagando: con "Ya la venía pagando" + cuotas pagadas se estima el saldo. El aporte social va a la cuenta de aportes (tipo cooperativa) y no es gasto.
- [ ] En **Mes** aparece la cuota de cada deuda desde la próxima fecha de pago; "Pagar" abre el pago en la deuda.
- [ ] **Me deben → Prestar**: sale de la cuenta sin ser gasto. El botón **+ → Me pagaron** registra el abono (recuperación). Si pasa la fecha acordada, Inicio lo avisa.
- [ ] Un gasto marcado "Reembolsable por Devtopia" aparece en **Deudas → Devtopia**; al registrar el reembolso queda como "✓ Reembolsado" y deshacerlo lo vuelve a dejar pendiente (funciona aunque el mes del gasto esté cerrado).
- [ ] **Inicio → Tus cuentas** muestra préstamos, lo que te deben, lo que te debe Devtopia y el patrimonio neto.

## 12. Checklist de aceptación de la Fase 4 (análisis y presupuesto)

Aplica la migración nueva (`pnpm db:push`, o en local `pnpm db:reset`). Sirve más con 2–3 meses de datos.

- [ ] **Análisis**: el "Gasto del mes" coincide con el de Inicio; el ranking muestra subcategorías como "Otros gastos › Mercado" e incluye las compras con tarjeta. Cambia a **Caja**: aparecen "Pagos de tarjetas", "Cuotas de préstamos", etc. Desmarca "Incluir gastos reembolsables por Devtopia" y el gasto baja. Recarga: los filtros se mantienen.
- [ ] Pasa el mouse (o Tab) por las columnas: el tooltip muestra cada categoría y el total. "Ver tabla" muestra los mismos datos.
- [ ] **Presupuesto → Proponer 50/30/20**: revisa la tabla de bolsas y usa la propuesta. Antes de guardar ves el total vs tus ingresos y cómo quedan necesidades / deseos / ahorro. Guarda con "también como plantilla".
- [ ] Una categoría pasada del tope muestra "! … te pasaste"; al 80 % "◐ cerca del tope". Inicio muestra esas alertas.
- [ ] El mes siguiente (o uno sin presupuesto propio) dice "usando tu plantilla"; "Copiar mes anterior" trae las líneas del mes pasado. En un mes cerrado el presupuesto es de solo lectura.
- [ ] **Histórico**: patrimonio de hoy = el de Inicio. Cierra un mes y su fila muestra el patrimonio de esa foto; la gráfica de evolución aparece con 1 mes cerrado + hoy. En "Historial por obligación" elige, p. ej., la luz: ves lo pagado mes a mes.

## 13. Checklist de aceptación de la Fase 5 (salud financiera)

Aplica la migración nueva (`pnpm db:push`, o en local `pnpm db:reset`).

- [ ] **Salud financiera → Resumen**: con ingresos del mes aparece el score (0–100) con su lectura y hasta 3 acciones con cifras (p. ej. "Paga el total de la Visa: este mes se fueron $ X en cargos"). Cada indicador dice su banda con símbolo y texto, y en "Cómo se calcula" su fórmula y peso.
- [ ] **Umbrales**: cambia un umbral (p. ej. ahorro sano 30 %) y el indicador cambia de banda. Anota la tasa de usura vigente: si una tarjeta o préstamo la supera, aparece el aviso.
- [ ] **Metas → Crear fondo**: propone 6 meses de gasto esencial. Elige la cuenta donde lo guardas, un aporte y una fecha: la vista previa dice cuándo llegas y cuánto necesitas al mes para la fecha. Una transferencia a esa cuenta sube el avance.
- [ ] **Plan de deudas**: completa las tasas que falten (están en el extracto) y ajusta el extra mensual: compara solo mínimos, avalancha y bola de nieve (meses, intereses, fecha libre).
- [ ] **Seguridad social**: escribe el salario mínimo del año y guarda; con tu ingreso promedio ves IBC, salud, pensión, ARL y total, y lo comparas con lo registrado en la categoría PILA.
- [ ] Al **cerrar un mes**, Histórico muestra su score en la tabla y la gráfica de Salud agrega el punto.

## 14. Checklist de aceptación de la Fase 6 (complementos)

Aplica la migración nueva (`pnpm db:push`, o en local `pnpm db:reset`) y, si quieres correo, configura Resend (sección 7, paso 5).

- [ ] **Instalar en el celular:** abre la app en Chrome (Android) → menú → *Instalar app*; en iPhone, Safari → Compartir → *Agregar a inicio*. Abre desde el ícono: pantalla completa y accesos directos a Mes y Movimientos (mantén presionado el ícono).
- [ ] **Sin conexión:** con el modo avión, abrir la app muestra "Estás sin conexión" (no guarda tus cifras en el teléfono); al volver la red, *Reintentar*.
- [ ] **Comprobante:** registra un gasto con *Adjuntar comprobante* (foto o PDF). En Movimientos aparece el clip; al tocarlo se abre el archivo. Quítalo editando el gasto.
- [ ] **Exportar:** Configuración → Datos y respaldo → elige el rango → *Descargar Excel* (3 hojas) y *Descargar CSV* (se abre bien en Excel en español).
- [ ] **Respaldo:** *Descargar respaldo ahora* baja un JSON. Para probar la restauración, registra algo de prueba, elige el JSON en *Restaurar un respaldo*, revisa la vista previa y confirma: vuelve al estado del archivo.
- [ ] **Cron:** Vercel → Settings → Cron Jobs → `/api/cron/diario` → *Run*. Con obligaciones vencidas o por vencer llega el correo; con `?respaldo=1` (probándolo con `curl` y `Authorization: Bearer <CRON_SECRET>`) aparece un respaldo en Datos y respaldo → *Respaldos automáticos*.

## Problemas comunes

| Síntoma | Causa probable | Solución |
|---|---|---|
| Error al arrancar: "NEXT_PUBLIC_SUPABASE_URL debe ser una URL" | Falta `.env.local` o variable en Vercel | Revisa el paso 2 o 7 |
| Configuración no muestra categorías | El usuario se creó antes de aplicar migraciones | En SQL Editor: `select public.inicializar_usuario(id) from auth.users where email = 'oamoreno31@gmail.com';` |
| Entras y te devuelve a /login con "no tiene acceso" | El correo no está en `ALLOWED_EMAILS` | Corrige la variable y redeploy |
| `pnpm db:start` falla | Docker Desktop cerrado | Ábrelo y reintenta |
| El enlace mágico lleva a localhost en producción | Site URL de Supabase mal configurada | Paso 6.3 |
