-- 프렌즈카드 모음: 초기 스키마
-- Supabase Dashboard > SQL Editor에서 한 번 실행하세요.

create extension if not exists pgcrypto;

-- 이전 안내에 따라 public.coords 테이블을 먼저 만들었다면 이름만 변경합니다.
do $
begin
  if to_regclass('public.coords') is not null and to_regclass('public.friends_card') is null then
    alter table public.coords rename to friends_card;
  end if;
end $;

create table if not exists public.friends_card (
  id uuid primary key default gen_random_uuid(),
  name_ko text not null default '' check (char_length(name_ko) <= 100),
  name_ja text not null default '' check (char_length(name_ja) <= 100),
  tag text not null check (tag in ('프리마지', '히미프리', '오네프리', '밀피', '구미', '스페셜')),
  front_image_path text not null,
  back_image_path text not null,
  x_id text not null default '' check (char_length(x_id) <= 80),
  display_name text not null default '' check (char_length(display_name) <= 80),
  my_character text not null default '' check (char_length(my_character) <= 80),
  character_owner text not null default '' check (char_length(character_owner) <= 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint friends_card_has_name check (length(trim(name_ko)) > 0 or length(trim(name_ja)) > 0)
);

create index if not exists friends_card_created_at_idx on public.friends_card (created_at desc);
create index if not exists friends_card_tag_idx on public.friends_card (tag);
create index if not exists friends_card_name_ko_idx on public.friends_card (name_ko);
create index if not exists friends_card_name_ja_idx on public.friends_card (name_ja);

-- 비밀번호 해시/솔트는 공개 프렌즈카드 테이블과 분리하고 API 역할에 노출하지 않습니다.
create table if not exists public.coord_credentials (
  coord_id uuid primary key references public.friends_card(id) on delete cascade,
  password_salt text not null,
  password_hash text not null,
  created_at timestamptz not null default now()
);

alter table public.friends_card enable row level security;
alter table public.coord_credentials enable row level security;

-- 방문자는 공개 프렌즈카드 목록만 읽을 수 있습니다.
revoke all on table public.friends_card from anon, authenticated;
grant select on table public.friends_card to anon, authenticated;
drop policy if exists "Public can read coords" on public.friends_card;
drop policy if exists "Public can read friends_card" on public.friends_card;
create policy "Public can read friends_card"
  on public.friends_card for select
  to anon, authenticated
  using (true);

-- 모든 쓰기는 coord-manage Edge Function에서 service role로 수행합니다.
-- 비밀번호 테이블에는 브라우저 역할에 어떤 권한도 부여하지 않습니다.
revoke all on table public.coord_credentials from anon, authenticated;
grant select, insert, update, delete on table public.friends_card to service_role;
grant select, insert, update, delete on table public.coord_credentials to service_role;

-- 공개 이미지는 누구나 URL로 읽을 수 있습니다. 업로드/삭제는 Edge Function만 수행합니다.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'coord-images',
  'coord-images',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;
