begin;

create or replace function public.get_my_night_event_cards(_promotion_id uuid)
returns table(card_id uuid,ceremony_id uuid,token text,beneficiary_name text,used_at timestamptz,ceremony_name text,ceremony_name_fr text,venue_ar text,venue_fr text,promotion_number integer,promotion_name_ar text,promotion_name_fr text,institution_name_ar text,institution_name_fr text,institution_logo text)
language plpgsql security definer set search_path=public as $$
declare
  v_student uuid;
  c record;
  target_count integer;
  existing_count integer;
  tok text;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  select g.student_id into v_student from public.graduate_accounts g
    where g.user_id=auth.uid() and g.promotion_id=_promotion_id and g.student_id is not null limit 1;
  if v_student is null then return; end if;
  for c in select ce.id from public.ceremonies ce
    where ce.promotion_id=_promotion_id and ce.type='night'
      and exists(select 1 from public.promotions p where p.id=ce.promotion_id and p.night_event_enabled)
  loop
    select coalesce(sum(scc.quantity),0)::integer into target_count
      from public.student_ceremony_cards scc
      where scc.ceremony_id=c.id and scc.student_id=v_student and scc.card_type_id is null;
    select count(*) into existing_count from public.night_event_cards nec
      where nec.ceremony_id=c.id and nec.owner_student_id=v_student;
    if target_count > existing_count then
      for i in (existing_count+1)..target_count loop
        tok=replace(gen_random_uuid()::text,'-','')||replace(gen_random_uuid()::text,'-','');
        insert into public.night_event_cards(promotion_id,ceremony_id,owner_student_id,token_hash,token_value)
        values(_promotion_id,c.id,v_student,md5(tok),tok);
      end loop;
    end if;
  end loop;
  return query
  select nec.id,nec.ceremony_id,nec.token_value,nec.beneficiary_name,nec.used_at,
    ce.name,ce.name_fr,ce.night_venue_ar,ce.night_venue_fr,p.number,p.name_ar,p.name_fr,
    i.name_ar,i.name_fr,coalesce(i.logo_url,p.logo_url)
  from public.night_event_cards nec
  join public.ceremonies ce on ce.id=nec.ceremony_id and ce.promotion_id=nec.promotion_id and ce.type='night'
  join public.promotions p on p.id=nec.promotion_id
  left join public.institutions i on i.id=p.institution_id
  where nec.promotion_id=_promotion_id and nec.owner_student_id=v_student and p.night_event_enabled
  order by ce.created_at desc,nec.created_at,nec.id;
end;
$$;

revoke all on function public.get_my_night_event_cards(uuid) from public,anon;
grant execute on function public.get_my_night_event_cards(uuid) to authenticated;

commit;
