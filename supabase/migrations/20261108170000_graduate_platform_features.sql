-- PROMO MR graduate platform features
-- Additive only: preserves existing tenants, students, ceremonies and automatic card allocation.
begin;

create extension if not exists pgcrypto;

create table if not exists public.graduate_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  promotion_id uuid not null references public.promotions(id) on delete restrict,
  student_id uuid references public.students(id) on delete set null,
  full_name text not null check (length(btrim(full_name)) between 2 and 160),
  registration_number text not null check (length(btrim(registration_number)) between 1 and 40),
  phone text,
  profile_photo_path text,
  membership_status text not null default 'pending' check (membership_status in ('pending','active','suspended')),
  privacy text not null default 'members' check (privacy in ('private','members','public')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (promotion_id, user_id)
);

create table if not exists public.subscription_settings (
  promotion_id uuid primary key references public.promotions(id) on delete cascade,
  amount numeric(12,2) not null default 0 check (amount >= 0),
  currency text not null default 'MRU' check (length(currency) between 3 and 8),
  instructions_ar text,
  instructions_fr text,
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now()
);

create table if not exists public.payment_banks (
  id uuid primary key default gen_random_uuid(),
  promotion_id uuid not null references public.promotions(id) on delete cascade,
  bank_name text not null check (length(btrim(bank_name)) between 2 and 120),
  account_number text not null check (length(btrim(account_number)) between 3 and 120),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.subscription_requests (
  id uuid primary key default gen_random_uuid(),
  promotion_id uuid not null references public.promotions(id) on delete restrict,
  account_id uuid not null references public.graduate_accounts(id) on delete cascade,
  bank_id uuid references public.payment_banks(id) on delete set null,
  amount numeric(12,2) not null check (amount > 0),
  proof_path text not null,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  rejection_reason text,
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (status <> 'rejected' or length(btrim(coalesce(rejection_reason,''))) >= 3)
);

create index if not exists subscription_requests_promotion_status_idx on public.subscription_requests(promotion_id, status, created_at desc);
create unique index if not exists subscription_requests_one_pending_per_account on public.subscription_requests(account_id) where status = 'pending';

create table if not exists public.graduate_memories (
  id uuid primary key default gen_random_uuid(),
  promotion_id uuid not null references public.promotions(id) on delete cascade,
  account_id uuid not null references public.graduate_accounts(id) on delete cascade,
  storage_path text not null,
  caption text,
  is_profile_photo boolean not null default false,
  visibility text not null default 'members' check (visibility in ('private','members','public')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists graduate_memories_account_idx on public.graduate_memories(account_id, created_at desc);
create unique index if not exists graduate_memories_profile_one on public.graduate_memories(account_id) where is_profile_photo;

create table if not exists public.promotion_staff (
  id uuid primary key default gen_random_uuid(),
  promotion_id uuid not null references public.promotions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('finance','specialty','night_event')),
  specialty_id uuid references public.specialties(id) on delete set null,
  is_active boolean not null default true,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  unique (promotion_id, user_id, role),
  check (role <> 'specialty' or specialty_id is not null)
);

create table if not exists public.promotion_financial_reports (
  id uuid primary key default gen_random_uuid(),
  promotion_id uuid not null references public.promotions(id) on delete cascade,
  title_ar text not null default 'التقرير المالي',
  title_fr text not null default 'Rapport financier',
  status text not null default 'draft' check (status in ('draft','published','archived')),
  notes text,
  published_at timestamptz,
  published_by uuid references auth.users(id),
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.financial_report_entries (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.promotion_financial_reports(id) on delete cascade,
  promotion_id uuid not null references public.promotions(id) on delete cascade,
  entry_type text not null check (entry_type in ('income','expense')),
  category text not null,
  description text,
  amount numeric(12,2) not null check (amount >= 0),
  entry_date date not null default current_date,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);
create table if not exists public.financial_report_revisions (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.promotion_financial_reports(id) on delete cascade,
  snapshot jsonb not null,
  changed_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create table if not exists public.night_event_cards (
  id uuid primary key default gen_random_uuid(),
  promotion_id uuid not null references public.promotions(id) on delete cascade,
  ceremony_id uuid not null references public.ceremonies(id) on delete cascade,
  card_type_id uuid references public.ceremony_card_types(id) on delete set null,
  owner_student_id uuid not null references public.students(id) on delete restrict,
  token_hash text not null unique,
  beneficiary_name text,
  used_at timestamptz,
  used_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists night_event_cards_owner_idx on public.night_event_cards(owner_student_id);
create table if not exists public.night_event_card_scans (
  id uuid primary key default gen_random_uuid(),
  card_id uuid not null references public.night_event_cards(id) on delete cascade,
  promotion_id uuid not null references public.promotions(id) on delete cascade,
  scanned_by uuid references auth.users(id),
  scanned_at timestamptz not null default now(),
  was_already_used boolean not null default false,
  metadata jsonb
);

create table if not exists public.graduate_notifications (
  id uuid primary key default gen_random_uuid(),
  promotion_id uuid not null references public.promotions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  body text not null,
  url text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create or replace function public.mp_feature_admin(_promotion_id uuid, _roles text[] default null)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_platform_admin() or exists (
    select 1 from public.admins a
    where a.user_id = auth.uid() and coalesce(a.is_active,true)
      and (a.is_platform or a.promotion_id = _promotion_id)
      and (a.role = 'super_admin' or _roles is null or a.role = any(_roles))
  ) or exists (
    select 1 from public.promotion_staff s
    where s.user_id = auth.uid() and s.promotion_id = _promotion_id and s.is_active
      and (_roles is null or s.role = any(_roles))
  );
$$;
revoke all on function public.mp_feature_admin(uuid,text[]) from public;
grant execute on function public.mp_feature_admin(uuid,text[]) to authenticated, service_role;

create or replace function public.register_graduate(_promotion_id uuid, _full_name text, _registration_number text, _phone text default null)
returns public.graduate_accounts language plpgsql security definer set search_path = public as $$
declare v public.graduate_accounts;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  if not exists (select 1 from public.promotions where id = _promotion_id) then raise exception 'PROMOTION_NOT_FOUND'; end if;
  insert into public.graduate_accounts(user_id,promotion_id,full_name,registration_number,phone)
  values(auth.uid(),_promotion_id,btrim(_full_name),btrim(_registration_number),nullif(btrim(_phone),''))
  on conflict (user_id) do update set full_name=excluded.full_name, registration_number=excluded.registration_number, phone=excluded.phone, updated_at=now()
  returning * into v;
  return v;
end $$;
revoke all on function public.register_graduate(uuid,text,text,text) from public;
grant execute on function public.register_graduate(uuid,text,text,text) to authenticated;

create or replace function public.redeem_night_event_card(_token text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v public.night_event_cards;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  select * into v from public.night_event_cards where token_hash = encode(digest(_token,'sha256'),'hex') for update;
  if not found then return jsonb_build_object('ok',false,'status','invalid'); end if;
  insert into public.night_event_card_scans(card_id,promotion_id,scanned_by,was_already_used,metadata)
  values(v.id,v.promotion_id,auth.uid(),v.used_at is not null,jsonb_build_object('first_used_at',v.used_at));
  if v.used_at is not null then return jsonb_build_object('ok',false,'status','used','used_at',v.used_at); end if;
  update public.night_event_cards set used_at=now(),used_by=auth.uid(),updated_at=now() where id=v.id returning * into v;
  return jsonb_build_object('ok',true,'status','accepted','card_id',v.id,'owner_student_id',v.owner_student_id,'beneficiary_name',v.beneficiary_name,'used_at',v.used_at);
end $$;
revoke all on function public.redeem_night_event_card(text) from public;
grant execute on function public.redeem_night_event_card(text) to authenticated;

alter table public.graduate_accounts enable row level security;
alter table public.subscription_settings enable row level security;
alter table public.payment_banks enable row level security;
alter table public.subscription_requests enable row level security;
alter table public.graduate_memories enable row level security;
alter table public.promotion_staff enable row level security;
alter table public.promotion_financial_reports enable row level security;
alter table public.financial_report_entries enable row level security;
alter table public.financial_report_revisions enable row level security;
alter table public.night_event_cards enable row level security;
alter table public.night_event_card_scans enable row level security;
alter table public.graduate_notifications enable row level security;

drop policy if exists graduate_accounts_self on public.graduate_accounts;
create policy graduate_accounts_self on public.graduate_accounts for select to authenticated using (user_id=auth.uid() or public.mp_feature_admin(promotion_id));
create policy graduate_accounts_update_self on public.graduate_accounts for update to authenticated using (user_id=auth.uid()) with check (user_id=auth.uid());

drop policy if exists subscription_settings_scope on public.subscription_settings;
create policy subscription_settings_scope on public.subscription_settings for all to authenticated using (public.mp_feature_admin(promotion_id)) with check (public.mp_feature_admin(promotion_id));
drop policy if exists payment_banks_scope on public.payment_banks;
create policy payment_banks_scope on public.payment_banks for all to authenticated using (public.mp_feature_admin(promotion_id)) with check (public.mp_feature_admin(promotion_id));
drop policy if exists subscription_requests_scope on public.subscription_requests;
create policy subscription_requests_scope on public.subscription_requests for select to authenticated using (exists(select 1 from public.graduate_accounts g where g.id=account_id and g.user_id=auth.uid()) or public.mp_feature_admin(promotion_id, array['finance','super_admin']));
create policy subscription_requests_insert on public.subscription_requests for insert to authenticated with check (exists(select 1 from public.graduate_accounts g where g.id=account_id and g.user_id=auth.uid() and g.promotion_id=promotion_id));
create policy subscription_requests_review on public.subscription_requests for update to authenticated using (public.mp_feature_admin(promotion_id, array['finance','super_admin'])) with check (public.mp_feature_admin(promotion_id, array['finance','super_admin']));

drop policy if exists graduate_memories_scope on public.graduate_memories;
create policy graduate_memories_scope on public.graduate_memories for select to authenticated using ((exists(select 1 from public.graduate_accounts g where g.id=account_id and g.user_id=auth.uid()) or public.mp_feature_admin(promotion_id)) and (visibility <> 'private' or exists(select 1 from public.graduate_accounts g where g.id=account_id and g.user_id=auth.uid())));
create policy graduate_memories_owner_write on public.graduate_memories for all to authenticated using (exists(select 1 from public.graduate_accounts g where g.id=account_id and g.user_id=auth.uid())) with check (exists(select 1 from public.graduate_accounts g where g.id=account_id and g.user_id=auth.uid() and g.promotion_id=promotion_id));

drop policy if exists promotion_staff_scope on public.promotion_staff;
create policy promotion_staff_scope on public.promotion_staff for all to authenticated using (public.mp_feature_admin(promotion_id, array['super_admin'])) with check (public.mp_feature_admin(promotion_id, array['super_admin']));

drop policy if exists financial_reports_scope on public.promotion_financial_reports;
create policy financial_reports_scope on public.promotion_financial_reports for select to authenticated using (status='published' or public.mp_feature_admin(promotion_id, array['super_admin']));
create policy financial_reports_manage on public.promotion_financial_reports for all to authenticated using (public.mp_feature_admin(promotion_id, array['super_admin'])) with check (public.mp_feature_admin(promotion_id, array['super_admin']));
drop policy if exists financial_entries_scope on public.financial_report_entries;
create policy financial_entries_scope on public.financial_report_entries for select to authenticated using (exists(select 1 from public.promotion_financial_reports r where r.id=report_id and (r.status='published' or public.mp_feature_admin(r.promotion_id,array['super_admin']))));
create policy financial_entries_manage on public.financial_report_entries for all to authenticated using (public.mp_feature_admin(promotion_id,array['super_admin'])) with check (public.mp_feature_admin(promotion_id,array['super_admin']));

drop policy if exists night_cards_scope on public.night_event_cards;
create policy night_cards_scope on public.night_event_cards for select to authenticated using (public.mp_feature_admin(promotion_id,array['night_event','super_admin']) or exists(select 1 from public.students s join public.graduate_accounts g on g.student_id=s.id where s.id=owner_student_id and g.user_id=auth.uid()));
create policy night_cards_manage on public.night_event_cards for all to authenticated using (public.mp_feature_admin(promotion_id,array['night_event','super_admin'])) with check (public.mp_feature_admin(promotion_id,array['night_event','super_admin']));
drop policy if exists night_scans_scope on public.night_event_card_scans;
create policy night_scans_scope on public.night_event_card_scans for select to authenticated using (public.mp_feature_admin(promotion_id,array['night_event','super_admin']));

drop policy if exists graduate_notifications_self on public.graduate_notifications;
create policy graduate_notifications_self on public.graduate_notifications for select to authenticated using (user_id=auth.uid() or public.mp_feature_admin(promotion_id));
create policy graduate_notifications_read on public.graduate_notifications for update to authenticated using (user_id=auth.uid()) with check (user_id=auth.uid());

commit;
