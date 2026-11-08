begin;

insert into storage.buckets (id, name, public)
values ('graduate-private', 'graduate-private', false)
on conflict (id) do update set public=false;

create or replace function public.mp_can_manage_graduate_storage(_name text, _roles text[] default null)
returns boolean language plpgsql stable security definer set search_path=public as $$
declare pid uuid;
begin
  if _name !~ '^(proofs|memories)/[0-9a-f-]{36}/[0-9a-f-]{36}/[^/]+$' then return false; end if;
  pid := split_part(_name,'/',2)::uuid;
  return public.mp_feature_admin(pid,_roles);
exception when others then
  return false;
end $$;
revoke all on function public.mp_can_manage_graduate_storage(text,text[]) from public, anon;
grant execute on function public.mp_can_manage_graduate_storage(text,text[]) to authenticated, service_role;

drop policy if exists graduate_private_insert on storage.objects;
create policy graduate_private_insert on storage.objects for insert to authenticated
with check (
  bucket_id='graduate-private'
  and name ~ '^(proofs|memories)/[0-9a-f-]{36}/[0-9a-f-]{36}/[^/]+$'
  and (split_part(name,'/',3) = (select auth.uid()::text)
       or public.mp_can_manage_graduate_storage(name, array['finance','night_event','super_admin']))
);

drop policy if exists graduate_private_select on storage.objects;
create policy graduate_private_select on storage.objects for select to authenticated
using (
  bucket_id='graduate-private'
  and name ~ '^(proofs|memories)/[0-9a-f-]{36}/[0-9a-f-]{36}/[^/]+$'
  and (split_part(name,'/',3) = (select auth.uid()::text)
       or public.mp_can_manage_graduate_storage(name, array['finance','night_event','super_admin']))
);

drop policy if exists graduate_private_update on storage.objects;
create policy graduate_private_update on storage.objects for update to authenticated
using (
  bucket_id='graduate-private'
  and name ~ '^(proofs|memories)/[0-9a-f-]{36}/[0-9a-f-]{36}/[^/]+$'
  and (split_part(name,'/',3) = (select auth.uid()::text)
       or public.mp_can_manage_graduate_storage(name, array['finance','night_event','super_admin']))
)
with check (
  bucket_id='graduate-private'
  and name ~ '^(proofs|memories)/[0-9a-f-]{36}/[0-9a-f-]{36}/[^/]+$'
  and (split_part(name,'/',3) = (select auth.uid()::text)
       or public.mp_can_manage_graduate_storage(name, array['finance','night_event','super_admin']))
);

drop policy if exists graduate_private_delete on storage.objects;
create policy graduate_private_delete on storage.objects for delete to authenticated
using (
  bucket_id='graduate-private'
  and name ~ '^(proofs|memories)/[0-9a-f-]{36}/[0-9a-f-]{36}/[^/]+$'
  and (split_part(name,'/',3) = (select auth.uid()::text)
       or public.mp_can_manage_graduate_storage(name, array['finance','night_event','super_admin']))
);

commit;
