begin;

create or replace function public.create_ceremony_with_cards(
  _promotion_id uuid,
  _name text,
  _name_fr text,
  _type text,
  _total_cards integer,
  _card_types jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ceremony public.ceremonies;
  v_type jsonb;
  v_result jsonb;
  v_sum integer;
begin
  if not public.can_manage_promotion(_promotion_id) then raise exception 'FORBIDDEN'; end if;
  if _type not in ('graduation','night') then raise exception 'INVALID_CEREMONY_TYPE'; end if;
  if coalesce(_total_cards,0) < 0 then raise exception 'INVALID_CARD_TOTAL'; end if;
  if _type = 'graduation' then
    select coalesce(sum(coalesce((x->>'total_cards')::integer,0)),0) into v_sum
    from jsonb_array_elements(coalesce(_card_types,'[]'::jsonb)) x;
    if v_sum <> coalesce(_total_cards,0) then
      raise exception 'CARD_TOTALS_MISMATCH: % <> %',v_sum,_total_cards;
    end if;
  elsif jsonb_array_length(coalesce(_card_types,'[]'::jsonb)) > 0 then
    raise exception 'NIGHT_CEREMONY_CANNOT_HAVE_COLORS';
  end if;

  insert into public.ceremonies (promotion_id,name,name_fr,type,total_cards)
  values (_promotion_id,btrim(_name),nullif(btrim(_name_fr),''),_type,coalesce(_total_cards,0))
  returning * into v_ceremony;

  if _type = 'graduation' then
    for v_type in select * from jsonb_array_elements(coalesce(_card_types,'[]'::jsonb)) loop
      insert into public.ceremony_card_types (promotion_id,ceremony_id,name,name_fr,color,total_cards)
      values (_promotion_id,v_ceremony.id,btrim(v_type->>'name'),nullif(btrim(v_type->>'name_fr'),''),coalesce(v_type->>'color','#7c3aed'),coalesce((v_type->>'total_cards')::integer,0));
    end loop;
  end if;

  v_result := public.redistribute_ceremony_cards(v_ceremony.id);
  return jsonb_build_object('ceremony_id',v_ceremony.id,'students',coalesce(v_result->'students','0'::jsonb),'distributed',coalesce(v_result->'distributed','0'::jsonb));
exception when others then
  raise;
end;
$$;
revoke all on function public.create_ceremony_with_cards(uuid,text,text,text,integer,jsonb) from public,anon;
grant execute on function public.create_ceremony_with_cards(uuid,text,text,text,integer,jsonb) to authenticated,service_role;

do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='graduate_notifications') then
    alter publication supabase_realtime add table public.graduate_notifications;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='subscription_requests') then
    alter publication supabase_realtime add table public.subscription_requests;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='notifications') then
    alter publication supabase_realtime add table public.notifications;
  end if;
end $$;

commit;
