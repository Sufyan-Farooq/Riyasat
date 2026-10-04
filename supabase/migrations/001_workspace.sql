-- Run in Supabase SQL editor. Domain state is a transactionally versioned JSONB
-- aggregate; only the authenticated application server can read/write it.
-- Do not expose the service-role key or grant clients access to workspace_data.
create table public.workspaces (
  id uuid primary key default gen_random_uuid(), name text not null,
  created_at timestamptz not null default now()
);
create table public.memberships (
  workspace_id uuid references public.workspaces(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  role text not null check (role in ('owner','manager','viewer')),
  property_ids text[], primary key (workspace_id,user_id)
);
create table public.workspace_data (
  workspace_id uuid primary key references public.workspaces(id) on delete cascade,
  state jsonb not null, version bigint not null default 0,
  updated_at timestamptz not null default now()
);
create table public.invitations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references public.workspaces(id) on delete cascade,
  email text not null, role text not null check (role in ('owner','manager','viewer')),
  property_ids text[], accepted boolean not null default false,
  expires_at timestamptz not null, unique(workspace_id,email)
);
alter table public.workspaces enable row level security;
alter table public.memberships enable row level security;
alter table public.workspace_data enable row level security;
alter table public.invitations enable row level security;
create policy own_membership on public.memberships for select to authenticated using (user_id=auth.uid());
create policy member_workspace on public.workspaces for select to authenticated using (exists(select 1 from public.memberships where workspace_id=workspaces.id and user_id=auth.uid()));
revoke all on public.workspace_data, public.invitations from anon, authenticated;
revoke insert,update,delete on public.workspaces,public.memberships from anon,authenticated;
create function public.create_workspace(workspace_name text, owner_id uuid, initial_state jsonb) returns uuid
language plpgsql security definer set search_path=public as $$
declare target uuid;
begin
  insert into workspaces(name) values(workspace_name) returning id into target;
  insert into memberships values(target,owner_id,'owner',null);
  insert into workspace_data(workspace_id,state) values(target,initial_state);
  return target;
end; $$;
create function public.save_workspace(target_id uuid, expected_version bigint, next_state jsonb) returns bigint
language plpgsql security definer set search_path=public as $$
declare updated bigint;
begin
  update workspace_data set state=next_state,version=version+1,updated_at=now()
    where workspace_id=target_id and version=expected_version returning version into updated;
  return updated;
end; $$;
revoke all on function public.create_workspace(text,uuid,jsonb), public.save_workspace(uuid,bigint,jsonb) from public, anon, authenticated;
grant execute on function public.create_workspace(text,uuid,jsonb), public.save_workspace(uuid,bigint,jsonb) to service_role;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('evidence','evidence',false,5000000,array['application/pdf','image/jpeg','image/png','image/webp']) on conflict(id) do nothing;
-- Private storage has no browser policies. Server authorises each signed download.
