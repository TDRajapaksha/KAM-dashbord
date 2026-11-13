create table if not exists public.google_sheet_connections (
  project_id text primary key,
  owner_id text not null,
  spreadsheet_id text not null,
  refresh_token_ciphertext text not null,
  question_ids jsonb not null default '[]'::jsonb,
  last_synced_at timestamptz,
  last_sync_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.google_sheet_connections enable row level security;

revoke all on public.google_sheet_connections from anon, authenticated;
grant all on public.google_sheet_connections to service_role;

create or replace function public.remove_google_sheet_connection_for_deleted_project()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.google_sheet_connections
  where project_id = old.id::text;
  return old;
end;
$$;

drop trigger if exists remove_google_sheet_connection_after_project_delete
  on public.projects;

create trigger remove_google_sheet_connection_after_project_delete
after delete on public.projects
for each row
execute function public.remove_google_sheet_connection_for_deleted_project();

revoke all on function public.remove_google_sheet_connection_for_deleted_project()
  from public, anon, authenticated;
