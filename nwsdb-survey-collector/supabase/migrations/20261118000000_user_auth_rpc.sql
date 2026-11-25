create or replace function public.register_user(
  p_f_name text,
  p_email text,
  p_password text,
  p_phone text,
  p_l_name text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $$
begin
  if nullif(btrim(p_f_name), '') is null
      or nullif(btrim(p_email), '') is null
      or p_password is null
      or length(p_password) < 6 then
    return jsonb_build_object(
      'success', false,
      'error', 'Name, email, and a password of at least 6 characters are required.'
    );
  end if;

  insert into public."usersT" (f_name, email, phone, l_name, password)
  values (
    btrim(p_f_name),
    lower(btrim(p_email)),
    nullif(btrim(coalesce(p_phone, '')), ''),
    nullif(btrim(coalesce(p_l_name, '')), ''),
    extensions.crypt(p_password, extensions.gen_salt('bf', 12))
  );

  return jsonb_build_object('success', true);
exception
  when unique_violation then
    return jsonb_build_object(
      'success', false,
      'error', 'A user with that name or email already exists.'
    );
end;
$$;

create or replace function public.login_user(
  p_username text,
  p_password text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $$
declare
  v_user public."usersT"%rowtype;
begin
  select *
    into v_user
    from public."usersT" as u
   where lower(u.f_name) = lower(btrim(p_username))
     and u.is_active;

  if not found
      or v_user.password is null
      or p_password is null
      or extensions.crypt(p_password, v_user.password) <> v_user.password then
    return null;
  end if;

  return jsonb_build_object(
    'id', v_user.id,
    'f_name', v_user.f_name,
    'email', v_user.email,
    'is_admin', v_user.is_admin,
    'is_active', v_user.is_active
  );
end;
$$;

create or replace function public.change_own_password(
  p_user_id uuid,
  p_current_password text,
  p_new_password text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $$
declare
  v_updated integer;
begin
  if p_new_password is null or length(p_new_password) < 6 then
    return jsonb_build_object(
      'success', false,
      'error', 'The new password must be at least 6 characters.'
    );
  end if;

  update public."usersT"
     set password = extensions.crypt(p_new_password, extensions.gen_salt('bf', 12))
   where id = p_user_id
     and is_active
     and password is not null
     and extensions.crypt(p_current_password, password) = password;

  get diagnostics v_updated = row_count;

  if v_updated = 0 then
    return jsonb_build_object(
      'success', false,
      'error', 'The current password is incorrect.'
    );
  end if;

  return jsonb_build_object('success', true);
end;
$$;

revoke all on function public.register_user(text, text, text, text, text)
  from public;
revoke all on function public.login_user(text, text) from public;
revoke all on function public.change_own_password(uuid, text, text)
  from public;

grant execute on function public.register_user(text, text, text, text, text)
  to anon, authenticated;
grant execute on function public.login_user(text, text)
  to anon, authenticated;
grant execute on function public.change_own_password(uuid, text, text)
  to anon, authenticated;

revoke select on table public."usersT" from public, anon, authenticated;
grant select (
  id,
  f_name,
  l_name,
  email,
  phone,
  is_admin,
  role,
  is_active,
  created_at
) on table public."usersT" to anon, authenticated;

notify pgrst, 'reload schema';
