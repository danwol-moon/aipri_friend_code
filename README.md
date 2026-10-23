# 프렌즈카드 모음

여러 사용자가 프렌즈카드를 등록하고 검색할 수 있는 팬메이드 아카이브입니다.

## 현재 설정
- Supabase 프로젝트 URL과 공개 Publishable key는 `app.js`에 설정되어 있습니다.
- Supabase 초기 SQL은 대시보드에서 실행했습니다.
- GitHub Pages 자동 배포 워크플로: `.github/workflows/deploy-pages.yml`
- Supabase Edge Function 수동 배포 워크플로: `.github/workflows/deploy-supabase-function.yml`

## 배포 순서
1. [Supabase 설정 및 배포 안내](./SUPABASE_SETUP.md)를 따라 GitHub 저장소의 Actions Secrets에 `SUPABASE_ACCESS_TOKEN`, `SUPABASE_PROJECT_REF`, `SUPABASE_DB_PASSWORD`를 등록합니다.
2. GitHub 저장소 Settings → Pages에서 Source를 **GitHub Actions**로 설정합니다.
3. Actions 탭에서 **Deploy Supabase Edge Function** 워크플로를 수동 실행합니다.
4. **Deploy GitHub Pages** 워크플로가 성공했는지 확인하고 Settings → Pages에 표시된 주소로 접속합니다.
5. 카드 등록, 이미지 업로드, 검색, 수정 및 삭제를 테스트합니다.

## 보안 주의
- 브라우저 코드에는 공개 Publishable/anon key만 사용합니다. `service_role` 또는 `secret` 키는 절대 커밋하지 마세요.
- 프렌즈카드 비밀번호는 Edge Function에서 PBKDF2-HMAC-SHA-256으로 해시합니다.
- 카드 이미지는 공개 Storage 버킷에서 제공되므로 누구나 볼 수 있습니다.
- 공개 등록 API에는 아직 CAPTCHA/속도 제한이 없습니다. 널리 공개하기 전에 스팸 방지 대책을 추가하는 것을 권장합니다.
