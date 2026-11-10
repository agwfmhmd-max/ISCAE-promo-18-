begin;

-- The product limit is three memories per graduate account. The trigger is authoritative,
-- so direct API calls cannot bypass the UI limit.
create or replace function public.enforce_graduate_memory_limit()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if (select count(*) from public.graduate_memories where account_id=new.account_id and id<>coalesce(new.id,'00000000-0000-0000-0000-000000000000'::uuid)) >= 3 then
    raise exception 'MEMORY_LIMIT_REACHED';
  end if;
  return new;
end $$;
drop trigger if exists graduate_memory_limit on public.graduate_memories;
create trigger graduate_memory_limit before insert or update on public.graduate_memories for each row execute function public.enforce_graduate_memory_limit();
revoke all on function public.enforce_graduate_memory_limit() from public,anon,authenticated;

commit;
