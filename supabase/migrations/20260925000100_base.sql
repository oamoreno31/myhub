-- =====================================================================
-- Plata Clara · 0001 · Base
-- Enums, utilidades, parametros, cuentas, categorias, periodos, RLS
-- e inicialización automática de datos al crear el usuario.
-- Referencia: docs/05-modelo-de-datos.md
-- =====================================================================

-- ---------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------
create type public.tipo_cuenta as enum (
  'ahorros', 'corriente', 'efectivo', 'billetera', 'tarjeta_credito', 'cooperativa', 'inversion'
);

create type public.tipo_categoria as enum ('ingreso', 'gasto');

create type public.bolsa_503020 as enum ('necesidad', 'deseo', 'ahorro_deuda', 'no_aplica');

create type public.estado_periodo as enum ('abierto', 'cerrado');

-- ---------------------------------------------------------------------
-- Utilidades
-- ---------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- parametros (1 fila por usuario)
-- ---------------------------------------------------------------------
create table public.parametros (
  user_id                  uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  moneda                   text        not null default 'COP',
  zona_horaria             text        not null default 'America/Bogota',
  dia_inicio_mes           smallint    not null default 1 check (dia_inicio_mes between 1 and 28),
  umbral_conciliacion_abs  numeric(14,2) not null default 20000 check (umbral_conciliacion_abs >= 0),
  umbral_conciliacion_pct  numeric(5,4)  not null default 0.05  check (umbral_conciliacion_pct between 0 and 1),
  imputacion_tc            text        not null default 'cargos_primero'
                             check (imputacion_tc in ('cargos_primero', 'proporcional')),
  meta_ahorro_pct          numeric(5,4)  not null default 0.20  check (meta_ahorro_pct between 0 and 1),
  umbrales_salud           jsonb       not null default '{
    "tasa_ahorro":        {"sano": 0.20, "riesgo": 0.10},
    "carga_deuda":        {"sano": 0.30, "riesgo": 0.40},
    "utilizacion_tc":     {"sano": 0.30, "riesgo": 0.60},
    "costo_financiero":   {"sano": 0.03, "riesgo": 0.08},
    "gastos_fijos":       {"sano": 0.50, "riesgo": 0.65},
    "fondo_emergencia":   {"sano": 6,    "riesgo": 3},
    "puntualidad":        {"sano": 1.00, "riesgo": 0.90}
  }'::jsonb,
  -- Valores de referencia editables; verificar vigencia cada año.
  seguridad_social         jsonb       not null default '{
    "ibc_pct": 0.40, "salud_pct": 0.125, "pension_pct": 0.16, "arl_clase": 1, "smmlv": null
  }'::jsonb,
  recordatorios_email      boolean     not null default true,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

create trigger parametros_updated_at
  before update on public.parametros
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- cuentas (medios de pago)
-- ---------------------------------------------------------------------
create table public.cuentas (
  id                   uuid primary key default gen_random_uuid(),
  user_id              uuid not null default auth.uid() references auth.users (id) on delete cascade,
  nombre               text not null check (length(trim(nombre)) between 1 and 60),
  tipo                 public.tipo_cuenta not null,
  entidad              text,
  saldo_inicial        numeric(14,2) not null default 0,
  fecha_saldo_inicial  date,
  color                text,
  activa               boolean not null default true,
  orden                smallint not null default 0,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  unique (user_id, nombre)
);

create index cuentas_user_idx on public.cuentas (user_id);

create trigger cuentas_updated_at
  before update on public.cuentas
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- categorias (con subcategorías vía padre_id)
-- ---------------------------------------------------------------------
create table public.categorias (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid not null default auth.uid() references auth.users (id) on delete cascade,
  tipo                  public.tipo_categoria not null,
  grupo                 text not null,
  nombre                text not null check (length(trim(nombre)) between 1 and 60),
  padre_id              uuid references public.categorias (id) on delete cascade,
  icono                 text,
  color                 text,
  bolsa                 public.bolsa_503020 not null default 'no_aplica',
  es_fija               boolean not null default false,
  requiere_descripcion  boolean not null default false,
  es_sistema            boolean not null default false,
  activa                boolean not null default true,
  orden                 smallint not null default 0,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  unique nulls not distinct (user_id, tipo, padre_id, nombre),
  check (padre_id is null or padre_id <> id)
);

create index categorias_user_idx on public.categorias (user_id, tipo);
create index categorias_padre_idx on public.categorias (padre_id);

create trigger categorias_updated_at
  before update on public.categorias
  for each row execute function public.set_updated_at();

-- Una subcategoría debe pertenecer al mismo usuario y tipo que su padre.
create or replace function public.validar_categoria_padre()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_padre public.categorias%rowtype;
begin
  if new.padre_id is null then
    return new;
  end if;
  select * into v_padre from public.categorias where id = new.padre_id;
  if v_padre.user_id <> new.user_id or v_padre.tipo <> new.tipo then
    raise exception 'La subcategoría debe tener el mismo usuario y tipo que su categoría padre';
  end if;
  if v_padre.padre_id is not null then
    raise exception 'Solo se permite un nivel de subcategorías';
  end if;
  return new;
end;
$$;

create trigger categorias_validar_padre
  before insert or update of padre_id, tipo on public.categorias
  for each row execute function public.validar_categoria_padre();

-- ---------------------------------------------------------------------
-- periodos (un registro por mes)
-- ---------------------------------------------------------------------
create table public.periodos (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users (id) on delete cascade,
  mes           date not null check (extract(day from mes) = 1),
  estado        public.estado_periodo not null default 'abierto',
  cerrado_en    timestamptz,
  reabierto_en  timestamptz,
  notas         text,
  snapshot      jsonb,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (user_id, mes),
  check ((estado = 'cerrado') = (cerrado_en is not null))
);

create trigger periodos_updated_at
  before update on public.periodos
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- RLS: cada usuario solo ve y modifica lo suyo
-- ---------------------------------------------------------------------
alter table public.parametros enable row level security;
alter table public.cuentas    enable row level security;
alter table public.categorias enable row level security;
alter table public.periodos   enable row level security;

create policy propietario on public.parametros
  for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy propietario on public.cuentas
  for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy propietario on public.categorias
  for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy propietario on public.periodos
  for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- Permisos explícitos: el rol anónimo no accede a nada.
revoke all on public.parametros, public.cuentas, public.categorias, public.periodos from anon;
grant select, insert, update, delete
  on public.parametros, public.cuentas, public.categorias, public.periodos
  to authenticated;
-- parametros: la fila la crea el sistema; el usuario solo la lee y la edita.
revoke insert, delete on public.parametros from authenticated;

-- ---------------------------------------------------------------------
-- Datos iniciales por usuario (categorías del doc 01 §5, parámetros, efectivo)
-- ---------------------------------------------------------------------
create or replace function public.inicializar_usuario(p_user uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_otros uuid;
begin
  insert into public.parametros (user_id) values (p_user)
  on conflict (user_id) do nothing;

  insert into public.cuentas (user_id, nombre, tipo, orden)
  values (p_user, 'Efectivo', 'efectivo', 0)
  on conflict (user_id, nombre) do nothing;

  -- Categorías de nivel 1
  insert into public.categorias
    (user_id, tipo, grupo, nombre, icono, color, bolsa, es_fija, requiere_descripcion, es_sistema, orden)
  select p_user, c.tipo::public.tipo_categoria, c.grupo, c.nombre, c.icono, c.color,
         c.bolsa::public.bolsa_503020, c.es_fija, c.req, c.sis, c.orden
  from (values
    -- INGRESOS
    ('ingreso','Laborales',          'Sueldo / honorarios',       'briefcase',      '#1F5A45','no_aplica',   true,  false, false, 10),
    ('ingreso','Laborales',          'Otros laborales',           'award',          '#1F5A45','no_aplica',   false, false, false, 11),
    ('ingreso','Recuperación',       'Recuperación de préstamos', 'hand-coins',     '#1D4E89','no_aplica',   false, false, true,  20),
    ('ingreso','Otros ingresos',     'Freelance / proyectos',     'laptop',         '#6B8F3A','no_aplica',   false, false, false, 30),
    ('ingreso','Otros ingresos',     'Rendimientos',              'trending-up',    '#6B8F3A','no_aplica',   false, false, false, 31),
    ('ingreso','Otros ingresos',     'Ventas',                    'tag',            '#6B8F3A','no_aplica',   false, false, false, 32),
    ('ingreso','Otros ingresos',     'Devoluciones',              'rotate-ccw',     '#6B8F3A','no_aplica',   false, false, false, 33),
    ('ingreso','Otros ingresos',     'Regalos',                   'gift',           '#6B8F3A','no_aplica',   false, false, false, 34),
    ('ingreso','Otros ingresos',     'Otros ingresos',            'plus-circle',    '#6B8F3A','no_aplica',   false, true,  false, 35),
    -- GASTOS
    ('gasto',  'Vivienda',           'Arriendo',                  'home',           '#1F5A45','necesidad',   true,  false, false, 100),
    ('gasto',  'Servicios públicos', 'Energía (luz)',             'zap',            '#3A6EA5','necesidad',   false, false, false, 110),
    ('gasto',  'Servicios públicos', 'Agua',                      'droplet',        '#3A6EA5','necesidad',   false, false, false, 111),
    ('gasto',  'Servicios públicos', 'Gas',                       'flame',          '#3A6EA5','necesidad',   false, false, false, 112),
    ('gasto',  'Telecomunicaciones', 'Internet',                  'wifi',           '#8C4F7D','necesidad',   true,  false, false, 120),
    ('gasto',  'Telecomunicaciones', 'Plan de celular',           'smartphone',     '#8C4F7D','necesidad',   true,  false, false, 121),
    ('gasto',  'Financiero',         'Tarjetas de crédito',       'credit-card',    '#B8483A','no_aplica',   false, false, true,  130),
    ('gasto',  'Financiero',         'Costos financieros TC',     'percent',        '#B8483A','necesidad',   false, false, true,  131),
    ('gasto',  'Financiero',         'Préstamos',                 'landmark',       '#B8483A','necesidad',   true,  false, false, 132),
    ('gasto',  'Financiero',         'Intereses de préstamos',    'percent',        '#B8483A','necesidad',   false, false, true,  133),
    ('gasto',  'Financiero',         'Cooperativas',              'users',          '#B8483A','necesidad',   true,  false, false, 134),
    ('gasto',  'Financiero',         'GMF (4x1000)',              'receipt',        '#B8483A','necesidad',   false, false, false, 135),
    ('gasto',  'Empresa',            'Devtopia – otros gastos',   'building-2',     '#C9772B','no_aplica',   false, true,  false, 140),
    ('gasto',  'Seguridad social',   'Seguridad social (PILA)',   'shield-check',   '#6B8F3A','necesidad',   true,  false, false, 150),
    ('gasto',  'Ahorro',             'Ahorro y metas',            'piggy-bank',     '#1F5A45','ahorro_deuda',false, false, false, 160),
    ('gasto',  'Otros',              'Otros gastos',              'shopping-bag',   '#8A8577','no_aplica',   false, true,  false, 190)
  ) as c(tipo, grupo, nombre, icono, color, bolsa, es_fija, req, sis, orden)
  on conflict do nothing;

  -- Subcategorías de "Otros gastos"
  select id into v_otros
  from public.categorias
  where user_id = p_user and tipo = 'gasto' and padre_id is null and nombre = 'Otros gastos';

  insert into public.categorias
    (user_id, tipo, grupo, nombre, padre_id, icono, color, bolsa, requiere_descripcion, orden)
  select p_user, 'gasto', 'Otros', s.nombre, v_otros, s.icono, '#8A8577', s.bolsa::public.bolsa_503020, s.req, s.orden
  from (values
    ('Mercado',                   'shopping-cart',  'necesidad', false, 1),
    ('Restaurantes y domicilios', 'utensils',       'deseo',     false, 2),
    ('Transporte',                'car',            'necesidad', false, 3),
    ('Salud y droguería',         'heart-pulse',    'necesidad', false, 4),
    ('Educación',                 'graduation-cap', 'necesidad', false, 5),
    ('Ocio y suscripciones',      'clapperboard',   'deseo',     false, 6),
    ('Ropa',                      'shirt',          'deseo',     false, 7),
    ('Hogar',                     'sofa',           'necesidad', false, 8),
    ('Mascotas',                  'paw-print',      'necesidad', false, 9),
    ('Regalos',                   'gift',           'deseo',     false, 10),
    ('Viajes',                    'plane',          'deseo',     false, 11),
    ('Impuestos y trámites',      'file-text',      'necesidad', false, 12),
    ('Imprevistos',               'alert-triangle', 'necesidad', false, 13),
    ('Otro',                      'circle-help',    'no_aplica', true,  14)
  ) as s(nombre, icono, bolsa, req, orden)
  on conflict do nothing;
end;
$$;

revoke all on function public.inicializar_usuario(uuid) from public, anon, authenticated;

-- Al crear un usuario en Auth, se inicializan sus datos.
create or replace function public.al_crear_usuario()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.inicializar_usuario(new.id);
  return new;
end;
$$;

revoke all on function public.al_crear_usuario() from public, anon, authenticated;

create trigger al_crear_usuario
  after insert on auth.users
  for each row execute function public.al_crear_usuario();
