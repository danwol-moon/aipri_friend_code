# 아이프리 코디 도감 — Supabase 연결 안내

이 저장소는 GitHub Pages 프런트엔드와 Supabase 백엔드를 사용합니다.

## 1. Supabase 프로젝트 생성
1. https://supabase.com 에 로그인하고 새 프로젝트를 만듭니다.
2. 프로젝트가 준비되면 Project URL과 publishable key(또는 구형 anon key)를 복사합니다.
3. Project Settings > API Keys에서 키를 확인합니다. secret/service_role 키는 브라우저나 GitHub 파일에 넣지 마세요.

## 2. 데이터베이스와 이미지 버킷 만들기
1. Supabase 대시보드에서 SQL Editor > New query를 엽니다.
2. `supabase/migrations/20261024000100_init_coord_book.sql`의 전체 내용을 붙여 넣고 Run을 누릅니다.
3. SQL이 오류 없이 실행되면 Table Editor에서 `coords` 테이블을 확인합니다.
4. Storage에서 `coord-images` 버킷이 생성됐는지 확인합니다. SQL이 버킷을 public으로 만들고, 이미지 형식을 JPEG/PNG/WEBP/GIF, 파일 크기를 5MB로 제한합니다.
5. 공개 버킷의 파일은 URL을 아는 누구나 볼 수 있습니다. 브라우저 역할에는 업로드/삭제 권한을 주지 않습니다.

## 3. Edge Function 비밀값 설정
Supabase 대시보드의 Edge Functions > Secrets에서 다음을 확인합니다.
- `SUPABASE_URL`: 프로젝트 URL
- `SUPABASE_SERVICE_ROLE_KEY`: Project Settings > API Keys의 secret/service_role 키

Supabase Edge Functions는 기본 환경 변수로 이 값을 제공하는 경우가 있습니다. 사용 중인 프로젝트의 함수 환경에서 실제 값이 제공되는지 확인하세요. 이 키는 절대 `app.js`, GitHub 저장소, 공개 이슈/채팅에 넣지 마세요.

## 4. Edge Function 배포
이 저장소의 `supabase/functions/coord-manage/index.ts`를 배포합니다. 가장 쉬운 방법은 로컬 PC에 Node.js와 Supabase CLI를 설치한 다음 저장소를 clone하고 아래 명령을 실행하는 것입니다.

```bash
supabase login
supabase link --project-ref YOUR_PROJECT_REF
supabase functions deploy coord-manage --no-verify-jwt
```

이 함수는 공개 방문자가 코디 등록/수정/삭제 요청을 보낼 수 있도록 JWT 검증을 끄고, 내부에서 요청 내용을 검증합니다. 그러므로 함수에는 공개 등록 스팸 방지(CAPTCHA/속도 제한)를 추가하는 것을 권장합니다. 함수가 service role로 DB/Storage에 접근하므로 서비스 키를 프런트엔드에 노출하지 마세요.

## 5. 프런트엔드 연결
`app.js` 맨 위의 `SUPABASE_URL`과 `SUPABASE_ANON_KEY` 값을 실제 프로젝트 값으로 바꿉니다. 이 값은 공개 브라우저용 publishable/anon key이며, RLS 정책으로 읽기 전용 접근만 허용됩니다. service_role/secret key를 넣으면 안 됩니다.

## 6. GitHub Pages 공개
GitHub 저장소의 Settings > Pages에서 Deploy from a branch를 선택하고 `main` / `/(root)`를 선택한 뒤 Save를 누릅니다. 배포 URL이 나타날 때까지 기다립니다.

## 7. 테스트 체크리스트
- [ ] 비로그인 방문자가 코디 목록을 읽을 수 있음
- [ ] 새 코디 등록 후 다른 브라우저에서도 표시됨
- [ ] 등록 비밀번호가 틀리면 수정/삭제가 거절됨
- [ ] 맞는 비밀번호로 코디 정보를 수정할 수 있음
- [ ] 맞는 비밀번호로 코디를 삭제할 수 있음
- [ ] 비밀번호 해시 테이블을 브라우저에서 조회할 수 없음
- [ ] 브라우저에서 Storage에 직접 업로드/삭제할 수 없음

## 주의
- 지금 구조는 별도 계정 없이 비밀번호로 코디를 관리합니다. 비밀번호를 잊으면 본인 확인을 자동으로 할 수 없습니다.
- 서버 측 비밀번호 해시는 PBKDF2-HMAC-SHA-256을 사용합니다.
- 공개 등록 API는 스팸/대량 업로드 위험이 있습니다. 공개 전 CAPTCHA, 요청 속도 제한, 운영자 신고/삭제 절차를 추가하세요.
- Storage 파일 백업과 Postgres 데이터베이스 백업은 별개로 관리하세요.
