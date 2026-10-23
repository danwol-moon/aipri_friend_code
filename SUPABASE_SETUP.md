# 프렌즈카드 모음 — 설정 및 배포 안내

이 저장소는 GitHub Pages 프런트엔드와 Supabase 백엔드를 사용합니다. SQL 스키마는 Supabase SQL Editor에서 이미 실행했다고 가정합니다.

## 완료된 설정
- Supabase 프로젝트 URL: `https://zlaiquivnuluglchqlbr.supabase.co`
- 프런트엔드의 `app.js`에 Project URL과 공개 Publishable key를 입력했습니다.
- 데이터베이스 초기 SQL을 실행했습니다.

## 1. 데이터베이스 확인
Supabase 대시보드에서 Table Editor에 `friends_card`, `coord_credentials` 테이블이 있는지 확인합니다. Storage에서 `coord-images` 버킷이 있는지도 확인합니다. 초기 SQL이 성공했다면 버킷도 만들어졌어야 합니다.

## 2. Edge Function 배포용 GitHub Secrets 설정
카드 등록·수정·삭제 기능은 Edge Function `coord-manage`가 담당합니다. 저장소에는 배포 워크플로 파일 `.github/workflows/deploy-supabase-function.yml`을 추가했습니다. 이 기능은 GitHub Actions에서 수동으로 실행할 수 있습니다.

GitHub 저장소에서 **Settings → Secrets and variables → Actions → New repository secret**을 열고 아래 3개를 하나씩 등록합니다.

- `SUPABASE_ACCESS_TOKEN`: Supabase 계정의 Access Token. Supabase 대시보드의 계정 설정에서 Access Tokens를 찾아 새 토큰을 생성합니다.
- `SUPABASE_PROJECT_REF`: `zlaiquivnuluglchqlbr`
- `SUPABASE_DB_PASSWORD`: 이 Supabase 프로젝트를 만들 때 설정한 데이터베이스 비밀번호

비밀번호나 Access Token은 이 채팅이나 공개 파일에 보내거나 저장하지 마세요. 잊어버린 데이터베이스 비밀번호는 Supabase 프로젝트 설정에서 재설정해야 할 수 있습니다.

Secrets를 등록한 뒤 GitHub 저장소의 **Actions** 탭 → **Deploy Supabase Edge Function** → **Run workflow** → **Run workflow**를 선택합니다. 실행이 성공하면 `coord-manage` 함수가 배포됩니다.

함수가 배포된 뒤에도 서버가 서비스 키를 읽을 수 있어야 합니다. Supabase Edge Functions의 기본 환경 변수에 `SUPABASE_SERVICE_ROLE_KEY`가 제공되는지 확인합니다. 제공되지 않는 경우에만 Supabase의 Edge Functions → Secrets에서 `AIPRI_SUPABASE_SERVICE_KEY`라는 이름으로 서비스 키를 등록합니다. 서비스 키는 절대 `app.js`나 GitHub 저장소에 넣지 마세요.

## 3. GitHub Pages 공개 설정
저장소에 GitHub Pages 자동 배포 워크플로 `.github/workflows/deploy-pages.yml`을 추가했습니다.

1. GitHub 저장소의 **Settings → Pages**를 엽니다.
2. **Build and deployment**의 Source를 **GitHub Actions**로 설정합니다.
3. 저장소의 **Actions** 탭에서 **Deploy GitHub Pages** 워크플로가 실행되는지 확인합니다. 코드가 main 브랜치에 올라갈 때 자동으로 실행됩니다.
4. 배포가 성공하면 Settings → Pages에 표시된 사이트 주소를 엽니다.

## 4. 테스트 순서
- [ ] 사이트가 열리고 카드 목록 영역에 연결 오류가 표시되지 않는지 확인
- [ ] 카드 등록 창에서 카드 앞면·뒷면 이미지와 필수 정보를 입력해 테스트 카드 등록
- [ ] 등록 후 새로고침해도 카드가 보이는지 확인
- [ ] 등록 비밀번호가 맞을 때 수정·삭제가 되는지 확인
- [ ] 다른 브라우저에서도 같은 카드가 보이는지 확인

## 보안 및 공개 전 주의
- 브라우저 코드에는 공개용 Publishable/anon key만 사용합니다. `service_role` 또는 `secret` 키는 브라우저 코드에 넣지 마세요.
- 카드 이미지는 공개 버킷에 저장되므로 업로드한 이미지는 누구나 볼 수 있습니다.
- 수정·삭제 비밀번호는 8자 이상으로 설정하고 잊지 않도록 안전하게 보관하세요.
- 현재 공개 등록 API에는 CAPTCHA나 속도 제한이 아직 없습니다. 사이트를 널리 공개하기 전에 스팸 방지 대책을 추가하는 것이 좋습니다.
- 데이터베이스와 Storage 이미지는 별도로 백업해야 합니다.
