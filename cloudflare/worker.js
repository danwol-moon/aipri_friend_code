const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, PUT, DELETE, OPTIONS",
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
  const publicUrl = "https://f005.backblazeb2.com/file/" + encodeURIComponent(bucket) + "/" + encodePath(key);
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
    "x-amz-date:" + amzDate;
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

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (request.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
    if (url.pathname === "/health" && request.method === "GET") {
      return json(200, {
        ok: true,
        service: "aipri-friend-image-worker",
        configured: Boolean(env.B2_KEY_ID && env.B2_APPLICATION_KEY && env.B2_BUCKET_NAME &&
          env.B2_ENDPOINT && env.B2_REGION && env.UPLOAD_SECRET),
      });
    }
    if (url.pathname.startsWith("/images/") && request.method === "GET") {
      let key;
      try { key = safeKey(url.pathname.slice("/images/".length)); }
      catch { return json(400, { error: "Invalid image key." }); }
      const publicUrl = "https://f005.backblazeb2.com/file/" + encodeURIComponent(env.B2_BUCKET_NAME) + "/" + encodePath(key);
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
    return ok ? json(200, { ok: true }) : json(502, { error: "Backblaze delete failed." });
  },
};
