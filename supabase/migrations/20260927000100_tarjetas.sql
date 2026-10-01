-- =====================================================================
-- Plata Clara · 0003 · Tarjetas de crédito (Fase 2)
-- Fuente de verdad de la lógica: docs/03-tarjetas-de-credito.md
-- Espejo en TypeScript: src/lib/domain/tarjetas.ts (prueba de contrato en tests/db).
--
-- Resumen:
--  · La app lleva solo CAPITAL (compras, avances, devoluciones, ajustes).
--  · Cada extracto deduce los otros cargos: pago_total_banco − saldo_sistema_al_corte.
--  · Cada pago se clasifica (total / mínimo / otro / inferior al mínimo) y se imputa
--    primero a otros cargos y luego a capital.
--  · `recalcular_tarjeta` rehace todo el libro cronológicamente tras cualquier cambio.
--  · Cada extracto crea la obligación del mes "Pago <tarjeta>" (monto = pago mínimo)
--    en el mes de su fecha límite; cada pago se refleja como movimiento de caja (pago_tc).
-- =====================================================================

create type public.tipo_compra_tc as enum ('compra', 'avance', 'devolucion', 'ajuste');
create type public.tipo_pago_tc as enum ('total', 'minimo', 'otro', 'inferior_minimo');
create type public.estado_extracto as enum ('pendiente', 'parcial', 'minimo_cubierto', 'pagado_total');

-- ---------------------------------------------------------------------
-- tarjetas_credito (cada tarjeta es también una cuenta tipo tarjeta_credito)
-- ---------------------------------------------------------------------
create table public.tarjetas_credito (
  id                      uuid primary key default gen_random_uuid(),
  user_id                 uuid not null default auth.uid() references auth.users (id) on delete cascade,
  cuenta_id               uuid not null unique references public.cuentas (id) on delete cascade,
  franquicia              text not null default 'visa' check (franquicia in ('visa', 'mastercard', 'amex', 'diners', 'otra')),
  ultimos4                text check (ultimos4 ~ '^[0-9]{4}$'),
  cupo                    numeric(14,2) not null default 0 check (cupo >= 0),
  dia_corte               smallint not null check (dia_corte between 1 and 31),
  dia_limite_pago         smallint not null check (dia_limite_pago between 1 and 31),
  tasa_ea_ref             numeric(7,4) check (tasa_ea_ref is null or tasa_ea_ref between 0 and 2),
  cuota_manejo_ref        numeric(14,2) check (cuota_manejo_ref is null or cuota_manejo_ref >= 0),
  cuenta_pago_default_id  uuid references public.cuentas (id) on delete set null,
  activa                  boolean not null default true,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

create trigger tarjetas_credito_updated_at
  before update on public.tarjetas_credito
  for each row execute function public.set_updated_at();

create or replace function public.validar_tarjeta()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_tipo public.tipo_cuenta;
begin
  perform public.exigir_propietario('public.cuentas', new.cuenta_id, new.user_id, 'Cuenta');
  perform public.exigir_propietario('public.cuentas', new.cuenta_pago_default_id, new.user_id, 'Cuenta de pago');
  select tipo into v_tipo from public.cuentas where id = new.cuenta_id;
  if v_tipo <> 'tarjeta_credito' then
    raise exception 'La cuenta de una tarjeta debe ser de tipo tarjeta de crédito';
  end if;
  if new.cuenta_pago_default_id is not null then
    select tipo into v_tipo from public.cuentas where id = new.cuenta_pago_default_id;
    if v_tipo = 'tarjeta_credito' then
      raise exception 'La tarjeta no se puede pagar con otra tarjeta de crédito';
    end if;
  end if;
  return new;
end;
$$;

create trigger tarjetas_credito_validar
  before insert or update on public.tarjetas_credito
  for each row execute function public.validar_tarjeta();

-- ---------------------------------------------------------------------
-- compras_tc
-- ---------------------------------------------------------------------
create table public.compras_tc (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null default auth.uid() references auth.users (id) on delete cascade,
  tarjeta_id         uuid not null references public.tarjetas_credito (id) on delete cascade,
  periodo_id         uuid not null references public.periodos (id) on delete cascade,
  fecha              date not null,
  tipo               public.tipo_compra_tc not null default 'compra',
  descripcion        text check (descripcion is null or length(descripcion) <= 200),
  comercio           text check (comercio is null or length(comercio) <= 80),
  categoria_id       uuid references public.categorias (id),
  cuenta_destino_id  uuid references public.cuentas (id),
  monto              numeric(14,2) not null check (monto <> 0),
  num_cuotas         smallint not null default 1 check (num_cuotas between 1 and 48),
  moneda             text not null default 'COP' check (moneda in ('COP', 'USD')),
  monto_origen       numeric(14,2),
  trm                numeric(10,2) check (trm is null or trm > 0),
  reembolsable       boolean not null default false,
  adjunto_path       text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  check (tipo = 'ajuste' or monto > 0)
);

create index compras_tc_tarjeta_idx on public.compras_tc (tarjeta_id, fecha);
create index compras_tc_periodo_idx on public.compras_tc (periodo_id);

create trigger compras_tc_updated_at
  before update on public.compras_tc
  for each row execute function public.set_updated_at();

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
  return new;
end;
$$;

create trigger compras_tc_10_validar
  before insert or update or delete on public.compras_tc
  for each row execute function public.validar_compra_tc();

-- ---------------------------------------------------------------------
-- extractos_tc
-- ---------------------------------------------------------------------
create table public.extractos_tc (
  id                       uuid primary key default gen_random_uuid(),
  user_id                  uuid not null default auth.uid() references auth.users (id) on delete cascade,
  tarjeta_id               uuid not null references public.tarjetas_credito (id) on delete cascade,
  periodo_id               uuid not null references public.periodos (id) on delete cascade,
  fecha_corte              date not null,
  fecha_limite_pago        date not null,
  pago_total_banco         numeric(14,2) not null check (pago_total_banco >= 0),
  pago_minimo_banco        numeric(14,2) not null check (pago_minimo_banco >= 0),
  intereses                numeric(14,2) check (intereses is null or intereses >= 0),
  cuota_manejo             numeric(14,2) check (cuota_manejo is null or cuota_manejo >= 0),
  seguros                  numeric(14,2) check (seguros is null or seguros >= 0),
  otros_declarados         numeric(14,2) check (otros_declarados is null or otros_declarados >= 0),
  -- Calculados por recalcular_tarjeta:
  saldo_sistema_al_corte   numeric(14,2),
  otros_generados          numeric(14,2),
  capital_facturado        numeric(14,2),
  minimo_estimado          numeric(14,2),
  diferencia_no_explicada  numeric(14,2),
  alerta                   text check (alerta in ('conciliacion_negativa', 'diferencia_no_explicada')),
  pagado                   numeric(14,2) not null default 0,
  estado                   public.estado_extracto not null default 'pendiente',
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  unique (tarjeta_id, fecha_corte),
  check (pago_minimo_banco <= pago_total_banco),
  check (fecha_limite_pago >= fecha_corte and fecha_limite_pago <= fecha_corte + 45)
);

create index extractos_tc_tarjeta_idx on public.extractos_tc (tarjeta_id, fecha_corte);

create trigger extractos_tc_updated_at
  before update on public.extractos_tc
  for each row execute function public.set_updated_at();

create or replace function public.validar_extracto_tc()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' and pg_trigger_depth() > 1 then
    return old;
  end if;
  -- Solo los datos del usuario disparan el bloqueo de mes cerrado; los campos calculados no.
  if tg_op = 'DELETE'
     or (tg_op = 'UPDATE' and (old.fecha_corte, old.fecha_limite_pago, old.pago_total_banco, old.pago_minimo_banco,
                               old.intereses, old.cuota_manejo, old.seguros, old.otros_declarados, old.tarjeta_id)
          is distinct from (new.fecha_corte, new.fecha_limite_pago, new.pago_total_banco, new.pago_minimo_banco,
                            new.intereses, new.cuota_manejo, new.seguros, new.otros_declarados, new.tarjeta_id)) then
    perform public.exigir_periodo_abierto(old.periodo_id);
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  if tg_op = 'INSERT' or old.fecha_corte is distinct from new.fecha_corte then
    new.periodo_id := public.periodo_de(new.user_id, new.fecha_corte);
    perform public.exigir_periodo_abierto(new.periodo_id);
  end if;
  perform public.exigir_propietario('public.tarjetas_credito', new.tarjeta_id, new.user_id, 'Tarjeta');
  return new;
end;
$$;

create trigger extractos_tc_10_validar
  before insert or update or delete on public.extractos_tc
  for each row execute function public.validar_extracto_tc();

-- La obligación del mes queda ligada a su extracto.
alter table public.obligaciones_periodo
  add column extracto_id uuid unique references public.extractos_tc (id) on delete cascade;

-- ---------------------------------------------------------------------
-- pagos_tc (cada pago crea/actualiza su movimiento de caja tipo pago_tc)
-- ---------------------------------------------------------------------
create table public.pagos_tc (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null default auth.uid() references auth.users (id) on delete cascade,
  tarjeta_id        uuid not null references public.tarjetas_credito (id) on delete cascade,
  movimiento_id     uuid unique references public.movimientos (id) on delete cascade,
  cuenta_origen_id  uuid not null references public.cuentas (id),
  fecha             date not null,
  monto             numeric(14,2) not null check (monto > 0),
  tipo_elegido      public.tipo_pago_tc not null default 'otro',
  -- Calculados por recalcular_tarjeta:
  extracto_id       uuid references public.extractos_tc (id) on delete set null,
  tipo_calculado    public.tipo_pago_tc,
  imputado_otros    numeric(14,2) not null default 0,
  imputado_capital  numeric(14,2) not null default 0,
  saldo_a_favor     numeric(14,2) not null default 0,
  nota              text check (nota is null or length(nota) <= 200),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index pagos_tc_tarjeta_idx on public.pagos_tc (tarjeta_id, fecha);

create trigger pagos_tc_updated_at
  before update on public.pagos_tc
  for each row execute function public.set_updated_at();

create or replace function public.sincronizar_pago_tc()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_tarjeta public.tarjetas_credito%rowtype;
  v_nombre text;
  v_categoria uuid;
  v_tipo public.tipo_cuenta;
  v_mov uuid;
  v_per uuid;
begin
  if tg_op = 'DELETE' then
    -- Un pago de un mes cerrado no se borra (salvo borrados en cascada).
    if pg_trigger_depth() <= 1 then
      select periodo_id into v_per from public.movimientos where id = old.movimiento_id;
      perform public.exigir_periodo_abierto(v_per);
    end if;
    return old;
  end if;
  if tg_op = 'UPDATE' and (old.fecha, old.monto, old.cuenta_origen_id, old.tarjeta_id, old.tipo_elegido, old.nota)
                          is not distinct from (new.fecha, new.monto, new.cuenta_origen_id, new.tarjeta_id, new.tipo_elegido, new.nota) then
    return new; -- solo cambian campos calculados
  end if;
  if tg_op = 'UPDATE' then
    select periodo_id into v_per from public.movimientos where id = old.movimiento_id;
    perform public.exigir_periodo_abierto(v_per);
  end if;

  perform public.exigir_propietario('public.tarjetas_credito', new.tarjeta_id, new.user_id, 'Tarjeta');
  perform public.exigir_propietario('public.cuentas', new.cuenta_origen_id, new.user_id, 'Cuenta');
  select tipo into v_tipo from public.cuentas where id = new.cuenta_origen_id;
  if v_tipo = 'tarjeta_credito' then
    raise exception 'Una tarjeta no se paga con otra tarjeta de crédito';
  end if;
  new.nota := nullif(trim(new.nota), '');

  -- Solo cambios de datos del usuario afectan el movimiento (no los calculados).
  if tg_op = 'UPDATE' and (old.fecha, old.monto, old.cuenta_origen_id, old.tarjeta_id)
                          is not distinct from (new.fecha, new.monto, new.cuenta_origen_id, new.tarjeta_id) then
    return new;
  end if;

  select * into v_tarjeta from public.tarjetas_credito where id = new.tarjeta_id;
  select nombre into v_nombre from public.cuentas where id = v_tarjeta.cuenta_id;
  select id into v_categoria from public.categorias
  where user_id = new.user_id and es_sistema and nombre = 'Tarjetas de crédito' and padre_id is null;

  if tg_op = 'INSERT' or new.movimiento_id is null then
    insert into public.movimientos (user_id, fecha, tipo, monto, cuenta_id, cuenta_destino_id, categoria_id, descripcion)
    values (new.user_id, new.fecha, 'pago_tc', new.monto, new.cuenta_origen_id, v_tarjeta.cuenta_id, v_categoria,
            'Pago ' || v_nombre)
    returning id into v_mov;
    new.movimiento_id := v_mov;
  else
    update public.movimientos
    set fecha = new.fecha, monto = new.monto, cuenta_id = new.cuenta_origen_id, cuenta_destino_id = v_tarjeta.cuenta_id
    where id = new.movimiento_id;
  end if;
  return new;
end;
$$;

create trigger pagos_tc_10_sincronizar
  before insert or update or delete on public.pagos_tc
  for each row execute function public.sincronizar_pago_tc();

-- Al borrar el pago se borra su movimiento (y viceversa por la FK en cascada).
create or replace function public.borrar_movimiento_de_pago()
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

create trigger pagos_tc_20_borrar_movimiento
  after delete on public.pagos_tc
  for each row execute function public.borrar_movimiento_de_pago();

-- ---------------------------------------------------------------------
-- Movimientos: se habilita pago_tc (solo creado por pagos_tc)
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
  if new.tipo = 'pago_tc' then
    -- Los pagos de tarjeta solo nacen de la tabla pagos_tc (trigger), nunca directo.
    if pg_trigger_depth() <= 1 then
      raise exception 'Los pagos de tarjeta se registran desde el módulo de tarjetas';
    end if;
    select tipo into v_tipo_destino from public.cuentas where id = new.cuenta_destino_id;
    if v_tipo_destino is distinct from 'tarjeta_credito' then
      raise exception 'El pago debe ir a una tarjeta de crédito';
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

  if new.tipo not in ('ingreso', 'gasto', 'transferencia') then
    raise exception 'El tipo de movimiento "%" se habilita en una fase posterior', new.tipo;
  end if;

  perform public.exigir_propietario('public.cuentas', new.cuenta_id, new.user_id, 'Cuenta');
  perform public.exigir_propietario('public.cuentas', new.cuenta_destino_id, new.user_id, 'Cuenta destino');
  perform public.exigir_propietario('public.categorias', new.categoria_id, new.user_id, 'Categoría');
  perform public.exigir_propietario('public.obligaciones_periodo', new.obligacion_periodo_id, new.user_id, 'Obligación');

  select tipo into v_tipo_cuenta from public.cuentas where id = new.cuenta_id;
  if v_tipo_cuenta = 'tarjeta_credito' then
    raise exception 'Las compras y pagos con tarjeta de crédito se registran en el módulo de tarjetas';
  end if;

  new.descripcion := nullif(trim(new.descripcion), '');
  new.comercio := nullif(trim(new.comercio), '');

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

-- Un movimiento pago_tc solo se modifica desde su pago (no desde la lista de movimientos).
create or replace function public.proteger_movimiento_pago_tc()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.tipo = 'pago_tc' and pg_trigger_depth() <= 1 and tg_op = 'UPDATE'
     and (old.fecha, old.monto, old.cuenta_id, old.cuenta_destino_id, old.tipo)
         is distinct from (new.fecha, new.monto, new.cuenta_id, new.cuenta_destino_id, new.tipo) then
    raise exception 'Edita este pago desde el módulo de tarjetas';
  end if;
  return new;
end;
$$;

create trigger movimientos_15_proteger_pago_tc
  before update on public.movimientos
  for each row execute function public.proteger_movimiento_pago_tc();

-- ---------------------------------------------------------------------
-- Cuotas y cortes (espejo de src/lib/domain/tarjetas.ts)
-- ---------------------------------------------------------------------
create or replace function public.corte_de_compra(p_fecha date, p_dia_corte smallint)
returns date
language sql
immutable
set search_path = ''
as $$
  select case
    when p_fecha <= public.fecha_en_mes(p_fecha, p_dia_corte) then public.fecha_en_mes(p_fecha, p_dia_corte)
    else public.fecha_en_mes((date_trunc('month', p_fecha) + interval '1 month')::date, p_dia_corte)
  end;
$$;

-- Calendario de capital de una compra. Valores en pesos con la última cuota absorbiendo el redondeo.
create or replace function public.cuotas_de_compra(
  p_fecha date, p_tipo public.tipo_compra_tc, p_monto numeric, p_num_cuotas smallint, p_dia_corte smallint
)
returns table (numero int, corte date, valor numeric)
language sql
immutable
set search_path = ''
as $$
  with base as (
    select
      (case p_tipo when 'devolucion' then -abs(p_monto) else abs(p_monto) end * 100)::bigint as total_c,
      case when p_tipo = 'devolucion' then 1 else greatest(p_num_cuotas, 1) end::int as n,
      public.corte_de_compra(p_fecha, p_dia_corte) as primero
    where p_tipo <> 'ajuste'
  )
  select
    k as numero,
    public.fecha_en_mes((date_trunc('month', b.primero) + make_interval(months => k - 1))::date, p_dia_corte) as corte,
    (case when k = b.n then b.total_c - trunc(b.total_c::numeric / b.n)::bigint * (b.n - 1)
          else trunc(b.total_c::numeric / b.n)::bigint end)::numeric / 100 as valor
  from base b, generate_series(1, b.n) as k;
$$;

-- ---------------------------------------------------------------------
-- Libro mayor: recalcular_tarjeta
-- ---------------------------------------------------------------------
create or replace function public.recalcular_tarjeta(p_tarjeta uuid)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_t public.tarjetas_credito%rowtype;
  v_nombre text;
  v_cat_tc uuid;
  v_tol numeric := 1000;
  v_umbral numeric := 20000;
  v_capital numeric := 0;
  v_otros numeric := 0;
  v_ext public.extractos_tc%rowtype;
  v_hay_ext boolean := false;
  v_pagado jsonb := '{}'::jsonb;
  v_acum numeric;
  v_tipo public.tipo_pago_tc;
  v_a_otros numeric;
  v_a_capital numeric;
  v_a_favor numeric;
  v_resto numeric;
  v_saldo numeric;
  v_gen numeric;
  v_capfact numeric;
  v_decl numeric;
  v_hay_decl boolean;
  v_dif numeric;
  ev record;
  e record;
  v_periodo uuid;
  v_estado_per public.estado_periodo;
  v_op public.obligaciones_periodo%rowtype;
  p record;
begin
  select * into v_t from public.tarjetas_credito where id = p_tarjeta;
  if not found then
    return;
  end if;
  select nombre into v_nombre from public.cuentas where id = v_t.cuenta_id;
  select coalesce(umbral_conciliacion_abs, 20000) into v_umbral from public.parametros where user_id = v_t.user_id;
  v_umbral := coalesce(v_umbral, 20000);

  for ev in
    select 0 as orden, c.fecha, c.created_at, c.id, c.tipo::text as tipo, c.monto,
           null::numeric as total, null::numeric as minimo
    from public.compras_tc c where c.tarjeta_id = p_tarjeta
    union all
    select 1, x.fecha_corte, x.created_at, x.id, null, null, x.pago_total_banco, x.pago_minimo_banco
    from public.extractos_tc x where x.tarjeta_id = p_tarjeta
    union all
    select 2, g.fecha, g.created_at, g.id, null, g.monto, null, null
    from public.pagos_tc g where g.tarjeta_id = p_tarjeta
    order by 2, 1, 3, 4
  loop
    if ev.orden = 0 then
      v_capital := v_capital + case ev.tipo when 'devolucion' then -abs(ev.monto) when 'ajuste' then ev.monto else abs(ev.monto) end;

    elsif ev.orden = 1 then
      select * into v_ext from public.extractos_tc where id = ev.id;
      v_saldo := v_capital + v_otros;
      v_gen := v_ext.pago_total_banco - v_saldo;
      if v_gen > 0 then
        v_otros := v_otros + v_gen;
      end if;
      select coalesce(sum(q.valor), 0) into v_capfact
      from public.compras_tc c,
           lateral public.cuotas_de_compra(c.fecha, c.tipo, c.monto, c.num_cuotas, v_t.dia_corte) q
      where c.tarjeta_id = p_tarjeta and date_trunc('month', q.corte) = date_trunc('month', v_ext.fecha_corte);
      v_hay_decl := v_ext.intereses is not null or v_ext.cuota_manejo is not null
                    or v_ext.seguros is not null or v_ext.otros_declarados is not null;
      v_decl := coalesce(v_ext.intereses, 0) + coalesce(v_ext.cuota_manejo, 0)
                + coalesce(v_ext.seguros, 0) + coalesce(v_ext.otros_declarados, 0);
      v_dif := case when v_hay_decl then v_gen - v_decl end;

      update public.extractos_tc set
        saldo_sistema_al_corte = v_saldo,
        otros_generados = v_gen,
        capital_facturado = v_capfact,
        minimo_estimado = least(greatest(v_capfact, 0), greatest(v_capital, 0)) + v_otros,
        diferencia_no_explicada = v_dif,
        alerta = case when v_gen < 0 then 'conciliacion_negativa'
                      when v_dif is not null and abs(v_dif) > v_umbral then 'diferencia_no_explicada' end
      where id = ev.id;

      v_hay_ext := true;
      v_pagado := jsonb_set(v_pagado, array[ev.id::text], '0'::jsonb);

    else
      v_tipo := 'otro';
      if v_hay_ext then
        v_acum := coalesce((v_pagado ->> v_ext.id::text)::numeric, 0) + ev.monto;
        v_pagado := jsonb_set(v_pagado, array[v_ext.id::text], to_jsonb(v_acum));
        v_tipo := case
          when v_acum >= v_ext.pago_total_banco - v_tol then 'total'
          when abs(v_acum - v_ext.pago_minimo_banco) <= v_tol then 'minimo'
          when v_acum > v_ext.pago_minimo_banco then 'otro'
          else 'inferior_minimo' end;
      end if;
      v_a_otros := least(ev.monto, greatest(v_otros, 0));
      v_otros := v_otros - v_a_otros;
      v_resto := ev.monto - v_a_otros;
      v_a_capital := least(v_resto, greatest(v_capital, 0));
      v_a_favor := v_resto - v_a_capital;
      v_capital := v_capital - v_a_capital - v_a_favor;

      update public.pagos_tc set
        extracto_id = case when v_hay_ext then v_ext.id end,
        tipo_calculado = v_tipo,
        imputado_otros = v_a_otros,
        imputado_capital = v_a_capital,
        saldo_a_favor = v_a_favor
      where id = ev.id;
    end if;
  end loop;

  -- Estado de cada extracto según lo pagado.
  update public.extractos_tc x set
    pagado = coalesce((v_pagado ->> x.id::text)::numeric, 0),
    estado = case
      when coalesce((v_pagado ->> x.id::text)::numeric, 0) >= x.pago_total_banco - v_tol then 'pagado_total'
      when coalesce((v_pagado ->> x.id::text)::numeric, 0) > 0
           and coalesce((v_pagado ->> x.id::text)::numeric, 0) >= x.pago_minimo_banco - v_tol then 'minimo_cubierto'
      when coalesce((v_pagado ->> x.id::text)::numeric, 0) > 0 then 'parcial'
      else 'pendiente' end::public.estado_extracto
  where x.tarjeta_id = p_tarjeta;

  -- Obligación del mes por extracto (mes de la fecha límite; monto = pago mínimo).
  select id into v_cat_tc from public.categorias
  where user_id = v_t.user_id and es_sistema and nombre = 'Tarjetas de crédito' and padre_id is null;

  for e in select * from public.extractos_tc where tarjeta_id = p_tarjeta loop
    v_periodo := public.periodo_de(v_t.user_id, e.fecha_limite_pago);
    select estado into v_estado_per from public.periodos where id = v_periodo;
    select * into v_op from public.obligaciones_periodo where extracto_id = e.id;
    if v_op.id is null then
      if v_estado_per = 'abierto' then
        insert into public.obligaciones_periodo
          (user_id, periodo_id, nombre, tipo, categoria_id, cuenta_default_id, monto_esperado, fecha_vencimiento, extracto_id, nota)
        values
          (v_t.user_id, v_periodo, 'Pago ' || v_nombre, 'tarjeta', v_cat_tc, v_t.cuenta_pago_default_id,
           e.pago_minimo_banco, e.fecha_limite_pago, e.id, 'Total para quedar en cero: ' || e.pago_total_banco);
      end if;
    elsif (v_op.periodo_id, v_op.monto_esperado, v_op.fecha_vencimiento, v_op.nombre)
          is distinct from (v_periodo, e.pago_minimo_banco, e.fecha_limite_pago, 'Pago ' || v_nombre)
          and v_estado_per = 'abierto'
          and (select estado from public.periodos where id = v_op.periodo_id) = 'abierto' then
      update public.obligaciones_periodo set
        periodo_id = v_periodo,
        nombre = 'Pago ' || v_nombre,
        monto_esperado = e.pago_minimo_banco,
        fecha_vencimiento = e.fecha_limite_pago,
        nota = 'Total para quedar en cero: ' || e.pago_total_banco
      where id = v_op.id;
    end if;
  end loop;

  -- Cada pago queda ligado a la obligación de su extracto; si esa obligación se pasó
  -- al mes siguiente al cerrar, se sigue la cadena hasta la instancia vigente.
  for p in
    select g.movimiento_id, m.obligacion_periodo_id as actual, pm.estado as estado_mov,
           (with recursive cadena as (
              select op.id, op.resolucion, 0 as n
              from public.obligaciones_periodo op where op.extracto_id = g.extracto_id
              union all
              select h.id, h.resolucion, c.n + 1
              from cadena c join public.obligaciones_periodo h on h.arrastrada_de_id = c.id
              where c.resolucion = 'arrastrada' and c.n < 24
            )
            select id from cadena where resolucion is null order by n limit 1) as destino
    from public.pagos_tc g
    join public.movimientos m on m.id = g.movimiento_id
    join public.periodos pm on pm.id = m.periodo_id
    where g.tarjeta_id = p_tarjeta
  loop
    if p.estado_mov = 'abierto' and p.actual is distinct from p.destino then
      update public.movimientos set obligacion_periodo_id = p.destino where id = p.movimiento_id;
    end if;
  end loop;
end;
$$;

revoke all on function public.recalcular_tarjeta(uuid) from public, anon;
grant execute on function public.recalcular_tarjeta(uuid) to authenticated, service_role;

-- Disparadores de recálculo (se omiten dentro del propio recálculo: pg_trigger_depth).
create or replace function public.tc_recalcular_disparador()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if pg_trigger_depth() > 1 then
    return null;
  end if;
  if tg_op in ('UPDATE', 'DELETE') then
    perform public.recalcular_tarjeta(old.tarjeta_id);
  end if;
  if tg_op = 'INSERT' or (tg_op = 'UPDATE' and new.tarjeta_id is distinct from old.tarjeta_id) then
    perform public.recalcular_tarjeta(new.tarjeta_id);
  end if;
  return null;
end;
$$;

create trigger compras_tc_90_recalcular
  after insert or update or delete on public.compras_tc
  for each row execute function public.tc_recalcular_disparador();
create trigger extractos_tc_90_recalcular
  after insert or update or delete on public.extractos_tc
  for each row execute function public.tc_recalcular_disparador();
create trigger pagos_tc_90_recalcular
  after insert or update or delete on public.pagos_tc
  for each row execute function public.tc_recalcular_disparador();

-- Al borrar un movimiento pago_tc desde la lista, su pago se borra en cascada: recalcular.
create or replace function public.movimiento_pago_tc_borrado()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_tarjeta uuid;
begin
  if old.tipo = 'pago_tc' and pg_trigger_depth() <= 1 then
    select id into v_tarjeta from public.tarjetas_credito where cuenta_id = old.cuenta_destino_id;
    if v_tarjeta is not null then
      perform public.recalcular_tarjeta(v_tarjeta);
    end if;
  end if;
  return null;
end;
$$;

create trigger movimientos_90_pago_tc_borrado
  after delete on public.movimientos
  for each row execute function public.movimiento_pago_tc_borrado();

-- ---------------------------------------------------------------------
-- Crear tarjeta (cuenta + tarjeta en una sola operación)
-- ---------------------------------------------------------------------
create or replace function public.crear_tarjeta(
  p_nombre text,
  p_franquicia text,
  p_ultimos4 text,
  p_cupo numeric,
  p_dia_corte smallint,
  p_dia_limite_pago smallint,
  p_tasa_ea_ref numeric default null,
  p_cuota_manejo_ref numeric default null,
  p_cuenta_pago_default_id uuid default null,
  p_entidad text default null
)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_cuenta uuid;
  v_tarjeta uuid;
begin
  insert into public.cuentas (nombre, tipo, entidad, orden)
  values (trim(p_nombre), 'tarjeta_credito', nullif(trim(p_entidad), ''), 50)
  returning id into v_cuenta;
  insert into public.tarjetas_credito
    (cuenta_id, franquicia, ultimos4, cupo, dia_corte, dia_limite_pago, tasa_ea_ref, cuota_manejo_ref, cuenta_pago_default_id)
  values
    (v_cuenta, p_franquicia, nullif(p_ultimos4, ''), p_cupo, p_dia_corte, p_dia_limite_pago, p_tasa_ea_ref,
     p_cuota_manejo_ref, p_cuenta_pago_default_id)
  returning id into v_tarjeta;
  return v_tarjeta;
end;
$$;

revoke all on function public.crear_tarjeta(text, text, text, numeric, smallint, smallint, numeric, numeric, uuid, text) from public, anon;
grant execute on function public.crear_tarjeta(text, text, text, numeric, smallint, smallint, numeric, numeric, uuid, text) to authenticated;

-- ---------------------------------------------------------------------
-- RLS y permisos
-- ---------------------------------------------------------------------
alter table public.tarjetas_credito enable row level security;
alter table public.compras_tc       enable row level security;
alter table public.extractos_tc     enable row level security;
alter table public.pagos_tc         enable row level security;

create policy propietario on public.tarjetas_credito for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy propietario on public.compras_tc for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy propietario on public.extractos_tc for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy propietario on public.pagos_tc for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

revoke all on public.tarjetas_credito, public.compras_tc, public.extractos_tc, public.pagos_tc from anon;
grant select, insert, update, delete
  on public.tarjetas_credito, public.compras_tc, public.extractos_tc, public.pagos_tc
  to authenticated;

-- ---------------------------------------------------------------------
-- Vistas
-- ---------------------------------------------------------------------

-- Estado de cada tarjeta (capital y otros cargos a hoy, último extracto).
create view public.v_estado_tarjetas with (security_invoker = true) as
select
  t.id, t.user_id, t.cuenta_id, cu.nombre, cu.entidad, t.franquicia, t.ultimos4, t.cupo,
  t.dia_corte, t.dia_limite_pago, t.tasa_ea_ref, t.cuota_manejo_ref, t.cuenta_pago_default_id, t.activa,
  (coalesce(cp.capital_compras, 0) - coalesce(pg.a_capital, 0) - coalesce(pg.a_favor, 0))::numeric(14,2) as capital,
  greatest(coalesce(ex.otros, 0) - coalesce(pg.a_otros, 0), 0)::numeric(14,2) as otros_pendientes,
  (coalesce(cp.capital_compras, 0) - coalesce(pg.a_capital, 0) - coalesce(pg.a_favor, 0)
   + greatest(coalesce(ex.otros, 0) - coalesce(pg.a_otros, 0), 0))::numeric(14,2) as deuda_total,
  coalesce(ex.costo_anio, 0)::numeric(14,2) as costo_financiero_anio,
  coalesce(ex.costo_total, 0)::numeric(14,2) as costo_financiero_total,
  coalesce(pg.pagado_anio, 0)::numeric(14,2) as pagado_anio,
  coalesce(cp.n_compras, 0)::int as n_compras,
  least(cp.primera, pg.primero) as primera_actividad,
  ue.id as ultimo_extracto_id, ue.fecha_corte as ultimo_corte, ue.fecha_limite_pago as ultima_fecha_limite,
  ue.pago_total_banco as ultimo_pago_total, ue.pago_minimo_banco as ultimo_pago_minimo,
  ue.pagado as ultimo_pagado, ue.estado as ultimo_estado, ue.alerta as ultima_alerta
from public.tarjetas_credito t
join public.cuentas cu on cu.id = t.cuenta_id
left join lateral (
  select
    sum(case c.tipo when 'devolucion' then -abs(c.monto) when 'ajuste' then c.monto else abs(c.monto) end) as capital_compras,
    count(*) filter (where c.tipo in ('compra', 'avance')) as n_compras,
    min(c.fecha) as primera
  from public.compras_tc c where c.tarjeta_id = t.id
) cp on true
left join lateral (
  select
    sum(greatest(x.otros_generados, 0)) as otros,
    sum(greatest(x.otros_generados, 0)) filter (where date_trunc('year', x.fecha_corte) = date_trunc('year', now() at time zone 'America/Bogota')) as costo_anio,
    sum(greatest(x.otros_generados, 0)) as costo_total
  from public.extractos_tc x where x.tarjeta_id = t.id
) ex on true
left join lateral (
  select
    sum(g.imputado_capital) as a_capital, sum(g.imputado_otros) as a_otros, sum(g.saldo_a_favor) as a_favor,
    sum(g.monto) filter (where date_trunc('year', g.fecha) = date_trunc('year', now() at time zone 'America/Bogota')) as pagado_anio,
    min(g.fecha) as primero
  from public.pagos_tc g where g.tarjeta_id = t.id
) pg on true
left join lateral (
  select * from public.extractos_tc x where x.tarjeta_id = t.id order by x.fecha_corte desc limit 1
) ue on true;

-- Compras con nombres (listas, filtros, movimientos).
create view public.v_compras_tc with (security_invoker = true) as
select
  c.id, c.user_id, c.tarjeta_id, c.periodo_id, c.fecha, c.tipo, c.descripcion, c.comercio, c.categoria_id,
  c.cuenta_destino_id, c.monto, c.num_cuotas, c.moneda, c.monto_origen, c.trm, c.reembolsable, c.created_at,
  p.mes, p.estado as estado_periodo,
  cu.nombre as tarjeta_nombre, t.dia_corte,
  cat.nombre as categoria_nombre, cat.padre_id as categoria_padre_id, cp.nombre as categoria_padre_nombre,
  cd.nombre as cuenta_destino_nombre,
  public.corte_de_compra(c.fecha, t.dia_corte) as primer_corte
from public.compras_tc c
join public.tarjetas_credito t on t.id = c.tarjeta_id
join public.cuentas cu on cu.id = t.cuenta_id
join public.periodos p on p.id = c.periodo_id
left join public.categorias cat on cat.id = c.categoria_id
left join public.categorias cp on cp.id = cat.padre_id
left join public.cuentas cd on cd.id = c.cuenta_destino_id;

-- Calendario de cuotas (capital) por compra.
create view public.v_cuotas_tc with (security_invoker = true) as
select
  c.user_id, c.tarjeta_id, c.id as compra_id, c.fecha, c.descripcion, c.comercio, c.num_cuotas,
  q.numero, q.corte, q.valor
from public.compras_tc c
join public.tarjetas_credito t on t.id = c.tarjeta_id,
lateral public.cuotas_de_compra(c.fecha, c.tipo, c.monto, c.num_cuotas, t.dia_corte) q;

-- Obligaciones del mes: se agregan columnas de tarjeta al final.
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
  x.pago_minimo_banco as pago_minimo_tc
from public.obligaciones_periodo op
join public.periodos p on p.id = op.periodo_id
join public.categorias c on c.id = op.categoria_id
left join public.cuentas cu on cu.id = op.cuenta_default_id
left join public.obligaciones o on o.id = op.obligacion_id
left join public.extractos_tc x on x.id = op.extracto_id
left join lateral (
  select sum(m.monto) as pagado, count(*) as n_pagos, max(m.fecha) as ultimo_pago
  from public.movimientos m
  where m.obligacion_periodo_id = op.id
) pg on true;

-- Resumen del mes: las compras con tarjeta son gasto de consumo y los otros cargos,
-- costo financiero. Los pagos de tarjeta solo cuentan como salida de caja (sin doble conteo).
create or replace view public.v_resumen_periodo with (security_invoker = true) as
select
  p.id as periodo_id, p.user_id, p.mes, p.estado, p.cerrado_en,
  coalesce(mv.ingresos, 0)::numeric(14,2)        as ingresos,
  coalesce(mv.recuperaciones, 0)::numeric(14,2)  as recuperaciones,
  (coalesce(mv.gastos, 0) + coalesce(tc.compras, 0) + coalesce(tc.costos, 0))::numeric(14,2) as gastos,
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
  coalesce(mv.gastos, 0)::numeric(14,2)          as gastos_cuentas
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

-- Saldos: se suman los avances en efectivo que llegan a una cuenta.
create or replace view public.v_saldos_cuentas with (security_invoker = true) as
select
  c.id, c.user_id, c.nombre, c.tipo, c.entidad, c.saldo_inicial, c.fecha_saldo_inicial,
  c.color, c.activa, c.orden,
  (c.saldo_inicial + coalesce(f.neto, 0))::numeric(14,2) as saldo,
  coalesce(f.n, 0)::int as n_movimientos
from public.cuentas c
left join lateral (
  select sum(x.valor) as neto, count(*) as n
  from (
    select case
             when m.cuenta_destino_id = c.id then m.monto
             when m.tipo in ('ingreso', 'recuperacion_prestamo', 'desembolso_deuda', 'reembolso_devtopia') then m.monto
             else -m.monto
           end as valor
    from public.movimientos m
    where (m.cuenta_id = c.id or m.cuenta_destino_id = c.id)
      and (c.fecha_saldo_inicial is null or m.fecha >= c.fecha_saldo_inicial)
    union all
    select a.monto
    from public.compras_tc a
    where a.tipo = 'avance' and a.cuenta_destino_id = c.id
      and (c.fecha_saldo_inicial is null or a.fecha >= c.fecha_saldo_inicial)
  ) x
) f on true;

-- Gasto por categoría: movimientos + compras con tarjeta + otros cargos de extractos.
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

revoke all on public.v_estado_tarjetas, public.v_compras_tc, public.v_cuotas_tc from anon;
grant select on public.v_estado_tarjetas, public.v_compras_tc, public.v_cuotas_tc to authenticated;
