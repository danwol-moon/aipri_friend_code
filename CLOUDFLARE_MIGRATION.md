# Supabase에서 Cloudflare + Backblaze로 완전 이전

## 목표 구성

- Cloudflare Pages: 정적 프론트엔드
- Cloudflare Workers: 사이트 API, 인증, 이미지 업로드/삭제
- Cloudflare D1: 카드 정보, 비밀번호 검증 데이터, 일반 사이트 설정
- Backblaze B2: 이미지 파일 원본 저장소

Supabase는 이전 완료 및 검증 전까지 원본으로 보존합니다. 이 절차는 Supabase 데이터를 삭제하지 않습니다.

## 현재 준비된 코드

- `cloudflare/worker.js`: D1 카드 API와 B2 이미지 저장/조회/삭제
- `cloudflare/migrations/0001_initial.sql`: D1 테이블 생성
- `scripts/migrate-supabase-to-cloudflare.mjs`: 로컬에서 실행하는 비파괴 데이터/이미지 이전 도구
- `app.js`: 별도 브랜치에서 Cloudflare Worker API를 사용하도록 변경됨
- 사이트의 실제 운영 브랜치 `main`에는 아직 반영하지 않았습니다.

## 1. D1 테이블 만들기

Cloudflare Dashboard → **Storage & databases → D1 SQL Database** → 생성한 `friends-card-db` → **Console**로 이동합니다.

저장소의 `cloudflare/migrations/0001_initial.sql` 전체 내용을 SQL Console에 붙여넣고 실행합니다. 아래 3개 테이블이 생성되어야 합니다.

- `friends_card`
- `coord_credentials`
- `app_settings`

## 2. Worker에 D1 연결 및 비밀값 등록

Cloudflare Dashboard → **Workers & Pages → aipri-friend-image-worker → Settings**에서 설정합니다.

### D1 database binding

**Bindings → Add → D1 database**에서 다음과 같이 등록합니다.

- Variable name: `DB`
- D1 database: `friends-card-db`

저장 후 Worker가 새 바인딩을 사용하도록 Deploy/Save 합니다.

### 기존 B2 설정은 유지하고 관리자 Secret 추가

기존에 등록한 B2 설정과 `UPLOAD_SECRET`은 그대로 둡니다. 다음 Secret을 추가합니다.

- `FRIENDS_CARD_ADMIN_PASSWORD`: 기존 관리자 비밀번호 또는 새 강력한 비밀번호 (최소 8자)

이 비밀번호는 GitHub나 브라우저 코드에 넣지 않습니다. Worker의 **Settings → Variables and Secrets**에서 Secret으로 입력합니다.

## 3. Worker 코드 배포

1. GitHub의 `cloudflare-full-migration` 브랜치에서 `cloudflare/worker.js`를 엽니다.
2. 전체 코드를 복사합니다.
3. Cloudflare Worker의 **Edit code**에서 기존 코드를 전체 교체합니다.
4. **Deploy**합니다.
5. `https://aipri-friend-image-worker.ghlwls0222.workers.dev/health`가 정상 응답하는지 확인합니다.

기존 이미지 전용 Worker 기능은 유지되며, 여기에 `GET /api/cards`와 `POST /api/cards`가 추가됩니다. D1 바인딩이 없으면 API가 오류를 반환합니다.

## 4. 로컬에서 Supabase 데이터와 이미지 이전

이전 도구는 사용자의 PC에서 실행합니다. Supabase 서비스 키와 업로드 Secret을 채팅이나 GitHub에 올리지 마세요.

### 필요한 환경

- Node.js 20 이상
- 저장소를 PC에 내려받은 상태
- Wrangler 로그인: `npx wrangler login`
- D1 스키마 적용 완료
- Worker D1 바인딩 및 B2 설정 완료

### Windows PowerShell

저장소 폴더에서 아래 명령을 실행하고 각 값을 본인 PC에서만 입력합니다.

```powershell
$env:SUPABASE_URL = "기존 Supabase 프로젝트 URL"
$env:SUPABASE_SERVICE_ROLE_KEY = "Supabase service_role 키"
$env:B2_WORKER_URL = "https://aipri-friend-image-worker.ghlwls0222.workers.dev"
$env:UPLOAD_SECRET = "Cloudflare Worker의 UPLOAD_SECRET과 동일한 값"

npx wrangler login
node scripts/migrate-supabase-to-cloudflare.mjs
```

스크립트는 다음 작업을 수행합니다.

1. Supabase의 `friends_card` 및 `coord_credentials` 데이터를 읽습니다.
2. `coord-images` Storage의 파일/폴더를 재귀적으로 전부 조사합니다.
3. 이미지 파일을 B2에 복사하고 기존 경로와 새 URL의 매핑을 만듭니다.
4. 기존 카드 UUID와 비밀번호 salt/hash를 유지한 채 D1 입력 SQL을 생성합니다.
5. 모든 이미지 복사가 성공한 경우에만 D1에 카드/비밀번호 데이터를 입력합니다.

결과와 로컬 백업은 `.migration-output` 폴더에 생성됩니다. 이 폴더에는 카드 데이터 및 비밀번호 해시가 포함될 수 있으므로 개인 PC에 안전하게 보관하고 공개 저장소에 올리지 마세요.

**현재 이미지 업로드 API는 이미지당 5MB 제한입니다.** 더 큰 원본이 발견되면 스크립트가 해당 파일을 실패로 기록하고 D1 데이터 입력을 중단합니다. 누락 파일을 해결하기 전에는 완료로 간주하지 않습니다.

## 5. 이전 후 검증

- Worker `GET /api/cards`의 카드 수가 Supabase 원본과 일치하는지 확인
- D1의 `coord_credentials` 레코드 수 확인
- 모든 카드의 프렌즈카드 이미지와 선택 코디 이미지가 표시되는지 확인
- 기존 등록 비밀번호로 수정/삭제 인증이 되는지 확인
- 관리자 비밀번호로 관리자 인증 및 전체 카드 수정/삭제가 되는지 확인
- 새 카드 등록, 이미지 URL 등록, 수정, 삭제, 검색, 태그 필터 테스트
- `.migration-output`의 실패 목록이 비어 있는지 확인

## 6. 운영 사이트 전환

검증을 마친 다음에만 이 브랜치의 변경을 검토해 `main`에 반영합니다. 운영 사이트에 반영된 후에도 일정 기간 Supabase 원본을 보존하고 롤백 가능성을 확인합니다.

**Supabase의 테이블, Storage bucket, 프로젝트는 지금 삭제하지 않습니다.** 카드 수·이미지·비밀번호 검증과 사이트 기능이 모두 확인된 후 별도로 종료를 결정합니다.
