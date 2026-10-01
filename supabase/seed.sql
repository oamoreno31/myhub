-- =====================================================================
-- Seed SOLO para desarrollo local (supabase db reset).
-- Crea el usuario de desarrollo; el trigger al_crear_usuario siembra
-- parámetros, la cuenta "Efectivo" y las categorías por defecto.
--   Correo:     oamoreno31@gmail.com
--   Contraseña: plata-clara-local
-- En producción el usuario se crea desde el panel de Supabase (Auth → Users).
-- =====================================================================

do $$
declare
  v_id uuid := '00000000-0000-4000-8000-000000000001';
begin
  if not exists (select 1 from auth.users where id = v_id) then
    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
      created_at, updated_at, confirmation_token, email_change,
      email_change_token_new, recovery_token
    ) values (
      '00000000-0000-0000-0000-000000000000', v_id, 'authenticated', 'authenticated',
      'oamoreno31@gmail.com', extensions.crypt('plata-clara-local', extensions.gen_salt('bf')),
      now(), '{"provider":"email","providers":["email"]}', '{"nombre":"Omar"}',
      now(), now(), '', '', '', ''
    );

    insert into auth.identities (
      id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at
    ) values (
      gen_random_uuid(), v_id, v_id::text,
      jsonb_build_object('sub', v_id::text, 'email', 'oamoreno31@gmail.com', 'email_verified', true),
      'email', now(), now(), now()
    );
  end if;
end;
$$;

-- Cuentas de ejemplo para empezar a probar (editables desde la app en F1).
insert into public.cuentas (user_id, nombre, tipo, entidad, orden)
values
  ('00000000-0000-4000-8000-000000000001', 'Ahorros', 'ahorros', null, 1),
  ('00000000-0000-4000-8000-000000000001', 'Nequi', 'billetera', 'Nequi', 2)
on conflict (user_id, nombre) do nothing;
