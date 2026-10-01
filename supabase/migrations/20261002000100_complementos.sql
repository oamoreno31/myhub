-- =====================================================================
-- F6 · Complementos (docs/04 §5, §6, §8)
--  · Storage privado: buckets "comprobantes" (adjuntos) y "respaldos" (copias semanales),
--    con políticas por carpeta {user_id}/… (solo si existe el esquema storage de Supabase).
--  · exportar_respaldo(): todas las tablas del usuario en un JSON (versión 1).
--  · restaurar_respaldo(json): reemplaza los datos del usuario por los del respaldo.
--  · v_movimientos y v_compras_tc exponen adjunto_path (comprobantes).
--  · recordatorios_hoy(fecha): obligaciones vencidas o por vencer (≤ 3 días) por usuario,
--    para el correo diario (solo service_role).
-- =====================================================================

-- ---------------------------------------------------------------------
-- Storage (en Supabase; en otros Postgres, como las pruebas, se omite)
-- ---------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_tables where schemaname = 'storage' and tablename = 'buckets') then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values
      ('comprobantes', 'comprobantes', false, 5242880,
       array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'application/pdf']),
      ('respaldos', 'respaldos', false, 52428800, array['application/json'])
    on conflict (id) do nothing;

    execute $p$
      create policy "comprobantes: dueño" on storage.objects for all to authenticated
      using (bucket_id = 'comprobantes' and (storage.foldername(name))[1] = (select auth.uid())::text)
      with check (bucket_id = 'comprobantes' and (storage.foldername(name))[1] = (select auth.uid())::text)
    $p$;
    -- Los respaldos los escribe el cron (service_role); el usuario solo los lee.
    execute $p$
      create policy "respaldos: lectura del dueño" on storage.objects for select to authenticated
      using (bucket_id = 'respaldos' and (storage.foldername(name))[1] = (select auth.uid())::text)
    $p$;
  end if;
end;
$$;

-- ---------------------------------------------------------------------
-- Comprobantes: las vistas exponen la ruta del adjunto (columna al final)
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
  m.adjunto_path
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
  c.adjunto_path
from public.compras_tc c
join public.tarjetas_credito t on t.id = c.tarjeta_id
join public.cuentas cu on cu.id = t.cuenta_id
join public.periodos p on p.id = c.periodo_id
left join public.categorias cat on cat.id = c.categoria_id
left join public.categorias cp on cp.id = cat.padre_id
left join public.cuentas cd on cd.id = c.cuenta_destino_id;

-- ---------------------------------------------------------------------
-- Respaldo JSON
-- ---------------------------------------------------------------------

-- Tablas del usuario en orden de inserción (padres antes que hijas).
create or replace function public._tablas_respaldo()
returns text[]
language sql
immutable
set search_path = ''
as $$
  select array[
    'parametros', 'cuentas', 'categorias', 'periodos', 'tarjetas_credito', 'deudas', 'obligaciones',
    'extractos_tc', 'obligaciones_periodo', 'prestamos_otorgados', 'movimientos', 'compras_tc',
    'pagos_tc', 'pagos_deuda', 'presupuestos', 'metas', 'bitacora'
  ];
$$;

-- Referencias circulares o a la misma tabla: se insertan en null y se completan al final.
create or replace function public._columnas_diferidas()
returns table (tabla text, columna text)
language sql
immutable
set search_path = ''
as $$
  values
    ('categorias', 'padre_id'),
    ('deudas', 'movimiento_desembolso_id'),
    ('obligaciones_periodo', 'arrastrada_de_id'),
    ('prestamos_otorgados', 'movimiento_id'),
    ('movimientos', 'reembolsado_por_id');
$$;

revoke all on function public._tablas_respaldo() from public, anon, authenticated;
revoke all on function public._columnas_diferidas() from public, anon, authenticated;

create or replace function public._respaldo_de(p_user uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_tablas jsonb := '{}'::jsonb;
  v_filas jsonb;
  t text;
begin
  foreach t in array public._tablas_respaldo() loop
    execute format(
      'select coalesce(jsonb_agg(to_jsonb(x) - ''user_id''), ''[]''::jsonb) from public.%I x where x.user_id = $1',
      t
    ) into v_filas using p_user;
    v_tablas := v_tablas || jsonb_build_object(t, v_filas);
  end loop;
  return jsonb_build_object(
    'app', 'plata-clara',
    'version', 1,
    'exportado_en', now(),
    'tablas', v_tablas
  );
end;
$$;

revoke all on function public._respaldo_de(uuid) from public, anon, authenticated;

/** Respaldo del usuario de la sesión. */
create or replace function public.exportar_respaldo()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Sin sesión' using errcode = '42501';
  end if;
  return public._respaldo_de(auth.uid());
end;
$$;

revoke all on function public.exportar_respaldo() from public, anon;
grant execute on function public.exportar_respaldo() to authenticated;

/** Respaldo de un usuario cualquiera: solo para el cron (service_role). */
create or replace function public.exportar_respaldo_usuario(p_user uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select public._respaldo_de(p_user);
$$;

revoke all on function public.exportar_respaldo_usuario(uuid) from public, anon, authenticated;
grant execute on function public.exportar_respaldo_usuario(uuid) to service_role;

/**
 * Reemplaza TODOS los datos del usuario de la sesión por los del respaldo.
 * Los triggers de validación y de efectos (movimientos automáticos, bloqueos de mes cerrado)
 * se desactivan mientras dura la carga, porque el respaldo ya trae esos resultados; al final
 * se verifica que toda referencia apunte a datos del mismo usuario. Todo o nada.
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

-- ---------------------------------------------------------------------
-- Recordatorios del correo diario (HU-24)
-- ---------------------------------------------------------------------
create or replace function public.recordatorios_hoy(p_hoy date)
returns table (user_id uuid, email text, obligaciones jsonb)
language sql
stable
security definer
set search_path = ''
as $$
  select
    p.user_id,
    u.email::text,
    jsonb_agg(
      jsonb_build_object(
        'nombre', o.nombre,
        'vence', o.fecha_vencimiento,
        'pendiente', o.pendiente,
        'esperado', o.monto_esperado,
        'tarjeta', o.tarjeta_id is not null
      ) order by o.fecha_vencimiento, o.nombre
    )
  from public.parametros p
  join auth.users u on u.id = p.user_id
  join public.v_obligaciones_mes o on o.user_id = p.user_id
  where p.recordatorios_email
    and u.email is not null
    and not coalesce(o.es_ingreso, false)
    and o.resolucion is null
    and not o.pagada
    and o.estado_periodo = 'abierto'
    and o.fecha_vencimiento <= p_hoy + 3
  group by p.user_id, u.email;
$$;

revoke all on function public.recordatorios_hoy(date) from public, anon, authenticated;
grant execute on function public.recordatorios_hoy(date) to service_role;
