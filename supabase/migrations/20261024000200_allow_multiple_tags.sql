-- 태그를 여러 개 선택할 수 있도록 기존 단일 태그 제약을 제거합니다.
-- 앱에서는 선택한 태그들을 쉼표로 연결해 friends_card.tag에 저장합니다.
do $$
declare
  constraint_name text;
begin
  for constraint_name in
    select conname
    from pg_constraint
    where conrelid = 'public.friends_card'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%tag%'
  loop
    execute format('alter table public.friends_card drop constraint %I', constraint_name);
  end loop;
end $$;

create index if not exists friends_card_tag_idx on public.friends_card (tag);
