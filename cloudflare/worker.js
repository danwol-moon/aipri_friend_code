const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, X-Upload-Secret",
};

function json(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json; charset=utf-8" },
  });
}
function safeKey(raw) {
  const key = raw.split("/").map(part => decodeURIComponent(part)).join("/");
  if (!key || key.length > 500 || key.split("/").some(part => !part || part === "." || part === "..") ||
      !/^[0-9a-f-]{36}\/(front|back)-[0-9a-f-]{36}\.(jpg|png|webp|gif)$/i.test(key)) {
    throw new Error("Invalid image key");
  }
  return key;
}
function hex(bytes) {
  return Array.from(bytes, b => b.toString(16).padStart(2, "0")).join("");
}
async function sha256(value) {
  return hex(new Uint8Array(await crypto.subtle.digest("SHA-256", value)));
}
async function hmac(key, value) {
  const imported = await crypto.subtle.importKey("raw", key, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", imported, new TextEncoder().encode(value)));
}
function encodePath(key) {
  return key.split("/").map(encodeURIComponent).join("/");
}
async function signAndUpload(request, env, key) {
  const body = await request.arrayBuffer();
  if (!body.byteLength || body.byteLength > 5 * 1024 * 1024) return json(413, { error: "Image must be 5MB or smaller." });
  const contentType = (request.headers.get("Content-Type") || "").split(";")[0].trim().toLowerCase();
  if (!["image/jpeg", "image/png", "image/webp", "image/gif"].includes(contentType)) {
    return json(415, { error: "Unsupported image type." });
  }

  const host = env.B2_ENDPOINT.replace(/^https?:\/\//, "").replace(/\/$/, "");
  const bucket = env.B2_BUCKET_NAME;
  const region = env.B2_REGION;
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
  const dateStamp = amzDate.slice(0, 8);
  const canonicalUri = "/" + bucket + "/" + encodePath(key);
  const payloadHash = await sha256(body);
  const canonicalHeaders =
    "content-type:" + contentType + "\n" +
    "host:" + host + "\n" +
    "x-amz-content-sha256:" + payloadHash + "\n" +
    "x-amz-date:" + amzDate + "\n";
  const signedHeaders = "content-type;host;x-amz-content-sha256;x-amz-date";
  const canonicalRequest = ["PUT", canonicalUri, "", canonicalHeaders, signedHeaders, payloadHash].join("\n");
  const scope = dateStamp + "/" + region + "/s3/aws4_request";
  const stringToSign = ["AWS4-HMAC-SHA256", amzDate, scope, await sha256(new TextEncoder().encode(canonicalRequest))].join("\n");

  const secret = new TextEncoder().encode("AWS4" + env.B2_APPLICATION_KEY);
  const kDate = await hmac(secret, dateStamp);
  const kRegion = await hmac(kDate, region);
  const kService = await hmac(kRegion, "s3");
  const kSigning = await hmac(kService, "aws4_request");
  const signature = hex(await hmac(kSigning, stringToSign));
  const authorization = "AWS4-HMAC-SHA256 Credential=" + env.B2_KEY_ID + "/" + scope +
    ", SignedHeaders=" + signedHeaders + ", Signature=" + signature;

  const upstream = await fetch("https://" + host + canonicalUri, {
    method: "PUT",
    headers: {
      "Authorization": authorization,
      "Content-Type": contentType,
      "x-amz-content-sha256": payloadHash,
      "x-amz-date": amzDate,
    },
    body,
  });
  if (!upstream.ok) {
    const detail = await upstream.text();
    console.error("B2 upload failed", upstream.status, detail.slice(0, 500));
    return json(502, { error: "Backblaze upload failed.", status: upstream.status });
  }
  const publicUrl = "https://" + host + "/" + encodeURIComponent(bucket) + "/" + encodePath(key);
  return json(201, { ok: true, key, url: new URL("/images/" + encodePath(key), request.url).toString(), publicUrl });
}
async function signAndDelete(env, key) {
  const host = env.B2_ENDPOINT.replace(/^https?:\/\//, "").replace(/\/$/, "");
  const region = env.B2_REGION;
  const bucket = env.B2_BUCKET_NAME;
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
  const dateStamp = amzDate.slice(0, 8);
  const canonicalUri = "/" + bucket + "/" + encodePath(key);
  const payloadHash = await sha256(new Uint8Array());
  const canonicalHeaders =
    "host:" + host + "\n" +
    "x-amz-content-sha256:" + payloadHash + "\n" +
    "x-amz-date:" + amzDate + "\n";
  const signedHeaders = "host;x-amz-content-sha256;x-amz-date";
  const canonicalRequest = ["DELETE", canonicalUri, "", canonicalHeaders, signedHeaders, payloadHash].join("\n");
  const scope = dateStamp + "/" + region + "/s3/aws4_request";
  const stringToSign = ["AWS4-HMAC-SHA256", amzDate, scope, await sha256(new TextEncoder().encode(canonicalRequest))].join("\n");
  const secret = new TextEncoder().encode("AWS4" + env.B2_APPLICATION_KEY);
  const kDate = await hmac(secret, dateStamp);
  const kRegion = await hmac(kDate, region);
  const kService = await hmac(kRegion, "s3");
  const kSigning = await hmac(kService, "aws4_request");
  const signature = hex(await hmac(kSigning, stringToSign));
  const authorization = "AWS4-HMAC-SHA256 Credential=" + env.B2_KEY_ID + "/" + scope +
    ", SignedHeaders=" + signedHeaders + ", Signature=" + signature;
  const upstream = await fetch("https://" + host + canonicalUri, {
    method: "DELETE",
    headers: { Authorization: authorization, "x-amz-content-sha256": payloadHash, "x-amz-date": amzDate },
  });
  if (!upstream.ok && upstream.status !== 404) {
    const detail = await upstream.text();
    console.error("B2 delete failed", upstream.status, detail.slice(0, 500));
    return false;
  }
  return true;
}



const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const ALLOWED_TAGS = new Set(["프리마지", "히미프리", "오네프리", "밀피", "구미", "스페셜"]);
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
const ITERATIONS = 310000;

function field(form, name, max = 200) {
  return String(form.get(name) ?? "").trim().slice(0, max);
}
function constantTimeEqual(a, b) {
  const aa = new TextEncoder().encode(String(a));
  const bb = new TextEncoder().encode(String(b));
  if (aa.length !== bb.length) return false;
  let diff = 0;
  for (let i = 0; i < aa.length; i++) diff |= aa[i] ^ bb[i];
  return diff === 0;
}
function fromHex(value) {
  if (!/^(?:[0-9a-f]{2})+$/i.test(value)) return new Uint8Array();
  return new Uint8Array(value.match(/.{2}/g).map(v => parseInt(v, 16)));
}
async function passwordHash(password, saltHex) {
  const salt = saltHex ? fromHex(saltHex) : crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", salt, iterations: ITERATIONS, hash: "SHA-256" }, key, 256);
  return { salt: hex(salt), hash: hex(new Uint8Array(bits)) };
}
async function checkCardPassword(env, id, password) {
  const row = await env.DB.prepare("SELECT password_salt,password_hash FROM coord_credentials WHERE coord_id=?").bind(id).first();
  if (!row) return false;
  const candidate = await passwordHash(password, row.password_salt);
  return constantTimeEqual(candidate.hash, row.password_hash);
}
function adminAllowed(env, form) {
  const configured = env.FRIENDS_CARD_ADMIN_PASSWORD || "";
  const supplied = String(form.get("admin_password") || "");
  return configured.length >= 8 && supplied.length > 0 && constantTimeEqual(configured, supplied);
}
function validRemoteImageUrl(value) {
  try {
    const u = new URL(value);
    if (!["https:", "http:"].includes(u.protocol) || !u.hostname || u.username || u.password) return false;
    const host = u.hostname.toLowerCase();
    if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") ||
        host === "0.0.0.0" || host === "::1" || /^127\./.test(host) ||
        /^10\./.test(host) || /^192\.168\./.test(host) ||
        /^169\.254\./.test(host) || /^172\.(1[6-9]|2\d|3[01])\./.test(host)) return false;
    return true;
  } catch { return false; }
}
async function fetchRemoteImage(value) {
  if (!validRemoteImageUrl(value)) throw new Error("이미지 URL이 올바르지 않거나 허용되지 않는 주소입니다.");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch(value, {
      redirect: "manual", signal: controller.signal,
      headers: { Accept: "image/avif,image/webp,image/png,image/jpeg,image/gif,*/*;q=0.8" }
    });
    if (response.status >= 300 && response.status < 400) throw new Error("다른 주소로 이동하는 이미지 URL은 사용할 수 없습니다. 최종 이미지 주소를 입력해 주세요.");
    if (!response.ok) throw new Error("이미지 주소에서 파일을 가져오지 못했습니다.");
    const type = (response.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
    const size = Number(response.headers.get("content-length") || 0);
    if (!ALLOWED_TYPES.has(type)) throw new Error("JPG, PNG, WEBP, GIF 이미지 주소만 사용할 수 있습니다.");
    if (size > MAX_IMAGE_BYTES) throw new Error("URL 이미지도 5MB 이하만 등록할 수 있습니다.");
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (!bytes.length || bytes.length > MAX_IMAGE_BYTES) throw new Error("URL 이미지도 5MB 이하만 등록할 수 있습니다.");
    return { bytes, type };
  } catch (error) {
    if (error?.name === "AbortError") throw new Error("이미지 주소 접속 시간이 초과되었습니다.");
    throw error;
  } finally { clearTimeout(timer); }
}
async function storeImage(env, requestUrl, id, role, file, remoteUrl) {
  let bytes, type;
  if (file instanceof File && file.size) {
    bytes = new Uint8Array(await file.arrayBuffer());
    type = file.type;
  } else if (remoteUrl) {
    ({ bytes, type } = await fetchRemoteImage(remoteUrl));
  } else return "";
  if (!ALLOWED_TYPES.has(type) || !bytes.length || bytes.length > MAX_IMAGE_BYTES) {
    throw new Error("이미지는 JPG, PNG, WEBP, GIF 형식으로 각각 5MB 이하만 가능합니다.");
  }
  const ext = ({ "image/jpeg":"jpg", "image/png":"png", "image/webp":"webp", "image/gif":"gif" })[type];
  const key = id + "/" + role + "-" + crypto.randomUUID() + "." + ext;
  const uploadRequest = new Request("https://internal.invalid/upload/" + key, {
    method: "PUT", headers: { "Content-Type": type }, body: bytes
  });
  const uploaded = await signAndUpload(uploadRequest, env, key);
  const result = await uploaded.json();
  if (!uploaded.ok || !result.url) throw new Error("Backblaze 이미지 업로드에 실패했습니다.");
  return new URL("/images/" + encodePath(key), requestUrl).toString();
}
function b2KeyFromUrl(value, requestUrl) {
  try {
    const u = new URL(value);
    const base = new URL(requestUrl);
    if (u.origin !== base.origin || !u.pathname.startsWith("/images/")) return null;
    return safeKey(u.pathname.slice("/images/".length));
  } catch { return null; }
}
async function cleanupImage(env, value, requestUrl) {
  const key = b2KeyFromUrl(value, requestUrl);
  if (!key) return;
  const ok = await signAndDelete(env, key);
  if (!ok) console.error("B2 cleanup failed for", key);
  else await caches.default.delete(new Request(new URL("/images/" + encodePath(key), requestUrl)));
}
async function cardsApi(request, env) {
  if (!env.DB) return json(500, { error: "Cloudflare D1 데이터베이스 바인딩(DB)이 필요합니다." });
  if (request.method === "GET") {
    const { results = [] } = await env.DB.prepare("SELECT * FROM friends_card ORDER BY created_at DESC").all();
    return json(200, results);
  }
  if (request.method !== "POST") return json(405, { error: "지원하지 않는 요청입니다." });
  const form = await request.formData();
  const action = field(form, "action", 20);
  const id = field(form, "id", 60);
  const password = String(form.get("password") || "");
  const isAdmin = adminAllowed(env, form);

  if (action === "admin-auth") {
    return isAdmin ? json(200, { ok: true }) : json(403, { error: "관리자 비밀번호가 올바르지 않습니다." });
  }
  if (action === "create") {
    const name_ko = field(form, "name_ko", 100), name_ja = field(form, "name_ja", 100);
    const tags = field(form, "tag", 200).split(",").map(v => v.trim()).filter(Boolean);
    if (!name_ko && !name_ja) return json(400, { error: "한국어 또는 일본어 코디 이름을 입력해 주세요." });
    if (!tags.length || tags.some(v => !ALLOWED_TAGS.has(v))) return json(400, { error: "태그를 하나 이상 올바르게 선택해 주세요." });
    if (password.length < 4 || password.length > 200) return json(400, { error: "비밀번호는 4~200자로 입력해 주세요." });
    const frontFile = form.get("front"), backFile = form.get("back");
    const frontUrl = field(form, "front_url", 2000), backUrl = field(form, "back_url", 2000);
    if (!(frontFile instanceof File && frontFile.size) && !frontUrl) return json(400, { error: "프렌즈카드 이미지는 필수입니다." });
    const newId = crypto.randomUUID();
    const uploaded = [];
    try {
      let front = await storeImage(env, request.url, newId, "front", frontFile, frontUrl);
      if (front) uploaded.push(front);
      let back = await storeImage(env, request.url, newId, "back", backFile, backUrl);
      if (back) uploaded.push(back);
      if (!front) front = back;
      if (!back) back = front;
      if (!front) throw new Error("프렌즈카드 이미지를 저장하지 못했습니다.");
      const credential = await passwordHash(password);
      const batch = await env.DB.batch([
        env.DB.prepare("INSERT INTO friends_card (id,name_ko,name_ja,tag,front_image_path,back_image_path,x_id,display_name,my_character,character_owner) VALUES (?,?,?,?,?,?,?,?,?,?)")
          .bind(newId,name_ko,name_ja,tags.join(","),front,back,field(form,"x_id",80),field(form,"display_name",80),field(form,"my_character",80),field(form,"character_owner",100)),
        env.DB.prepare("INSERT INTO coord_credentials (coord_id,password_salt,password_hash) VALUES (?,?,?)")
          .bind(newId,credential.salt,credential.hash)
      ]);
      return json(201, { ok:true, id:newId, message:"프렌즈카드가 등록되었습니다." });
    } catch (error) {
      for (const path of uploaded) await cleanupImage(env,path,request.url);
      console.error("D1 card create failed", error);
      return json(500, { error:error instanceof Error ? error.message : "프렌즈카드 등록에 실패했습니다." });
    }
  }
  if (action !== "update" && action !== "delete") return json(400, { error:"지원하지 않는 작업입니다." });
  if (!/^[0-9a-f-]{36}$/i.test(id)) return json(400, { error:"코디 ID가 올바르지 않습니다." });
  if (!isAdmin && (password.length < 4 || password.length > 200)) return json(400, { error:"등록 비밀번호를 4자 이상 입력해 주세요." });
  if (!isAdmin && !(await checkCardPassword(env,id,password))) return json(403, { error:"비밀번호가 일치하지 않습니다." });
  const current = await env.DB.prepare("SELECT * FROM friends_card WHERE id=?").bind(id).first();
  if (!current) return json(404, { error:"프렌즈카드를 찾을 수 없습니다." });
  if (action === "delete") {
    await env.DB.batch([
      env.DB.prepare("DELETE FROM coord_credentials WHERE coord_id=?").bind(id),
      env.DB.prepare("DELETE FROM friends_card WHERE id=?").bind(id)
    ]);
    await cleanupImage(env,current.front_image_path,request.url);
    if (current.back_image_path !== current.front_image_path) await cleanupImage(env,current.back_image_path,request.url);
    return json(200,{ok:true,message:"프렌즈카드가 삭제되었습니다."});
  }
  const name_ko=field(form,"name_ko",100), name_ja=field(form,"name_ja",100);
  const tags=field(form,"tag",200).split(",").map(v=>v.trim()).filter(Boolean);
  if (!name_ko && !name_ja) return json(400,{error:"한국어 또는 일본어 코디 이름을 입력해 주세요."});
  if (!tags.length || tags.some(v=>!ALLOWED_TAGS.has(v))) return json(400,{error:"태그를 하나 이상 올바르게 선택해 주세요."});
  let front=current.front_image_path, back=current.back_image_path;
  const uploaded=[];
  try {
    const frontNew=await storeImage(env,request.url,id,"front",form.get("front"),field(form,"front_url",2000));
    const backNew=await storeImage(env,request.url,id,"back",form.get("back"),field(form,"back_url",2000));
    if (frontNew) { front=frontNew; uploaded.push(frontNew); }
    if (backNew) { back=backNew; uploaded.push(backNew); }
    else if (frontNew && current.back_image_path === current.front_image_path) back = frontNew;
    await env.DB.prepare("UPDATE friends_card SET name_ko=?,name_ja=?,tag=?,front_image_path=?,back_image_path=?,x_id=?,display_name=?,my_character=?,character_owner=?,updated_at=? WHERE id=?")
      .bind(name_ko,name_ja,tags.join(","),front,back,field(form,"x_id",80),field(form,"display_name",80),field(form,"my_character",80),field(form,"character_owner",100),new Date().toISOString(),id).run();
  } catch(error) {
    for (const path of uploaded) await cleanupImage(env,path,request.url);
    return json(500,{error:error instanceof Error?error.message:"프렌즈카드 수정에 실패했습니다."});
  }
  if (front !== current.front_image_path) await cleanupImage(env,current.front_image_path,request.url);
  if (back !== current.back_image_path && current.back_image_path !== current.front_image_path) await cleanupImage(env,current.back_image_path,request.url);
  return json(200,{ok:true,id,message:"프렌즈카드가 수정되었습니다."});
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (request.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
    if (url.pathname === "/api/cards") {
      try { return await cardsApi(request, env); }
      catch (error) {
        console.error("Cards API error", error);
        return json(500, { error: error instanceof Error ? error.message : "서버 오류가 발생했습니다." });
      }
    }
    if (url.pathname === "/health" && request.method === "GET") {
      return json(200, {
        ok: true,
        service: "aipri-friend-image-worker",
        b2Configured: Boolean(env.B2_KEY_ID && env.B2_APPLICATION_KEY && env.B2_BUCKET_NAME &&
          env.B2_ENDPOINT && env.B2_REGION && env.UPLOAD_SECRET),
        d1Bound: Boolean(env.DB),
        adminConfigured: Boolean(env.FRIENDS_CARD_ADMIN_PASSWORD && env.FRIENDS_CARD_ADMIN_PASSWORD.length >= 8),
      });
    }
    if (url.pathname.startsWith("/images/") && request.method === "GET") {
      let key;
      try { key = safeKey(url.pathname.slice("/images/".length)); }
      catch { return json(400, { error: "Invalid image key." }); }
      const publicUrl = "https://" + env.B2_ENDPOINT.replace(/^https?:\/\//, "").replace(/\/$/, "") + "/" + encodeURIComponent(env.B2_BUCKET_NAME) + "/" + encodePath(key);
      const cached = await caches.default.match(request);
      if (cached) return cached;
      const upstream = await fetch(publicUrl, { cf: { cacheEverything: true, cacheTtl: 31536000 } });
      if (!upstream.ok) return new Response("Image not found", { status: upstream.status });
      const headers = new Headers(upstream.headers);
      headers.set("Cache-Control", "public, max-age=31536000, immutable");
      headers.set("Access-Control-Allow-Origin", "*");
      const response = new Response(upstream.body, { status: 200, headers });
      ctx.waitUntil(caches.default.put(request, response.clone()));
      return response;
    }
    if (request.method !== "PUT" && request.method !== "DELETE") return json(404, { error: "Not found." });
    if (!env.UPLOAD_SECRET || request.headers.get("X-Upload-Secret") !== env.UPLOAD_SECRET) {
      return json(401, { error: "Unauthorized." });
    }
    let key;
    const prefix = request.method === "PUT" ? "/upload/" : "/delete/";
    if (!url.pathname.startsWith(prefix)) return json(404, { error: "Not found." });
    try { key = safeKey(url.pathname.slice(prefix.length)); }
    catch { return json(400, { error: "Invalid image key." }); }

    if (request.method === "PUT") {
      if (!env.B2_KEY_ID || !env.B2_APPLICATION_KEY || !env.B2_BUCKET_NAME || !env.B2_ENDPOINT || !env.B2_REGION) {
        return json(500, { error: "B2 Worker configuration is incomplete." });
      }
      return signAndUpload(request, env, key);
    }
    const ok = await signAndDelete(env, key);
    if (!ok) return json(502, { error: "Backblaze delete failed." });
    await caches.default.delete(new Request(new URL("/images/" + encodePath(key), url.origin)));
    return json(200, { ok: true });
  },
};
