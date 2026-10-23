// 아이프리 코디 도감 — Supabase 연결 설정
// Project URL + publishable/anon key만 입력하세요.
// secret/service_role 키는 절대 이 파일에 넣지 마세요.
const SUPABASE_URL = "https://YOUR_PROJECT_REF.supabase.co";
const SUPABASE_ANON_KEY = "YOUR_SUPABASE_PUBLISHABLE_OR_ANON_KEY";
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

function isConfigured() {
  return SUPABASE_URL.startsWith("https://") &&
    !SUPABASE_URL.includes("YOUR_PROJECT_REF") &&
    SUPABASE_ANON_KEY !== "YOUR_SUPABASE_PUBLISHABLE_OR_ANON_KEY";
}
function escapeHtml(value = "") {
  return String(value).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
}
function bestName(item) { return item.name_ko || item.name_ja || "이름 없는 코디"; }
function imageUrl(path) {
  return `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${String(path).split("/").map(encodeURIComponent).join("/")}`;
}
async function loadCoords() {
  if (!isConfigured()) {
    gallery.innerHTML = '<div class="empty-state">Supabase 연결 설정이 필요해요.<br><strong>app.js</strong> 맨 위에 프로젝트 URL과 공개용 키를 입력해 주세요.</div>';
    resultCount.textContent = "—";
    emptyState.hidden = true;
    return;
  }
  gallery.innerHTML = '<p class="muted">코디를 불러오는 중…</p>';
  try {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/coords?select=*&order=created_at.desc`, {
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` }
    });
    if (!response.ok) throw new Error("코디 목록을 불러오지 못했습니다. Supabase URL/키와 RLS 정책을 확인해 주세요.");
    coords = await response.json();
    render();
  } catch (error) {
    gallery.innerHTML = `<p class="empty-state">${escapeHtml(error.message || "연결 오류가 발생했습니다.")}</p>`;
  }
}
function filteredCoords() {
  const q = searchInput.value.trim().toLocaleLowerCase();
  let list = coords.filter(item => {
    const haystack = [item.name_ko,item.name_ja,item.x_id,item.display_name,item.my_character,item.character_owner,item.tag].join(" ").toLocaleLowerCase();
    return (!q || haystack.includes(q)) && (!tagFilter.value || item.tag === tagFilter.value);
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
    <article class="coord-card" tabindex="0" role="button" data-id="${escapeHtml(item.id)}" aria-label="${escapeHtml(bestName(item))} 상세 보기">
      <div class="card-images">
        <img src="${escapeHtml(imageUrl(item.front_image_path))}" alt="앞면 이미지" loading="lazy">
        <img src="${escapeHtml(imageUrl(item.back_image_path))}" alt="뒷면 이미지" loading="lazy">
      </div>
      <div class="card-body"><span class="tag">${escapeHtml(item.tag)}</span><p class="card-title">${escapeHtml(bestName(item))}</p><p class="card-subtitle">${escapeHtml(item.my_character || item.display_name || "등록자 정보 없음")}</p><div class="card-meta">${escapeHtml(item.x_id || "X ID 미입력")}</div></div>
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
  currentDetailId = id;
  const similar = findSimilar(item);
  document.querySelector("#detailContent").innerHTML = `
    <p class="eyebrow">COORD DETAIL</p><h2>${escapeHtml(bestName(item))}</h2>
    <div class="detail-images"><img src="${escapeHtml(imageUrl(item.front_image_path))}" alt="앞면"><img src="${escapeHtml(imageUrl(item.back_image_path))}" alt="뒷면"></div>
    <div class="detail-info">
      <p><strong>일본어 이름</strong><br>${escapeHtml(item.name_ja || "—")}</p><p><strong>타입</strong><br>${escapeHtml(item.tag || "—")}</p>
      <p><strong>등록자</strong><br>${escapeHtml(item.display_name || "—")} ${escapeHtml(item.x_id || "")}</p><p><strong>마이캐릭터</strong><br>${escapeHtml(item.my_character || "—")}</p>
      ${item.character_owner?'<p><strong>캐릭터 관련 정보</strong><br>'+escapeHtml(item.character_owner)+'</p>':""}
    </div>
    <div class="recommendations"><h3>✧ 이로치 후보 추천</h3><p>${similar.length ? similar.map(x=>escapeHtml(bestName(x))+" ("+Math.round(x.score*100)+"% 유사)").join(" · ") : "비교할 만한 코디가 아직 없어요."}<br><br>이름 유사도 기반 후보이며 실제 이로치 여부를 확정하지 않습니다.</p></div>
    <div class="recommendations"><h3>등록자 관리</h3><p>등록 시 설정한 비밀번호를 입력하면 이 코디를 수정하거나 삭제할 수 있어요.</p>
      <label class="owner-password-label">등록 비밀번호<input id="ownerPassword" type="password" autocomplete="current-password" placeholder="등록할 때 설정한 비밀번호"></label>
      <div class="owner-actions"><button class="primary" id="editCoordButton" type="button">수정하기</button><button class="danger-button" id="deleteCoordButton" type="button">삭제하기</button></div>
      <p id="ownerMessage" class="form-message" role="status"></p>
    </div>`;
  detailDialog.showModal();
  document.querySelector("#editCoordButton").addEventListener("click", () => {
    const password = document.querySelector("#ownerPassword").value;
    if (!password) { setOwnerMessage("등록 비밀번호를 입력해 주세요."); return; }
    detailDialog.close();
    openEditForm(item, password);
  });
  document.querySelector("#deleteCoordButton").addEventListener("click", async () => {
    const password = document.querySelector("#ownerPassword").value;
    if (!password) { setOwnerMessage("등록 비밀번호를 입력해 주세요."); return; }
    if (!confirm("이 코디를 삭제할까요? 삭제 후에는 복구할 수 없습니다.")) return;
    const data = new FormData();
    data.append("action","delete"); data.append("id",item.id); data.append("password",password);
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
  registerForm.elements.front.required = !isEdit;
  registerForm.elements.back.required = !isEdit;
}
function openCreateForm() {
  currentEditId = null;
  registerForm.reset();
  resetFileRequirements(false);
  formMessage.textContent = "";
  registerDialog.querySelector(".eyebrow").textContent = "ADD YOUR COORD";
  registerDialog.querySelector("h2").textContent = "코디 등록하기";
  registerForm.querySelector('button[type="submit"]').textContent = "코디 등록하기";
  registerDialog.showModal();
}
function openEditForm(item, password) {
  currentEditId = item.id;
  registerForm.reset();
  registerForm.elements.nameKo.value = item.name_ko || "";
  registerForm.elements.nameJa.value = item.name_ja || "";
  registerForm.elements.tag.value = item.tag || "";
  registerForm.elements.xId.value = item.x_id || "";
  registerForm.elements.displayName.value = item.display_name || "";
  registerForm.elements.myCharacter.value = item.my_character || "";
  registerForm.elements.characterOwner.value = item.character_owner || "";
  registerForm.elements.password.value = password;
  resetFileRequirements(true);
  formMessage.textContent = "사진을 선택하지 않으면 기존 이미지를 유지합니다.";
  registerDialog.querySelector(".eyebrow").textContent = "EDIT YOUR COORD";
  registerDialog.querySelector("h2").textContent = "코디 수정하기";
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
  if (!currentEditId && (!front?.size || !back?.size)) { formMessage.textContent = "앞면과 뒷면 이미지를 모두 선택해 주세요."; return; }
  if (!validateImage(front) || !validateImage(back)) { formMessage.textContent = "JPG, PNG, WEBP, GIF 이미지를 각각 5MB 이하로 선택해 주세요."; return; }
  if (!String(data.get("nameKo")||"").trim() && !String(data.get("nameJa")||"").trim()) { formMessage.textContent = "한국어 또는 일본어 코디명을 하나 이상 입력해 주세요."; return; }
  if (String(data.get("password")||"").length < 8) { formMessage.textContent = "비밀번호는 8자 이상 입력해 주세요."; return; }
  const payload = new FormData();
  payload.append("action", currentEditId ? "update" : "create");
  if (currentEditId) payload.append("id", currentEditId);
  payload.append("password", String(data.get("password")||""));
  payload.append("name_ko", String(data.get("nameKo")||"").trim());
  payload.append("name_ja", String(data.get("nameJa")||"").trim());
  payload.append("tag", String(data.get("tag")||""));
  payload.append("x_id", String(data.get("xId")||"").trim());
  payload.append("display_name", String(data.get("displayName")||"").trim());
  payload.append("my_character", String(data.get("myCharacter")||"").trim());
  payload.append("character_owner", String(data.get("characterOwner")||"").trim());
  if (front?.size) payload.append("front", front);
  if (back?.size) payload.append("back", back);
  const submit = registerForm.querySelector('button[type="submit"]');
  submit.disabled = true;
  formMessage.textContent = currentEditId ? "코디 수정 중…" : "이미지와 코디 정보를 저장 중…";
  const result = await callFunction(payload);
  submit.disabled = false;
  if (!result.ok) { formMessage.textContent = result.error || "저장하지 못했습니다."; return; }
  registerDialog.close();
  await loadCoords();
});
document.querySelector("#openRegister").addEventListener("click", openCreateForm);
gallery.addEventListener("click", e => { const card=e.target.closest("[data-id]"); if(card) openDetail(card.dataset.id); });
gallery.addEventListener("keydown", e => { if((e.key==="Enter"||e.key===" ") && e.target.matches("[data-id]")){e.preventDefault();openDetail(e.target.dataset.id);} });
[searchInput,tagFilter,sortFilter].forEach(el=>el.addEventListener("input",render));
document.querySelectorAll("[data-close]").forEach(btn=>btn.addEventListener("click",()=>document.getElementById(btn.dataset.close).close()));
loadCoords();
