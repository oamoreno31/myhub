-- =====================================================================
-- Plata Clara · 0004 · Deudas, préstamos otorgados y reembolsos Devtopia (Fase 3)
-- Referencias: docs/01 (F6, F7, HU-15..18), docs/02 §1 y §7, docs/05 §3.12–3.15.
--
-- Resumen:
--  · deudas: préstamos recibidos (banco, libranza, cooperativa, persona). Saldo de capital =
--    saldo al empezar el registro − Σ abonos a capital. El desembolso (opcional) entra a una cuenta.
--  · pagos_deuda: cada cuota se desglosa en capital, intereses, seguros/otros y aporte (cooperativa).
--    Crea sus movimientos de caja: `pago_deuda` (capital+intereses+seguros) y `aporte` (a la cuenta
--    de aportes). Solo intereses y seguros son gasto de consumo ("Intereses de préstamos").
--  · prestamos_otorgados: plata que prestaste (movimiento `prestamo_otorgado`, no es gasto).
--    Los abonos son movimientos `recuperacion_prestamo` ligados al préstamo (no son ingreso operativo).
--  · Reembolsos Devtopia: gastos y compras con tarjeta marcados como reembolsables quedan "por cobrar"
--    hasta que se registra el reembolso (movimiento `reembolso_devtopia`) que los marca.
-- =====================================================================

create type public.tipo_deuda as enum ('banco', 'libranza', 'cooperativa', 'persona', 'otro');

-- ---------------------------------------------------------------------
-- deudas (préstamos recibidos y créditos)
-- ---------------------------------------------------------------------
create table public.deudas (
  id                        uuid primary key default gen_random_uuid(),
  user_id                   uuid not null default auth.uid() references auth.users (id) on delete cascade,
  nombre                    text not null check (length(trim(nombre)) between 1 and 80),
  acreedor                  text check (acreedor is null or length(acreedor) <= 80),
  tipo                      public.tipo_deuda not null default 'banco',
  monto_original            numeric(14,2) not null check (monto_original > 0),
  fecha_desembolso          date not null,
  tasa_ea                   numeric(7,4) not null default 0 check (tasa_ea between 0 and 2),
  plazo_meses               smallint not null check (plazo_meses between 1 and 480),
  -- Cuota pactada de capital + intereses (sin seguros ni aportes).
  cuota                     numeric(14,2) not null check (cuota >= 0),
  seguro_mensual            numeric(14,2) not null default 0 check (seguro_mensual >= 0),
  aporte_mensual            numeric(14,2) not null default 0 check (aporte_mensual >= 0),
  cuenta_aportes_id         uuid references public.cuentas (id) on delete set null,
  dia_pago                  smallint not null check (dia_pago between 1 and 31),
  cuenta_pago_default_id    uuid references public.cuentas (id) on delete set null,
  -- Capital pendiente cuando empezaste a registrarla en la app (= monto original si es nueva).
  saldo_inicial             numeric(14,2) not null check (saldo_inicial >= 0),
  fecha_saldo_inicial       date not null,
  cuenta_desembolso_id      uuid references public.cuentas (id) on delete set null,
  movimiento_desembolso_id  uuid unique references public.movimientos (id) on delete set null,
  activa                    boolean not null default true,
  notas                     text check (notas is null or length(notas) <= 300),
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now(),
  check (saldo_inicial <= monto_original),
  check (fecha_saldo_inicial >= fecha_desembolso),
  check (aporte_mensual = 0 or cuenta_aportes_id is not null)
);

create index deudas_user_idx on public.deudas (user_id, activa);

create trigger deudas_updated_at
  before update on public.deudas
  for each row execute function public.set_updated_at();

-- Valida la deuda y mantiene su movimiento de desembolso (si se eligió cuenta de desembolso).
create or replace function public.sincronizar_deuda()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_tipo public.tipo_cuenta;
  v_mov uuid;
begin
  if tg_op = 'DELETE' then
    return old;
  end if;

  perform public.exigir_propietario('public.cuentas', new.cuenta_pago_default_id, new.user_id, 'Cuenta de pago');
  perform public.exigir_propietario('public.cuentas', new.cuenta_aportes_id, new.user_id, 'Cuenta de aportes');
  perform public.exigir_propietario('public.cuentas', new.cuenta_desembolso_id, new.user_id, 'Cuenta de desembolso');
  new.nombre := trim(new.nombre);
  new.acreedor := nullif(trim(new.acreedor), '');
  new.notas := nullif(trim(new.notas), '');

  foreach v_mov in array array[new.cuenta_pago_default_id, new.cuenta_aportes_id, new.cuenta_desembolso_id] loop
    if v_mov is not null then
      select tipo into v_tipo from public.cuentas where id = v_mov;
      if v_tipo = 'tarjeta_credito' then
        raise exception 'Las cuentas de una deuda no pueden ser tarjetas de crédito';
      end if;
    end if;
  end loop;

  -- Desembolso: el dinero del préstamo entra a una cuenta (no es ingreso).
  if new.cuenta_desembolso_id is null then
    -- El movimiento viejo se borra en el trigger AFTER (borrarlo aquí chocaría con la FK).
    new.movimiento_desembolso_id := null;
  elsif new.movimiento_desembolso_id is null then
    insert into public.movimientos (user_id, fecha, tipo, monto, cuenta_id, descripcion)
    values (new.user_id, new.fecha_desembolso, 'desembolso_deuda', new.monto_original, new.cuenta_desembolso_id,
            'Desembolso ' || new.nombre)
    returning id into v_mov;
    new.movimiento_desembolso_id := v_mov;
  elsif tg_op = 'UPDATE'
        and (old.fecha_desembolso, old.monto_original, old.cuenta_desembolso_id, old.nombre)
            is distinct from (new.fecha_desembolso, new.monto_original, new.cuenta_desembolso_id, new.nombre) then
    update public.movimientos
    set fecha = new.fecha_desembolso, monto = new.monto_original, cuenta_id = new.cuenta_desembolso_id,
        descripcion = 'Desembolso ' || new.nombre
    where id = new.movimiento_desembolso_id;
  end if;
  return new;
end;
$$;

create trigger deudas_10_sincronizar
  before insert or update on public.deudas
  for each row execute function public.sincronizar_deuda();

create or replace function public.borrar_desembolso_deuda()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.movimiento_desembolso_id is not null
     and (tg_op = 'DELETE' or new.movimiento_desembolso_id is null) then
    delete from public.movimientos where id = old.movimiento_desembolso_id;
  end if;
  return null;
end;
$$;

create trigger deudas_20_borrar_desembolso
  after update or delete on public.deudas
  for each row execute function public.borrar_desembolso_deuda();

-- La plantilla de obligación mensual de una deuda (su cuota en el checklist del mes).
alter table public.obligaciones
  add column deuda_id uuid unique references public.deudas (id) on delete set null;

create or replace function public.validar_obligacion_deuda()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  perform public.exigir_propietario('public.deudas', new.deuda_id, new.user_id, 'Deuda');
  return new;
end;
$$;

create trigger obligaciones_validar_deuda
  before insert or update on public.obligaciones
  for each row execute function public.validar_obligacion_deuda();

-- ---------------------------------------------------------------------
-- pagos_deuda (cuotas con desglose)
-- ---------------------------------------------------------------------
create table public.pagos_deuda (
  id                     uuid primary key default gen_random_uuid(),
  user_id                uuid not null default auth.uid() references auth.users (id) on delete cascade,
  deuda_id               uuid not null references public.deudas (id) on delete cascade,
  movimiento_id          uuid unique references public.movimientos (id) on delete cascade,
  movimiento_aporte_id   uuid unique references public.movimientos (id) on delete set null,
  obligacion_periodo_id  uuid references public.obligaciones_periodo (id) on delete set null,
  cuenta_origen_id       uuid not null references public.cuentas (id),
  fecha                  date not null,
  monto                  numeric(14,2) not null check (monto > 0),
  a_capital              numeric(14,2) not null default 0 check (a_capital >= 0),
  a_intereses            numeric(14,2) not null default 0 check (a_intereses >= 0),
  a_seguros              numeric(14,2) not null default 0 check (a_seguros >= 0),
  a_aporte               numeric(14,2) not null default 0 check (a_aporte >= 0),
  nota                   text check (nota is null or length(nota) <= 200),
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  constraint pagos_deuda_desglose_cuadra check (a_capital + a_intereses + a_seguros + a_aporte = monto),
  constraint pagos_deuda_sin_solo_aporte check (monto > a_aporte)
);

create index pagos_deuda_deuda_idx on public.pagos_deuda (deuda_id, fecha);

create trigger pagos_deuda_updated_at
  before update on public.pagos_deuda
  for each row execute function public.set_updated_at();

create or replace function public.sincronizar_pago_deuda()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_deuda public.deudas%rowtype;
  v_tipo public.tipo_cuenta;
  v_categoria uuid;
  v_descripcion text;
  v_per uuid;
  v_mov uuid;
begin
  if tg_op = 'DELETE' then
    if pg_trigger_depth() <= 1 then
      select periodo_id into v_per from public.movimientos where id = old.movimiento_id;
      perform public.exigir_periodo_abierto(v_per);
    end if;
    return old;
  end if;
  if tg_op = 'UPDATE' then
    select periodo_id into v_per from public.movimientos where id = old.movimiento_id;
    perform public.exigir_periodo_abierto(v_per);
  end if;

  perform public.exigir_propietario('public.deudas', new.deuda_id, new.user_id, 'Deuda');
  perform public.exigir_propietario('public.cuentas', new.cuenta_origen_id, new.user_id, 'Cuenta');
  perform public.exigir_propietario('public.obligaciones_periodo', new.obligacion_periodo_id, new.user_id, 'Obligación');
  select tipo into v_tipo from public.cuentas where id = new.cuenta_origen_id;
  if v_tipo = 'tarjeta_credito' then
    raise exception 'La cuota de un préstamo no se paga con tarjeta de crédito';
  end if;
  select * into v_deuda from public.deudas where id = new.deuda_id;
  if new.a_aporte > 0 and v_deuda.cuenta_aportes_id is null then
    raise exception 'Esta deuda no tiene cuenta de aportes: el aporte debe ser 0';
  end if;
  new.nota := nullif(trim(new.nota), '');

  select id into v_categoria from public.categorias
  where user_id = new.user_id and tipo = 'gasto' and padre_id is null
    and nombre = case when v_deuda.tipo = 'cooperativa' then 'Cooperativas' else 'Préstamos' end
  limit 1;
  -- Un pago que va todo a capital es un abono extra.
  v_descripcion := case when new.a_intereses + new.a_seguros + new.a_aporte = 0
                        then 'Abono a capital ' else 'Cuota ' end || v_deuda.nombre;

  -- Salida de caja de la cuota (capital + intereses + seguros).
  if new.movimiento_id is null then
    insert into public.movimientos
      (user_id, fecha, tipo, monto, cuenta_id, categoria_id, obligacion_periodo_id, descripcion)
    values
      (new.user_id, new.fecha, 'pago_deuda', new.monto - new.a_aporte, new.cuenta_origen_id, v_categoria,
       new.obligacion_periodo_id, v_descripcion)
    returning id into v_mov;
    new.movimiento_id := v_mov;
  else
    update public.movimientos
    set fecha = new.fecha, monto = new.monto - new.a_aporte, cuenta_id = new.cuenta_origen_id,
        obligacion_periodo_id = new.obligacion_periodo_id, descripcion = v_descripcion
    where id = new.movimiento_id
      and (fecha, monto, cuenta_id, obligacion_periodo_id, descripcion)
          is distinct from (new.fecha, new.monto - new.a_aporte, new.cuenta_origen_id, new.obligacion_periodo_id,
                            v_descripcion);
  end if;

  -- Aporte (cooperativa): pasa de tu cuenta a la cuenta de aportes; es ahorro, no gasto.
  if new.a_aporte > 0 then
    if new.movimiento_aporte_id is null then
      insert into public.movimientos
        (user_id, fecha, tipo, monto, cuenta_id, cuenta_destino_id, obligacion_periodo_id, descripcion)
      values
        (new.user_id, new.fecha, 'aporte', new.a_aporte, new.cuenta_origen_id, v_deuda.cuenta_aportes_id,
         new.obligacion_periodo_id, 'Aporte ' || v_deuda.nombre)
      returning id into v_mov;
      new.movimiento_aporte_id := v_mov;
    else
      update public.movimientos
      set fecha = new.fecha, monto = new.a_aporte, cuenta_id = new.cuenta_origen_id,
          cuenta_destino_id = v_deuda.cuenta_aportes_id, obligacion_periodo_id = new.obligacion_periodo_id
      where id = new.movimiento_aporte_id
        and (fecha, monto, cuenta_id, cuenta_destino_id, obligacion_periodo_id)
            is distinct from (new.fecha, new.a_aporte, new.cuenta_origen_id, v_deuda.cuenta_aportes_id,
                              new.obligacion_periodo_id);
    end if;
  else
    -- El movimiento del aporte se borra en el trigger AFTER (borrarlo aquí chocaría con la FK).
    new.movimiento_aporte_id := null;
  end if;
  return new;
end;
$$;

create trigger pagos_deuda_10_sincronizar
  before insert or update or delete on public.pagos_deuda
  for each row execute function public.sincronizar_pago_deuda();

create or replace function public.borrar_movimientos_pago_deuda()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    delete from public.movimientos where id in (old.movimiento_id, old.movimiento_aporte_id);
  elsif old.movimiento_aporte_id is not null and new.movimiento_aporte_id is null then
    delete from public.movimientos where id = old.movimiento_aporte_id;
  end if;
  return null;
end;
$$;

create trigger pagos_deuda_20_borrar_movimientos
  after update or delete on public.pagos_deuda
  for each row execute function public.borrar_movimientos_pago_deuda();

-- ---------------------------------------------------------------------
-- prestamos_otorgados (cuentas por cobrar)
-- ---------------------------------------------------------------------
create table public.prestamos_otorgados (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null default auth.uid() references auth.users (id) on delete cascade,
  deudor            text not null check (length(trim(deudor)) between 1 and 80),
  monto             numeric(14,2) not null check (monto > 0),
  fecha             date not null,
  fecha_esperada    date,
  cuenta_origen_id  uuid not null references public.cuentas (id),
  movimiento_id     uuid unique references public.movimientos (id) on delete cascade,
  castigado_en      date,
  motivo_castigo    text check (motivo_castigo is null or length(motivo_castigo) <= 200),
  notas             text check (notas is null or length(notas) <= 300),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  check (fecha_esperada is null or fecha_esperada >= fecha),
  check (castigado_en is null or length(trim(coalesce(motivo_castigo, ''))) > 0)
);

create index prestamos_otorgados_user_idx on public.prestamos_otorgados (user_id, fecha desc);

create trigger prestamos_otorgados_updated_at
  before update on public.prestamos_otorgados
  for each row execute function public.set_updated_at();

create or replace function public.sincronizar_prestamo_otorgado()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_tipo public.tipo_cuenta;
  v_per uuid;
  v_mov uuid;
begin
  if tg_op = 'DELETE' then
    if pg_trigger_depth() <= 1 then
      select periodo_id into v_per from public.movimientos where id = old.movimiento_id;
      perform public.exigir_periodo_abierto(v_per);
    end if;
    return old;
  end if;

  perform public.exigir_propietario('public.cuentas', new.cuenta_origen_id, new.user_id, 'Cuenta');
  select tipo into v_tipo from public.cuentas where id = new.cuenta_origen_id;
  if v_tipo = 'tarjeta_credito' then
    raise exception 'Para prestar con la tarjeta registra un avance en el módulo de tarjetas';
  end if;
  new.deudor := trim(new.deudor);
  new.notas := nullif(trim(new.notas), '');
  new.motivo_castigo := nullif(trim(new.motivo_castigo), '');
  if new.castigado_en is null then
    new.motivo_castigo := null;
  end if;

  if new.movimiento_id is null then
    insert into public.movimientos (user_id, fecha, tipo, monto, cuenta_id, descripcion)
    values (new.user_id, new.fecha, 'prestamo_otorgado', new.monto, new.cuenta_origen_id, 'Préstamo a ' || new.deudor)
    returning id into v_mov;
    new.movimiento_id := v_mov;
  elsif (old.fecha, old.monto, old.cuenta_origen_id, old.deudor)
        is distinct from (new.fecha, new.monto, new.cuenta_origen_id, new.deudor) then
    update public.movimientos
    set fecha = new.fecha, monto = new.monto, cuenta_id = new.cuenta_origen_id, descripcion = 'Préstamo a ' || new.deudor
    where id = new.movimiento_id;
  end if;
  return new;
end;
$$;

create trigger prestamos_otorgados_10_sincronizar
  before insert or update or delete on public.prestamos_otorgados
  for each row execute function public.sincronizar_prestamo_otorgado();

create or replace function public.borrar_movimiento_prestamo()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.movimiento_id is not null then
    delete from public.movimientos where id = old.movimiento_id;
  end if;
  return old;
end;
$$;

create trigger prestamos_otorgados_20_borrar_movimiento
  after delete on public.prestamos_otorgados
  for each row execute function public.borrar_movimiento_prestamo();

-- Abonos del deudor: movimientos `recuperacion_prestamo` ligados al préstamo.
-- (sin acción en cascada: no se puede borrar un préstamo que ya tiene abonos).
alter table public.movimientos
  add column prestamo_otorgado_id uuid references public.prestamos_otorgados (id);
create index movimientos_prestamo_idx on public.movimientos (prestamo_otorgado_id);

-- ---------------------------------------------------------------------
-- Reembolsos Devtopia
-- ---------------------------------------------------------------------
alter table public.movimientos
  add column reembolsado_por_id uuid references public.movimientos (id) on delete set null;
alter table public.compras_tc
  add column reembolsado_por_id uuid references public.movimientos (id) on delete set null;
create index movimientos_reembolsado_idx on public.movimientos (reembolsado_por_id);
create index compras_tc_reembolsado_idx on public.compras_tc (reembolsado_por_id);

-- Marcar (o desmarcar) algo como reembolsado no cuenta como editar un mes cerrado.
create or replace function public.solo_cambia_reembolso(p_old jsonb, p_new jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select (p_old - 'reembolsado_por_id' - 'updated_at') = (p_new - 'reembolsado_por_id' - 'updated_at');
$$;

create or replace function public.movimiento_asignar_periodo()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' and pg_trigger_depth() > 1 then
    return old;
  end if;
  if tg_op = 'UPDATE' and public.solo_cambia_reembolso(to_jsonb(old), to_jsonb(new)) then
    return new;
  end if;
  if tg_op in ('UPDATE', 'DELETE') then
    perform public.exigir_periodo_abierto(old.periodo_id);
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  new.periodo_id := public.periodo_de(new.user_id, new.fecha);
  perform public.exigir_periodo_abierto(new.periodo_id);
  return new;
end;
$$;

create or replace function public.validar_compra_tc()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_cat public.categorias%rowtype;
  v_tipo public.tipo_cuenta;
begin
  if tg_op = 'DELETE' and pg_trigger_depth() > 1 then
    return old;
  end if;
  if tg_op = 'UPDATE' and public.solo_cambia_reembolso(to_jsonb(old), to_jsonb(new)) then
    return new;
  end if;
  if tg_op in ('UPDATE', 'DELETE') then
    perform public.exigir_periodo_abierto(old.periodo_id);
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;

  new.periodo_id := public.periodo_de(new.user_id, new.fecha);
  perform public.exigir_periodo_abierto(new.periodo_id);
  perform public.exigir_propietario('public.tarjetas_credito', new.tarjeta_id, new.user_id, 'Tarjeta');
  perform public.exigir_propietario('public.categorias', new.categoria_id, new.user_id, 'Categoría');
  perform public.exigir_propietario('public.cuentas', new.cuenta_destino_id, new.user_id, 'Cuenta destino');

  new.descripcion := nullif(trim(new.descripcion), '');
  new.comercio := nullif(trim(new.comercio), '');

  if new.tipo in ('compra', 'devolucion') then
    if new.categoria_id is null then
      raise exception 'Elige la categoría de la compra';
    end if;
    select * into v_cat from public.categorias where id = new.categoria_id;
    if v_cat.tipo <> 'gasto' then
      raise exception 'La categoría "%" no es de gasto', v_cat.nombre;
    end if;
    if v_cat.requiere_descripcion and new.descripcion is null then
      raise exception 'La categoría "%" requiere una descripción', v_cat.nombre;
    end if;
    new.cuenta_destino_id := null;
  else
    new.categoria_id := null;
    new.reembolsable := false;
  end if;

  if new.tipo = 'avance' and new.cuenta_destino_id is not null then
    select tipo into v_tipo from public.cuentas where id = new.cuenta_destino_id;
    if v_tipo = 'tarjeta_credito' then
      raise exception 'El avance debe llegar a una cuenta que no sea tarjeta de crédito';
    end if;
  elsif new.tipo <> 'avance' then
    new.cuenta_destino_id := null;
  end if;

  if new.tipo in ('devolucion', 'ajuste') then
    new.num_cuotas := 1;
  end if;
  if new.tipo = 'ajuste' and new.descripcion is null then
    raise exception 'Describe el motivo del ajuste';
  end if;
  if new.moneda = 'COP' then
    new.monto_origen := null;
    new.trm := null;
  end if;
  if not new.reembolsable or new.tipo <> 'compra' then
    new.reembolsado_por_id := null;
  end if;
  perform public.exigir_reembolso(new.reembolsado_por_id, new.user_id);
  return new;
end;
$$;

-- El reembolso que marca un gasto debe ser un movimiento `reembolso_devtopia` del mismo usuario.
create or replace function public.exigir_reembolso(p_mov uuid, p_user uuid)
returns void
language plpgsql
stable
set search_path = ''
as $$
declare
  v_tipo public.tipo_movimiento;
begin
  if p_mov is null then
    return;
  end if;
  perform public.exigir_propietario('public.movimientos', p_mov, p_user, 'Reembolso');
  select tipo into v_tipo from public.movimientos where id = p_mov;
  if v_tipo <> 'reembolso_devtopia' then
    raise exception 'El reembolso debe ser un movimiento de reembolso de Devtopia';
  end if;
end;
$$;

-- ---------------------------------------------------------------------
-- Movimientos: todos los tipos del modelo quedan habilitados
-- ---------------------------------------------------------------------
create or replace function public.validar_movimiento()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_cat public.categorias%rowtype;
  v_tipo_cuenta public.tipo_cuenta;
  v_tipo_destino public.tipo_cuenta;
  v_op public.obligaciones_periodo%rowtype;
begin
  perform public.exigir_propietario('public.cuentas', new.cuenta_id, new.user_id, 'Cuenta');
  perform public.exigir_propietario('public.cuentas', new.cuenta_destino_id, new.user_id, 'Cuenta destino');
  perform public.exigir_propietario('public.categorias', new.categoria_id, new.user_id, 'Categoría');
  perform public.exigir_propietario('public.obligaciones_periodo', new.obligacion_periodo_id, new.user_id, 'Obligación');
  perform public.exigir_propietario('public.prestamos_otorgados', new.prestamo_otorgado_id, new.user_id, 'Préstamo');
  perform public.exigir_reembolso(new.reembolsado_por_id, new.user_id);

  new.descripcion := nullif(trim(new.descripcion), '');
  new.comercio := nullif(trim(new.comercio), '');
  if new.tipo <> 'recuperacion_prestamo' then
    new.prestamo_otorgado_id := null;
  end if;
  if new.tipo <> 'gasto' or not new.reembolsable then
    new.reembolsado_por_id := null;
  end if;

  -- Tipos que solo nacen de su módulo (trigger de pagos_tc, pagos_deuda, deudas o prestamos_otorgados).
  if new.tipo in ('pago_tc', 'pago_deuda', 'aporte', 'desembolso_deuda', 'prestamo_otorgado') then
    if pg_trigger_depth() <= 1 then
      raise exception '%', case new.tipo
        when 'pago_tc' then 'Los pagos de tarjeta se registran desde el módulo de tarjetas'
        when 'prestamo_otorgado' then 'Los préstamos que haces se registran en Deudas → Me deben'
        else 'Las cuotas, aportes y desembolsos se registran desde Deudas' end;
    end if;
    new.reembolsable := false;
    if new.tipo = 'pago_tc' then
      select tipo into v_tipo_destino from public.cuentas where id = new.cuenta_destino_id;
      if v_tipo_destino is distinct from 'tarjeta_credito' then
        raise exception 'El pago debe ir a una tarjeta de crédito';
      end if;
    elsif new.tipo = 'aporte' then
      if new.cuenta_destino_id is null or new.cuenta_destino_id = new.cuenta_id then
        raise exception 'El aporte necesita una cuenta de aportes distinta a la de origen';
      end if;
    else
      new.cuenta_destino_id := null;
    end if;
    if new.obligacion_periodo_id is not null then
      select * into v_op from public.obligaciones_periodo where id = new.obligacion_periodo_id;
      if v_op.resolucion is not null
         and (tg_op = 'INSERT' or old.obligacion_periodo_id is distinct from new.obligacion_periodo_id) then
        new.obligacion_periodo_id := null;
      end if;
    end if;
    return new;
  end if;

  select tipo into v_tipo_cuenta from public.cuentas where id = new.cuenta_id;
  if v_tipo_cuenta = 'tarjeta_credito' then
    raise exception 'Las compras y pagos con tarjeta de crédito se registran en el módulo de tarjetas';
  end if;

  -- Abono de un préstamo que hiciste: recuperación, no ingreso operativo.
  if new.tipo = 'recuperacion_prestamo' then
    if new.prestamo_otorgado_id is null then
      raise exception 'Elige el préstamo al que corresponde el abono';
    end if;
    select id into new.categoria_id from public.categorias
    where user_id = new.user_id and tipo = 'ingreso' and grupo = 'Recuperación' and padre_id is null
    order by es_sistema desc, orden limit 1;
    new.cuenta_destino_id := null;
    new.obligacion_periodo_id := null;
    new.reembolsable := false;
    return new;
  end if;

  -- Reembolso de Devtopia: entra dinero y cancela gastos reembolsables (no es ingreso).
  if new.tipo = 'reembolso_devtopia' then
    new.categoria_id := null;
    new.cuenta_destino_id := null;
    new.obligacion_periodo_id := null;
    new.reembolsable := false;
    return new;
  end if;

  if new.tipo = 'transferencia' then
    if new.cuenta_destino_id is null or new.cuenta_destino_id = new.cuenta_id then
      raise exception 'Una transferencia necesita una cuenta destino distinta a la de origen';
    end if;
    select tipo into v_tipo_destino from public.cuentas where id = new.cuenta_destino_id;
    if v_tipo_destino = 'tarjeta_credito' then
      raise exception 'Los pagos a tarjetas de crédito se registran en el módulo de tarjetas';
    end if;
    if new.categoria_id is not null or new.obligacion_periodo_id is not null then
      raise exception 'Una transferencia no lleva categoría ni obligación';
    end if;
    new.reembolsable := false;
    return new;
  end if;

  -- ingreso / gasto
  new.cuenta_destino_id := null;
  if new.categoria_id is null then
    raise exception 'Elige una categoría';
  end if;
  select * into v_cat from public.categorias where id = new.categoria_id;
  if (new.tipo = 'ingreso') <> (v_cat.tipo = 'ingreso') then
    raise exception 'La categoría "%" no es de %', v_cat.nombre, case when new.tipo = 'ingreso' then 'ingreso' else 'gasto' end;
  end if;
  if v_cat.requiere_descripcion and new.descripcion is null then
    raise exception 'La categoría "%" requiere una descripción', v_cat.nombre;
  end if;
  if new.tipo = 'ingreso' then
    new.reembolsable := false;
  end if;

  if new.obligacion_periodo_id is not null then
    select * into v_op from public.obligaciones_periodo where id = new.obligacion_periodo_id;
    if v_op.tipo = 'tarjeta' then
      raise exception 'El pago de la tarjeta se registra desde el módulo de tarjetas';
    end if;
    if v_op.es_ingreso <> (new.tipo = 'ingreso') then
      raise exception 'Este movimiento no corresponde al tipo de la obligación "%"', v_op.nombre;
    end if;
    if v_op.resolucion is not null
       and (tg_op = 'INSERT' or old.obligacion_periodo_id is distinct from new.obligacion_periodo_id) then
      raise exception 'La obligación "%" está %; regístralo en el mes al que se pasó', v_op.nombre, v_op.resolucion;
    end if;
  end if;

  return new;
end;
$$;

-- Los movimientos creados por un módulo solo se modifican desde ese módulo.
create or replace function public.proteger_movimiento_pago_tc()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.tipo in ('pago_tc', 'pago_deuda', 'aporte', 'desembolso_deuda', 'prestamo_otorgado')
     and pg_trigger_depth() <= 1 and tg_op = 'UPDATE'
     and (old.fecha, old.monto, old.cuenta_id, old.cuenta_destino_id, old.tipo)
         is distinct from (new.fecha, new.monto, new.cuenta_id, new.cuenta_destino_id, new.tipo) then
    raise exception '%', case old.tipo
      when 'pago_tc' then 'Edita este pago desde el módulo de tarjetas'
      else 'Edita este movimiento desde Deudas' end;
  end if;
  if old.tipo <> new.tipo and pg_trigger_depth() <= 1 then
    raise exception 'No se puede cambiar el tipo de un movimiento';
  end if;
  return new;
end;
$$;

-- Registra un reembolso de Devtopia y marca los gastos y compras que cubre.
create or replace function public.registrar_reembolso(
  p_cuenta uuid,
  p_fecha date,
  p_monto numeric,
  p_movimientos uuid[] default '{}',
  p_compras uuid[] default '{}',
  p_descripcion text default null
)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_id uuid;
  v_n int;
begin
  if coalesce(array_length(p_movimientos, 1), 0) + coalesce(array_length(p_compras, 1), 0) = 0 then
    raise exception 'Elige al menos un gasto reembolsado';
  end if;
  insert into public.movimientos (fecha, tipo, monto, cuenta_id, descripcion)
  values (p_fecha, 'reembolso_devtopia', p_monto, p_cuenta, coalesce(nullif(trim(p_descripcion), ''), 'Reembolso Devtopia'))
  returning id into v_id;

  update public.movimientos set reembolsado_por_id = v_id
  where id = any(p_movimientos) and tipo = 'gasto' and reembolsable and reembolsado_por_id is null;
  get diagnostics v_n = row_count;
  if v_n <> coalesce(array_length(p_movimientos, 1), 0) then
    raise exception 'Algún gasto ya no está pendiente de reembolso';
  end if;

  update public.compras_tc set reembolsado_por_id = v_id
  where id = any(p_compras) and tipo = 'compra' and reembolsable and reembolsado_por_id is null;
  get diagnostics v_n = row_count;
  if v_n <> coalesce(array_length(p_compras, 1), 0) then
    raise exception 'Alguna compra ya no está pendiente de reembolso';
  end if;
  return v_id;
end;
$$;

revoke all on function public.registrar_reembolso(uuid, date, numeric, uuid[], uuid[], text) from public, anon;
grant execute on function public.registrar_reembolso(uuid, date, numeric, uuid[], uuid[], text) to authenticated;

-- ---------------------------------------------------------------------
-- RLS y permisos
-- ---------------------------------------------------------------------
alter table public.deudas              enable row level security;
alter table public.pagos_deuda         enable row level security;
alter table public.prestamos_otorgados enable row level security;

create policy propietario on public.deudas for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy propietario on public.pagos_deuda for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy propietario on public.prestamos_otorgados for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

revoke all on public.deudas, public.pagos_deuda, public.prestamos_otorgados from anon;
grant select, insert, update, delete on public.deudas, public.pagos_deuda, public.prestamos_otorgados to authenticated;

-- ---------------------------------------------------------------------
-- Vistas
-- ---------------------------------------------------------------------

-- Estado de cada deuda: saldo de capital, lo pagado desglosado y la cuota total del mes.
create view public.v_estado_deudas with (security_invoker = true) as
select
  d.id, d.user_id, d.nombre, d.acreedor, d.tipo, d.monto_original, d.fecha_desembolso, d.tasa_ea, d.plazo_meses,
  d.cuota, d.seguro_mensual, d.aporte_mensual, d.cuenta_aportes_id, d.dia_pago, d.cuenta_pago_default_id,
  d.saldo_inicial, d.fecha_saldo_inicial, d.cuenta_desembolso_id, d.activa, d.notas, d.created_at,
  (d.cuota + d.seguro_mensual + d.aporte_mensual)::numeric(14,2) as cuota_total,
  greatest(d.saldo_inicial - coalesce(pg.capital, 0), 0)::numeric(14,2) as saldo_capital,
  coalesce(pg.capital, 0)::numeric(14,2) as pagado_capital,
  coalesce(pg.intereses, 0)::numeric(14,2) as pagado_intereses,
  coalesce(pg.seguros, 0)::numeric(14,2) as pagado_seguros,
  coalesce(pg.aportes, 0)::numeric(14,2) as pagado_aportes,
  coalesce(pg.intereses_anio, 0)::numeric(14,2) as intereses_anio,
  coalesce(pg.total, 0)::numeric(14,2) as pagado_total,
  coalesce(pg.n, 0)::int as n_pagos,
  pg.ultimo_pago,
  o.id as obligacion_id,
  ca.nombre as cuenta_aportes_nombre,
  cp.nombre as cuenta_pago_nombre
from public.deudas d
left join lateral (
  select
    sum(p.a_capital) as capital, sum(p.a_intereses) as intereses, sum(p.a_seguros) as seguros,
    sum(p.a_aporte) as aportes, sum(p.monto) as total, count(*) as n, max(p.fecha) as ultimo_pago,
    sum(p.a_intereses + p.a_seguros) filter (
      where date_trunc('year', p.fecha) = date_trunc('year', now() at time zone 'America/Bogota')) as intereses_anio
  from public.pagos_deuda p where p.deuda_id = d.id
) pg on true
left join public.obligaciones o on o.deuda_id = d.id
left join public.cuentas ca on ca.id = d.cuenta_aportes_id
left join public.cuentas cp on cp.id = d.cuenta_pago_default_id;

-- Préstamos que hiciste: abonado, saldo y estado (vencido se calcula en TS con la fecha de hoy).
create view public.v_prestamos_otorgados with (security_invoker = true) as
select
  p.id, p.user_id, p.deudor, p.monto, p.fecha, p.fecha_esperada, p.cuenta_origen_id, p.movimiento_id,
  p.castigado_en, p.motivo_castigo, p.notas, p.created_at,
  cu.nombre as cuenta_origen_nombre,
  coalesce(a.abonado, 0)::numeric(14,2) as abonado,
  greatest(p.monto - coalesce(a.abonado, 0), 0)::numeric(14,2) as saldo,
  coalesce(a.n, 0)::int as n_abonos,
  a.ultimo_abono,
  case
    when coalesce(a.abonado, 0) >= p.monto then 'pagado'
    when p.castigado_en is not null then 'castigado'
    else 'vigente'
  end as estado,
  pe.estado as estado_periodo
from public.prestamos_otorgados p
join public.cuentas cu on cu.id = p.cuenta_origen_id
left join public.movimientos m on m.id = p.movimiento_id
left join public.periodos pe on pe.id = m.periodo_id
left join lateral (
  select sum(r.monto) as abonado, count(*) as n, max(r.fecha) as ultimo_abono
  from public.movimientos r
  where r.prestamo_otorgado_id = p.id and r.tipo = 'recuperacion_prestamo'
) a on true;

-- Gastos y compras con tarjeta reembolsables por Devtopia que aún no se han cobrado.
create view public.v_reembolsos_pendientes with (security_invoker = true) as
select
  'movimiento'::text as origen, m.id, m.user_id, m.fecha, m.monto,
  coalesce(m.descripcion, m.comercio, c.nombre) as descripcion,
  c.nombre as categoria_nombre, cu.nombre as medio, p.estado as estado_periodo, m.created_at
from public.movimientos m
join public.cuentas cu on cu.id = m.cuenta_id
join public.periodos p on p.id = m.periodo_id
left join public.categorias c on c.id = m.categoria_id
where m.tipo = 'gasto' and m.reembolsable and m.reembolsado_por_id is null
union all
select
  'compra_tc', k.id, k.user_id, k.fecha, k.monto,
  coalesce(k.descripcion, k.comercio, c.nombre),
  c.nombre, cu.nombre, p.estado, k.created_at
from public.compras_tc k
join public.tarjetas_credito t on t.id = k.tarjeta_id
join public.cuentas cu on cu.id = t.cuenta_id
join public.periodos p on p.id = k.periodo_id
left join public.categorias c on c.id = k.categoria_id
where k.tipo = 'compra' and k.reembolsable and k.reembolsado_por_id is null;

-- Reembolsos recibidos con lo que cubrieron.
create view public.v_reembolsos with (security_invoker = true) as
select
  r.id, r.user_id, r.fecha, r.monto, r.descripcion, r.cuenta_id, cu.nombre as cuenta_nombre,
  p.estado as estado_periodo, r.created_at,
  (coalesce(g.n, 0) + coalesce(k.n, 0))::int as n_items,
  (coalesce(g.total, 0) + coalesce(k.total, 0))::numeric(14,2) as total_items
from public.movimientos r
join public.cuentas cu on cu.id = r.cuenta_id
join public.periodos p on p.id = r.periodo_id
left join lateral (select count(*) as n, sum(monto) as total from public.movimientos x where x.reembolsado_por_id = r.id) g on true
left join lateral (select count(*) as n, sum(monto) as total from public.compras_tc x where x.reembolsado_por_id = r.id) k on true
where r.tipo = 'reembolso_devtopia';

-- Movimientos: se agregan al final el préstamo, la deuda y el reembolso relacionados.
create or replace view public.v_movimientos with (security_invoker = true) as
select
  m.id, m.user_id, m.periodo_id, m.fecha, m.tipo, m.monto, m.cuenta_id, m.cuenta_destino_id,
  m.categoria_id, m.obligacion_periodo_id, m.descripcion, m.comercio, m.reembolsable, m.etiquetas,
  m.created_at, m.updated_at,
  p.mes, p.estado as estado_periodo,
  cu.nombre as cuenta_nombre, cd.nombre as cuenta_destino_nombre,
  c.nombre as categoria_nombre, c.icono as categoria_icono, c.color as categoria_color,
  c.padre_id as categoria_padre_id, cp.nombre as categoria_padre_nombre,
  op.nombre as obligacion_nombre,
  (c.grupo = 'Recuperación' or m.tipo = 'recuperacion_prestamo') as es_recuperacion,
  m.prestamo_otorgado_id,
  m.reembolsado_por_id,
  coalesce(pd.deuda_id, dd.id) as deuda_id,
  coalesce(po.id, m.prestamo_otorgado_id) as prestamo_id
from public.movimientos m
join public.periodos p on p.id = m.periodo_id
join public.cuentas cu on cu.id = m.cuenta_id
left join public.cuentas cd on cd.id = m.cuenta_destino_id
left join public.categorias c on c.id = m.categoria_id
left join public.categorias cp on cp.id = c.padre_id
left join public.obligaciones_periodo op on op.id = m.obligacion_periodo_id
left join public.pagos_deuda pd on pd.movimiento_id = m.id or pd.movimiento_aporte_id = m.id
left join public.deudas dd on dd.movimiento_desembolso_id = m.id
left join public.prestamos_otorgados po on po.movimiento_id = m.id;

-- Compras con tarjeta: se agrega al final el reembolso de Devtopia que las cubrió.
create or replace view public.v_compras_tc with (security_invoker = true) as
select
  c.id, c.user_id, c.tarjeta_id, c.periodo_id, c.fecha, c.tipo, c.descripcion, c.comercio, c.categoria_id,
  c.cuenta_destino_id, c.monto, c.num_cuotas, c.moneda, c.monto_origen, c.trm, c.reembolsable, c.created_at,
  p.mes, p.estado as estado_periodo,
  cu.nombre as tarjeta_nombre, t.dia_corte,
  cat.nombre as categoria_nombre, cat.padre_id as categoria_padre_id, cp.nombre as categoria_padre_nombre,
  cd.nombre as cuenta_destino_nombre,
  public.corte_de_compra(c.fecha, t.dia_corte) as primer_corte,
  c.reembolsado_por_id
from public.compras_tc c
join public.tarjetas_credito t on t.id = c.tarjeta_id
join public.cuentas cu on cu.id = t.cuenta_id
join public.periodos p on p.id = c.periodo_id
left join public.categorias cat on cat.id = c.categoria_id
left join public.categorias cp on cp.id = cat.padre_id
left join public.cuentas cd on cd.id = c.cuenta_destino_id;

-- Obligaciones del mes: se agrega la deuda de la plantilla al final.
create or replace view public.v_obligaciones_mes with (security_invoker = true) as
select
  op.id, op.user_id, op.periodo_id, op.obligacion_id, op.nombre, op.tipo, op.es_ingreso,
  op.categoria_id, op.cuenta_default_id, op.monto_esperado, op.fecha_vencimiento,
  op.resolucion, op.motivo, op.arrastrada_de_id, op.nota, op.created_at,
  p.mes, p.estado as estado_periodo,
  c.nombre as categoria_nombre, c.icono as categoria_icono, c.color as categoria_color,
  cu.nombre as cuenta_default_nombre,
  o.es_variable, o.referencia_pago, o.frecuencia,
  coalesce(pg.pagado, 0)::numeric(14,2) as pagado,
  coalesce(pg.n_pagos, 0)::int as n_pagos,
  pg.ultimo_pago,
  (coalesce(pg.pagado, 0) > 0 and coalesce(pg.pagado, 0) >= op.monto_esperado) as pagada,
  case
    when op.resolucion is not null then 0
    else greatest(op.monto_esperado - coalesce(pg.pagado, 0), 0)
  end::numeric(14,2) as pendiente,
  op.extracto_id,
  x.tarjeta_id,
  x.pago_total_banco as pago_total_tc,
  x.pago_minimo_banco as pago_minimo_tc,
  coalesce(o.deuda_id, oa.deuda_id) as deuda_id
from public.obligaciones_periodo op
join public.periodos p on p.id = op.periodo_id
join public.categorias c on c.id = op.categoria_id
left join public.cuentas cu on cu.id = op.cuenta_default_id
left join public.obligaciones o on o.id = op.obligacion_id
left join public.extractos_tc x on x.id = op.extracto_id
-- Una obligación arrastrada al mes siguiente conserva la deuda de su origen.
left join public.obligaciones_periodo opa on opa.id = op.arrastrada_de_id
left join public.obligaciones oa on oa.id = opa.obligacion_id
left join lateral (
  select sum(m.monto) as pagado, count(*) as n_pagos, max(m.fecha) as ultimo_pago
  from public.movimientos m
  where m.obligacion_periodo_id = op.id
) pg on true;

-- Resumen del mes: los intereses y seguros de préstamos son gasto; capital, aportes,
-- préstamos otorgados y desembolsos no. Se agregan columnas al final.
create or replace view public.v_resumen_periodo with (security_invoker = true) as
select
  p.id as periodo_id, p.user_id, p.mes, p.estado, p.cerrado_en,
  coalesce(mv.ingresos, 0)::numeric(14,2)        as ingresos,
  coalesce(mv.recuperaciones, 0)::numeric(14,2)  as recuperaciones,
  (coalesce(mv.gastos, 0) + coalesce(tc.compras, 0) + coalesce(tc.costos, 0) + coalesce(dx.costos, 0))::numeric(14,2) as gastos,
  coalesce(mv.salidas_caja, 0)::numeric(14,2)    as salidas_caja,
  (coalesce(mv.reembolsables, 0) + coalesce(tc.reembolsables, 0))::numeric(14,2) as gastos_reembolsables,
  coalesce(mv.n_movimientos, 0)::int             as n_movimientos,
  coalesce(ob.total, 0)::int                     as obligaciones_total,
  coalesce(ob.pagadas, 0)::int                   as obligaciones_pagadas,
  coalesce(ob.pendientes, 0)::int                as obligaciones_pendientes,
  coalesce(ob.omitidas, 0)::int                  as obligaciones_omitidas,
  coalesce(ob.arrastradas, 0)::int               as obligaciones_arrastradas,
  coalesce(ob.monto_esperado, 0)::numeric(14,2)  as monto_obligaciones,
  coalesce(ob.monto_pagado, 0)::numeric(14,2)    as monto_pagado_obligaciones,
  coalesce(ob.monto_pendiente, 0)::numeric(14,2) as monto_pendiente_obligaciones,
  coalesce(ie.esperado, 0)::numeric(14,2)        as ingresos_esperados,
  coalesce(ie.recibido, 0)::numeric(14,2)        as ingresos_esperados_recibidos,
  coalesce(ie.pendiente, 0)::numeric(14,2)       as ingresos_esperados_pendientes,
  coalesce(tc.compras, 0)::numeric(14,2)         as gastos_tc,
  coalesce(tc.costos, 0)::numeric(14,2)          as costos_financieros_tc,
  coalesce(mv.pagos_tc, 0)::numeric(14,2)        as pagos_tc,
  coalesce(mv.gastos, 0)::numeric(14,2)          as gastos_cuentas,
  coalesce(dx.costos, 0)::numeric(14,2)          as costos_financieros_deudas,
  coalesce(dx.capital, 0)::numeric(14,2)         as abonos_capital_deudas,
  coalesce(mv.pagos_deuda, 0)::numeric(14,2)     as pagos_deuda,
  coalesce(mv.aportes, 0)::numeric(14,2)         as aportes,
  coalesce(mv.prestamos, 0)::numeric(14,2)       as prestamos_otorgados,
  coalesce(mv.desembolsos, 0)::numeric(14,2)     as desembolsos,
  coalesce(mv.reembolsos, 0)::numeric(14,2)      as reembolsos
from public.periodos p
left join lateral (
  select
    sum(m.monto) filter (where m.tipo = 'ingreso' and not coalesce(c.grupo = 'Recuperación', false)) as ingresos,
    sum(m.monto) filter (where m.tipo in ('ingreso', 'recuperacion_prestamo') and coalesce(c.grupo = 'Recuperación', false)
                            or m.tipo = 'recuperacion_prestamo') as recuperaciones,
    sum(m.monto) filter (where m.tipo = 'gasto') as gastos,
    sum(m.monto) filter (where m.tipo in ('gasto', 'pago_tc', 'pago_deuda', 'aporte', 'prestamo_otorgado')) as salidas_caja,
    sum(m.monto) filter (where m.tipo = 'gasto' and m.reembolsable) as reembolsables,
    sum(m.monto) filter (where m.tipo = 'pago_tc') as pagos_tc,
    sum(m.monto) filter (where m.tipo = 'pago_deuda') as pagos_deuda,
    sum(m.monto) filter (where m.tipo = 'aporte') as aportes,
    sum(m.monto) filter (where m.tipo = 'prestamo_otorgado') as prestamos,
    sum(m.monto) filter (where m.tipo = 'desembolso_deuda') as desembolsos,
    sum(m.monto) filter (where m.tipo = 'reembolso_devtopia') as reembolsos,
    count(*) as n_movimientos
  from public.movimientos m
  left join public.categorias c on c.id = m.categoria_id
  where m.periodo_id = p.id
) mv on true
left join lateral (
  select
    (select sum(case c.tipo when 'devolucion' then -c.monto else c.monto end)
       from public.compras_tc c where c.periodo_id = p.id and c.tipo in ('compra', 'devolucion')) as compras,
    (select sum(case c.tipo when 'devolucion' then -c.monto else c.monto end)
       from public.compras_tc c where c.periodo_id = p.id and c.tipo in ('compra', 'devolucion') and c.reembolsable) as reembolsables,
    (select sum(greatest(x.otros_generados, 0)) from public.extractos_tc x where x.periodo_id = p.id) as costos
) tc on true
left join lateral (
  select sum(pd.a_intereses + pd.a_seguros) as costos, sum(pd.a_capital) as capital
  from public.pagos_deuda pd
  join public.movimientos m on m.id = pd.movimiento_id
  where m.periodo_id = p.id
) dx on true
left join lateral (
  select
    count(*) filter (where resolucion is distinct from 'arrastrada') as total,
    count(*) filter (where pagada) as pagadas,
    count(*) filter (where resolucion is null and not pagada) as pendientes,
    count(*) filter (where resolucion = 'omitida') as omitidas,
    count(*) filter (where resolucion = 'arrastrada') as arrastradas,
    sum(monto_esperado) filter (where resolucion is null) as monto_esperado,
    sum(pagado) as monto_pagado,
    sum(pendiente) as monto_pendiente
  from public.v_obligaciones_mes v
  where v.periodo_id = p.id and not v.es_ingreso
) ob on true
left join lateral (
  select
    sum(monto_esperado) filter (where resolucion is null) as esperado,
    sum(pagado) as recibido,
    sum(pendiente) as pendiente
  from public.v_obligaciones_mes v
  where v.periodo_id = p.id and v.es_ingreso
) ie on true;

-- Gasto por categoría: se suman intereses y seguros de préstamos en "Intereses de préstamos".
create or replace view public.v_gasto_categoria_mes with (security_invoker = true) as
with gastos as (
  select m.user_id, m.periodo_id, m.categoria_id, m.monto
  from public.movimientos m where m.tipo = 'gasto'
  union all
  select c.user_id, c.periodo_id, c.categoria_id, case c.tipo when 'devolucion' then -c.monto else c.monto end
  from public.compras_tc c where c.tipo in ('compra', 'devolucion')
  union all
  select x.user_id, x.periodo_id, cat.id, x.otros_generados
  from public.extractos_tc x
  join public.categorias cat on cat.user_id = x.user_id and cat.es_sistema and cat.nombre = 'Costos financieros TC'
  where x.otros_generados > 0
  union all
  select pd.user_id, m.periodo_id, cat.id, pd.a_intereses + pd.a_seguros
  from public.pagos_deuda pd
  join public.movimientos m on m.id = pd.movimiento_id
  join public.categorias cat on cat.user_id = pd.user_id and cat.es_sistema and cat.nombre = 'Intereses de préstamos'
  where pd.a_intereses + pd.a_seguros > 0
)
select
  g.user_id, g.periodo_id, p.mes,
  c.id as categoria_id, c.nombre as categoria_nombre, c.color, c.icono, c.bolsa, c.es_fija,
  cp.id as padre_id, cp.nombre as padre_nombre, coalesce(cp.grupo, c.grupo) as grupo,
  sum(g.monto)::numeric(14,2) as total,
  count(*)::int as n_movimientos
from gastos g
join public.periodos p on p.id = g.periodo_id
join public.categorias c on c.id = g.categoria_id
left join public.categorias cp on cp.id = c.padre_id
group by g.user_id, g.periodo_id, p.mes, c.id, cp.id;

revoke all on public.v_estado_deudas, public.v_prestamos_otorgados, public.v_reembolsos_pendientes,
  public.v_reembolsos from anon;
grant select on public.v_estado_deudas, public.v_prestamos_otorgados, public.v_reembolsos_pendientes,
  public.v_reembolsos to authenticated;
