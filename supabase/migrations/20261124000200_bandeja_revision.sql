-- =====================================================================
-- F8.3 · Bandeja "Por revisar" (docs/08 §5.2)
--  · Regla: un registro con la categoría de sistema "Por clasificar" siempre queda por revisar
--    (así, editarlo desde la app sin cambiar la categoría no lo saca de la bandeja).
--  · v_por_revisar: movimientos y compras con tarjeta pendientes de revisión, en una sola lista.
-- =====================================================================

create or replace function public.mantener_por_revisar()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.categoria_id is not null and exists (
    select 1 from public.categorias c
    where c.id = new.categoria_id and c.es_sistema and c.nombre = 'Por clasificar'
  ) then
    new.por_revisar := true;
  end if;
  return new;
end;
$$;

-- Después de validar (10/20): la categoría ya está resuelta.
create trigger movimientos_30_por_revisar
  before insert or update of categoria_id, por_revisar on public.movimientos
  for each row execute function public.mantener_por_revisar();

create trigger compras_tc_30_por_revisar
  before insert or update of categoria_id, por_revisar on public.compras_tc
  for each row execute function public.mantener_por_revisar();

create view public.v_por_revisar with (security_invoker = true) as
select
  'movimiento'::text as registro,
  m.id, m.user_id, m.fecha, m.tipo::text as tipo, m.monto, m.descripcion, m.comercio,
  m.cuenta_id, cu.nombre as origen_nombre, null::uuid as tarjeta_id, null::text as ultimos4,
  cd.nombre as destino_nombre,
  m.categoria_id, ca.nombre as categoria_nombre, ca.tipo::text as categoria_tipo,
  coalesce(ca.es_sistema and ca.nombre = 'Por clasificar', false) as por_clasificar,
  null::smallint as num_cuotas,
  m.origen_registro, p.estado as estado_periodo, m.created_at,
  -- Para abrir el formulario de edición desde la bandeja:
  m.cuenta_destino_id, m.obligacion_periodo_id, m.reembolsable, m.adjunto_path
from public.movimientos m
join public.periodos p on p.id = m.periodo_id
join public.cuentas cu on cu.id = m.cuenta_id
left join public.cuentas cd on cd.id = m.cuenta_destino_id
left join public.categorias ca on ca.id = m.categoria_id
where m.por_revisar
union all
select
  'compra_tc', c.id, c.user_id, c.fecha, 'gasto', c.monto, c.descripcion, c.comercio,
  t.cuenta_id, cu.nombre, t.id, t.ultimos4,
  null,
  c.categoria_id, ca.nombre, ca.tipo::text,
  coalesce(ca.es_sistema and ca.nombre = 'Por clasificar', false),
  c.num_cuotas,
  c.origen_registro, p.estado, c.created_at,
  null::uuid, null::uuid, c.reembolsable, c.adjunto_path
from public.compras_tc c
join public.tarjetas_credito t on t.id = c.tarjeta_id
join public.cuentas cu on cu.id = t.cuenta_id
join public.periodos p on p.id = c.periodo_id
left join public.categorias ca on ca.id = c.categoria_id
where c.por_revisar;

revoke all on public.v_por_revisar from anon;
grant select on public.v_por_revisar to authenticated;
