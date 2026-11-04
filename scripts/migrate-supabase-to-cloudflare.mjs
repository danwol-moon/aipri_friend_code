#!/usr/bin/env node
/**
 * One-way, non-destructive migration from Supabase to Backblaze B2 + Cloudflare D1.
 *
 * Required environment variables:
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   B2_WORKER_URL
 *   UPLOAD_SECRET
 *
 * Run only after applying cloudflare/migrations/0001_initial.sql:
 *   node scripts/migrate-supabase-to-cloudflare.mjs
 *
 * This script never deletes Supabase records or objects.
 */
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import path from "node:path";

const supabaseUrl = (process.env.SUPABASE_URL || "").replace(/\/$/, "");
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const workerUrl = (process.env.B2_WORKER_URL || "").replace(/\/$/, "");
const uploadSecret = process.env.UPLOAD_SECRET || "";
const bucket = "coord-images";
const maxFileBytes = 5 * 1024 * 1024;
const allowedTypes = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
const outputDir = path.resolve(".migration-output");

if (!supabaseUrl.startsWith("https://") || !serviceKey || !workerUrl.startsWith("https://") || !uploadSecret) {
  console.error("필수 환경변수가 없습니다. SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, B2_WORKER_URL, UPLOAD_SECRET을 설정하세요.");
  process.exit(1);
}

const authHeaders = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` };
function sql(value) {
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "NULL";
  if (typeof value === "boolean") return value ? "1" : "0";
  return "'" + String(value).replace(/'/g, "''") + "'";
}
function stableUuid(value) {
  const h = createHash("sha256").update(value).digest("hex").slice(0, 32);
  return h.slice(0,8)+"-"+h.slice(8,12)+"-5"+h.slice(13,16)+"-a"+h.slice(17,20)+"-"+h.slice(20,32);
}
function storagePath(value) {
  if (!value) return "";
  let raw = String(value);
  const marker = `/storage/v1/object/public/${bucket}/`;
  const authMarker = `/storage/v1/object/authenticated/${bucket}/`;
  if (raw.includes(marker)) raw = raw.slice(raw.indexOf(marker) + marker.length);
  else if (raw.includes(authMarker)) raw = raw.slice(raw.indexOf(authMarker) + authMarker.length);
  else if (/^https?:\/\//i.test(raw)) return "";
  return raw.split("/").map(part => decodeURIComponent(part)).join("/");
}
async function supabaseJson(url, options = {}) {
  const response = await fetch(url, { ...options, headers: { ...authHeaders, ...(options.headers || {}) } });
  if (!response.ok) throw new Error(`Supabase 요청 실패: HTTP ${response.status} (${new URL(url).pathname})`);
  return response.json();
}
async function listAllObjects(prefix = "") {
  const files = [];
  const folders = [];
  for (let offset = 0; ; offset += 100) {
    const page = await supabaseJson(`${supabaseUrl}/storage/v1/object/list/${bucket}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prefix, limit: 100, offset, sortBy: { column: "name", order: "asc" } })
    });
    for (const item of page) {
      if (!item?.name) continue;
      const full = prefix ? `${prefix}/${item.name}` : item.name;
      if (!item.id && !item.metadata) folders.push(full);
      else files.push(full);
    }
    if (page.length < 100) break;
  }
  for (const folder of folders) files.push(...await listAllObjects(folder));
  return files;
}
async function downloadObject(objectPath) {
  const url = `${supabaseUrl}/storage/v1/object/authenticated/${bucket}/${objectPath.split("/").map(encodeURIComponent).join("/")}`;
  const response = await fetch(url, { headers: authHeaders });
  if (!response.ok) throw new Error(`이미지 다운로드 실패: ${objectPath} (HTTP ${response.status})`);
  const type = (response.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
  if (!allowedTypes.has(type)) throw new Error(`지원하지 않는 이미지 형식: ${objectPath} (${type})`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (!bytes.length || bytes.length > maxFileBytes) throw new Error(`이미지 크기가 5MB 제한을 초과했습니다: ${objectPath}`);
  return { bytes, type };
}
async function uploadObject(objectPath) {
  const { bytes, type } = await downloadObject(objectPath);
  const ext = ({ "image/jpeg":"jpg", "image/png":"png", "image/webp":"webp", "image/gif":"gif" })[type];
  const uuid = stableUuid(objectPath);
  const key = `${uuid}/front-${uuid}.${ext}`;
  const response = await fetch(`${workerUrl}/upload/${key}`, {
    method: "PUT",
    headers: { "X-Upload-Secret": uploadSecret, "Content-Type": type },
    body: bytes
  });
  if (!response.ok) throw new Error(`B2 업로드 실패: ${objectPath} (HTTP ${response.status})`);
  return { url: `${workerUrl}/images/${key}`, bytes: bytes.length };
}
async function getRows(table) {
  return supabaseJson(`${supabaseUrl}/rest/v1/${table}?select=*&limit=10000`);
}
function imageDestination(oldValue, map) {
  if (!oldValue) return "";
  if (/^https?:\/\//i.test(String(oldValue))) {
    if (String(oldValue).startsWith(workerUrl + "/images/")) return oldValue;
    const p = storagePath(oldValue);
    return p && map.has(p) ? map.get(p).url : oldValue;
  }
  const p = storagePath(oldValue);
  return p && map.has(p) ? map.get(p).url : oldValue;
}

await mkdir(outputDir, { recursive: true });
console.log("1/4 Supabase 카드 및 비밀번호 데이터를 읽습니다.");
const [cards, credentials] = await Promise.all([getRows("friends_card"), getRows("coord_credentials")]);
console.log(`카드 ${cards.length}개, 비밀번호 레코드 ${credentials.length}개 확인`);

await writeFile(path.join(outputDir, "source-backup.json"), JSON.stringify({ cards, credentials }, null, 2));
console.log("2/4 Storage 전체 객체를 조사하고 B2로 복사합니다.");
const objects = await listAllObjects("");
const imageMap = new Map();
const failures = [];
for (let i = 0; i < objects.length; i++) {
  const objectPath = objects[i];
  try {
    imageMap.set(objectPath, await uploadObject(objectPath));
    if ((i + 1) % 10 === 0 || i + 1 === objects.length) console.log(`이미지 ${i + 1}/${objects.length}개 처리`);
  } catch (error) {
    failures.push({ path: objectPath, error: error.message });
    console.error("이미지 이전 실패:", objectPath, error.message);
  }
}
await writeFile(path.join(outputDir, "image-map.json"), JSON.stringify(Object.fromEntries(imageMap), null, 2));
await writeFile(path.join(outputDir, "migration-failures.json"), JSON.stringify(failures, null, 2));

console.log("3/4 D1 입력 SQL을 생성합니다.");
const cardRows = cards.map(row => {
  const front = imageDestination(row.front_image_path, imageMap);
  const back = imageDestination(row.back_image_path, imageMap);
  return `INSERT INTO friends_card (id,name_ko,name_ja,tag,front_image_path,back_image_path,x_id,display_name,my_character,character_owner,created_at,updated_at) VALUES (${[
    row.id,row.name_ko || "",row.name_ja || "",row.tag || "",front,back,row.x_id || "",row.display_name || "",
    row.my_character || "",row.character_owner || "",row.created_at || new Date().toISOString(),row.updated_at || null
  ].map(sql).join(",")}) ON CONFLICT(id) DO UPDATE SET name_ko=excluded.name_ko,name_ja=excluded.name_ja,tag=excluded.tag,front_image_path=excluded.front_image_path,back_image_path=excluded.back_image_path,x_id=excluded.x_id,display_name=excluded.display_name,my_character=excluded.my_character,character_owner=excluded.character_owner,created_at=excluded.created_at,updated_at=excluded.updated_at;`;
});
const credentialRows = credentials.map(row =>
  `INSERT INTO coord_credentials (coord_id,password_salt,password_hash) VALUES (${[row.coord_id,row.password_salt,row.password_hash].map(sql).join(",")}) ON CONFLICT(coord_id) DO UPDATE SET password_salt=excluded.password_salt,password_hash=excluded.password_hash;`
);
const statements = [...cardRows, ...credentialRows];
for (let i = 0; i < statements.length; i += 40) {
  const file = path.join(outputDir, `d1-batch-${String(Math.floor(i / 40) + 1).padStart(4,"0")}.sql`);
  await writeFile(file, "PRAGMA foreign_keys=ON;\n" + statements.slice(i, i + 40).join("\n") + "\n");
}
await writeFile(path.join(outputDir, "source-counts.json"), JSON.stringify({
  cards: cards.length, credentials: credentials.length, storageObjects: objects.length,
  copiedImages: imageMap.size, failedImages: failures.length
}, null, 2));

if (failures.length) {
  console.error(`이미지 ${failures.length}개가 실패했습니다. 누락된 이미지를 해결하기 전에는 D1 데이터 이전을 진행하지 않습니다.`);
  process.exit(2);
}
console.log("4/4 D1에 데이터를 입력합니다.");
const batches = Math.ceil(statements.length / 40);
for (let i = 1; i <= batches; i++) {
  const file = path.join(outputDir, `d1-batch-${String(i).padStart(4,"0")}.sql`);
  execFileSync(process.platform === "win32" ? "npx.cmd" : "npx", [
    "wrangler", "d1", "execute", "friends-card-db", "--remote", `--file=${file}`
  ], { stdio: "inherit" });
}
console.log("이전 데이터 입력이 끝났습니다. Supabase 원본은 삭제하지 않았습니다.");
console.log(`결과 파일: ${outputDir}`);
console.log("Cloudflare Worker의 GET /api/cards에서 카드 수를 확인하고 이미지 및 비밀번호 테스트를 진행하세요.");
