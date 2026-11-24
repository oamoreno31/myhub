-- =====================================================================
-- F8 · Captura desde iPhone (docs/08-atajos-iphone.md)
--  · tokens_api: tokens personales para los Atajos (solo se guarda el sha256).
--  · alias_origen: lo que el atajo aprende (tarjeta de Wallet, últimos 4 del SMS, nombre dictado → cuenta).
--  · capturas_atajo: bitácora técnica de cada llamada (sin saldos), base del límite de frecuencia.
--  · movimientos / compras_tc: origen_registro, por_revisar, clave_idempotencia.
--  · Categoría de sistema "Por clasificar" (gasto e ingreso).
--  · atajo_contexto(token, datos) y atajo_registrar(token, datos): únicas puertas de entrada del
--    atajo. Son security definer, resuelven el usuario por el token y fijan user_id en cada insert;
--    los triggers existentes (periodo, validación, mes cerrado, recálculo de tarjeta) aplican igual.
--  · Respaldo: incluye alias_origen; la restauración completa con su valor por defecto las columnas
--    obligatorias que un respaldo anterior no trae.
-- Errores con SQLSTATE PTxxx: PostgREST responde con ese código HTTP (401, 403, 429).
-- =====================================================================

-- ---------------------------------------------------------------------
-- Utilidades
-- ---------------------------------------------------------------------

-- Clave de comparación de textos: sin mayúsculas, espacios dobles ni tildes (igual que v_comercios_mes).
-- Espejo en TS: claveTexto() de src/lib/domain/interpretar.ts.
create or replace function public.clave_texto(p_texto text)
returns text
language sql
immutable
set search_path = ''
as $$
  select nullif(
    translate(lower(regexp_replace(trim(coalesce(p_texto, '')), '\s+', ' ', 'g')), 'áéíóúüàèìòù', 'aeiouuaeiou'),
    ''
  );
$$;

-- Fecha de hoy en la zona horaria del usuario (parametros.zona_horaria).
create or replace function public._hoy_de(p_user uuid)
returns date
language sql
stable
set search_path = ''
as $$
  select (now() at time zone coalesce(
    (select p.zona_horaria from public.parametros p where p.user_id = p_user), 'America/Bogota'))::date;
$$;

revoke all on function public._hoy_de(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- Columnas nuevas en movimientos y compras_tc
-- ---------------------------------------------------------------------
alter table public.movimientos
  add column origen_registro text not null default 'app'
    check (origen_registro in ('app', 'atajo_wallet', 'atajo_sms', 'atajo_rapido', 'atajo_dictado')),
  add column por_revisar boolean not null default false,
  add column clave_idempotencia text
    check (clave_idempotencia is null or length(clave_idempotencia) between 8 and 80);

alter table public.compras_tc
  add column origen_registro text not null default 'app'
    check (origen_registro in ('app', 'atajo_wallet', 'atajo_sms', 'atajo_rapido', 'atajo_dictado')),
  add column por_revisar boolean not null default false,
  add column clave_idempotencia text
    check (clave_idempotencia is null or length(clave_idempotencia) between 8 and 80);

create unique index movimientos_clave_idx on public.movimientos (user_id, clave_idempotencia)
  where clave_idempotencia is not null;
create unique index compras_tc_clave_idx on public.compras_tc (user_id, clave_idempotencia)
  where clave_idempotencia is not null;
create index movimientos_por_revisar_idx on public.movimientos (user_id) where por_revisar;
create index compras_tc_por_revisar_idx on public.compras_tc (user_id) where por_revisar;

-- ---------------------------------------------------------------------
-- Categoría de sistema "Por clasificar" (se crea si falta: usuarios nuevos o respaldos antiguos)
-- ---------------------------------------------------------------------
create or replace function public._categoria_por_clasificar(p_user uuid, p_tipo text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  select id into v_id from public.categorias
  where user_id = p_user and tipo = p_tipo::public.tipo_categoria and padre_id is null and nombre = 'Por clasificar';
  if v_id is null then
    insert into public.categorias
      (user_id, tipo, grupo, nombre, icono, color, bolsa, es_sistema, orden)
    values
      (p_user, p_tipo::public.tipo_categoria, case p_tipo when 'gasto' then 'Otros' else 'Otros ingresos' end,
       'Por clasificar', 'inbox', '#8A8577', 'no_aplica', true, case p_tipo when 'gasto' then 195 else 39 end)
    on conflict do nothing
    returning id into v_id;
    if v_id is null then
      select id into v_id from public.categorias
      where user_id = p_user and tipo = p_tipo::public.tipo_categoria and padre_id is null and nombre = 'Por clasificar';
    end if;
  end if;
  return v_id;
end;
$$;

revoke all on function public._categoria_por_clasificar(uuid, text) from public, anon, authenticated;

do $$
declare
  r record;
begin
  for r in select user_id from public.parametros loop
    perform public._categoria_por_clasificar(r.user_id, 'gasto');
    perform public._categoria_por_clasificar(r.user_id, 'ingreso');
  end loop;
end;
$$;

-- ---------------------------------------------------------------------
-- tokens_api
-- ---------------------------------------------------------------------
create table public.tokens_api (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null default auth.uid() references auth.users (id) on delete cascade,
  nombre             text not null check (length(trim(nombre)) between 1 and 40),
  prefijo            text not null,
  token_hash         text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  alcances           text[] not null default '{registrar}',
  usos               integer not null default 0,
  ultimo_uso_en      timestamptz,
  ultimo_uso_fuente  text,
  expira_en          timestamptz,
  revocado_en        timestamptz,
  created_at         timestamptz not null default now()
);

create index tokens_api_user_idx on public.tokens_api (user_id);

alter table public.tokens_api enable row level security;
create policy propietario on public.tokens_api
  for select to authenticated
  using (user_id = (select auth.uid()));

-- El hash nunca sale de la base: el usuario lee todas las columnas menos token_hash.
revoke all on public.tokens_api from anon, authenticated;
grant select (id, user_id, nombre, prefijo, alcances, usos, ultimo_uso_en, ultimo_uso_fuente, expira_en,
              revocado_en, created_at)
  on public.tokens_api to authenticated;

/** Crea un token para el usuario de la sesión. Devuelve el token en claro UNA sola vez. */
create or replace function public.crear_token_api(p_nombre text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_token text;
  v_id uuid;
begin
  if v_user is null then
    raise exception 'Sin sesión' using errcode = '42501';
  end if;
  if length(trim(coalesce(p_nombre, ''))) not between 1 and 40 then
    raise exception 'Ponle un nombre al token (máx. 40 caracteres), p. ej. "iPhone de Omar"';
  end if;
  if (select count(*) from public.tokens_api t
      where t.user_id = v_user and t.revocado_en is null and (t.expira_en is null or t.expira_en > now())) >= 5 then
    raise exception 'Ya tienes 5 tokens activos; revoca uno antes de crear otro';
  end if;
  -- 64 hex = dos UUID v4 (≈ 244 bits aleatorios).
  v_token := 'pc_' || replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  insert into public.tokens_api (user_id, nombre, prefijo, token_hash)
  values (v_user, trim(p_nombre), left(v_token, 9), encode(sha256(convert_to(v_token, 'UTF8')), 'hex'))
  returning id into v_id;
  return jsonb_build_object('id', v_id, 'token', v_token, 'prefijo', left(v_token, 9));
end;
$$;

revoke all on function public.crear_token_api(text) from public, anon;
grant execute on function public.crear_token_api(text) to authenticated;

create or replace function public.revocar_token_api(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Sin sesión' using errcode = '42501';
  end if;
  update public.tokens_api set revocado_en = now()
  where id = p_id and user_id = auth.uid() and revocado_en is null;
  if not found then
    raise exception 'Token no encontrado o ya revocado' using errcode = 'P0002';
  end if;
end;
$$;

revoke all on function public.revocar_token_api(uuid) from public, anon;
grant execute on function public.revocar_token_api(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- alias_origen (aprendizaje: lo que llega del iPhone → cuenta o tarjeta)
-- ---------------------------------------------------------------------
create table public.alias_origen (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  tipo        text not null check (tipo in ('wallet_tarjeta', 'sms_ultimos4', 'nombre_dictado')),
  valor       text not null check (length(valor) between 1 and 80),
  cuenta_id   uuid not null references public.cuentas (id) on delete cascade,
  usos        integer not null default 1,
  ultimo_uso  timestamptz not null default now(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (user_id, tipo, valor)
);

create index alias_origen_cuenta_idx on public.alias_origen (cuenta_id);

create trigger alias_origen_updated_at
  before update on public.alias_origen
  for each row execute function public.set_updated_at();

create or replace function public.validar_alias_origen()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  perform public.exigir_propietario('public.cuentas', new.cuenta_id, new.user_id, 'Cuenta');
  new.valor := public.clave_texto(new.valor);
  if new.valor is null then
    raise exception 'El alias no puede estar vacío';
  end if;
  return new;
end;
$$;

create trigger alias_origen_validar
  before insert or update on public.alias_origen
  for each row execute function public.validar_alias_origen();

alter table public.alias_origen enable row level security;
create policy propietario on public.alias_origen
  for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
revoke all on public.alias_origen from anon;
grant select, insert, update, delete on public.alias_origen to authenticated;

-- ---------------------------------------------------------------------
-- capturas_atajo (bitácora técnica; se purga a los 30 días)
-- ---------------------------------------------------------------------
create table public.capturas_atajo (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references auth.users (id) on delete cascade,
  token_id           uuid references public.tokens_api (id) on delete set null,
  fuente             text not null check (fuente in ('wallet', 'sms', 'rapido', 'dictado')),
  etapa              text not null check (etapa in ('contexto', 'registrar')),
  resultado          text not null check (resultado in ('consultado', 'ignorado', 'registrado', 'repetido', 'rechazado')),
  mensaje            text check (mensaje is null or length(mensaje) <= 300),
  movimiento_id      uuid references public.movimientos (id) on delete set null,
  compra_tc_id       uuid references public.compras_tc (id) on delete set null,
  texto_enmascarado  text check (texto_enmascarado is null or length(texto_enmascarado) <= 500),
  creado_en          timestamptz not null default now()
);

create index capturas_atajo_user_idx on public.capturas_atajo (user_id, creado_en desc);
create index capturas_atajo_token_idx on public.capturas_atajo (token_id, creado_en desc);

alter table public.capturas_atajo enable row level security;
create policy propietario on public.capturas_atajo
  for select to authenticated
  using (user_id = (select auth.uid()));
revoke all on public.capturas_atajo from anon, authenticated;
grant select on public.capturas_atajo to authenticated;

/** Purga de la bitácora técnica (cron diario). */
create or replace function public.purgar_capturas_atajo()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_n integer;
begin
  delete from public.capturas_atajo where creado_en < now() - interval '30 days';
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

revoke all on function public.purgar_capturas_atajo() from public, anon, authenticated;
grant execute on function public.purgar_capturas_atajo() to service_role;

-- ---------------------------------------------------------------------
-- Piezas internas de los atajos
-- ---------------------------------------------------------------------

/** Valida el token (formato, hash, revocado, vencido, alcance) y el límite de frecuencia. */
create or replace function public._token_valido(p_token text)
returns public.tokens_api
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.tokens_api;
begin
  if p_token is null or p_token !~ '^pc_[0-9a-f]{64}$' then
    raise exception 'Token inválido o revocado' using errcode = 'PT401';
  end if;
  select * into v from public.tokens_api where token_hash = encode(sha256(convert_to(p_token, 'UTF8')), 'hex');
  if not found or v.revocado_en is not null or (v.expira_en is not null and v.expira_en <= now()) then
    raise exception 'Token inválido o revocado' using errcode = 'PT401';
  end if;
  if not ('registrar' = any (v.alcances)) then
    raise exception 'Este token no permite registrar movimientos' using errcode = 'PT403';
  end if;
  -- Cuando exista F7 (multiusuario), aquí se exige además perfiles.estado = 'activo'.
  if (select count(*) from public.capturas_atajo c
      where c.token_id = v.id and c.creado_en > now() - interval '1 minute') >= 40
     or (select count(*) from public.capturas_atajo c
         where c.token_id = v.id and c.creado_en > now() - interval '1 day') >= 400 then
    raise exception 'Demasiadas solicitudes seguidas; espera un momento' using errcode = 'PT429';
  end if;
  return v;
end;
$$;

revoke all on function public._token_valido(text) from public, anon, authenticated;

/** Cuentas y tarjetas activas que sirven de origen, ordenadas por uso reciente (60 días). */
create or replace function public._origenes_atajo(p_user uuid)
returns table (
  id uuid, nombre text, tipo_cuenta text, es_tarjeta boolean, tarjeta_id uuid, ultimos4 text, usos integer,
  ultimo_uso timestamptz
)
language sql
stable
set search_path = ''
as $$
  with uso as (
    select m.cuenta_id as cid, count(*) as n, max(m.created_at) as u
    from public.movimientos m
    where m.user_id = p_user and m.tipo in ('gasto', 'ingreso') and m.created_at > now() - interval '60 days'
    group by m.cuenta_id
    union all
    select t.cuenta_id, count(*), max(c.created_at)
    from public.compras_tc c
    join public.tarjetas_credito t on t.id = c.tarjeta_id
    where c.user_id = p_user and c.tipo = 'compra' and c.created_at > now() - interval '60 days'
    group by t.cuenta_id
  )
  select cu.id, cu.nombre, cu.tipo::text, cu.tipo = 'tarjeta_credito', t.id, t.ultimos4,
         coalesce(sum(u.n), 0)::integer, max(u.u)
  from public.cuentas cu
  left join public.tarjetas_credito t on t.cuenta_id = cu.id
  left join uso u on u.cid = cu.id
  where cu.user_id = p_user and cu.activa
    and (cu.tipo <> 'tarjeta_credito' or coalesce(t.activa, false))
  group by cu.id, cu.nombre, cu.tipo, cu.orden, t.id, t.ultimos4
  order by coalesce(sum(u.n), 0) desc, max(u.u) desc nulls last, cu.orden, cu.nombre;
$$;

revoke all on function public._origenes_atajo(uuid) from public, anon, authenticated;

/**
 * Categoría sugerida por historial: la más usada con el mismo comercio (o descripción).
 * "Éxito" coincide con "Éxito Chapinero" (una clave es prefijo de la otra, por palabras).
 * Confiable: al menos 2 usos y ≥ 2/3 de las coincidencias.
 */
create or replace function public._sugerir_categoria(p_user uuid, p_tipo text, p_texto text)
returns table (categoria_id uuid, nombre text, usos integer, confiable boolean)
language sql
stable
set search_path = ''
as $$
  with k as (select public.clave_texto(p_texto) as clave),
  hist as (
    select m.categoria_id, m.created_at, public.clave_texto(coalesce(m.comercio, m.descripcion)) as clave
    from public.movimientos m
    where m.user_id = p_user and m.tipo::text = p_tipo and not m.por_revisar
    union all
    select c.categoria_id, c.created_at, public.clave_texto(coalesce(c.comercio, c.descripcion))
    from public.compras_tc c
    where p_tipo = 'gasto' and c.user_id = p_user and c.tipo = 'compra' and not c.por_revisar
  ),
  coincide as (
    select h.categoria_id, h.created_at
    from hist h, k
    where k.clave is not null and h.clave is not null and h.categoria_id is not null
      and (h.clave = k.clave or k.clave like h.clave || ' %' or h.clave like k.clave || ' %')
  ),
  conteo as (
    select co.categoria_id, count(*) as n, max(co.created_at) as u from coincide co group by co.categoria_id
  )
  select c.categoria_id, ca.nombre, c.n::integer,
         c.n >= 2 and c.n * 3 >= 2 * (select count(*) from coincide)
  from conteo c
  join public.categorias ca on ca.id = c.categoria_id
  where ca.activa and not (ca.es_sistema and ca.nombre = 'Por clasificar')
  order by c.n desc, c.u desc
  limit 1;
$$;

revoke all on function public._sugerir_categoria(uuid, text, text) from public, anon, authenticated;

/** Último registro con el mismo monto en los últimos 15 minutos (opcionalmente del mismo origen). */
create or replace function public._posible_duplicado(p_user uuid, p_monto numeric, p_cuenta uuid)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'id', x.id,
    'hace_min', greatest(0, floor(extract(epoch from now() - x.created_at) / 60))::integer,
    'descripcion', x.descripcion,
    'origen', x.origen,
    'monto', x.monto
  )
  from (
    select m.id, m.created_at, coalesce(m.comercio, m.descripcion) as descripcion, cu.nombre as origen,
           m.cuenta_id as cid, m.monto
    from public.movimientos m
    join public.cuentas cu on cu.id = m.cuenta_id
    where m.user_id = p_user and m.tipo in ('gasto', 'ingreso', 'transferencia')
      and m.monto = p_monto and m.created_at > now() - interval '15 minutes'
    union all
    select c.id, c.created_at, coalesce(c.comercio, c.descripcion), cu.nombre, t.cuenta_id, c.monto
    from public.compras_tc c
    join public.tarjetas_credito t on t.id = c.tarjeta_id
    join public.cuentas cu on cu.id = t.cuenta_id
    where c.user_id = p_user and c.tipo = 'compra'
      and c.monto = p_monto and c.created_at > now() - interval '15 minutes'
  ) x
  where p_monto is not null and (p_cuenta is null or x.cid = p_cuenta)
  order by x.created_at desc
  limit 1;
$$;

revoke all on function public._posible_duplicado(uuid, numeric, uuid) from public, anon, authenticated;

/** Resumen de lo registrado (para el mensaje del atajo y para reintentos idempotentes). */
create or replace function public._resumen_registro(p_registro text, p_id uuid)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'id', m.id, 'registro', 'movimiento', 'tipo', m.tipo, 'monto', m.monto, 'fecha', m.fecha,
    'origen', cu.nombre, 'destino', cd.nombre, 'ultimos4', null, 'categoria', ca.nombre,
    'por_revisar', m.por_revisar, 'cuotas', null, 'descripcion', m.descripcion)
  from public.movimientos m
  join public.cuentas cu on cu.id = m.cuenta_id
  left join public.cuentas cd on cd.id = m.cuenta_destino_id
  left join public.categorias ca on ca.id = m.categoria_id
  where p_registro = 'movimiento' and m.id = p_id
  union all
  select jsonb_build_object(
    'id', c.id, 'registro', 'compra_tc', 'tipo', 'gasto', 'monto', c.monto, 'fecha', c.fecha,
    'origen', cu.nombre, 'destino', null, 'ultimos4', t.ultimos4, 'categoria', ca.nombre, 'por_revisar', c.por_revisar,
    'cuotas', c.num_cuotas, 'descripcion', c.descripcion)
  from public.compras_tc c
  join public.tarjetas_credito t on t.id = c.tarjeta_id
  join public.cuentas cu on cu.id = t.cuenta_id
  left join public.categorias ca on ca.id = c.categoria_id
  where p_registro = 'compra_tc' and c.id = p_id;
$$;

revoke all on function public._resumen_registro(text, uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- atajo_contexto: lo que el atajo necesita antes de preguntar
-- ---------------------------------------------------------------------
/**
 * p_datos (lo arma la ruta /api/atajos/v1/contexto tras interpretar el SMS o el dictado):
 *   fuente: wallet | sms | rapido | dictado
 *   accion: preguntar | ignorar          (ignorar: SMS que no es un movimiento)
 *   tipo: gasto | ingreso | null
 *   monto, comercio, ultimos4, medio (credito | debito), tarjeta_wallet, texto_origen, texto_enmascarado
 * Devuelve origen y categoría sugeridos, posible duplicado, listas ordenadas y una clave de idempotencia.
 * No devuelve saldos ni historial.
 */
create or replace function public.atajo_contexto(p_token text, p_datos jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tok public.tokens_api;
  v_user uuid;
  v_datos jsonb := coalesce(p_datos, '{}'::jsonb);
  v_fuente text := coalesce(nullif(v_datos ->> 'fuente', ''), 'rapido');
  v_tipo text := coalesce(nullif(v_datos ->> 'tipo', ''), 'gasto');
  v_monto numeric;
  v_ultimos4 text := nullif(v_datos ->> 'ultimos4', '');
  v_medio text := nullif(v_datos ->> 'medio', '');
  v_texto_origen text := public.clave_texto(v_datos ->> 'texto_origen');
  v_cuenta uuid;
  v_razon text;
  v_fuerte boolean := false;
  v_sug record;
  v_origenes jsonb;
  v_cat_gasto jsonb;
  v_cat_ingreso jsonb;
begin
  v_tok := public._token_valido(p_token);
  v_user := v_tok.user_id;
  if v_fuente not in ('wallet', 'sms', 'rapido', 'dictado') then
    v_fuente := 'rapido';
  end if;
  if v_tipo not in ('gasto', 'ingreso', 'transferencia') then
    v_tipo := 'gasto';
  end if;
  if coalesce(v_datos ->> 'monto', '') ~ '^[0-9]{1,12}(\.[0-9]{1,2})?$' then
    v_monto := (v_datos ->> 'monto')::numeric;
  end if;
  if v_ultimos4 is not null and v_ultimos4 !~ '^[0-9]{4}$' then
    v_ultimos4 := null;
  end if;

  insert into public.capturas_atajo (user_id, token_id, fuente, etapa, resultado, texto_enmascarado)
  values (v_user, v_tok.id, v_fuente, 'contexto',
          case when v_datos ->> 'accion' = 'ignorar' then 'ignorado' else 'consultado' end,
          left(nullif(v_datos ->> 'texto_enmascarado', ''), 500));
  update public.tokens_api
  set ultimo_uso_en = now(), ultimo_uso_fuente = v_fuente, usos = usos + 1
  where id = v_tok.id;

  if v_datos ->> 'accion' = 'ignorar' then
    return jsonb_build_object('accion', 'ignorar');
  end if;

  -- 1) Origen sugerido: alias aprendido > últimos 4 de una tarjeta > nombre en el dictado > el más reciente.
  if v_datos ->> 'tarjeta_wallet' is not null then
    select a.cuenta_id into v_cuenta from public.alias_origen a
    join public.cuentas cu on cu.id = a.cuenta_id and cu.activa
    where a.user_id = v_user and a.tipo = 'wallet_tarjeta' and a.valor = public.clave_texto(v_datos ->> 'tarjeta_wallet');
    if v_cuenta is not null then v_razon := 'alias'; v_fuerte := true; end if;
  end if;
  if v_cuenta is null and v_ultimos4 is not null then
    select a.cuenta_id into v_cuenta from public.alias_origen a
    join public.cuentas cu on cu.id = a.cuenta_id and cu.activa
    where a.user_id = v_user and a.tipo = 'sms_ultimos4' and a.valor = v_ultimos4;
    if v_cuenta is null and v_medio is distinct from 'debito' then
      select t.cuenta_id into v_cuenta from public.tarjetas_credito t
      join public.cuentas cu on cu.id = t.cuenta_id and cu.activa
      where t.user_id = v_user and t.activa and t.ultimos4 = v_ultimos4
      order by t.created_at limit 1;
    end if;
    if v_cuenta is not null then v_razon := 'ultimos4'; v_fuerte := true; end if;
  end if;
  if v_cuenta is null and v_texto_origen is not null then
    select a.cuenta_id into v_cuenta from public.alias_origen a
    join public.cuentas cu on cu.id = a.cuenta_id and cu.activa
    where a.user_id = v_user and a.tipo = 'nombre_dictado'
      and position(' ' || a.valor || ' ' in ' ' || v_texto_origen || ' ') > 0
    order by length(a.valor) desc limit 1;
    if v_cuenta is null then
      select cu.id into v_cuenta from public.cuentas cu
      where cu.user_id = v_user and cu.activa
        and (position(' ' || public.clave_texto(cu.nombre) || ' ' in ' ' || v_texto_origen || ' ') > 0
             or position(' ' || v_texto_origen || ' ' in ' ' || public.clave_texto(cu.nombre) || ' ') > 0)
      -- Primero el nombre completo dentro de lo dictado; si no, la cuenta más corta que contiene lo dictado.
      order by (position(' ' || public.clave_texto(cu.nombre) || ' ' in ' ' || v_texto_origen || ' ') > 0) desc,
               length(cu.nombre) * case when position(' ' || public.clave_texto(cu.nombre) || ' ' in ' ' || v_texto_origen || ' ') > 0 then -1 else 1 end,
               cu.orden
      limit 1;
    end if;
    if v_cuenta is not null then v_razon := 'nombre'; v_fuerte := true; end if;
  end if;
  if v_cuenta is null then
    select o.id into v_cuenta from public._origenes_atajo(v_user) o
    where o.ultimo_uso is not null and (v_tipo = 'gasto' or not o.es_tarjeta)
    order by o.ultimo_uso desc limit 1;
    if v_cuenta is not null then v_razon := 'reciente'; end if;
  end if;

  -- 2) Listas ordenadas (sugerido primero; luego por uso).
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', o.id, 'nombre', o.nombre, 'tipo', o.tipo_cuenta, 'tarjeta', o.es_tarjeta, 'ultimos4', o.ultimos4,
           'sugerido', o.id = v_cuenta)
         order by (o.id = v_cuenta) desc, o.usos desc, o.ultimo_uso desc nulls last, o.nombre), '[]'::jsonb)
  into v_origenes
  from public._origenes_atajo(v_user) o;

  with uso as (
    select m.categoria_id, count(*) as n from public.movimientos m
    where m.user_id = v_user and m.tipo in ('gasto', 'ingreso') and m.created_at > now() - interval '90 days'
    group by m.categoria_id
    union all
    select c.categoria_id, count(*) from public.compras_tc c
    where c.user_id = v_user and c.tipo = 'compra' and c.created_at > now() - interval '90 days'
    group by c.categoria_id
  ),
  total as (select u.categoria_id, sum(u.n) as n from uso u group by u.categoria_id),
  lista as (
    select c.id, c.nombre, c.tipo, p.nombre as padre, coalesce(t.n, 0) as n,
           coalesce(p.orden, c.orden) as orden_grupo, c.orden
    from public.categorias c
    left join public.categorias p on p.id = c.padre_id
    left join total t on t.categoria_id = c.id
    where c.user_id = v_user and c.activa and (p.id is null or p.activa)
      and not (c.es_sistema and c.nombre in
               ('Tarjetas de crédito', 'Costos financieros TC', 'Intereses de préstamos', 'Por clasificar'))
      and c.grupo <> 'Recuperación'
  )
  select
    coalesce(jsonb_agg(jsonb_build_object('id', l.id, 'nombre', l.nombre, 'padre', l.padre)
             order by l.n desc, l.orden_grupo, l.orden, l.nombre) filter (where l.tipo = 'gasto'), '[]'::jsonb),
    coalesce(jsonb_agg(jsonb_build_object('id', l.id, 'nombre', l.nombre, 'padre', l.padre)
             order by l.n desc, l.orden_grupo, l.orden, l.nombre) filter (where l.tipo = 'ingreso'), '[]'::jsonb)
  into v_cat_gasto, v_cat_ingreso
  from lista l;

  -- 3) Categoría sugerida por comercio.
  select * into v_sug from public._sugerir_categoria(v_user, v_tipo, v_datos ->> 'comercio');

  return jsonb_build_object(
    'accion', 'preguntar',
    'hoy', public._hoy_de(v_user),
    'tipo', v_tipo,
    'origen_sugerido', v_cuenta,
    'origen_razon', v_razon,
    'categoria_sugerida', case when v_sug.categoria_id is null then null else jsonb_build_object(
      'id', v_sug.categoria_id, 'nombre', v_sug.nombre, 'confiable', v_sug.confiable) end,
    'posible_duplicado', public._posible_duplicado(v_user, v_monto, case when v_fuerte then v_cuenta end),
    'origenes', v_origenes,
    'categorias_gasto', v_cat_gasto,
    'categorias_ingreso', v_cat_ingreso,
    'clave', gen_random_uuid()::text
  );
end;
$$;

revoke all on function public.atajo_contexto(text, jsonb) from public;
grant execute on function public.atajo_contexto(text, jsonb) to anon, authenticated;

-- ---------------------------------------------------------------------
-- atajo_registrar: crea el gasto/ingreso (cuenta) o la compra (tarjeta de crédito)
-- ---------------------------------------------------------------------
/**
 * p_datos (lo arma la ruta /api/atajos/v1/registrar):
 *   clave (idempotencia, la entrega atajo_contexto), fuente, tipo (gasto | ingreso), origen (id de cuenta),
 *   monto (número > 0), descripcion, comercio, categoria (auto | pendiente | id), cuotas (1–48, tarjeta),
 *   revisar (bool: forzar "por revisar"), alias ([{tipo, valor}] a aprender con este origen)
 * La fecha es siempre HOY en la zona del usuario.
 * Errores de negocio → {ok: false, mensaje} (quedan en capturas_atajo). Token/frecuencia → excepción PTxxx.
 */
create or replace function public.atajo_registrar(p_token text, p_datos jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tok public.tokens_api;
  v_user uuid;
  v_datos jsonb := coalesce(p_datos, '{}'::jsonb);
  v_fuente text := coalesce(nullif(v_datos ->> 'fuente', ''), 'rapido');
  v_clave text := nullif(trim(v_datos ->> 'clave'), '');
  v_tipo text := coalesce(nullif(v_datos ->> 'tipo', ''), 'gasto');
  v_hoy date;
  v_monto numeric;
  v_cuenta public.cuentas;
  v_tarjeta uuid;
  v_destino uuid;
  v_desc text := left(nullif(trim(v_datos ->> 'descripcion'), ''), 200);
  v_com text := left(nullif(trim(v_datos ->> 'comercio'), ''), 80);
  v_cuotas integer := 1;
  v_cat_txt text := coalesce(nullif(trim(v_datos ->> 'categoria'), ''), 'auto');
  v_cat uuid;
  v_revisar boolean := coalesce((v_datos ->> 'revisar') = 'true', false);
  v_sug record;
  v_alias record;
  v_registro text;
  v_id uuid;
  v_repetido boolean := false;
  v_error text;
  v_restriccion text;
  v_res jsonb;
begin
  v_tok := public._token_valido(p_token);
  v_user := v_tok.user_id;
  if v_fuente not in ('wallet', 'sms', 'rapido', 'dictado') then
    v_fuente := 'rapido';
  end if;
  v_hoy := public._hoy_de(v_user);

  begin
    if v_clave is not null and length(v_clave) not between 8 and 80 then
      raise exception 'Clave de registro inválida';
    end if;

    -- Reintento con la misma clave: devolver lo ya registrado.
    if v_clave is not null then
      select 'movimiento', m.id into v_registro, v_id from public.movimientos m
      where m.user_id = v_user and m.clave_idempotencia = v_clave;
      if v_id is null then
        select 'compra_tc', c.id into v_registro, v_id from public.compras_tc c
        where c.user_id = v_user and c.clave_idempotencia = v_clave;
      end if;
      if v_id is not null then
        v_repetido := true;
      end if;
    end if;

    if not v_repetido then
      if v_tipo not in ('gasto', 'ingreso', 'transferencia') then
        raise exception 'Tipo inválido: usa gasto, ingreso o transferencia';
      end if;
      if coalesce(v_datos ->> 'monto', '') !~ '^[0-9]{1,12}(\.[0-9]{1,2})?$' then
        raise exception 'El monto no es válido';
      end if;
      v_monto := (v_datos ->> 'monto')::numeric;
      if v_monto <= 0 then
        raise exception 'El monto debe ser mayor que cero';
      end if;

      if coalesce(v_datos ->> 'origen', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
        raise exception 'Elige el origen del pago';
      end if;
      select * into v_cuenta from public.cuentas
      where id = (v_datos ->> 'origen')::uuid and user_id = v_user;
      if v_cuenta.id is null then
        raise exception 'Origen no encontrado' using errcode = 'P0002';
      end if;
      if not v_cuenta.activa then
        raise exception 'La cuenta "%" está inactiva', v_cuenta.nombre;
      end if;
      if v_cuenta.tipo = 'tarjeta_credito' then
        select t.id into v_tarjeta from public.tarjetas_credito t where t.cuenta_id = v_cuenta.id and t.activa;
        if v_tarjeta is null then
          raise exception 'La tarjeta "%" está inactiva', v_cuenta.nombre;
        end if;
        if v_tipo = 'ingreso' then
          raise exception 'Un ingreso no puede llegar a una tarjeta de crédito';
        end if;
        if v_tipo = 'transferencia' then
          raise exception 'Los avances con tarjeta de crédito se registran desde la app';
        end if;
        if coalesce(v_datos ->> 'cuotas', '') <> '' then
          if (v_datos ->> 'cuotas') !~ '^[0-9]{1,2}$' or (v_datos ->> 'cuotas')::integer not between 1 and 48 then
            raise exception 'Las cuotas van de 1 a 48';
          end if;
          v_cuotas := (v_datos ->> 'cuotas')::integer;
        end if;
      end if;

      v_desc := coalesce(v_desc, v_com);

      -- Transferencia (p. ej. retiro en cajero): destino elegido o la cuenta de efectivo.
      if v_tipo = 'transferencia' then
        if coalesce(v_datos ->> 'destino', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
          select cu.id into v_destino from public.cuentas cu
          where cu.id = (v_datos ->> 'destino')::uuid and cu.user_id = v_user and cu.activa;
        elsif coalesce(nullif(v_datos ->> 'destino', ''), 'efectivo') = 'efectivo' then
          select cu.id into v_destino from public.cuentas cu
          where cu.user_id = v_user and cu.activa and cu.tipo = 'efectivo'
          order by cu.orden, cu.created_at limit 1;
        end if;
        if v_destino is null then
          raise exception 'No encontré la cuenta destino de la transferencia (crea una cuenta de efectivo activa)';
        end if;
      -- Categoría: elegida > sugerida por historial > "Por clasificar".
      elsif v_cat_txt = 'pendiente' then
        v_cat := public._categoria_por_clasificar(v_user, v_tipo);
        v_revisar := true;
      elsif v_cat_txt = 'auto' then
        select * into v_sug from public._sugerir_categoria(v_user, v_tipo, coalesce(v_com, v_desc));
        if v_sug.categoria_id is not null then
          v_cat := v_sug.categoria_id;
          v_revisar := v_revisar or not v_sug.confiable;
        else
          v_cat := public._categoria_por_clasificar(v_user, v_tipo);
          v_revisar := true;
        end if;
      elsif v_cat_txt ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
        v_cat := v_cat_txt::uuid;  -- dueño y tipo los valida el trigger
      else
        raise exception 'Categoría inválida';
      end if;

      if v_tarjeta is not null then
        insert into public.compras_tc
          (user_id, tarjeta_id, fecha, tipo, descripcion, comercio, categoria_id, monto, num_cuotas,
           origen_registro, por_revisar, clave_idempotencia)
        values
          (v_user, v_tarjeta, v_hoy, 'compra', v_desc, v_com, v_cat, v_monto, v_cuotas,
           'atajo_' || v_fuente, v_revisar, v_clave)
        returning id into v_id;
        v_registro := 'compra_tc';
      else
        insert into public.movimientos
          (user_id, fecha, tipo, monto, cuenta_id, cuenta_destino_id, categoria_id, descripcion, comercio,
           origen_registro, por_revisar, clave_idempotencia)
        values
          (v_user, v_hoy, v_tipo::public.tipo_movimiento, v_monto, v_cuenta.id, v_destino, v_cat, v_desc,
           case when v_tipo = 'transferencia' then null else v_com end,
           'atajo_' || v_fuente, v_revisar, v_clave)
        returning id into v_id;
        v_registro := 'movimiento';
      end if;

      -- Aprender alias (tarjeta de Wallet, últimos 4, nombre dictado → este origen).
      if jsonb_typeof(v_datos -> 'alias') = 'array' then
        for v_alias in
          select x.tipo, public.clave_texto(x.valor) as valor
          from jsonb_to_recordset(v_datos -> 'alias') as x(tipo text, valor text)
        loop
          if v_alias.tipo in ('wallet_tarjeta', 'sms_ultimos4', 'nombre_dictado')
             and v_alias.valor is not null and length(v_alias.valor) <= 80 then
            insert into public.alias_origen (user_id, tipo, valor, cuenta_id)
            values (v_user, v_alias.tipo, v_alias.valor, v_cuenta.id)
            on conflict (user_id, tipo, valor) do update
              set cuenta_id = excluded.cuenta_id, usos = public.alias_origen.usos + 1, ultimo_uso = now();
          end if;
        end loop;
      end if;
    end if;
  exception
    when unique_violation then
      get stacked diagnostics v_restriccion = constraint_name;
      if v_restriccion in ('movimientos_clave_idx', 'compras_tc_clave_idx') then
        -- Dos reintentos simultáneos con la misma clave: el otro ganó.
        select 'movimiento', m.id into v_registro, v_id from public.movimientos m
        where m.user_id = v_user and m.clave_idempotencia = v_clave;
        if v_id is null then
          select 'compra_tc', c.id into v_registro, v_id from public.compras_tc c
          where c.user_id = v_user and c.clave_idempotencia = v_clave;
        end if;
        v_repetido := true;
      else
        v_error := sqlerrm;
      end if;
    when others then
      v_error := sqlerrm;
  end;

  insert into public.capturas_atajo
    (user_id, token_id, fuente, etapa, resultado, mensaje, movimiento_id, compra_tc_id)
  values
    (v_user, v_tok.id, v_fuente, 'registrar',
     case when v_error is not null then 'rechazado' when v_repetido then 'repetido' else 'registrado' end,
     left(v_error, 300),
     case when v_error is null and v_registro = 'movimiento' then v_id end,
     case when v_error is null and v_registro = 'compra_tc' then v_id end);
  update public.tokens_api
  set ultimo_uso_en = now(), ultimo_uso_fuente = v_fuente, usos = usos + 1
  where id = v_tok.id;

  if v_error is not null then
    return jsonb_build_object('ok', false, 'mensaje', v_error);
  end if;
  v_res := public._resumen_registro(v_registro, v_id);
  return v_res || jsonb_build_object('ok', true, 'repetido', v_repetido);
end;
$$;

revoke all on function public.atajo_registrar(text, jsonb) from public;
grant execute on function public.atajo_registrar(text, jsonb) to anon, authenticated;

-- ---------------------------------------------------------------------
-- Vistas: exponen origen_registro y por_revisar (columnas al final)
-- ---------------------------------------------------------------------
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
  coalesce(po.id, m.prestamo_otorgado_id) as prestamo_id,
  m.adjunto_path,
  m.origen_registro,
  m.por_revisar
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

create or replace view public.v_compras_tc with (security_invoker = true) as
select
  c.id, c.user_id, c.tarjeta_id, c.periodo_id, c.fecha, c.tipo, c.descripcion, c.comercio, c.categoria_id,
  c.cuenta_destino_id, c.monto, c.num_cuotas, c.moneda, c.monto_origen, c.trm, c.reembolsable, c.created_at,
  p.mes, p.estado as estado_periodo,
  cu.nombre as tarjeta_nombre, t.dia_corte,
  cat.nombre as categoria_nombre, cat.padre_id as categoria_padre_id, cp.nombre as categoria_padre_nombre,
  cd.nombre as cuenta_destino_nombre,
  public.corte_de_compra(c.fecha, t.dia_corte) as primer_corte,
  c.reembolsado_por_id,
  c.adjunto_path,
  c.origen_registro,
  c.por_revisar
from public.compras_tc c
join public.tarjetas_credito t on t.id = c.tarjeta_id
join public.cuentas cu on cu.id = t.cuenta_id
join public.periodos p on p.id = c.periodo_id
left join public.categorias cat on cat.id = c.categoria_id
left join public.categorias cp on cp.id = cat.padre_id
left join public.cuentas cd on cd.id = c.cuenta_destino_id;

-- ---------------------------------------------------------------------
-- Respaldo: alias_origen entra al JSON (tokens y bitácora técnica no)
-- ---------------------------------------------------------------------
create or replace function public._tablas_respaldo()
returns text[]
language sql
immutable
set search_path = ''
as $$
  select array[
    'parametros', 'cuentas', 'categorias', 'periodos', 'tarjetas_credito', 'alias_origen', 'deudas', 'obligaciones',
    'extractos_tc', 'obligaciones_periodo', 'prestamos_otorgados', 'movimientos', 'compras_tc',
    'pagos_tc', 'pagos_deuda', 'presupuestos', 'metas', 'bitacora'
  ];
$$;

revoke all on function public._tablas_respaldo() from public, anon, authenticated;

/**
 * Igual que en F6, con un cambio: una columna obligatoria que el respaldo no trae (respaldos
 * anteriores a la columna) toma su valor por defecto en lugar de fallar por null.
 */
create or replace function public.restaurar_respaldo(p_datos jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_tablas text[] := public._tablas_respaldo();
  v_filas jsonb;
  v_res jsonb := '{}'::jsonb;
  v_cols text;
  v_sel text;
  v_n int;
  v_i int;
  t text;
  r record;
begin
  if v_user is null then
    raise exception 'Sin sesión' using errcode = '42501';
  end if;
  if p_datos ->> 'app' is distinct from 'plata-clara' or (p_datos ->> 'version') is distinct from '1'
     or jsonb_typeof(p_datos -> 'tablas') is distinct from 'object' then
    raise exception 'El archivo no es un respaldo de Plata Clara (versión 1)';
  end if;
  if jsonb_typeof(p_datos -> 'tablas' -> 'parametros') is distinct from 'array'
     or jsonb_array_length(p_datos -> 'tablas' -> 'parametros') <> 1 then
    raise exception 'El respaldo no trae tus parámetros';
  end if;
  foreach t in array v_tablas loop
    if p_datos -> 'tablas' ? t and jsonb_typeof(p_datos -> 'tablas' -> t) <> 'array' then
      raise exception 'La tabla % del respaldo no es una lista', t;
    end if;
  end loop;

  foreach t in array v_tablas loop
    execute format('alter table public.%I disable trigger user', t);
  end loop;

  -- 1) Borrar lo actual (primero se sueltan las referencias circulares).
  for r in select * from public._columnas_diferidas() loop
    execute format('update public.%I set %I = null where user_id = $1', r.tabla, r.columna) using v_user;
  end loop;
  for v_i in reverse array_length(v_tablas, 1) .. 1 loop
    execute format('delete from public.%I where user_id = $1', v_tablas[v_i]) using v_user;
  end loop;

  -- 2) Insertar en orden; user_id siempre es el de la sesión.
  foreach t in array v_tablas loop
    v_filas := coalesce(p_datos -> 'tablas' -> t, '[]'::jsonb);
    select
      string_agg(quote_ident(c.column_name), ', ' order by c.ordinal_position),
      string_agg(
        case
          when c.column_name = 'user_id' then '$2'
          when exists (select 1 from public._columnas_diferidas() d where d.tabla = t and d.columna = c.column_name)
            then 'null'
          when c.is_nullable = 'NO' and c.column_default is not null
            then format('coalesce(r.%I, %s)', c.column_name, c.column_default)
          else 'r.' || quote_ident(c.column_name)
        end, ', ' order by c.ordinal_position)
    into v_cols, v_sel
    from information_schema.columns c
    where c.table_schema = 'public' and c.table_name = t and c.is_generated = 'NEVER';
    execute format(
      'insert into public.%I (%s) select %s from jsonb_populate_recordset(null::public.%I, $1) r',
      t, v_cols, v_sel, t
    ) using v_filas, v_user;
    get diagnostics v_n = row_count;
    v_res := v_res || jsonb_build_object(t, v_n);
  end loop;

  -- 3) Completar las referencias diferidas.
  for r in select * from public._columnas_diferidas() loop
    execute format(
      'update public.%1$I x set %2$I = s.%2$I
       from jsonb_populate_recordset(null::public.%1$I, $1) s
       where x.id = s.id and x.user_id = $2 and s.%2$I is not null',
      r.tabla, r.columna
    ) using coalesce(p_datos -> 'tablas' -> r.tabla, '[]'::jsonb), v_user;
  end loop;

  -- 4) Toda referencia debe apuntar a datos del mismo usuario.
  for r in
    select c.conrelid::regclass::text as hija, c.confrelid::regclass::text as padre, a.attname::text as col
    from pg_constraint c
    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
    where c.contype = 'f' and c.connamespace = 'public'::regnamespace
      and c.confrelid::regclass::text like 'public.%'
      and array_length(c.conkey, 1) = 1
  loop
    execute format(
      'select count(*) from %s h join %s p on p.id = h.%I where h.user_id = $1 and p.user_id <> $1',
      r.hija, r.padre, r.col
    ) into v_n using v_user;
    if v_n > 0 then
      raise exception 'El respaldo apunta a datos que no son tuyos (%.%)', r.hija, r.col;
    end if;
  end loop;

  foreach t in array v_tablas loop
    execute format('alter table public.%I enable trigger user', t);
  end loop;

  insert into public.bitacora (user_id, entidad, accion, detalle)
  values (v_user, 'respaldo', 'restaurar',
          jsonb_build_object('exportado_en', p_datos ->> 'exportado_en', 'filas', v_res));
  return v_res;
end;
$$;

revoke all on function public.restaurar_respaldo(jsonb) from public, anon;
grant execute on function public.restaurar_respaldo(jsonb) to authenticated;
