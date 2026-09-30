-- =============================================================================
-- STATS.sql — إحصائيات الزوار + التحكم بظهور رقم الهاتف (للمشرف الرئيسي)
-- Supabase Dashboard ← SQL Editor ← الصق الملف كاملاً ← Run  (آمن للتكرار)
-- يتطلب وجود public.is_super_admin() (موجودة في NOTIFICATIONS-RPC.sql).
-- لا يحذف ولا يعدّل أي بيانات موجودة (students / admins / ...).
-- =============================================================================

-- 1) التحكم بإظهار رقم الهاتف في نتيجة البحث (الافتراضي: ظاهر = السلوك الحالي)
alter table public.settings add column if not exists show_phone_in_search boolean not null default true;

-- 2) جدول الزيارات
create table if not exists public.site_visits (
  id          bigint generated always as identity primary key,
  visitor_id  text        not null check (char_length(visitor_id) between 8 and 64),
  visited_at  timestamptz not null default now(),
  lang        text,
  device      text,
  path        text
);
create index if not exists site_visits_visited_at_idx on public.site_visits (visited_at);
create index if not exists site_visits_visitor_idx    on public.site_visits (visitor_id);

alter table public.site_visits enable row level security;
drop policy if exists "super admin reads visits" on public.site_visits;
create policy "super admin reads visits" on public.site_visits
  for select to authenticated using (public.is_super_admin());
revoke all on public.site_visits from anon, authenticated;
grant select on public.site_visits to authenticated;

-- 3) تسجيل زيارة (الزوار يستدعون الدالة فقط؛ لا إدراج مباشر في الجدول)
create or replace function public.track_visit(_visitor text, _lang text default null, _device text default null, _path text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if _visitor is null or char_length(_visitor) not between 8 and 64 then return; end if;
  insert into public.site_visits (visitor_id, lang, device, path)
  values (_visitor, left(_lang, 8), left(_device, 16), left(_path, 200));
end $$;
revoke all on function public.track_visit(text, text, text, text) from public;
grant execute on function public.track_visit(text, text, text, text) to anon, authenticated;

-- 4) إحصائيات الزيارات اليومية (للمشرف الرئيسي فقط)
create or replace function public.get_visit_stats(_from timestamptz, _to timestamptz, _tz text default 'UTC')
returns table (day date, visits bigint, unique_visitors bigint)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_super_admin() then raise exception 'forbidden'; end if;
  return query
    select (v.visited_at at time zone _tz)::date as d, count(*)::bigint, count(distinct v.visitor_id)::bigint
    from public.site_visits v
    where v.visited_at >= _from and v.visited_at < _to
    group by 1 order by 1;
end $$;
revoke all on function public.get_visit_stats(timestamptz, timestamptz, text) from public;
grant execute on function public.get_visit_stats(timestamptz, timestamptz, text) to authenticated;

-- 5) إجمالي الزيارات والزوار الفريدين في الفترة (الفريد لا يُجمع يومياً)
create or replace function public.get_visit_totals(_from timestamptz, _to timestamptz)
returns table (visits bigint, unique_visitors bigint)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_super_admin() then raise exception 'forbidden'; end if;
  return query
    select count(*)::bigint, count(distinct v.visitor_id)::bigint
    from public.site_visits v where v.visited_at >= _from and v.visited_at < _to;
end $$;
revoke all on function public.get_visit_totals(timestamptz, timestamptz) from public;
grant execute on function public.get_visit_totals(timestamptz, timestamptz) to authenticated;
