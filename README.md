# 프렌즈카드 모음

여러 사용자가 프렌즈카드를 등록하고 검색할 수 있는 팬메이드 아카이브입니다.

## 구성
- GitHub Pages: 웹 화면
- Supabase Database: 프렌즈카드 메타데이터
- Supabase Storage: 공개 앞면/뒷면 이미지
- Supabase Edge Function `coord-manage`: 프렌즈카드 등록, 비밀번호 검증, 수정/삭제

## 설정 순서
1. [SUPABASE_SETUP.md](./SUPABASE_SETUP.md)의 안내대로 Supabase 프로젝트를 만듭니다.
2. [초기 SQL 마이그레이션](./supabase/migrations/20261024000100_init_friends_card.sql)을 Supabase SQL Editor에서 실행합니다.
3. [coord-manage Edge Function](./supabase/functions/coord-manage/index.ts)을 배포합니다.
4. `app.js` 맨 위의 `SUPABASE_URL`과 `SUPABASE_ANON_KEY`를 프로젝트의 공개 URL/key로 바꿉니다.
5. GitHub 저장소의 Settings → Pages에서 `main` 브랜치와 `/(root)`를 배포 대상으로 설정합니다.

## 보안 주의
- 브라우저 코드에는 publishable/anon key만 사용합니다. `service_role`/secret key는 절대 커밋하지 마세요.
- 프렌즈카드 비밀번호는 Edge Function에서 PBKDF2-HMAC-SHA-256으로 해시합니다.
- 공개 등록 기능에는 스팸 방지(CAPTCHA/속도 제한)와 운영자 신고·삭제 절차를 추가하는 것을 권장합니다.
- 지금 저장소에는 실제 Supabase 프로젝트의 URL/key가 설정되어 있지 않으므로, Supabase 프로젝트를 만든 후 설정해야 작동합니다.
