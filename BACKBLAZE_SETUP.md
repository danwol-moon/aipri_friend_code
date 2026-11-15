# Backblaze B2 이미지 저장소 전환

이 변경은 Supabase 데이터베이스를 유지하면서 새 이미지 업로드·조회·삭제를 Backblaze B2로 보내는 단계적 전환입니다. 기존 Supabase Storage 경로를 가진 카드는 계속 Supabase에서 이미지를 읽고, 수정·삭제 시에도 기존 파일 정리를 유지합니다.

## 구성

- Cloudflare Worker 소스: `cloudflare/worker.js`
- Supabase Edge Function: `supabase/functions/coord-manage/index.ts`
- 브라우저 코드에는 B2 키나 업로드 Secret을 넣지 않습니다.
- 새 카드 이미지 URL은 Cloudflare Worker의 `/images/<key>` 주소로 DB에 저장됩니다.

## 1. Backblaze 버킷

버킷 이름과 리전은 이미 생성한 값과 일치해야 합니다.

- Bucket: `aipri-friend-code-images`
- S3 endpoint: `s3.us-east-005.backblazeb2.com`
- Region: `us-east-005`

Worker의 이미지 조회 경로는 공개 파일 URL을 프록시하므로 버킷은 **Public**이어야 합니다. 공개 버킷은 파일을 누구나 읽을 수 있다는 뜻이며, 업로드와 삭제는 Worker의 Secret 인증을 통과해야 합니다. 기존 Supabase Storage 버킷은 테스트와 롤백을 위해 당분간 삭제하지 마세요.

## 2. Cloudflare Worker 코드 배포

1. Cloudflare Dashboard → **Workers & Pages** → `aipri-friend-image-worker`를 엽니다.
2. **Edit code**를 선택합니다.
3. 저장소의 `cloudflare/worker.js` 전체 내용을 편집기에 붙여넣습니다.
4. **Deploy**를 눌러 배포합니다.
5. Worker의 기본 주소(예: `https://이름.계정.workers.dev`)를 복사해 둡니다.

Worker의 **Settings → Variables and Secrets**에서 아래 항목을 확인합니다.

| 이름 | 유형 | 값 |
|---|---|---|
| `B2_KEY_ID` | Secret | Backblaze Application Key ID |
| `B2_APPLICATION_KEY` | Secret | Backblaze Application Key |
| `B2_BUCKET_NAME` | Text | `aipri-friend-code-images` |
| `B2_ENDPOINT` | Text | `s3.us-east-005.backblazeb2.com` |
| `B2_REGION` | Text | `us-east-005` |
| `UPLOAD_SECRET` | Secret | 사용자가 만든 강력한 임의 문자열 |

Secret 값은 저장소나 브라우저 코드에 넣지 마세요.

## 3. Supabase Edge Function Secrets

Supabase Dashboard → **Edge Functions → Secrets**에 다음 두 값을 등록합니다.

- `B2_WORKER_URL`: 2단계에서 복사한 Worker 기본 주소(끝의 / 없이)
- `UPLOAD_SECRET`: Cloudflare Worker에 등록한 `UPLOAD_SECRET`과 **완전히 같은 값**

Secret 값은 채팅으로 보내지 말고, 사용자가 두 대시보드에 직접 복사해 입력합니다.

## 4. 배포

이 변경은 GitHub의 별도 브랜치에서 검토한 뒤 `main`에 반영해야 운영 사이트에 적용됩니다. `main` 반영 후 GitHub Actions의 **Deploy Supabase Edge Function** 워크플로를 실행해 `coord-manage`를 재배포합니다. GitHub Pages는 `main` 변경 시 자동 배포됩니다.

## 5. 테스트와 기존 파일 보존

1. 테스트 카드 1개를 새 이미지 파일로 등록합니다.
2. 새 카드 이미지가 갤러리와 상세 화면에서 보이는지 확인합니다.
3. 테스트 카드 수정 후 이미지가 유지되는지 확인합니다.
4. 테스트 카드 삭제 후 이미지도 삭제되는지 확인합니다.
5. 기존에 등록된 카드의 이미지가 계속 보이는지 확인합니다.

**기존 Supabase Storage의 `coord-images` 버킷은 이 확인이 끝날 때까지 삭제하지 마세요.** 이 코드 변경만으로 과거 이미지가 자동 복사되지는 않습니다. 기존 이미지의 일괄 이전은 별도의 복사 및 DB 경로 갱신 절차로 진행해야 합니다.
