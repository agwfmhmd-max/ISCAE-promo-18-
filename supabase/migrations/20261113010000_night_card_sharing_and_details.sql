begin;

alter table public.ceremonies add column if not exists night_venue_ar text;
alter table public.ceremonies add column if not exists night_venue_fr text;
alter table public.night_event_cards add column if not exists token_value text;
create unique index if not exists night_event_cards_token_value_uniq
  on public.night_event_cards(token_value) where token_value is not null;

-- The raw token is returned only through owner/manager RPCs. The hash remains
-- the value used for redemption, so scanning never relies on a client query.
create or replace function public.issue_night_event_cards(_ceremony_id uuid)
returns table(card_id uuid, raw_token text, owner_student_id uuid, card_type_id uuid)
language plpgsql security definer set search_path=public as $$
declare
  c public.ceremonies;
  a record;
  existing_count integer;
  tok text;
  cid uuid;
  old_card public.night_event_cards;
begin
  select * into c from public.ceremonies where id=_ceremony_id;
  if not found or c.type<>'night' then raise exception 'NIGHT_CEREMONY_REQUIRED'; end if;
  if not exists(select 1 from public.promotions p where p.id=c.promotion_id and p.night_event_enabled) then raise exception 'NIGHT_EVENT_DISABLED'; end if;
  if not public.mp_feature_admin(c.promotion_id,array['night_event','super_admin']) then raise exception 'FORBIDDEN'; end if;

  -- Repair legacy rows first, then fill only the missing quantity. Repeating
  -- this operation is therefore safe and never duplicates a card.
  for old_card in select * from public.night_event_cards where ceremony_id=_ceremony_id and token_value is null for update loop
    tok=replace(gen_random_uuid()::text,'-','')||replace(gen_random_uuid()::text,'-','');
    update public.night_event_cards set token_value=tok,token_hash=md5(tok),updated_at=now() where id=old_card.id;
  end loop;
  for a in select scc.student_id,scc.quantity
    from public.student_ceremony_cards scc
    where scc.ceremony_id=_ceremony_id and scc.promotion_id=c.promotion_id
      and scc.quantity>0 and scc.card_type_id is null
  loop
    select count(*) into existing_count from public.night_event_cards nec
      where nec.ceremony_id=_ceremony_id and nec.owner_student_id=a.student_id;
    for i in (existing_count+1)..a.quantity loop
      tok=replace(gen_random_uuid()::text,'-','')||replace(gen_random_uuid()::text,'-','');
      insert into public.night_event_cards(promotion_id,ceremony_id,card_type_id,owner_student_id,token_hash,token_value)
      values(c.promotion_id,_ceremony_id,null,a.student_id,md5(tok),tok)
      returning id into cid;
    end loop;
  end loop;
  return query select nec.id,nec.token_value,nec.owner_student_id,nec.card_type_id
    from public.night_event_cards nec where nec.ceremony_id=_ceremony_id order by nec.created_at,nec.id;
end;
$$;
revoke all on function public.issue_night_event_cards(uuid) from public,anon;
grant execute on function public.issue_night_event_cards(uuid) to authenticated,service_role;

-- Owners receive only their own cards. Calling this also provisions missing
-- tokens for the paid allocation, so cards appear immediately in the space.
create or replace function public.get_my_night_event_cards(_promotion_id uuid)
returns table(
  card_id uuid, ceremony_id uuid, token text, beneficiary_name text,
  used_at timestamptz, ceremony_name text, ceremony_name_fr text,
  venue_ar text, venue_fr text, promotion_number integer,
  promotion_name_ar text, promotion_name_fr text, institution_name_ar text,
  institution_name_fr text, institution_logo text
)
language plpgsql security definer set search_path=public as $$
declare
  v_student uuid;
  c record;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  select g.student_id into v_student from public.graduate_accounts g
    where g.user_id=auth.uid() and g.promotion_id=_promotion_id and g.student_id is not null limit 1;
  if v_student is null then return; end if;
  for c in select ce.id from public.ceremonies ce
    where ce.promotion_id=_promotion_id and ce.type='night'
      and exists(select 1 from public.promotions p where p.id=ce.promotion_id and p.night_event_enabled)
  loop
    -- SECURITY DEFINER call is not used for graduates; provision directly
    -- for this owner from their already-created paid allocation only.
    insert into public.night_event_cards(promotion_id,ceremony_id,owner_student_id,token_hash,token_value)
    select _promotion_id,c.id,v_student,md5(t.token),t.token
    from (select replace(gen_random_uuid()::text,'-','')||replace(gen_random_uuid()::text,'-','') as token) t
    where exists(select 1 from public.student_ceremony_cards scc where scc.ceremony_id=c.id and scc.student_id=v_student and scc.card_type_id is null and scc.quantity>0)
      and not exists(select 1 from public.night_event_cards nec where nec.ceremony_id=c.id and nec.owner_student_id=v_student);
  end loop;
  return query
  select nec.id,nec.ceremony_id,nec.token_value,nec.beneficiary_name,nec.used_at,
    ce.name,ce.name_fr,ce.night_venue_ar,ce.night_venue_fr,p.number,p.name_ar,p.name_fr,
    i.name_ar,i.name_fr,coalesce(i.logo_url,p.logo_url)
  from public.night_event_cards nec
  join public.ceremonies ce on ce.id=nec.ceremony_id and ce.promotion_id=nec.promotion_id and ce.type='night'
  join public.promotions p on p.id=nec.promotion_id
  left join public.institutions i on i.id=p.institution_id
  where nec.promotion_id=_promotion_id and nec.owner_student_id=v_student
    and p.night_event_enabled
  order by ce.created_at desc,nec.created_at,nec.id;
end;
$$;
revoke all on function public.get_my_night_event_cards(uuid) from public,anon;
grant execute on function public.get_my_night_event_cards(uuid) to authenticated;

create or replace function public.update_night_event_card_beneficiary(_card_id uuid,_beneficiary_name text)
returns public.night_event_cards
language plpgsql security definer set search_path=public as $$
declare v public.night_event_cards;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  select nec.* into v from public.night_event_cards nec
  join public.graduate_accounts g on g.student_id=nec.owner_student_id and g.promotion_id=nec.promotion_id
  where nec.id=_card_id and g.user_id=auth.uid() for update;
  if not found then raise exception 'CARD_NOT_FOUND'; end if;
  if v.used_at is not null then raise exception 'CARD_ALREADY_USED'; end if;
  if length(btrim(coalesce(_beneficiary_name,'')))<2 or length(btrim(_beneficiary_name))>160 then raise exception 'INVALID_BENEFICIARY_NAME'; end if;
  update public.night_event_cards set beneficiary_name=btrim(_beneficiary_name),updated_at=now() where id=_card_id returning * into v;
  return v;
end;
$$;
revoke all on function public.update_night_event_card_beneficiary(uuid,text) from public,anon;
grant execute on function public.update_night_event_card_beneficiary(uuid,text) to authenticated;

create or replace function public.update_night_event_details(_ceremony_id uuid,_venue_ar text,_venue_fr text)
returns public.ceremonies
language plpgsql security definer set search_path=public as $$
declare v public.ceremonies;
begin
  select * into v from public.ceremonies where id=_ceremony_id and type='night' for update;
  if not found then raise exception 'NIGHT_CEREMONY_NOT_FOUND'; end if;
  if not public.mp_feature_admin(v.promotion_id,array['night_event','super_admin']) then raise exception 'FORBIDDEN'; end if;
  update public.ceremonies set night_venue_ar=nullif(btrim(_venue_ar),''),night_venue_fr=nullif(btrim(_venue_fr),''),updated_at=now() where id=_ceremony_id returning * into v;
  return v;
end;
$$;
revoke all on function public.update_night_event_details(uuid,text,text) from public,anon;
grant execute on function public.update_night_event_details(uuid,text,text) to authenticated;

create or replace function public.get_shared_night_event_card(_token text)
returns table(card_id uuid, ceremony_id uuid, token text, beneficiary_name text, used_at timestamptz, ceremony_name text, ceremony_name_fr text, venue_ar text, venue_fr text, promotion_number integer, promotion_name_ar text, promotion_name_fr text, institution_name_ar text, institution_name_fr text, institution_logo text)
language sql stable security definer set search_path=public as $$
  select nec.id,nec.ceremony_id,nec.token_value,nec.beneficiary_name,nec.used_at,ce.name,ce.name_fr,ce.night_venue_ar,ce.night_venue_fr,p.number,p.name_ar,p.name_fr,i.name_ar,i.name_fr,coalesce(i.logo_url,p.logo_url)
  from public.night_event_cards nec join public.ceremonies ce on ce.id=nec.ceremony_id join public.promotions p on p.id=nec.promotion_id left join public.institutions i on i.id=p.institution_id
  where nec.token_value=trim(_token) and ce.type='night' and p.night_event_enabled limit 1;
$$;
revoke all on function public.get_shared_night_event_card(text) from public;
grant execute on function public.get_shared_night_event_card(text) to anon,authenticated;

-- Atomic redemption: row lock + used_at check ensures the second scan is rejected.
create or replace function public.redeem_night_event_card(_token text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v public.night_event_cards;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  select * into v from public.night_event_cards where token_hash=md5(trim(_token)) for update;
  if not found then return jsonb_build_object('ok',false,'status','invalid'); end if;
  if not exists(select 1 from public.promotions p where p.id=v.promotion_id and p.night_event_enabled) then raise exception 'NIGHT_EVENT_DISABLED'; end if;
  if not public.mp_feature_admin(v.promotion_id,array['night_event','super_admin']) then raise exception 'FORBIDDEN'; end if;
  if v.used_at is not null then
    insert into public.night_event_card_scans(card_id,promotion_id,scanned_by,was_already_used,metadata) values(v.id,v.promotion_id,auth.uid(),true,jsonb_build_object('first_used_at',v.used_at));
    return jsonb_build_object('ok',false,'status','used','used_at',v.used_at,'beneficiary_name',v.beneficiary_name);
  end if;
  update public.night_event_cards set used_at=now(),used_by=auth.uid(),updated_at=now() where id=v.id returning * into v;
  insert into public.night_event_card_scans(card_id,promotion_id,scanned_by,was_already_used,metadata) values(v.id,v.promotion_id,auth.uid(),false,jsonb_build_object('first_used_at',v.used_at));
  return jsonb_build_object('ok',true,'status','accepted','card_id',v.id,'owner_student_id',v.owner_student_id,'beneficiary_name',v.beneficiary_name,'used_at',v.used_at);
end;
$$;
revoke all on function public.redeem_night_event_card(text) from public,anon;
grant execute on function public.redeem_night_event_card(text) to authenticated,service_role;

commit;
