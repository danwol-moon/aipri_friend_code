import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json; charset=utf-8",
};

const BUCKET = "coord-images";
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
const ALLOWED_TAGS = new Set(["프리마지", "히미프리", "오네프리", "밀피", "구미", "스페셜"]);
const ITERATIONS = 310_000;

function response(status: number, payload: Record<string, unknown>) {
  return new Response(JSON.stringify(payload), { status, headers: corsHeaders });
}
function text(form: FormData, key: string, max = 200): string {
  return String(form.get(key) ?? "").trim().slice(0, max);
}
function hex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}
function fromHex(value: string): Uint8Array {
  const out = new Uint8Array(value.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(value.slice(i * 2, i * 2 + 2), 16);
  return out;
}
async function hashPassword(password: string, saltHex?: string) {
  const salt = saltHex ? fromHex(saltHex) : crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", salt, iterations: ITERATIONS, hash: "SHA-256" }, key, 256);
  return { salt: hex(salt), hash: hex(new Uint8Array(bits)) };
}
function constantTimeEqual(a: string, b: string): boolean {
  const aa = new TextEncoder().encode(a);
  const bb = new TextEncoder().encode(b);
  if (aa.length !== bb.length) return false;
  let diff = 0;
  for (let i = 0; i < aa.length; i++) diff |= aa[i] ^ bb[i];
  return diff === 0;
}
async function verifyPassword(password: string, salt: string, expected: string): Promise<boolean> {
  const candidate = await hashPassword(password, salt);
  return constantTimeEqual(candidate.hash, expected);
}
function extensionFor(file: File): string | null {
  const map: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif" };
  return map[file.type] ?? null;
}
async function uploadImage(supabase: ReturnType<typeof createClient>, coordId: string, role: "front" | "back", file: File) {
  const ext = extensionFor(file);
  if (!ext || !ALLOWED_TYPES.has(file.type)) throw new Error("이미지는 JPG, PNG, WEBP, GIF 형식만 가능합니다.");
  if (file.size <= 0 || file.size > MAX_IMAGE_BYTES) throw new Error("이미지는 각각 5MB 이하로 선택해 주세요.");
  const path = `${coordId}/${role}-${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
    contentType: file.type,
    cacheControl: "31536000",
    upsert: false,
  });
  if (error) throw new Error("이미지 업로드에 실패했습니다: " + error.message);
  return path;
}
async function removeImages(supabase: ReturnType<typeof createClient>, paths: string[]) {
  const valid = [...new Set(paths.filter(Boolean))];
  if (!valid.length) return;
  const { error } = await supabase.storage.from(BUCKET).remove(valid);
  if (error) console.error("Storage cleanup failed", error.message);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return response(405, { error: "POST 요청만 지원합니다." });

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("AIPRI_SUPABASE_SERVICE_KEY") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceKey) return response(500, { error: "서버 환경 설정이 완료되지 않았습니다." });

  try {
    const form = await req.formData();
    const action = text(form, "action", 20);
    const password = String(form.get("password") ?? "");
    const supabase = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    if (action === "create") {
      const nameKo = text(form, "name_ko", 100);
      const nameJa = text(form, "name_ja", 100);
      const tags = text(form, "tag", 200).split(",").map(value => value.trim()).filter(Boolean);
      const tag = tags.join(",");
      const frontValue = form.get("front");
      const backValue = form.get("back");
      const front = frontValue instanceof File && frontValue.size > 0 ? frontValue : null;
      const back = backValue instanceof File && backValue.size > 0 ? backValue : null;
      if (!nameKo && !nameJa) return response(400, { error: "한국어 또는 일본어 코디 이름을 입력해 주세요." });
      if (!tags.length || tags.some(value => !ALLOWED_TAGS.has(value))) return response(400, { error: "태그를 하나 이상 올바르게 선택해 주세요." });
      if (password.length < 4 || password.length > 200) return response(400, { error: "비밀번호는 4~200자로 입력해 주세요." });
      if (!front && !back) return response(400, { error: "프렌즈카드 이미지 또는 코디 이미지 중 하나 이상 선택해 주세요." });

      const id = crypto.randomUUID();
      let frontPath = "";
      let backPath = "";
      try {
        if (front) frontPath = await uploadImage(supabase, id, "front", front);
        if (back) backPath = await uploadImage(supabase, id, "back", back);
        if (!frontPath) frontPath = backPath;
        if (!backPath) backPath = frontPath;
        const { error: insertError } = await supabase.from("friends_card").insert({
          id, name_ko: nameKo, name_ja: nameJa, tag,
          front_image_path: frontPath, back_image_path: backPath,
          x_id: text(form, "x_id", 80),
          display_name: text(form, "display_name", 80),
          my_character: text(form, "my_character", 80),
          character_owner: text(form, "character_owner", 100),
        });
        if (insertError) throw new Error("프렌즈카드 정보 저장에 실패했습니다: " + insertError.message);
        const credential = await hashPassword(password);
        const { error: secretError } = await supabase.from("coord_credentials").insert({
          coord_id: id, password_salt: credential.salt, password_hash: credential.hash,
        });
        if (secretError) {
          await supabase.from("friends_card").delete().eq("id", id);
          throw new Error("비밀번호 정보를 저장하지 못했습니다.");
        }
      } catch (err) {
        await removeImages(supabase, [frontPath, backPath]);
        throw err;
      }
      return response(201, { ok: true, id, message: "프렌즈카드가 등록되었습니다." });
    }

    if (action === "update" || action === "delete") {
      const id = text(form, "id", 60);
      if (!/^[0-9a-f-]{36}$/i.test(id)) return response(400, { error: "코디 ID가 올바르지 않습니다." });
      if (password.length < 4 || password.length > 200) return response(400, { error: "등록 비밀번호를 4자 이상 입력해 주세요." });

      const { data: credential, error: credentialError } = await supabase
        .from("coord_credentials").select("password_salt,password_hash").eq("coord_id", id).maybeSingle();
      if (credentialError || !credential) return response(404, { error: "프렌즈카드를 찾을 수 없거나 비밀번호 정보가 없습니다." });
      const valid = await verifyPassword(password, credential.password_salt, credential.password_hash);
      if (!valid) return response(403, { error: "비밀번호가 일치하지 않습니다." });

      const { data: current, error: currentError } = await supabase.from("friends_card")
        .select("front_image_path,back_image_path").eq("id", id).maybeSingle();
      if (currentError || !current) return response(404, { error: "프렌즈카드를 찾을 수 없습니다." });

      if (action === "delete") {
        const { error: deleteError } = await supabase.from("friends_card").delete().eq("id", id);
        if (deleteError) return response(500, { error: "프렌즈카드 삭제에 실패했습니다." });
        await supabase.from("coord_credentials").delete().eq("coord_id", id);
        await removeImages(supabase, [current.front_image_path, current.back_image_path]);
        return response(200, { ok: true, message: "프렌즈카드가 삭제되었습니다." });
      }

      const nameKo = text(form, "name_ko", 100);
      const nameJa = text(form, "name_ja", 100);
      const tags = text(form, "tag", 200).split(",").map(value => value.trim()).filter(Boolean);
      const tag = tags.join(",");
      if (!nameKo && !nameJa) return response(400, { error: "한국어 또는 일본어 코디 이름을 입력해 주세요." });
      if (!tags.length || tags.some(value => !ALLOWED_TAGS.has(value))) return response(400, { error: "태그를 하나 이상 올바르게 선택해 주세요." });

      let frontPath = current.front_image_path;
      let backPath = current.back_image_path;
      const uploaded: string[] = [];
      try {
        const front = form.get("front");
        const back = form.get("back");
        if (front instanceof File && front.size > 0) {
          frontPath = await uploadImage(supabase, id, "front", front);
          uploaded.push(frontPath);
        }
        if (back instanceof File && back.size > 0) {
          backPath = await uploadImage(supabase, id, "back", back);
          uploaded.push(backPath);
        }
        const { error: updateError } = await supabase.from("friends_card").update({
          name_ko: nameKo, name_ja: nameJa, tag,
          front_image_path: frontPath, back_image_path: backPath,
          x_id: text(form, "x_id", 80),
          display_name: text(form, "display_name", 80),
          my_character: text(form, "my_character", 80),
          character_owner: text(form, "character_owner", 100),
          updated_at: new Date().toISOString(),
        }).eq("id", id);
        if (updateError) throw new Error("프렌즈카드 수정에 실패했습니다: " + updateError.message);
      } catch (err) {
        await removeImages(supabase, uploaded);
        throw err;
      }
      const oldPaths: string[] = [];
      if (frontPath !== current.front_image_path) oldPaths.push(current.front_image_path);
      if (backPath !== current.back_image_path) oldPaths.push(current.back_image_path);
      await removeImages(supabase, oldPaths);
      return response(200, { ok: true, id, message: "프렌즈카드가 수정되었습니다." });
    }

    return response(400, { error: "지원하지 않는 작업입니다." });
  } catch (error) {
    console.error("coord-manage error", error);
    const message = error instanceof Error ? error.message : "요청을 처리하지 못했습니다.";
    return response(500, { error: message });
  }
});
