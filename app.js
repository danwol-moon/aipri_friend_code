// 프렌즈카드 모음 — Supabase 연결 설정
// Project URL + publishable/anon key만 입력하세요.
// secret/service_role 키는 절대 이 파일에 넣지 마세요.
const SUPABASE_URL = "https://zlaiquivnuluglchqlbr.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_JMTnzgv6xVYkeTIExhNl2Q_QaIVgAYC";
const BUCKET = "coord-images";
const FUNCTION_URL = `${SUPABASE_URL}/functions/v1/coord-manage`;

const gallery = document.querySelector("#gallery");
const searchInput = document.querySelector("#searchInput");
const tagFilter = document.querySelector("#tagFilter");
const sortFilter = document.querySelector("#sortFilter");
const resultCount = document.querySelector("#resultCount");
const emptyState = document.querySelector("#emptyState");
const registerDialog = document.querySelector("#registerDialog");
const detailDialog = document.querySelector("#detailDialog");
const registerForm = document.querySelector("#registerForm");
const formMessage = document.querySelector("#formMessage");
let coords = [];
let currentEditId = null;
let currentDetailId = null;
let adminMode = false;
let adminPassword = "";

function isConfigured() {
  return SUPABASE_URL.startsWith("https://") &&
    !SUPABASE_URL.includes("YOUR_PROJECT_REF") &&
    SUPABASE_ANON_KEY !== "YOUR_SUPABASE_PUBLISHABLE_OR_ANON_KEY";
}
function escapeHtml(value = "") {
  return String(value).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
}
function bestName(item) { return item.name_ko || item.name_ja || "이름 없는 프렌즈카드"; }
function imageUrl(path) {
  if (/^https?:\/\//i.test(String(path || ""))) return String(path);
  return `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${String(path).split("/").map(encodeURIComponent).join("/")}`;
}
async function loadCoords() {
  if (!isConfigured()) {
    gallery.innerHTML = '<div class="empty-state">Supabase 연결 설정이 필요해요.<br><strong>app.js</strong> 맨 위에 프로젝트 URL과 공개용 키를 입력해 주세요.</div>';
    resultCount.textContent = "—";
    emptyState.hidden = true;
    return;
  }
  gallery.innerHTML = '<p class="muted">프렌즈카드를 불러오는 중…</p>';
  try {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/friends_card?select=*&order=created_at.desc`, {
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` }
    });
    if (!response.ok) throw new Error("프렌즈카드 목록을 불러오지 못했습니다. Supabase URL/키와 RLS 정책을 확인해 주세요.");
    coords = await response.json();
    render();
  } catch (error) {
    gallery.innerHTML = `<p class="empty-state">${escapeHtml(error.message || "연결 오류가 발생했습니다.")}</p>`;
  }
}
function filteredCoords() {
  const q = searchInput.value.trim().toLocaleLowerCase();
  let list = coords.filter(item => {
    const haystack = [item.name_ko,item.name_ja,item.x_id,item.my_character,item.character_owner,item.tag].join(" ").toLocaleLowerCase();
    const tags = String(item.tag || "").split(",").filter(Boolean);
    return (!q || haystack.includes(q)) && (!tagFilter.value || tags.includes(tagFilter.value));
  });
  if (sortFilter.value === "name") list.sort((a,b) => bestName(a).localeCompare(bestName(b),"ko"));
  else list.sort((a,b) => new Date(b.created_at) - new Date(a.created_at));
  return list;
}
function render() {
  const list = filteredCoords();
  resultCount.textContent = list.length;
  emptyState.hidden = list.length !== 0;
  if (!list.length) {
    gallery.innerHTML = "";
    return;
  }
  gallery.innerHTML = list.map(item => `
    <article class="coord-card" tabindex="0" role="button" data-id="${escapeHtml(item.id)}" aria-label="${escapeHtml((languageSelect?.value === "ja" ? item.name_ja : item.name_ko) || bestName(item))} 상세 보기">
      <div class="card-images ${item.front_image_path === item.back_image_path ? "single" : ""}">
        <img src="${escapeHtml(imageUrl(item.front_image_path))}" alt="프렌즈카드 이미지" loading="lazy">
        ${item.front_image_path === item.back_image_path ? "" : `<img src="${escapeHtml(imageUrl(item.back_image_path))}" alt="코디 이미지" loading="lazy">`}
      </div>
      <div class="card-body"><span class="tag">${escapeHtml((languageSelect?.value === "ja" ? String(item.tag || "").split(",").map(v => ({ "프리마지":"プリマジ","히미프리":"ひみつのアイプリ","오네프리":"おねがい アイプリ","구미":"グミ","밀피":"ミルフィー","스페셜":"スペシャル" }[v.trim()] || v.trim())).join(" · ") : String(item.tag || "").split(",").join(" · ")))}</span><p class="card-title">${escapeHtml(bestName(item))}</p><p class="card-subtitle">${escapeHtml(item.my_character || "마이캐릭터 미입력")}</p><div class="card-meta">${escapeHtml(item.x_id || "X ID 미입력")}</div>${item.character_owner?`<p class="card-extra"><strong>기타</strong><br>${escapeHtml(item.character_owner)}</p>`:""}${adminMode?`<div class="admin-card-actions"><button type="button" data-admin-edit="${escapeHtml(item.id)}">수정</button><button type="button" class="danger-button" data-admin-delete="${escapeHtml(item.id)}">삭제</button></div>`:""}</div>
    </article>`).join("");
}
function similarity(a,b) {
  const x = (a || "").toLowerCase().replace(/[\s\p{P}\p{S}]/gu,"");
  const y = (b || "").toLowerCase().replace(/[\s\p{P}\p{S}]/gu,"");
  if (!x || !y) return 0;
  if (x === y) return 1;
  const matrix = Array.from({length:x.length+1},(_,i)=>Array.from({length:y.length+1},(_,j)=>i===0?j:j===0?i:0));
  for(let i=1;i<=x.length;i++) for(let j=1;j<=y.length;j++)
    matrix[i][j] = Math.min(matrix[i-1][j]+1,matrix[i][j-1]+1,matrix[i-1][j-1]+(x[i-1]===y[j-1]?0:1));
  return 1 - matrix[x.length][y.length]/Math.max(x.length,y.length);
}
function findSimilar(item) {
  return coords.filter(other => other.id !== item.id).map(other => {
    const ko = similarity(item.name_ko, other.name_ko);
    const ja = similarity(item.name_ja, other.name_ja);
    const sameLength = [item.name_ko && other.name_ko && item.name_ko.length===other.name_ko.length, item.name_ja && other.name_ja && item.name_ja.length===other.name_ja.length].some(Boolean);
    return {...other, score:Math.max(ko,ja), sameLength};
  }).filter(x => x.score >= .35 || x.sameLength).sort((a,b)=>(b.score+(b.sameLength?.08:0))-(a.score+(a.sameLength?.08:0))).slice(0,4);
}
function openDetail(id) {
  const item = coords.find(x => x.id === id);
  if (!item) return;
  if (adminMode) { openEditForm(item, adminPassword, true); return; }
  currentDetailId = id;
  const similar = findSimilar(item);
  document.querySelector("#detailContent").innerHTML = `
    <p class="eyebrow">FRIENDS CARD DETAIL</p><h2>${escapeHtml((languageSelect?.value === "ja" ? item.name_ja : item.name_ko) || bestName(item))}</h2>
    <div class="detail-images ${item.front_image_path === item.back_image_path ? "single" : ""}">
      <img src="${escapeHtml(imageUrl(item.front_image_path))}" alt="프렌즈카드 이미지">
      ${item.front_image_path === item.back_image_path ? "" : `<img src="${escapeHtml(imageUrl(item.back_image_path))}" alt="코디 이미지">`}
    </div>
    <div class="detail-info">
      <p><strong>코디 이름 (일본어)</strong><br>${escapeHtml(item.name_ja || "—")}</p><p><strong>태그</strong><br>${escapeHtml(String(item.tag || "").split(",").join(" · ") || "—")}</p>
      <p><strong>X ID</strong><br>${escapeHtml(item.x_id || "—")}</p><p><strong>마이캐릭터</strong><br>${escapeHtml(item.my_character || "—")}</p>
      ${item.character_owner?'<p><strong>기타</strong><br>'+escapeHtml(item.character_owner)+'</p>':""}
    </div>
    <div class="recommendations"><h3>✧ 이로치 후보 추천</h3>
      ${similar.length ? `<div class="similar-card-grid">${similar.map(x => `<a class="similar-card" href="#gallery" data-similar-id="${escapeHtml(x.id)}" aria-label="${escapeHtml(bestName(x))} 상세 보기"><img src="${escapeHtml(imageUrl(x.front_image_path))}" alt="${escapeHtml(bestName(x))}" loading="lazy"><span class="similar-card-name">${escapeHtml(bestName(x))}</span><span class="similar-card-score">${Math.round(x.score*100)}% 유사</span></a>`).join("")}</div>` : `<p>비교할 만한 코디가 아직 없어요.</p>`} 
      <p class="recommendation-note">이름 유사도 기반 후보이며 실제 이로치 여부를 확정하지 않습니다.</p></div>
    <div class="recommendations"><h3>${adminMode ? "관리자 편집" : "등록자 관리"}</h3><p>${adminMode ? "관리자 모드가 켜져 있어 이 카드를 편집할 수 있어요." : "등록 시 설정한 비밀번호를 입력하면 이 코디를 수정하거나 삭제할 수 있어요."}</p>
      <label class="owner-password-label">${adminMode ? "관리자 모드 활성화됨" : "등록 비밀번호"}<input id="ownerPassword" type="password" autocomplete="current-password" placeholder="${adminMode ? "관리자 권한으로 처리됩니다" : "등록할 때 설정한 비밀번호"}" ${adminMode ? "disabled" : ""}></label>
      <div class="owner-actions"><button class="primary" id="editCoordButton" type="button">수정하기</button><button class="danger-button" id="deleteCoordButton" type="button">삭제하기</button></div>
      <p id="ownerMessage" class="form-message" role="status"></p>
    </div>`;
  detailDialog.showModal();
  document.querySelectorAll("[data-similar-id]").forEach(link => {
    link.addEventListener("click", event => {
      event.preventDefault();
      const targetId = link.dataset.similarId;
      detailDialog.close();
      openDetail(targetId);
    });
  });
  document.querySelector("#editCoordButton").addEventListener("click", () => {
    const password = adminMode ? adminPassword : document.querySelector("#ownerPassword").value;
    if (!password) { setOwnerMessage("등록 비밀번호를 입력해 주세요."); return; }
    detailDialog.close();
    openEditForm(item, password, adminMode);
  });
  document.querySelector("#deleteCoordButton").addEventListener("click", async () => {
    const password = adminMode ? adminPassword : document.querySelector("#ownerPassword").value;
    if (!password) { setOwnerMessage("등록 비밀번호를 입력해 주세요."); return; }
    if (!confirm("이 프렌즈카드를 삭제할까요? 삭제 후에는 복구할 수 없습니다.")) return;
    const data = new FormData();
    data.append("action","delete"); data.append("id",item.id); if (adminMode) data.append("admin_password", password); else data.append("password", password);
    setOwnerMessage("비밀번호 확인 및 삭제 중…");
    const result = await callFunction(data);
    if (result.ok) { detailDialog.close(); await loadCoords(); }
    else setOwnerMessage(result.error || "삭제하지 못했습니다.");
  });
}
function setOwnerMessage(message) {
  const el = document.querySelector("#ownerMessage");
  if (el) el.textContent = message;
}
async function callFunction(formData) {
  try {
    const response = await fetch(FUNCTION_URL, {
      method: "POST",
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
      body: formData
    });
    const result = await response.json().catch(() => ({}));
    return response.ok ? {ok:true,...result} : {ok:false,error:result.error || "요청에 실패했습니다."};
  } catch {
    return {ok:false,error:"서버에 연결하지 못했습니다. 인터넷과 Supabase 설정을 확인해 주세요."};
  }
}
function resetFileRequirements(isEdit) {
  registerForm.elements.front.required = false;
  // 파일 업로드 또는 URL 중 하나를 허용하므로 개별 입력란은 required로 고정하지 않아요.
  registerForm.elements.frontUrl.required = false;
  registerForm.elements.back.required = false;
  registerForm.elements.frontUrl.setCustomValidity("");
}
function resetImagePreviews() {
  registerForm.querySelectorAll('input[type="file"][name="front"], input[type="file"][name="back"]').forEach(input => {
    const box = input.closest(".upload-box");
    const preview = box.querySelector(".upload-preview");
    const hint = box.querySelector(".upload-hint");
    preview.removeAttribute("src");
    preview.hidden = true;
    if (hint) {
      hint.hidden = false;
      hint.textContent = input.name === "front" ? "파일을 선택하거나 이미지 주소를 입력해 주세요." : "선택 사항 · 파일 또는 이미지 주소";
    }
    box.classList.remove("has-preview", "preview-error");
  });
  registerForm.querySelectorAll('input[type="url"][name$="Url"]').forEach(input => { input.value = ""; });
}
function showImagePreview(box, source, hintText = "") {
  const preview = box.querySelector(".upload-preview");
  const hint = box.querySelector(".upload-hint");
  preview.onload = () => {
    preview.hidden = false;
    if (hint) hint.hidden = true;
    box.classList.add("has-preview");
    box.classList.remove("preview-error");
  };
  preview.onerror = () => {
    preview.hidden = true;
    preview.removeAttribute("src");
    if (hint) {
      hint.hidden = false;
      hint.textContent = "이미지를 미리볼 수 없어요. 직접 이미지 링크인지 확인해 주세요.";
    }
    box.classList.remove("has-preview");
    box.classList.add("preview-error");
  };
  preview.src = source;
  if (hint && hintText) hint.textContent = hintText;
  // data URL / cached image can load before onload handlers on some browsers
  if (preview.complete && preview.naturalWidth > 0) {
    preview.hidden = false;
    if (hint) hint.hidden = true;
    box.classList.add("has-preview");
  }
}
function setupImagePreviews() {
  registerForm.querySelectorAll('input[type="file"][name="front"], input[type="file"][name="back"]').forEach(input => {
    input.addEventListener("change", () => {
      const box = input.closest(".upload-box");
      const preview = box.querySelector(".upload-preview");
      const hint = box.querySelector(".upload-hint");
      const file = input.files?.[0];
      const urlInput = registerForm.elements[input.name === "front" ? "frontUrl" : "backUrl"];
      if (file && urlInput) urlInput.value = "";
      if (!file) {
        if (hint) {
          hint.hidden = false;
          hint.textContent = input.name === "front" ? "파일을 선택하거나 이미지 주소를 입력해 주세요." : "선택 사항 · 파일 또는 이미지 주소";
        }
        preview.removeAttribute("src");
        preview.hidden = true;
        box.classList.remove("has-preview", "preview-error");
        return;
      }
      if (!["image/jpeg","image/png","image/webp","image/gif"].includes(file.type)) {
        preview.removeAttribute("src");
        preview.hidden = true;
        if (hint) { hint.hidden = false; hint.textContent = "JPG, PNG, WEBP, GIF 파일만 선택할 수 있어요."; }
        box.classList.remove("has-preview");
        return;
      }
      const reader = new FileReader();
      reader.onload = () => showImagePreview(box, String(reader.result || ""));
      reader.onerror = () => {
        preview.removeAttribute("src");
        preview.hidden = true;
        if (hint) { hint.hidden = false; hint.textContent = "미리보기를 불러오지 못했어요. 다른 이미지를 선택해 주세요."; }
        box.classList.remove("has-preview");
      };
      reader.readAsDataURL(file);
    });
  });
  registerForm.querySelectorAll('input[type="url"][name$="Url"]').forEach(input => {
    input.addEventListener("input", () => {
      const box = input.closest(".upload-box");
      const fileInput = registerForm.elements[input.name === "frontUrl" ? "front" : "back"];
      if (input.value.trim() && fileInput) fileInput.value = "";
      const value = input.value.trim();
      if (!value) {
        const preview = box.querySelector(".upload-preview");
        preview.removeAttribute("src");
        preview.hidden = true;
        const hint = box.querySelector(".upload-hint");
        if (hint) {
          hint.hidden = false;
          hint.textContent = input.name === "frontUrl" ? "파일을 선택하거나 이미지 주소를 입력해 주세요." : "선택 사항 · 파일 또는 이미지 주소";
        }
        box.classList.remove("has-preview", "preview-error");
        return;
      }
      try {
        const parsed = new URL(value);
        if (!["http:","https:"].includes(parsed.protocol)) throw new Error("Invalid protocol");
        showImagePreview(box, parsed.href);
      } catch {
        const hint = box.querySelector(".upload-hint");
        if (hint) { hint.hidden = false; hint.textContent = "http:// 또는 https://로 시작하는 이미지 주소를 입력해 주세요."; }
      }
    });
  });
}
setupImagePreviews();
function openCreateForm() {
  currentEditId = null;
  registerForm.reset();
  registerForm.elements.password.required = true;
  delete registerForm.dataset.adminEdit;
  resetImagePreviews();
  resetFileRequirements(false);
  formMessage.textContent = "";
  registerDialog.querySelector(".eyebrow").textContent = "ADD YOUR FRIEND CARD";
  registerDialog.querySelector("h2").textContent = "프렌즈카드 등록하기";
  registerForm.querySelector('button[type="submit"]').textContent = "프렌즈카드 등록하기";
  registerDialog.showModal();
}
function openEditForm(item, password, isAdmin = false) {
  currentEditId = item.id;
  registerForm.reset();
  resetImagePreviews();
  registerForm.elements.nameKo.value = item.name_ko || "";
  registerForm.elements.nameJa.value = item.name_ja || "";
  const selectedTags = String(item.tag || "").split(",").filter(Boolean);
  registerForm.querySelectorAll('input[name="tag"]').forEach(input => { input.checked = selectedTags.includes(input.value); });
  registerForm.elements.xId.value = item.x_id || "";
  registerForm.elements.myCharacter.value = item.my_character || "";
  registerForm.elements.characterOwner.value = item.character_owner || "";
  // 수정 화면을 열면 기존 이미지도 미리보기로 표시합니다.
  const frontPath = String(item.front_image_path || "");
  const backPath = String(item.back_image_path || "");
  if (/^https?:\/\//i.test(frontPath)) registerForm.elements.frontUrl.value = frontPath;
  if (backPath && backPath !== frontPath && /^https?:\/\//i.test(backPath)) registerForm.elements.backUrl.value = backPath;
  const frontBox = registerForm.elements.front.closest(".upload-box");
  const backBox = registerForm.elements.back.closest(".upload-box");
  if (frontPath) showImagePreview(frontBox, imageUrl(frontPath));
  // 코디 이미지가 별도로 저장된 경우에만 오른쪽 미리보기를 표시합니다.
  // back_image_path가 프렌즈카드 이미지와 같으면 오른쪽은 비워 둡니다.
  if (backPath && backPath !== frontPath) showImagePreview(backBox, imageUrl(backPath));
  registerForm.elements.password.value = isAdmin ? "" : password;
  // 관리자 수정은 기존 등록 비밀번호가 필요 없으므로 브라우저의 required 검사를 해제합니다.
  registerForm.elements.password.required = !isAdmin;
  registerForm.dataset.adminEdit = isAdmin ? "true" : "false";
  resetFileRequirements(true);
  formMessage.textContent = "사진을 선택하지 않으면 기존 이미지를 유지합니다.";
  registerDialog.querySelector(".eyebrow").textContent = "EDIT YOUR COORD";
  registerDialog.querySelector("h2").textContent = "프렌즈카드 수정하기";
  registerForm.querySelector('button[type="submit"]').textContent = "수정 내용 저장";
  registerDialog.showModal();
}
function validateImage(file) {
  if (!file || file.size === 0) return true;
  return ["image/jpeg","image/png","image/webp","image/gif"].includes(file.type) && file.size <= 5*1024*1024;
}
registerForm.addEventListener("submit", async e => {
  e.preventDefault();
  if (!isConfigured()) { formMessage.textContent = "먼저 app.js에 Supabase URL과 공개용 키를 입력해 주세요."; return; }
  const data = new FormData(registerForm);
  const front = data.get("front"), back = data.get("back");
  const frontUrl = String(data.get("frontUrl") || "").trim();
  const backUrl = String(data.get("backUrl") || "").trim();
  const tags = data.getAll("tag").map(value => String(value)).filter(Boolean);
  if (!currentEditId && !front?.size && !frontUrl) { formMessage.textContent = "프렌즈카드 이미지는 필수예요. 파일을 선택하거나 이미지 주소를 입력해 주세요."; return; }
  for (const [label, value] of [["프렌즈카드 이미지", frontUrl], ["코디 이미지", backUrl]]) {
    if (value) { try { const parsed = new URL(value); if (!["http:","https:"].includes(parsed.protocol)) throw new Error(); } catch { formMessage.textContent = `${label} 주소는 http:// 또는 https://로 시작하는 올바른 URL이어야 해요.`; return; } }
  }
  if (!validateImage(front) || !validateImage(back)) { formMessage.textContent = "JPG, PNG, WEBP, GIF 이미지를 각각 5MB 이하로 선택해 주세요."; return; }
  if (!String(data.get("nameKo")||"").trim() && !String(data.get("nameJa")||"").trim()) { formMessage.textContent = "한국어 또는 일본어 코디 이름을 하나 이상 입력해 주세요."; return; }
  if (!tags.length) { formMessage.textContent = "태그를 하나 이상 선택해 주세요."; return; }
  if (registerForm.dataset.adminEdit !== "true" && String(data.get("password")||"").length < 4) { formMessage.textContent = "비밀번호는 4자 이상 입력해 주세요."; return; }
  const missingFields = [];
  if (!String(data.get("nameKo") || "").trim()) missingFields.push("코디 이름 (한국어)");
  if (!String(data.get("nameJa") || "").trim()) missingFields.push("코디 이름 (일본어)");
  if (!String(data.get("xId") || "").trim()) missingFields.push("X ID");
  if (!String(data.get("myCharacter") || "").trim()) missingFields.push("마이캐릭터명");
  if (missingFields.length) {
    const message = "빈칸이 존재합니다. 이대로 등록하겠습니까?\n\n비어 있는 항목: " + missingFields.join(", ");
    if (!window.confirm(message)) return;
  }
  const payload = new FormData();
  payload.append("action", currentEditId ? "update" : "create");
  if (currentEditId) payload.append("id", currentEditId);
  if (registerForm.dataset.adminEdit === "true") payload.append("admin_password", adminPassword);
  else payload.append("password", String(data.get("password")||""));
  payload.append("name_ko", String(data.get("nameKo")||"").trim());
  payload.append("name_ja", String(data.get("nameJa")||"").trim());
  payload.append("tag", tags.join(","));
  payload.append("x_id", String(data.get("xId")||"").trim());
  payload.append("my_character", String(data.get("myCharacter")||"").trim());
  payload.append("character_owner", String(data.get("characterOwner")||"").trim());
  if (front?.size) payload.append("front", front);
  if (back?.size) payload.append("back", back);
  if (frontUrl) payload.append("front_url", frontUrl);
  if (backUrl) payload.append("back_url", backUrl);
  const submit = registerForm.querySelector('button[type="submit"]');
  submit.disabled = true;
  formMessage.textContent = currentEditId ? "프렌즈카드 수정 중…" : "이미지와 코디 정보를 저장 중…";
  const result = await callFunction(payload);
  submit.disabled = false;
  if (!result.ok) { formMessage.textContent = result.error || "저장하지 못했습니다."; return; }
  registerDialog.close();
  delete registerForm.dataset.adminEdit;
  registerForm.elements.password.required = true;
  await loadCoords();
});
document.querySelector("#openRegister").addEventListener("click", openCreateForm);
gallery.addEventListener("click", async e => {
  const editButton = e.target.closest("[data-admin-edit]");
  if (editButton && adminMode) {
    e.stopPropagation();
    const item = coords.find(x => x.id === editButton.dataset.adminEdit);
    if (item) openEditForm(item, adminPassword, true);
    return;
  }
  const deleteButton = e.target.closest("[data-admin-delete]");
  if (deleteButton && adminMode) {
    e.stopPropagation();
    const item = coords.find(x => x.id === deleteButton.dataset.adminDelete);
    if (!item || !confirm(`「${bestName(item)}」프렌즈카드를 삭제할까요? 삭제 후에는 복구할 수 없습니다.`)) return;
    const data = new FormData();
    data.append("action", "delete"); data.append("id", item.id); data.append("admin_password", adminPassword);
    const result = await callFunction(data);
    if (result.ok) await loadCoords();
    else alert(result.error || "삭제하지 못했습니다.");
    return;
  }
  const card=e.target.closest("[data-id]");
  if(card) openDetail(card.dataset.id);
});
gallery.addEventListener("keydown", e => { if((e.key==="Enter"||e.key===" ") && e.target.matches("[data-id]")){e.preventDefault();openDetail(e.target.dataset.id);} });
[searchInput,tagFilter,sortFilter].forEach(el=>el.addEventListener("input",render));

// 브랜드 로고를 누르면 검색어·필터·정렬을 초기화하고 전체 카드 목록으로 돌아갑니다.
const brandLink = document.querySelector(".brand");
if (brandLink) {
  brandLink.addEventListener("click", event => {
    event.preventDefault();
    searchInput.value = "";
    tagFilter.selectedIndex = 0;
    sortFilter.selectedIndex = 0;
    render();
    window.scrollTo({ top: 0, behavior: "smooth" });
  });
}
document.querySelectorAll("[data-close]").forEach(btn=>btn.addEventListener("click",()=>document.getElementById(btn.dataset.close).close()));
loadCoords();

const adminDialog = document.querySelector("#adminDialog");
const adminForm = document.querySelector("#adminForm");
const adminPasswordInput = document.querySelector("#adminPasswordInput");
const adminMessage = document.querySelector("#adminMessage");
const ADMIN_MAX_ATTEMPTS = 5;
const ADMIN_LOCK_KEY = "friends-card-admin-lock-v1";
let adminFailedAttempts = Number(sessionStorage.getItem(ADMIN_LOCK_KEY) || 0);

function syncAdminLockMessage() {
  if (adminFailedAttempts >= ADMIN_MAX_ATTEMPTS) {
    adminPasswordInput.disabled = true;
    adminForm.querySelector('button[type="submit"]').disabled = true;
    adminMessage.textContent = "로그인 시도 횟수 5회를 초과해 잠겼습니다. 페이지를 새로고침해도 잠금은 유지됩니다.";
    return true;
  }
  adminPasswordInput.disabled = false;
  adminForm.querySelector('button[type="submit"]').disabled = false;
  return false;
}
syncAdminLockMessage();

document.querySelector("#adminModeButton").addEventListener("click", () => {
  if (adminMode) {
    adminMode = false;
    adminPassword = "";
    document.querySelector("#adminModeButton").classList.remove("active");
    document.querySelector("#adminModeButton").textContent = "관리자 모드";
    render();
    if (currentDetailId && detailDialog.open) openDetail(currentDetailId);
    return;
  }
  if (syncAdminLockMessage()) {
    adminDialog.showModal();
    return;
  }
  adminForm.reset();
  adminMessage.textContent = "";
  adminDialog.showModal();
  adminPasswordInput.focus();
});

adminForm.addEventListener("submit", async e => {
  e.preventDefault();
  if (syncAdminLockMessage()) return;
  const entered = adminPasswordInput.value;
  if (!entered) {
    adminMessage.textContent = "관리자 비밀번호를 입력해 주세요.";
    return;
  }
  const submit = adminForm.querySelector('button[type="submit"]');
  submit.disabled = true;
  adminMessage.textContent = "관리자 인증 중…";
  const data = new FormData();
  data.append("action", "admin-auth");
  data.append("admin_password", entered);
  const result = await callFunction(data);
  submit.disabled = false;
  if (!result.ok) {
    adminFailedAttempts += 1;
    sessionStorage.setItem(ADMIN_LOCK_KEY, String(adminFailedAttempts));
    if (adminFailedAttempts >= ADMIN_MAX_ATTEMPTS) {
      syncAdminLockMessage();
    } else {
      adminMessage.textContent = "관리자 비밀번호가 올바르지 않습니다. 5번 이상 틀릴 시 로그인에 제한됩니다.";
    }
    return;
  }
  adminFailedAttempts = 0;
  sessionStorage.removeItem(ADMIN_LOCK_KEY);
  adminPassword = entered;
  adminMode = true;
  const button = document.querySelector("#adminModeButton");
  button.classList.add("active");
  button.textContent = "관리자 모드 켜짐 · 끄기";
  adminDialog.close();
  render();
});


// 언어 선택: 주요 내비게이션과 검색 UI를 한국어/일본어로 전환합니다.
const languageSelect = document.querySelector("#languageSelect");
const languageCopy = {
  ko: {
    admin:"관리자 모드", register:"＋ 프카 이미지 등록", search:"코디 이름, 마이캐릭터명, X ID 검색",
    allTags:"모든 태그", newest:"최신 등록순", name:"이름순", gallery:"코디 둘러보기",
    galleryHint:"등록된 이미지를 눌러 상세 정보를 확인해주세요", empty:"아직 등록된 코디가 없어요.\n첫 번째 코디를 등록해 보세요!",
    close:"닫기"
  },
  ja: {
    admin:"管理者モード", register:"＋ フレンズカード登録", search:"コーデ名・マイキャラクター名・X IDで検索",
    allTags:"すべてのタグ", newest:"新着順", name:"名前順", gallery:"コーデ一覧",
    galleryHint:"登録された画像をクリックして詳細情報をご確認ください", empty:"まだカードが登録されていません。\n最初のカードを登録しましょう！",
    close:"閉じる"
  }
};
function applyLanguage(lang) {
  const t = languageCopy[lang] || languageCopy.ko;
  document.documentElement.lang = lang;
  document.querySelector("#adminModeButton").textContent = adminMode ? (lang === "ja" ? "管理者モード有効・解除" : "관리자 모드 켜짐 · 끄기") : t.admin;
  document.querySelector("#brandName").childNodes[0].textContent = lang === "ja" ? "フレンドカードコレクション" : "프렌즈카드 컬렉션";
  document.title = lang === "ja" ? "フレンドカードコレクション" : "프렌즈카드 컬렉션";
  document.querySelector("#openRegister").textContent = t.register;
  document.querySelector("#searchInput").placeholder = t.search;
  document.querySelector("#tagFilter option[value='']").textContent = t.allTags;
  document.querySelector("#sortFilter option[value='newest']").textContent = t.newest;
  document.querySelector("#sortFilter option[value='name']").textContent = t.name;
  document.querySelector("#galleryHeading").textContent = "FRIENDS CARD LIST";
  document.querySelector(".hero h1").innerHTML = lang === "ja" ? 'フレンドカードを<br><em>一度にまとめてみましょう！</em>' : '프렌즈 카드를<br><em>한 번에 모아봐요!</em>';
  document.querySelector(".hero-copy > p:last-child").textContent = lang === "ja" ? "フレンドカードを登録すると、簡単に確認できます。" : "프카를 등록하고, 편하게 찾아볼 수 있어요.";
  document.querySelector(".section-heading > .muted").textContent = t.galleryHint;
  document.querySelector("#emptyState").innerHTML = t.empty.replace("\\n","<br>");
  document.querySelectorAll(".close").forEach(b => b.setAttribute("aria-label", t.close));
  document.querySelector("#adminDialog h2").textContent = t.admin;
  document.querySelector("#adminForm button[type='submit']").textContent = lang === "ja" ? "管理者モードを有効にする" : "관리자 모드 켜기";
  document.querySelector("#registerDialog h2").textContent = lang === "ja" ? "フレンドカードを登録する" : "프렌즈카드 등록하기";
  document.querySelector("#registerForm button[type='submit']").textContent = lang === "ja" ? "フレンドカードを登録する" : "프렌즈카드 등록하기";
  document.querySelector("#registerForm .form-note").textContent = lang === "ja" ? "ファイルは5MB以下でアップロードしてください。" : "프렌즈카드 이미지는 필수예요. 파일을 올리거나 이미지 주소(URL)를 입력해 주세요. 코디 이미지는 선택 사항이며 파일은 5MB 이하로 선택해 주세요. 비밀번호는 4자 이상으로 설정해 주세요.";
  if (lang === "ja") {
    const tagJa = ["プリマジ", "ひみつのアイプリ", "おねがい アイプリ", "グミ", "ミルフィー", "スペシャル"];
    const tagKoValues = ["프리마지", "히미프리", "오네프리", "밀피", "구미", "스페셜"];
    [...document.querySelectorAll("#tagFilter option")].forEach((opt, i) => { if (i > 0) opt.textContent = tagJa[tagKoValues.indexOf(opt.value)] || opt.value; });
    [...document.querySelectorAll("#registerForm .tag-checkboxes label")].forEach(label => {
      const input = label.querySelector("input");
      const idx = tagKoValues.indexOf(input.value);
      if (idx >= 0) label.lastChild.textContent = " " + tagJa[idx];
    });
    const jaOrder = ["프리마지", "히미프리", "오네프리", "구미", "밀피", "스페셜"];
    const tagFilter = document.querySelector("#tagFilter");
    jaOrder.forEach(value => { const option = [...tagFilter.options].find(o => o.value === value); if (option) tagFilter.appendChild(option); });
    const tagFieldset = document.querySelector("#registerForm .tag-checkboxes");
    jaOrder.forEach(value => { const label = [...tagFieldset.querySelectorAll("label")].find(l => l.querySelector("input").value === value); if (label) tagFieldset.appendChild(label); });
    const strongs = document.querySelectorAll("#registerForm .image-fields .upload-box strong");
    strongs[0].childNodes[0].textContent = "フレンドカード画像 ";
    strongs[0].querySelector(".required-mark").textContent = "(必須)";
    strongs[1].textContent = "コーデ画像";
    document.querySelector("#registerForm .image-fields label:nth-child(1) .upload-hint").textContent = "ファイルを選択するか、画像のURLを入力してください。";
    document.querySelector("#registerForm .image-fields label:nth-child(2) .upload-hint").textContent = "（オプション）ファイルを選択するか、画像のURLを入力してください。";
    document.querySelector("#registerForm input[name='frontUrl']").placeholder = "画像URLを貼り付け";
    document.querySelector("#registerForm .tag-checkboxes legend").innerHTML = 'タグ <span class="muted">(複数選択可)</span>';
    document.querySelector("#registerForm input[name='xId']").placeholder = "ニックネーム（ID）";
    document.querySelector("#registerForm label:has(input[name='myCharacter'])").childNodes[0].textContent = "マイキャラクターの名前";
    document.querySelector("#registerForm input[name='myCharacter']").placeholder = "";
    document.querySelector("#registerForm label:has(input[name='characterOwner'])").childNodes[0].textContent = "その他事項";
    document.querySelector("#registerForm input[name='characterOwner']").placeholder = "名前は公開不可、カスタムの有無など自由に記入してください";
    document.querySelector("#registerForm label:has(input[name='password'])").childNodes[0].textContent = "登録パスワード";
    document.querySelector("#registerForm input[name='password']").placeholder = "4文字以上・登録後にパスワードを入力すると内容の変更および削除が可能";
    document.querySelector("#registerForm input[name='frontUrl']").setAttribute("aria-label", "フレンドカード画像URL");
    document.querySelector("#registerForm input[name='backUrl']").placeholder = "画像URLを貼り付け";
    document.querySelector("#registerForm input[name='backUrl']").setAttribute("aria-label", "コーデ画像URL");
    document.querySelector("#registerForm label:has(input[name='nameKo'])").childNodes[0].textContent = "コーデ名（韓国語）";
    document.querySelector("#registerForm label:has(input[name='nameJa'])").childNodes[0].textContent = "コーデ名（日本語）";
  } else {
    const tagKoValues = ["프리마지", "히미프리", "오네프리", "밀피", "구미", "스페셜"];
    [...document.querySelectorAll("#tagFilter option")].forEach((opt, i) => { if (i > 0) opt.textContent = tagKoValues[i - 1]; });
    [...document.querySelectorAll("#registerForm .tag-checkboxes label")].forEach(label => {
      const input = label.querySelector("input");
      label.lastChild.textContent = " " + input.value;
    });
    const koOrder = ["프리마지", "히미프리", "오네프리", "밀피", "구미", "스페셜"];
    const tagFilter = document.querySelector("#tagFilter");
    koOrder.forEach(value => { const option = [...tagFilter.options].find(o => o.value === value); if (option) tagFilter.appendChild(option); });
    const tagFieldset = document.querySelector("#registerForm .tag-checkboxes");
    koOrder.forEach(value => { const label = [...tagFieldset.querySelectorAll("label")].find(l => l.querySelector("input").value === value); if (label) tagFieldset.appendChild(label); });
    const strongs = document.querySelectorAll("#registerForm .image-fields .upload-box strong");
    strongs[0].childNodes[0].textContent = "프렌즈카드 이미지 ";
    strongs[0].querySelector(".required-mark").textContent = "(필수)";
    strongs[1].textContent = "코디 이미지";
    document.querySelector("#registerForm .image-fields label:nth-child(1) .upload-hint").textContent = "파일을 선택하거나 이미지 주소를 입력해 주세요.";
    document.querySelector("#registerForm .image-fields label:nth-child(2) .upload-hint").textContent = "선택 사항 · 파일 또는 이미지 주소";
    document.querySelector("#registerForm input[name='frontUrl']").placeholder = "또는 이미지 주소 URL 붙여넣기";
    document.querySelector("#registerForm input[name='frontUrl']").setAttribute("aria-label", "프렌즈카드 이미지 주소");
    document.querySelector("#registerForm input[name='backUrl']").placeholder = "또는 이미지 주소 URL 붙여넣기";
    document.querySelector("#registerForm input[name='backUrl']").setAttribute("aria-label", "코디 이미지 주소");
    document.querySelector("#registerForm label:has(input[name='nameKo'])").childNodes[0].textContent = "코디 이름 (한국어)";
    document.querySelector("#registerForm label:has(input[name='nameJa'])").childNodes[0].textContent = "코디 이름 (일본어)";
  }
}
languageSelect?.addEventListener("change", () => applyLanguage(languageSelect.value));
applyLanguage(languageSelect?.value || "ko");

// 관리자 버튼은 히어로 영역의 반짝이 아이콘을 5회 클릭하면 표시됩니다.
const heroSparkle = document.querySelector(".hero-sparkle");
let sparkleTapCount = 0;
heroSparkle?.addEventListener("click", () => {
  sparkleTapCount += 1;
  if (sparkleTapCount >= 5) {
    document.body.classList.add("admin-entry-visible");
    heroSparkle.title = languageSelect?.value === "ja" ? "管理者メニューを表示しました" : "관리자 메뉴가 표시되었습니다";
  }
});
