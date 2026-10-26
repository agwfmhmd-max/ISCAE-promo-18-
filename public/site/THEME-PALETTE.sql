-- THEME-PALETTE.sql — لوحات ألوان المنصة المشتركة لكل الأجهزة
-- آمن للتكرار ولا يحذف أو يغيّر أي بيانات موجودة.
alter table public.settings
  add column if not exists theme_preset text not null default 'royal-gold';

update public.settings
set theme_preset = 'royal-gold'
where theme_preset is null or btrim(theme_preset) = '';

comment on column public.settings.theme_preset is
  'الهوية اللونية المشتركة للمنصة: royal-gold, emerald-gold, sky-white, burgundy-ivory';
