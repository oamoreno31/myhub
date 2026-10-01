-- =====================================================================
-- Plata Clara · 0005 · Análisis, presupuesto e histórico (Fase 4)
-- Referencias: docs/01 §10 (vistas Consumo y Caja), HU-14, HU-19, HU-20;
-- docs/02 §3 (patrimonio) y §5 (50/30/20); docs/05 §3.16.
--
--  · v_consumo_mes: gasto de consumo (devengo) por categoría hoja, mes, origen y si es
--    reembolsable por Devtopia. Suma movimientos de gasto, compras con tarjeta, otros cargos de
--    extractos e intereses/seguros de préstamos (lo mismo que v_resumen_periodo.gastos).
--  · v_caja_mes: salidas de dinero de tus cuentas por concepto (gastos, pagos de tarjeta completos,
--    cuotas de préstamos, aportes y préstamos que hiciste).
--  · v_comercios_mes: gasto por comercio (top comercios).
--  · presupuestos: monto por categoría y mes (o plantilla base con periodo_id nulo).
--  · v_patrimonio: patrimonio neto actual; cerrar_periodo lo guarda en la foto del mes.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Vistas de análisis
-- ---------------------------------------------------------------------

create view public.v_consumo_mes with (security_invoker = true) as
with filas as (
  select m.user_id, m.periodo_id, m.categoria_id, 'cuenta'::text as origen, m.reembolsable, m.monto
  from public.movimientos m
  where m.tipo = 'gasto'
  union all
  select c.user_id, c.periodo_id, c.categoria_id, 'tarjeta',
         c.reembolsable, case c.tipo when 'devolucion' then -c.monto else c.monto end
  from public.compras_tc c
  where c.tipo in ('compra', 'devolucion')
  union all
  select x.user_id, x.periodo_id, cat.id, 'cargos_tarjeta', false, x.otros_generados
  from public.extractos_tc x
  join public.categorias cat on cat.user_id = x.user_id and cat.es_sistema and cat.nombre = 'Costos financieros TC'
  where x.otros_generados > 0
  union all
  select pd.user_id, m.periodo_id, cat.id, 'intereses_prestamos', false, pd.a_intereses + pd.a_seguros
  from public.pagos_deuda pd
  join public.movimientos m on m.id = pd.movimiento_id
  join public.categorias cat on cat.user_id = pd.user_id and cat.es_sistema and cat.nombre = 'Intereses de préstamos'
  where pd.a_intereses + pd.a_seguros > 0
)
select
  f.user_id, f.periodo_id, p.mes, p.estado as estado_periodo,
  c.id as categoria_id, c.nombre as categoria_nombre, c.padre_id, cp.nombre as padre_nombre,
  coalesce(c.padre_id, c.id) as raiz_id,
  coalesce(cp.grupo, c.grupo) as grupo,
  c.bolsa, (c.es_fija or coalesce(cp.es_fija, false)) as es_fija,
  f.origen, f.reembolsable,
  sum(f.monto)::numeric(14,2) as total,
  count(*)::int as n
from filas f
join public.periodos p on p.id = f.periodo_id
join public.categorias c on c.id = f.categoria_id
left join public.categorias cp on cp.id = c.padre_id
group by f.user_id, f.periodo_id, p.mes, p.estado, c.id, cp.id, f.origen, f.reembolsable;

-- Caja: lo que salió de tus cuentas (transferencias entre cuentas propias no cuentan).
create view public.v_caja_mes with (security_invoker = true) as
select
  m.user_id, m.periodo_id, p.mes,
  m.tipo,
  case m.tipo
    when 'gasto' then coalesce(c.padre_id, c.id)
    else c.id
  end as categoria_id,
  case m.tipo
    when 'gasto' then coalesce(cp.nombre, c.nombre)
    when 'pago_tc' then 'Pagos de tarjetas'
    when 'pago_deuda' then 'Cuotas de préstamos'
    when 'aporte' then 'Aportes y ahorro'
    when 'prestamo_otorgado' then 'Préstamos que hiciste'
  end as concepto,
  m.reembolsable,
  sum(m.monto)::numeric(14,2) as total,
  count(*)::int as n
from public.movimientos m
join public.periodos p on p.id = m.periodo_id
left join public.categorias c on c.id = m.categoria_id
left join public.categorias cp on cp.id = c.padre_id
where m.tipo in ('gasto', 'pago_tc', 'pago_deuda', 'aporte', 'prestamo_otorgado')
group by m.user_id, m.periodo_id, p.mes, m.tipo, 5, 6, m.reembolsable;

-- Top comercios: se agrupan sin distinguir mayúsculas ni espacios.
create view public.v_comercios_mes with (security_invoker = true) as
with filas as (
  select m.user_id, m.periodo_id, m.comercio, m.reembolsable, m.monto
  from public.movimientos m
  where m.tipo = 'gasto' and m.comercio is not null
  union all
  select c.user_id, c.periodo_id, c.comercio, c.reembolsable,
         case c.tipo when 'devolucion' then -c.monto else c.monto end
  from public.compras_tc c
  where c.tipo in ('compra', 'devolucion') and c.comercio is not null
),
formas as (
  -- Clave sin mayúsculas, espacios dobles ni tildes: "Éxito", " exito " y "EXITO" son el mismo comercio.
  select f.user_id, f.periodo_id,
         translate(lower(regexp_replace(trim(f.comercio), '\s+', ' ', 'g')), 'áéíóúüàèìòù', 'aeiouuaeiou') as clave,
         regexp_replace(trim(f.comercio), '\s+', ' ', 'g') as forma,
         f.reembolsable, sum(f.monto) as total, count(*) as n
  from filas f
  group by 1, 2, 3, 4, 5
)
select
  fo.user_id, fo.periodo_id, p.mes, fo.clave,
  -- Nombre a mostrar: la forma más usada; en empate, la que tiene mayúsculas o tildes.
  (array_agg(fo.forma order by fo.n desc, (fo.forma <> lower(fo.forma)) desc, fo.forma))[1] as comercio,
  fo.reembolsable,
  sum(fo.total)::numeric(14,2) as total,
  sum(fo.n)::int as n
from formas fo
join public.periodos p on p.id = fo.periodo_id
group by fo.user_id, fo.periodo_id, p.mes, fo.clave, fo.reembolsable;

-- ---------------------------------------------------------------------
-- Patrimonio neto (docs/02 §3)
-- ---------------------------------------------------------------------
create view public.v_patrimonio with (security_invoker = true) as
select
  u.user_id,
  coalesce(cu.total, 0)::numeric(14,2) as cuentas,
  coalesce(pr.total, 0)::numeric(14,2) as por_cobrar,
  coalesce(dv.total, 0)::numeric(14,2) as devtopia,
  coalesce(tc.total, 0)::numeric(14,2) as deuda_tarjetas,
  coalesce(de.total, 0)::numeric(14,2) as prestamos,
  (coalesce(cu.total, 0) + coalesce(pr.total, 0) + coalesce(dv.total, 0)
   - coalesce(tc.total, 0) - coalesce(de.total, 0))::numeric(14,2) as patrimonio
from public.parametros u
left join lateral (
  select sum(s.saldo) as total from public.v_saldos_cuentas s
  where s.user_id = u.user_id and s.tipo <> 'tarjeta_credito'
) cu on true
left join lateral (
  select sum(p.saldo) as total from public.v_prestamos_otorgados p
  where p.user_id = u.user_id and p.castigado_en is null
) pr on true
left join lateral (
  select sum(r.monto) as total from public.v_reembolsos_pendientes r where r.user_id = u.user_id
) dv on true
left join lateral (
  select sum(t.deuda_total) as total from public.v_estado_tarjetas t where t.user_id = u.user_id
) tc on true
left join lateral (
  select sum(d.saldo_capital) as total from public.v_estado_deudas d where d.user_id = u.user_id
) de on true;

-- La foto del cierre de mes incluye ahora el patrimonio neto (versión 2).
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
  v_patrimonio jsonb;
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
  select to_jsonb(pa) - 'user_id' into v_patrimonio
  from public.v_patrimonio pa where pa.user_id = v_periodo.user_id;
  v_snapshot := v_snapshot || jsonb_build_object('cerrado_en', now(), 'version', 2, 'patrimonio', v_patrimonio);

  update public.periodos
  set estado = 'cerrado', cerrado_en = now(), snapshot = v_snapshot
  where id = p_periodo;

  insert into public.bitacora (user_id, entidad, entidad_id, accion, detalle)
  values (v_periodo.user_id, 'periodos', p_periodo, 'cerrar', jsonb_build_object('decisiones', p_decisiones));

  return v_snapshot;
end;
$$;

-- ---------------------------------------------------------------------
-- presupuestos (docs/05 §3.16)
-- ---------------------------------------------------------------------
create table public.presupuestos (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users (id) on delete cascade,
  -- null = plantilla base (se usa en los meses que no tienen presupuesto propio)
  periodo_id    uuid references public.periodos (id) on delete cascade,
  categoria_id  uuid not null references public.categorias (id) on delete cascade,
  monto         numeric(14,2) not null check (monto > 0),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create unique index presupuestos_mes_unico on public.presupuestos (user_id, periodo_id, categoria_id)
  where periodo_id is not null;
create unique index presupuestos_plantilla_unica on public.presupuestos (user_id, categoria_id)
  where periodo_id is null;

create trigger presupuestos_updated_at
  before update on public.presupuestos
  for each row execute function public.set_updated_at();

create or replace function public.validar_presupuesto()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_tipo public.tipo_categoria;
begin
  if tg_op = 'DELETE' and pg_trigger_depth() > 1 then
    return old;
  end if;
  if tg_op in ('UPDATE', 'DELETE') and old.periodo_id is not null then
    perform public.exigir_periodo_abierto(old.periodo_id);
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  if new.periodo_id is not null then
    perform public.exigir_periodo_abierto(new.periodo_id);
  end if;
  perform public.exigir_propietario('public.periodos', new.periodo_id, new.user_id, 'Periodo');
  perform public.exigir_propietario('public.categorias', new.categoria_id, new.user_id, 'Categoría');
  select tipo into v_tipo from public.categorias where id = new.categoria_id;
  if v_tipo <> 'gasto' then
    raise exception 'Solo se presupuestan categorías de gasto';
  end if;
  return new;
end;
$$;

create trigger presupuestos_validar
  before insert or update or delete on public.presupuestos
  for each row execute function public.validar_presupuesto();

-- Reemplaza el presupuesto de un mes (o la plantilla, con p_periodo nulo) en una sola operación.
-- p_items: [{"categoria_id": uuid, "monto": number}]; montos en 0 se omiten.
create or replace function public.guardar_presupuesto(p_periodo uuid, p_items jsonb)
returns int
language plpgsql
set search_path = ''
as $$
declare
  v_n int;
begin
  if p_periodo is null then
    delete from public.presupuestos where periodo_id is null and user_id = auth.uid();
  else
    delete from public.presupuestos where periodo_id = p_periodo;
  end if;
  insert into public.presupuestos (periodo_id, categoria_id, monto)
  select p_periodo, (i ->> 'categoria_id')::uuid, (i ->> 'monto')::numeric
  from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) as i
  where coalesce((i ->> 'monto')::numeric, 0) > 0;
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

revoke all on function public.guardar_presupuesto(uuid, jsonb) from public, anon;
grant execute on function public.guardar_presupuesto(uuid, jsonb) to authenticated;

alter table public.presupuestos enable row level security;
create policy propietario on public.presupuestos for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
revoke all on public.presupuestos from anon;
grant select, insert, update, delete on public.presupuestos to authenticated;

revoke all on public.v_consumo_mes, public.v_caja_mes, public.v_comercios_mes, public.v_patrimonio from anon;
grant select on public.v_consumo_mes, public.v_caja_mes, public.v_comercios_mes, public.v_patrimonio to authenticated;
