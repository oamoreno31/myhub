-- =====================================================================
-- F5 · Salud financiera (docs/02 §4–§7, docs/05 §3.17)
--  · metas (ahorro, fondo de emergencia, pagar deuda, compra) + v_metas con el avance.
--  · insumos_salud(periodo): las cifras con las que se calculan los indicadores y el score
--    (el cálculo de bandas y puntajes vive en TypeScript: lib/domain/salud.ts).
--  · parametros.tasa_usura_ea: referencia editable para comparar tasas (no se consulta sola).
--  · cerrar_periodo guarda los insumos en la foto del mes (versión 3).
-- =====================================================================

alter table public.parametros
  add column tasa_usura_ea numeric(7,4) check (tasa_usura_ea is null or tasa_usura_ea between 0 and 2);

-- ---------------------------------------------------------------------
-- metas
-- ---------------------------------------------------------------------
create type public.tipo_meta as enum ('ahorro', 'fondo_emergencia', 'pagar_deuda', 'compra');

create table public.metas (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null default auth.uid() references auth.users (id) on delete cascade,
  nombre          text not null check (length(trim(nombre)) between 1 and 80),
  tipo            public.tipo_meta not null,
  monto_objetivo  numeric(14,2) not null check (monto_objetivo > 0),
  fecha_objetivo  date,
  -- Dónde se guarda la plata de la meta (su saldo es el avance). No aplica a pagar_deuda.
  cuenta_id       uuid references public.cuentas (id) on delete set null,
  -- Deuda a pagar (solo pagar_deuda): avance = objetivo − saldo de capital.
  deuda_id        uuid references public.deudas (id) on delete cascade,
  -- Cuánto piensas aportar cada mes (para estimar la fecha).
  aporte_mensual  numeric(14,2) check (aporte_mensual is null or aporte_mensual >= 0),
  activa          boolean not null default true,
  notas           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  check ((tipo = 'pagar_deuda') = (deuda_id is not null)),
  check (tipo = 'pagar_deuda' or cuenta_id is not null)
);

create index metas_user_idx on public.metas (user_id, activa);

create trigger metas_updated_at
  before update on public.metas
  for each row execute function public.set_updated_at();

create or replace function public.validar_meta()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_tipo public.tipo_cuenta;
begin
  perform public.exigir_propietario('public.cuentas', new.cuenta_id, new.user_id, 'Cuenta');
  perform public.exigir_propietario('public.deudas', new.deuda_id, new.user_id, 'Deuda');
  if new.cuenta_id is not null then
    select tipo into v_tipo from public.cuentas where id = new.cuenta_id;
    if v_tipo = 'tarjeta_credito' then
      raise exception 'La plata de una meta no se guarda en una tarjeta de crédito';
    end if;
  end if;
  return new;
end;
$$;

create trigger metas_validar
  before insert or update on public.metas
  for each row execute function public.validar_meta();

alter table public.metas enable row level security;
create policy propietario on public.metas for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
revoke all on public.metas from anon;
grant select, insert, update, delete on public.metas to authenticated;

-- Avance de cada meta: saldo de su cuenta, o lo que ya se pagó de la deuda.
create view public.v_metas with (security_invoker = true) as
select
  m.id, m.user_id, m.nombre, m.tipo, m.monto_objetivo, m.fecha_objetivo, m.cuenta_id, m.deuda_id,
  m.aporte_mensual, m.activa, m.notas, m.created_at,
  s.nombre as cuenta_nombre,
  d.nombre as deuda_nombre,
  d.saldo_capital as deuda_saldo,
  (case
     when m.tipo = 'pagar_deuda' then greatest(m.monto_objetivo - coalesce(d.saldo_capital, 0), 0)
     else greatest(coalesce(s.saldo, 0), 0)
   end)::numeric(14,2) as actual
from public.metas m
left join public.v_saldos_cuentas s on s.id = m.cuenta_id
left join public.v_estado_deudas d on d.id = m.deuda_id;

revoke all on public.v_metas from anon;
grant select on public.v_metas to authenticated;

-- ---------------------------------------------------------------------
-- Insumos de los indicadores de salud (docs/02 §4)
-- ---------------------------------------------------------------------
-- Devuelve cifras, no juicios: TypeScript las convierte en indicadores con los umbrales del
-- usuario. Las cifras "de hoy" (deuda de tarjetas, cupo, ahorro líquido) son del momento en que
-- se calculan; al cerrar el mes quedan congeladas en la foto.
create or replace function public.insumos_salud(p_periodo uuid)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with p as (
    select id, user_id, mes from public.periodos where id = p_periodo
  ),
  hoy as (
    select (now() at time zone 'America/Bogota')::date as d
  ),
  r as (
    select r.* from public.v_resumen_periodo r join p on p.id = r.periodo_id
  ),
  consumo as (
    select
      coalesce(sum(c.total) filter (where not c.reembolsable and c.bolsa <> 'ahorro_deuda'), 0) as gasto_personal,
      coalesce(sum(c.total) filter (where not c.reembolsable and c.bolsa = 'ahorro_deuda'), 0) as ahorro_registrado,
      coalesce(sum(c.total) filter (
        where c.categoria_nombre in ('Costos financieros TC', 'Intereses de préstamos')
      ), 0) as costo_financiero
    from public.v_consumo_mes c join p on p.id = c.periodo_id
  ),
  -- Gasto esencial (bolsa "necesidad") promedio de los 3 meses anteriores con datos;
  -- si aún no hay meses anteriores, el del mismo mes.
  esencial_prev as (
    select c.mes, sum(c.total) as total
    from public.v_consumo_mes c, p
    where c.user_id = p.user_id and c.mes < p.mes and c.mes >= (p.mes - interval '3 months')::date
      and c.bolsa = 'necesidad' and not c.reembolsable
    group by c.mes
  ),
  esencial as (
    select coalesce(
      (select avg(total) from esencial_prev),
      (select sum(c.total) from public.v_consumo_mes c join p on p.id = c.periodo_id
        where c.bolsa = 'necesidad' and not c.reembolsable),
      0
    ) as gasto_esencial
  ),
  oblig as (
    select
      o.*,
      coalesce(d.aporte_mensual, 0) as aporte
    from public.v_obligaciones_mes o
    join p on p.id = o.periodo_id
    left join public.deudas d on d.id = o.deuda_id
    where not coalesce(o.es_ingreso, false)
  ),
  obligaciones as (
    select
      -- Carga de deuda: mínimos de tarjetas + cuotas de préstamos (sin el aporte social de la cooperativa).
      coalesce(sum(case
        when o.tarjeta_id is not null then o.monto_esperado
        when o.deuda_id is not null then greatest(o.monto_esperado - o.aporte, 0)
      end) filter (where o.arrastrada_de_id is null), 0) as pagos_deuda,
      -- Gastos fijos: todo lo comprometido del mes, sin ahorro ni aportes.
      coalesce(sum(greatest(o.monto_esperado - o.aporte, 0))
        filter (where o.arrastrada_de_id is null and o.tipo <> 'ahorro'), 0) as obligaciones_fijas,
      -- Puntualidad: solo lo que ya venció o ya se pagó; lo omitido o pasado al mes siguiente no cuenta.
      count(*) filter (where o.resolucion is null and (o.pagada or o.fecha_vencimiento < (select d from hoy))) as evaluables,
      count(*) filter (where o.resolucion is null and o.pagada and o.ultimo_pago <= o.fecha_vencimiento) as a_tiempo
    from oblig o
  ),
  -- Forma de pago de las tarjetas: extractos cuya fecha límite cae en el mes (y ya venció o ya se pagó total).
  extractos as (
    select
      count(*) filter (where x.pagado >= x.pago_total_banco) as tc_total,
      count(*) filter (where x.pagado < x.pago_total_banco and x.pagado > x.pago_minimo_banco + 1000) as tc_otro,
      count(*) filter (where x.pagado < x.pago_total_banco and x.pagado <= x.pago_minimo_banco + 1000) as tc_minimo
    from public.extractos_tc x, p
    where x.user_id = p.user_id
      and x.fecha_limite_pago >= p.mes and x.fecha_limite_pago < (p.mes + interval '1 month')::date
      and x.pago_total_banco > 0
      and (x.pagado >= x.pago_total_banco or x.fecha_limite_pago < (select d from hoy))
  ),
  tarjetas as (
    select coalesce(sum(greatest(t.deuda_total, 0)), 0) as deuda_tc, coalesce(sum(t.cupo), 0) as cupo_tc
    from public.v_estado_tarjetas t, p
    where t.user_id = p.user_id and t.activa
  ),
  liquido as (
    select coalesce(sum(s.saldo), 0) as ahorro_liquido
    from public.v_saldos_cuentas s, p
    where s.user_id = p.user_id and s.activa
      and s.tipo in ('ahorros', 'corriente', 'efectivo', 'billetera', 'inversion')
  )
  select jsonb_build_object(
    'version', 1,
    'ingresos', coalesce((select ingresos from r), 0),
    'gasto_personal', consumo.gasto_personal,
    'ahorro_registrado', consumo.ahorro_registrado,
    'costo_financiero', consumo.costo_financiero,
    'pagos_deuda', obligaciones.pagos_deuda,
    'obligaciones_fijas', obligaciones.obligaciones_fijas,
    'oblig_evaluables', obligaciones.evaluables,
    'oblig_a_tiempo', obligaciones.a_tiempo,
    'tc_total', extractos.tc_total,
    'tc_otro', extractos.tc_otro,
    'tc_minimo', extractos.tc_minimo,
    'deuda_tc', tarjetas.deuda_tc,
    'cupo_tc', tarjetas.cupo_tc,
    'ahorro_liquido', liquido.ahorro_liquido,
    'gasto_esencial', round(esencial.gasto_esencial, 2),
    'calculado_en', (select d from hoy)
  )
  from p, consumo, obligaciones, extractos, tarjetas, liquido, esencial;
$$;

revoke all on function public.insumos_salud(uuid) from public, anon;
grant execute on function public.insumos_salud(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- Cierre de mes: la foto guarda también los insumos de salud (versión 3).
-- ---------------------------------------------------------------------
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
  v_snapshot := v_snapshot || jsonb_build_object(
    'cerrado_en', now(),
    'version', 3,
    'patrimonio', v_patrimonio,
    'salud', public.insumos_salud(p_periodo)
  );

  update public.periodos
  set estado = 'cerrado', cerrado_en = now(), snapshot = v_snapshot
  where id = p_periodo;

  insert into public.bitacora (user_id, entidad, entidad_id, accion, detalle)
  values (v_periodo.user_id, 'periodos', p_periodo, 'cerrar', jsonb_build_object('decisiones', p_decisiones));

  return v_snapshot;
end;
$$;
