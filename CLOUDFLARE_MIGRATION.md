# Supabase에서 Cloudflare + Backblaze로 완전 이전

## 목표 구성

- Cloudflare Pages: 정적 프론트엔드
- Cloudflare Workers: 사이트 API, 인증, 이미지 업로드/삭제 및 이전 도구
- Cloudflare D1: `friends_card`, `coord_credentials` 데이터
- Backblaze B2: 이미지 파일 원본 저장소

Supabase는 이전 완료 및 검증 전까지 원본으로 보존합니다. 이 문서의 준비 단계만으로 Supabase 데이터나 파일은 삭제되지 않습니다.

## 현재 상태

- 기존 Supabase Edge Function을 호출하는 사이트 코드가 남아 있습니다.
- 기존 카드 테이블은 `friends_card`, 비밀번호 테이블은 `coord_credentials`입니다.
- 기존 Storage bucket은 `coord-images`입니다.
- 기존 이미지 경로는 Supabase Storage 경로일 수 있고, Backblaze Worker URL일 수도 있으므로 둘 다 구분해 처리해야 합니다.
- D1 스키마 초안은 `cloudflare/migrations/0001_initial.sql`에 있습니다.
- 이미지 일괄 복사, 카드/비밀번호 데이터 복사, API 전환은 아직 실행되지 않았습니다.

## 1. D1 데이터베이스 준비

Cloudflare Dashboard → Storage & databases → D1 SQL Database에서 데이터베이스를 만듭니다.

권장 이름: `friends-card-db`

그다음 저장소 루트에서 다음 명령을 실행합니다.

```bash
npx wrangler d1 execute friends-card-db --remote --file=cloudflare/migrations/0001_initial.sql
```

스키마는 기존 카드의 UUID, 이름, 태그, 이미지 경로, X 정보, 마이캐릭터, 기타 정보, 생성/수정 시각과 비밀번호 salt/hash를 보존하도록 설계했습니다.

## 2. 이전 순서

1. Supabase에서 카드 데이터와 비밀번호 해시/솔트를 읽어 안전한 로컬 백업을 만듭니다.
2. `coord-images` Storage의 전체 파일 목록을 재귀적으로 수집합니다.
3. 모든 파일을 Backblaze B2에 복사하고 파일별 성공/실패 및 크기를 기록합니다.
4. 기존 카드의 `front_image_path`와 `back_image_path`를 새 Worker 이미지 URL로 변환합니다.
5. 카드 행과 `coord_credentials` 행을 D1에 넣습니다.
6. 파일 수, 카드 수, 비밀번호 레코드 수, 누락 파일, 이미지 HTTP 응답을 대조합니다.
7. 사이트 API를 Cloudflare Worker + D1로 전환합니다.
8. 등록/수정/삭제/관리자 로그인/검색/이미지 표시를 검증합니다.

## 3. 보안 및 데이터 보존 규칙

- Supabase service-role key, Backblaze application key, Worker upload secret은 브라우저 코드나 Git 저장소에 넣지 않습니다.
- 비밀값을 채팅으로 보내지 않습니다. 이전 도구는 사용자의 로컬 환경에서 환경변수 또는 비밀 입력으로 사용하도록 구성합니다.
- 기존 Supabase Storage bucket과 데이터 테이블은 검증 완료 전 삭제하지 않습니다.
- 이미지 파일은 D1 BLOB으로 넣지 않습니다. Backblaze B2에 저장하고 D1에는 주소/키만 저장합니다.
- 이전은 재실행해도 중복 생성이나 기존 파일 덮어쓰기가 발생하지 않도록 멱등성을 갖춰야 합니다.
- 이전 후에도 기존 카드 UUID와 비밀번호 해시/솔트를 그대로 유지해야 기존 등록자의 수정/삭제 비밀번호가 계속 작동합니다.

## 4. 완료 조건

아래 조건을 모두 충족하기 전에는 Supabase를 종료하지 않습니다.

- 모든 Storage 객체가 B2에 존재하고 크기/형식 검증을 통과함
- 모든 카드 행과 자격 증명 행이 D1에 존재함
- 모든 카드 이미지 URL이 새 Worker 경로에서 정상 응답함
- 검색, 필터, 등록, 수정, 삭제, 관리자 기능 테스트 통과
- 별도 백업이 확보됨
- 이전 실패 항목이 0개이거나 명시적으로 해결됨
