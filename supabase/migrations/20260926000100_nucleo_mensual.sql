-- =====================================================================
-- Plata Clara · 0002 · Núcleo mensual (Fase 1)
-- Obligaciones recurrentes (plantillas), obligaciones del mes, movimientos,
-- bitácora, vistas de lectura y funciones de ciclo de vida del mes:
-- generar_periodo, cerrar_periodo, reabrir_periodo.
-- Referencia: docs/01 §6–9, docs/05 §3–6
-- =====================================================================

-- ---------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------
create type public.frecuencia as enum ('mensual', 'bimestral', 'trimestral', 'semestral', 'anual');

create type public.tipo_obligacion as enum (
  'servicio', 'arriendo', 'telecom', 'tarjeta', 'deuda', 'cooperativa',
  'seguridad_social', 'ingreso_esperado', 'ahorro', 'otro'
);

-- Todos los tipos del modelo; en F1 solo se habilitan ingreso, gasto y transferencia.
create type public.tipo_movimiento as enum (
  'ingreso', 'gasto', 'transferencia',
  'pago_tc', 'pago_deuda', 'aporte', 'prestamo_otorgado',
  'recuperacion_prestamo', 'desembolso_deuda', 'reembolso_devtopia'
);

-- ---------------------------------------------------------------------
-- Utilidades
-- ---------------------------------------------------------------------

-- Verifica que una fila referenciada pertenezca al usuario (las FK ignoran RLS).
create or replace function public.exigir_propietario(p_tabla regclass, p_id uuid, p_user uuid, p_etiqueta text)
returns void
language plpgsql
stable
set search_path = ''
as $$
declare
  v_user uuid;
begin
  if p_id is null then
    return;
  end if;
  execute format('select user_id from %s where id = $1', p_tabla) into v_user using p_id;
  if v_user is null or v_user <> p_user then
    raise exception '% no encontrada', p_etiqueta using errcode = 'P0002';
  end if;
end;
$$;

-- Día N del mes; si el mes es más corto, el último día (31 → 30 de septiembre).
create or replace function public.fecha_en_mes(p_mes date, p_dia smallint)
returns date
language sql
immutable
set search_path = ''
as $$
  select (date_trunc('month', p_mes)::date
          + (least(p_dia, extract(day from (date_trunc('month', p_mes) + interval '1 month - 1 day'))::int) - 1));
$$;

-- ¿Una plantilla con esta frecuencia genera obligación en el mes dado?
create or replace function public.obligacion_aplica(
  p_frecuencia public.frecuencia, p_mes_ancla date, p_inicio date, p_fin date, p_mes date
)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select date_trunc('month', p_mes) >= date_trunc('month', p_inicio)
     and (p_fin is null or date_trunc('month', p_mes) <= date_trunc('month', p_fin))
     and (
       (((extract(year from p_mes)::int * 12 + extract(month from p_mes)::int)
         - (extract(year from p_mes_ancla)::int * 12 + extract(month from p_mes_ancla)::int))
        % case p_frecuencia
            when 'mensual' then 1 when 'bimestral' then 2 when 'trimestral' then 3
            when 'semestral' then 6 when 'anual' then 12 end
        + case p_frecuencia
            when 'mensual' then 1 when 'bimestral' then 2 when 'trimestral' then 3
            when 'semestral' then 6 when 'anual' then 12 end)
       % case p_frecuencia
           when 'mensual' then 1 when 'bimestral' then 2 when 'trimestral' then 3
           when 'semestral' then 6 when 'anual' then 12 end
     ) = 0;
$$;

-- Obtiene (o crea) el periodo de una fecha.
create or replace function public.periodo_de(p_user uuid, p_fecha date)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_id uuid;
begin
  insert into public.periodos (user_id, mes)
  values (p_user, date_trunc('month', p_fecha)::date)
  on conflict (user_id, mes) do nothing;
  select id into v_id from public.periodos where user_id = p_user and mes = date_trunc('month', p_fecha)::date;
  return v_id;
end;
$$;

-- Rechaza cambios sobre un periodo cerrado.
create or replace function public.exigir_periodo_abierto(p_periodo uuid)
returns void
language plpgsql
stable
set search_path = ''
as $$
declare
  v_estado public.estado_periodo;
  v_mes date;
begin
  select estado, mes into v_estado, v_mes from public.periodos where id = p_periodo;
  if v_estado = 'cerrado' then
    raise exception 'El mes % está cerrado. Reábrelo para hacer cambios.', to_char(v_mes, 'YYYY-MM')
      using errcode = 'P0001', hint = 'periodo_cerrado';
  end if;
end;
$$;

-- ---------------------------------------------------------------------
-- obligaciones (plantillas recurrentes)
-- ---------------------------------------------------------------------
create table public.obligaciones (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid not null default auth.uid() references auth.users (id) on delete cascade,
  nombre                text not null check (length(trim(nombre)) between 1 and 80),
  tipo                  public.tipo_obligacion not null,
  categoria_id          uuid not null references public.categorias (id),
  monto_estimado        numeric(14,2) not null default 0 check (monto_estimado >= 0),
  es_variable           boolean not null default false,
  estimar_con_promedio  boolean not null default false,
  dia_vencimiento       smallint not null check (dia_vencimiento between 1 and 31),
  frecuencia            public.frecuencia not null default 'mensual',
  fecha_inicio          date not null default date_trunc('month', now() at time zone 'America/Bogota')::date,
  mes_ancla             date,
  fecha_fin             date,
  cuenta_default_id     uuid references public.cuentas (id) on delete set null,
  referencia_pago       text,
  notas                 text,
  activa                boolean not null default true,
  orden                 smallint not null default 0,
  es_ingreso            boolean generated always as (tipo = 'ingreso_esperado') stored,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  check (fecha_fin is null or fecha_fin >= fecha_inicio)
);

create index obligaciones_user_idx on public.obligaciones (user_id, activa);

create trigger obligaciones_updated_at
  before update on public.obligaciones
  for each row execute function public.set_updated_at();

create or replace function public.validar_obligacion()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_tipo_cat public.tipo_categoria;
  v_tipo_cuenta public.tipo_cuenta;
begin
  perform public.exigir_propietario('public.categorias', new.categoria_id, new.user_id, 'Categoría');
  perform public.exigir_propietario('public.cuentas', new.cuenta_default_id, new.user_id, 'Cuenta');

  select tipo into v_tipo_cat from public.categorias where id = new.categoria_id;
  if (new.tipo = 'ingreso_esperado') <> (v_tipo_cat = 'ingreso') then
    raise exception 'La categoría debe ser de %', case when new.tipo = 'ingreso_esperado' then 'ingreso' else 'gasto' end;
  end if;

  if new.cuenta_default_id is not null then
    select tipo into v_tipo_cuenta from public.cuentas where id = new.cuenta_default_id;
    if v_tipo_cuenta = 'tarjeta_credito' then
      raise exception 'La cuenta de pago no puede ser una tarjeta de crédito';
    end if;
  end if;

  new.fecha_inicio := date_trunc('month', new.fecha_inicio)::date;
  new.mes_ancla := date_trunc('month', coalesce(new.mes_ancla, new.fecha_inicio))::date;
  if not new.es_variable then
    new.estimar_con_promedio := false;
  end if;
  return new;
end;
$$;

create trigger obligaciones_validar
  before insert or update on public.obligaciones
  for each row execute function public.validar_obligacion();

-- ---------------------------------------------------------------------
-- obligaciones_periodo (instancias del mes)
-- ---------------------------------------------------------------------
create table public.obligaciones_periodo (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null default auth.uid() references auth.users (id) on delete cascade,
  periodo_id         uuid not null references public.periodos (id) on delete cascade,
  obligacion_id      uuid references public.obligaciones (id) on delete set null,
  nombre             text not null check (length(trim(nombre)) between 1 and 80),
  tipo               public.tipo_obligacion not null,
  categoria_id       uuid not null references public.categorias (id),
  cuenta_default_id  uuid references public.cuentas (id) on delete set null,
  monto_esperado     numeric(14,2) not null default 0 check (monto_esperado >= 0),
  fecha_vencimiento  date not null,
  resolucion         text check (resolucion in ('omitida', 'arrastrada')),
  motivo             text,
  arrastrada_de_id   uuid references public.obligaciones_periodo (id) on delete set null,
  nota               text,
  es_ingreso         boolean generated always as (tipo = 'ingreso_esperado') stored,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  check (resolucion is null or resolucion <> 'omitida' or length(trim(coalesce(motivo, ''))) > 0)
);

-- Una instancia por plantilla y mes (las arrastradas desde meses anteriores no cuentan).
create unique index obligaciones_periodo_unica
  on public.obligaciones_periodo (obligacion_id, periodo_id)
  where obligacion_id is not null and arrastrada_de_id is null;

create index obligaciones_periodo_periodo_idx on public.obligaciones_periodo (periodo_id);
create index obligaciones_periodo_obligacion_idx on public.obligaciones_periodo (obligacion_id);

create trigger obligaciones_periodo_updated_at
  before update on public.obligaciones_periodo
  for each row execute function public.set_updated_at();

create or replace function public.validar_obligacion_periodo()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_tipo_cat public.tipo_categoria;
begin
  -- Borrados en cascada (p. ej. al eliminar el usuario) no se bloquean.
  if tg_op = 'DELETE' and pg_trigger_depth() > 1 then
    return old;
  end if;
  if tg_op in ('UPDATE', 'DELETE') then
    perform public.exigir_periodo_abierto(old.periodo_id);
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;

  perform public.exigir_periodo_abierto(new.periodo_id);
  perform public.exigir_propietario('public.periodos', new.periodo_id, new.user_id, 'Periodo');
  perform public.exigir_propietario('public.categorias', new.categoria_id, new.user_id, 'Categoría');
  perform public.exigir_propietario('public.cuentas', new.cuenta_default_id, new.user_id, 'Cuenta');
  perform public.exigir_propietario('public.obligaciones', new.obligacion_id, new.user_id, 'Obligación');

  select tipo into v_tipo_cat from public.categorias where id = new.categoria_id;
  if (new.tipo = 'ingreso_esperado') <> (v_tipo_cat = 'ingreso') then
    raise exception 'La categoría debe ser de %', case when new.tipo = 'ingreso_esperado' then 'ingreso' else 'gasto' end;
  end if;
  if new.resolucion is null then
    new.motivo := null;
  end if;
  return new;
end;
$$;

create trigger obligaciones_periodo_validar
  before insert or update or delete on public.obligaciones_periodo
  for each row execute function public.validar_obligacion_periodo();

-- ---------------------------------------------------------------------
-- movimientos
-- ---------------------------------------------------------------------
create table public.movimientos (
  id                     uuid primary key default gen_random_uuid(),
  user_id                uuid not null default auth.uid() references auth.users (id) on delete cascade,
  periodo_id             uuid not null references public.periodos (id) on delete cascade,
  fecha                  date not null,
  tipo                   public.tipo_movimiento not null,
  monto                  numeric(14,2) not null check (monto > 0),
  cuenta_id              uuid not null references public.cuentas (id),
  cuenta_destino_id      uuid references public.cuentas (id),
  categoria_id           uuid references public.categorias (id),
  obligacion_periodo_id  uuid references public.obligaciones_periodo (id) on delete set null,
  descripcion            text check (descripcion is null or length(descripcion) <= 200),
  comercio               text check (comercio is null or length(comercio) <= 80),
  reembolsable           boolean not null default false,
  etiquetas              text[] not null default '{}',
  adjunto_path           text,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

create index movimientos_user_fecha_idx on public.movimientos (user_id, fecha desc);
create index movimientos_periodo_idx on public.movimientos (periodo_id);
create index movimientos_obligacion_idx on public.movimientos (obligacion_periodo_id);
create index movimientos_cuenta_idx on public.movimientos (cuenta_id);
create index movimientos_categoria_idx on public.movimientos (categoria_id);

create trigger movimientos_updated_at
  before update on public.movimientos
  for each row execute function public.set_updated_at();

-- Los triggers BEFORE se ejecutan en orden alfabético: 10 → 20.
create or replace function public.movimiento_asignar_periodo()
returns trigger
language plpgsql
set search_path = ''
as $$
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
  return new;
end;
$$;

create trigger movimientos_10_periodo
  before insert or update or delete on public.movimientos
  for each row execute function public.movimiento_asignar_periodo();

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

create trigger movimientos_20_validar
  before insert or update on public.movimientos
  for each row execute function public.validar_movimiento();

-- ---------------------------------------------------------------------
-- bitácora (auditoría ligera)
-- ---------------------------------------------------------------------
create table public.bitacora (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  entidad     text not null,
  entidad_id  uuid,
  accion      text not null,
  detalle     jsonb,
  creado_en   timestamptz not null default now()
);

create index bitacora_user_idx on public.bitacora (user_id, creado_en desc);

-- ---------------------------------------------------------------------
-- RLS y permisos
-- ---------------------------------------------------------------------
alter table public.obligaciones          enable row level security;
alter table public.obligaciones_periodo  enable row level security;
alter table public.movimientos           enable row level security;
alter table public.bitacora              enable row level security;

create policy propietario on public.obligaciones
  for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy propietario on public.obligaciones_periodo
  for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy propietario on public.movimientos
  for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy propietario_lectura on public.bitacora
  for select to authenticated using (user_id = (select auth.uid()));
create policy propietario_insercion on public.bitacora
  for insert to authenticated with check (user_id = (select auth.uid()));

revoke all on public.obligaciones, public.obligaciones_periodo, public.movimientos, public.bitacora from anon;
grant select, insert, update, delete
  on public.obligaciones, public.obligaciones_periodo, public.movimientos
  to authenticated;
grant select, insert on public.bitacora to authenticated;

-- ---------------------------------------------------------------------
-- Vistas (security_invoker: aplican el RLS de quien consulta)
-- ---------------------------------------------------------------------

-- Obligaciones del mes con lo pagado. El estado visual (vencida, vence pronto…)
-- se calcula en src/lib/domain/obligaciones.ts con la fecha de hoy.
create view public.v_obligaciones_mes with (security_invoker = true) as
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
  end::numeric(14,2) as pendiente
from public.obligaciones_periodo op
join public.periodos p on p.id = op.periodo_id
join public.categorias c on c.id = op.categoria_id
left join public.cuentas cu on cu.id = op.cuenta_default_id
left join public.obligaciones o on o.id = op.obligacion_id
left join lateral (
  select sum(m.monto) as pagado, count(*) as n_pagos, max(m.fecha) as ultimo_pago
  from public.movimientos m
  where m.obligacion_periodo_id = op.id
) pg on true;

-- Movimientos con nombres de cuenta y categoría (para listas y filtros).
create view public.v_movimientos with (security_invoker = true) as
select
  m.id, m.user_id, m.periodo_id, m.fecha, m.tipo, m.monto, m.cuenta_id, m.cuenta_destino_id,
  m.categoria_id, m.obligacion_periodo_id, m.descripcion, m.comercio, m.reembolsable, m.etiquetas,
  m.created_at, m.updated_at,
  p.mes, p.estado as estado_periodo,
  cu.nombre as cuenta_nombre, cd.nombre as cuenta_destino_nombre,
  c.nombre as categoria_nombre, c.icono as categoria_icono, c.color as categoria_color,
  c.padre_id as categoria_padre_id, cp.nombre as categoria_padre_nombre,
  op.nombre as obligacion_nombre,
  (c.grupo = 'Recuperación') as es_recuperacion
from public.movimientos m
join public.periodos p on p.id = m.periodo_id
join public.cuentas cu on cu.id = m.cuenta_id
left join public.cuentas cd on cd.id = m.cuenta_destino_id
left join public.categorias c on c.id = m.categoria_id
left join public.categorias cp on cp.id = c.padre_id
left join public.obligaciones_periodo op on op.id = m.obligacion_periodo_id;

-- Resumen por mes (dashboard, histórico y snapshot de cierre).
create view public.v_resumen_periodo with (security_invoker = true) as
select
  p.id as periodo_id, p.user_id, p.mes, p.estado, p.cerrado_en,
  coalesce(mv.ingresos, 0)::numeric(14,2)        as ingresos,
  coalesce(mv.recuperaciones, 0)::numeric(14,2)  as recuperaciones,
  coalesce(mv.gastos, 0)::numeric(14,2)          as gastos,
  coalesce(mv.salidas_caja, 0)::numeric(14,2)    as salidas_caja,
  coalesce(mv.reembolsables, 0)::numeric(14,2)   as gastos_reembolsables,
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
  coalesce(ie.pendiente, 0)::numeric(14,2)       as ingresos_esperados_pendientes
from public.periodos p
left join lateral (
  select
    sum(m.monto) filter (where m.tipo = 'ingreso' and not coalesce(c.grupo = 'Recuperación', false)) as ingresos,
    sum(m.monto) filter (where m.tipo in ('ingreso', 'recuperacion_prestamo') and coalesce(c.grupo = 'Recuperación', false)
                            or m.tipo = 'recuperacion_prestamo') as recuperaciones,
    sum(m.monto) filter (where m.tipo = 'gasto') as gastos,
    sum(m.monto) filter (where m.tipo in ('gasto', 'pago_tc', 'pago_deuda', 'aporte', 'prestamo_otorgado')) as salidas_caja,
    sum(m.monto) filter (where m.tipo = 'gasto' and m.reembolsable) as reembolsables,
    count(*) as n_movimientos
  from public.movimientos m
  left join public.categorias c on c.id = m.categoria_id
  where m.periodo_id = p.id
) mv on true
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

-- Saldo actual por cuenta (saldo inicial + movimientos desde la fecha del saldo inicial).
create view public.v_saldos_cuentas with (security_invoker = true) as
select
  c.id, c.user_id, c.nombre, c.tipo, c.entidad, c.saldo_inicial, c.fecha_saldo_inicial,
  c.color, c.activa, c.orden,
  (c.saldo_inicial + coalesce(sum(
    case
      when m.cuenta_destino_id = c.id then m.monto
      when m.tipo in ('ingreso', 'recuperacion_prestamo', 'desembolso_deuda', 'reembolso_devtopia') then m.monto
      else -m.monto
    end
  ), 0))::numeric(14,2) as saldo,
  count(m.id)::int as n_movimientos
from public.cuentas c
left join public.movimientos m
  on (m.cuenta_id = c.id or m.cuenta_destino_id = c.id)
 and (c.fecha_saldo_inicial is null or m.fecha >= c.fecha_saldo_inicial)
group by c.id;

-- Gasto por categoría hoja (subcategoría si existe) y mes.
create view public.v_gasto_categoria_mes with (security_invoker = true) as
select
  m.user_id, m.periodo_id, p.mes,
  c.id as categoria_id, c.nombre as categoria_nombre, c.color, c.icono, c.bolsa, c.es_fija,
  cp.id as padre_id, cp.nombre as padre_nombre, coalesce(cp.grupo, c.grupo) as grupo,
  sum(m.monto)::numeric(14,2) as total,
  count(*)::int as n_movimientos
from public.movimientos m
join public.periodos p on p.id = m.periodo_id
join public.categorias c on c.id = m.categoria_id
left join public.categorias cp on cp.id = c.padre_id
where m.tipo = 'gasto'
group by m.user_id, m.periodo_id, p.mes, c.id, cp.id;

revoke all on public.v_obligaciones_mes, public.v_movimientos, public.v_resumen_periodo,
  public.v_saldos_cuentas, public.v_gasto_categoria_mes from anon;
grant select on public.v_obligaciones_mes, public.v_movimientos, public.v_resumen_periodo,
  public.v_saldos_cuentas, public.v_gasto_categoria_mes to authenticated;

-- ---------------------------------------------------------------------
-- Ciclo de vida del mes
-- ---------------------------------------------------------------------

-- Promedio de lo pagado en las últimas 3 instancias (para obligaciones variables).
create or replace function public.promedio_pagado(p_obligacion uuid, p_antes_de date)
returns numeric
language sql
stable
set search_path = ''
as $$
  select round(avg(t.pagado), -2)
  from (
    select sum(m.monto) as pagado
    from public.obligaciones_periodo op
    join public.periodos p on p.id = op.periodo_id
    join public.movimientos m on m.obligacion_periodo_id = op.id
    where op.obligacion_id = p_obligacion and p.mes < p_antes_de
    group by op.id, p.mes
    order by p.mes desc
    limit 3
  ) t;
$$;

-- Núcleo: crea el periodo y las obligaciones del mes para un usuario. Idempotente.
create or replace function public.generar_periodo_de_usuario(p_user uuid, p_mes date)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_mes date := date_trunc('month', p_mes)::date;
  v_periodo public.periodos%rowtype;
begin
  insert into public.periodos (user_id, mes) values (p_user, v_mes)
  on conflict (user_id, mes) do nothing;
  select * into v_periodo from public.periodos where user_id = p_user and mes = v_mes;

  if v_periodo.estado = 'cerrado' then
    return v_periodo.id;
  end if;

  insert into public.obligaciones_periodo
    (user_id, periodo_id, obligacion_id, nombre, tipo, categoria_id, cuenta_default_id, monto_esperado, fecha_vencimiento)
  select
    o.user_id, v_periodo.id, o.id, o.nombre, o.tipo, o.categoria_id, o.cuenta_default_id,
    case when o.estimar_con_promedio
         then coalesce(public.promedio_pagado(o.id, v_mes), o.monto_estimado)
         else o.monto_estimado end,
    public.fecha_en_mes(v_mes, o.dia_vencimiento)
  from public.obligaciones o
  where o.user_id = p_user
    and o.activa
    and public.obligacion_aplica(o.frecuencia, o.mes_ancla, o.fecha_inicio, o.fecha_fin, v_mes)
  on conflict (obligacion_id, periodo_id) where obligacion_id is not null and arrastrada_de_id is null
  do nothing;

  return v_periodo.id;
end;
$$;

revoke all on function public.generar_periodo_de_usuario(uuid, date) from public, anon, authenticated;
grant execute on function public.generar_periodo_de_usuario(uuid, date) to service_role;

-- Para la app: genera el mes del usuario autenticado.
create or replace function public.generar_periodo(p_mes date)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Sesión requerida' using errcode = '42501';
  end if;
  return public.generar_periodo_de_usuario(auth.uid(), p_mes);
end;
$$;

revoke all on function public.generar_periodo(date) from public, anon;
grant execute on function public.generar_periodo(date) to authenticated;

-- Para el cron del día 1: genera el mes para todos los usuarios.
create or replace function public.generar_periodo_todos(p_mes date)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid;
  v_n int := 0;
begin
  for v_user in select user_id from public.parametros loop
    perform public.generar_periodo_de_usuario(v_user, p_mes);
    v_n := v_n + 1;
  end loop;
  return v_n;
end;
$$;

revoke all on function public.generar_periodo_todos(date) from public, anon, authenticated;
grant execute on function public.generar_periodo_todos(date) to service_role;

-- Cierra un mes. p_decisiones: [{"id": uuid, "accion": "arrastrar"|"omitir", "motivo": text}]
-- para cada obligación pendiente. Devuelve la foto (snapshot) guardada.
create or replace function public.cerrar_periodo(p_periodo uuid, p_decisiones jsonb default '[]'::jsonb)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_periodo public.periodos%rowtype;
  v_siguiente uuid;
  v_decision jsonb;
  v_op public.v_obligaciones_mes%rowtype;
  v_restantes int;
  v_snapshot jsonb;
begin
  select * into v_periodo from public.periodos where id = p_periodo for update;
  if not found then
    raise exception 'Periodo no encontrado' using errcode = 'P0002';
  end if;
  if v_periodo.estado = 'cerrado' then
    raise exception 'El mes ya está cerrado';
  end if;

  for v_decision in select * from jsonb_array_elements(coalesce(p_decisiones, '[]'::jsonb)) loop
    select * into v_op from public.v_obligaciones_mes where id = (v_decision ->> 'id')::uuid;
    if not found or v_op.periodo_id <> p_periodo then
      raise exception 'Obligación no encontrada en este mes';
    end if;
    if v_op.resolucion is not null or v_op.pagada then
      continue;
    end if;

    if v_decision ->> 'accion' = 'omitir' then
      update public.obligaciones_periodo
      set resolucion = 'omitida',
          motivo = coalesce(nullif(trim(v_decision ->> 'motivo'), ''), 'Omitida al cerrar el mes')
      where id = v_op.id;

    elsif v_decision ->> 'accion' = 'arrastrar' then
      v_siguiente := public.generar_periodo((v_periodo.mes + interval '1 month')::date);
      perform public.exigir_periodo_abierto(v_siguiente);
      insert into public.obligaciones_periodo
        (user_id, periodo_id, obligacion_id, nombre, tipo, categoria_id, cuenta_default_id,
         monto_esperado, fecha_vencimiento, arrastrada_de_id, nota)
      values
        (v_op.user_id, v_siguiente, v_op.obligacion_id, v_op.nombre, v_op.tipo, v_op.categoria_id,
         v_op.cuenta_default_id,
         case when v_op.monto_esperado = 0 then 0 else v_op.pendiente end,
         v_op.fecha_vencimiento, v_op.id,
         'Pendiente de ' || to_char(v_periodo.mes, 'MM/YYYY'));
      update public.obligaciones_periodo
      set resolucion = 'arrastrada', motivo = 'Pasó al mes siguiente'
      where id = v_op.id;

    else
      raise exception 'Acción inválida: %', v_decision ->> 'accion';
    end if;
  end loop;

  select count(*) into v_restantes
  from public.v_obligaciones_mes
  where periodo_id = p_periodo and resolucion is null and not pagada;
  if v_restantes > 0 then
    raise exception 'Quedan % obligaciones pendientes sin decisión', v_restantes
      using hint = 'pendientes_sin_decision';
  end if;

  select to_jsonb(r) - 'user_id' - 'estado' - 'cerrado_en' into v_snapshot
  from public.v_resumen_periodo r where r.periodo_id = p_periodo;
  v_snapshot := v_snapshot || jsonb_build_object('cerrado_en', now(), 'version', 1);

  update public.periodos
  set estado = 'cerrado', cerrado_en = now(), snapshot = v_snapshot
  where id = p_periodo;

  insert into public.bitacora (user_id, entidad, entidad_id, accion, detalle)
  values (v_periodo.user_id, 'periodos', p_periodo, 'cerrar', jsonb_build_object('decisiones', p_decisiones));

  return v_snapshot;
end;
$$;

revoke all on function public.cerrar_periodo(uuid, jsonb) from public, anon;
grant execute on function public.cerrar_periodo(uuid, jsonb) to authenticated;

create or replace function public.reabrir_periodo(p_periodo uuid, p_motivo text)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_periodo public.periodos%rowtype;
begin
  if length(trim(coalesce(p_motivo, ''))) < 3 then
    raise exception 'Indica el motivo para reabrir el mes';
  end if;
  select * into v_periodo from public.periodos where id = p_periodo for update;
  if not found then
    raise exception 'Periodo no encontrado' using errcode = 'P0002';
  end if;
  if v_periodo.estado = 'abierto' then
    return;
  end if;
  update public.periodos
  set estado = 'abierto', cerrado_en = null, reabierto_en = now()
  where id = p_periodo;
  insert into public.bitacora (user_id, entidad, entidad_id, accion, detalle)
  values (v_periodo.user_id, 'periodos', p_periodo, 'reabrir',
          jsonb_build_object('motivo', trim(p_motivo), 'snapshot_anterior', v_periodo.snapshot));
end;
$$;

revoke all on function public.reabrir_periodo(uuid, text) from public, anon;
grant execute on function public.reabrir_periodo(uuid, text) to authenticated;
