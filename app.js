const STORAGE_KEY = "aipri-coord-catalog-v1";
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

let coords = readCoords();

function readCoords() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]"); }
  catch { return []; }
}
function saveCoords() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(coords));
}
function escapeHtml(value = "") {
  return String(value).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
}
function bestName(item) { return item.nameKo || item.nameJa || "이름 없는 코디"; }
function filteredCoords() {
  const q = searchInput.value.trim().toLocaleLowerCase();
  let list = coords.filter(item => {
    const haystack = [item.nameKo,item.nameJa,item.xId,item.displayName,item.myCharacter,item.characterOwner,item.tag].join(" ").toLocaleLowerCase();
    return (!q || haystack.includes(q)) && (!tagFilter.value || item.tag === tagFilter.value);
  });
  if (sortFilter.value === "name") list.sort((a,b) => bestName(a).localeCompare(bestName(b),"ko"));
  else list.sort((a,b) => b.createdAt - a.createdAt);
  return list;
}
function render() {
  const list = filteredCoords();
  resultCount.textContent = list.length;
  emptyState.hidden = list.length !== 0;
  gallery.innerHTML = list.map(item => `
    <article class="coord-card" tabindex="0" role="button" data-id="${item.id}" aria-label="${escapeHtml(bestName(item))} 상세 보기">
      <div class="card-images">
        ${item.front ? `<img src="${item.front}" alt="앞면 이미지" loading="lazy">` : '<div class="placeholder">✧</div>'}
        ${item.back ? `<img src="${item.back}" alt="뒷면 이미지" loading="lazy">` : '<div class="placeholder">✦</div>'}
      </div>
      <div class="card-body"><span class="tag">${escapeHtml(item.tag)}</span><p class="card-title">${escapeHtml(bestName(item))}</p><p class="card-subtitle">${escapeHtml(item.myCharacter || item.displayName || "등록자 정보 없음")}</p><div class="card-meta">${escapeHtml(item.xId || "X ID 미입력")}</div></div>
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
    const ko = similarity(item.nameKo, other.nameKo);
    const ja = similarity(item.nameJa, other.nameJa);
    const sameLength = [item.nameKo && other.nameKo && item.nameKo.length===other.nameKo.length, item.nameJa && other.nameJa && item.nameJa.length===other.nameJa.length].some(Boolean);
    return {...other, score:Math.max(ko,ja), sameLength};
  }).filter(x => x.score >= .35 || x.sameLength).sort((a,b)=>(b.score+(b.sameLength?.08:0))-(a.score+(a.sameLength?.08:0))).slice(0,4);
}
function openDetail(id) {
  const item = coords.find(x => x.id === id);
  if (!item) return;
  const similar = findSimilar(item);
  document.querySelector("#detailContent").innerHTML = `
    <p class="eyebrow">COORD DETAIL</p><h2>${escapeHtml(bestName(item))}</h2>
    <div class="detail-images">${item.front?'<img src="'+item.front+'" alt="앞면">':'<div class="placeholder">앞면 이미지 없음</div>'}${item.back?'<img src="'+item.back+'" alt="뒷면">':'<div class="placeholder">뒷면 이미지 없음</div>'}</div>
    <div class="detail-info">
      <p><strong>일본어 이름</strong><br>${escapeHtml(item.nameJa || "—")}</p><p><strong>타입</strong><br>${escapeHtml(item.tag || "—")}</p>
      <p><strong>등록자</strong><br>${escapeHtml(item.displayName || "—")} ${escapeHtml(item.xId || "")}</p><p><strong>마이캐릭터</strong><br>${escapeHtml(item.myCharacter || "—")}</p>
      ${item.characterOwner?'<p><strong>캐릭터 관련 정보</strong><br>'+escapeHtml(item.characterOwner)+'</p>':""}
    </div>
    <div class="recommendations"><h3>✧ 이로치 후보 추천</h3><p>${similar.length ? similar.map(x=>escapeHtml(bestName(x))+" ("+Math.round(x.score*100)+"% 유사)").join(" · ") : "비교할 만한 코디가 아직 없어요."}<br><br>이 추천은 이름의 길이와 문자열 유사도를 바탕으로 한 후보이며, 실제 이로치 여부를 확정하지 않아요.</p></div>
    <p class="form-note">수정/삭제는 공동 데이터베이스와 서버 측 비밀번호 검증을 연결한 뒤 활성화할 예정입니다.</p>`;
  detailDialog.showModal();
}
gallery.addEventListener("click", e => { const card=e.target.closest("[data-id]"); if(card) openDetail(card.dataset.id); });
gallery.addEventListener("keydown", e => { if((e.key==="Enter"||e.key===" ") && e.target.matches("[data-id]")){e.preventDefault();openDetail(e.target.dataset.id);} });
[searchInput,tagFilter,sortFilter].forEach(el=>el.addEventListener("input",render));
document.querySelector("#openRegister").addEventListener("click",()=>{formMessage.textContent="";registerDialog.showModal();});
document.querySelectorAll("[data-close]").forEach(btn=>btn.addEventListener("click",()=>document.getElementById(btn.dataset.close).close()));
registerForm.addEventListener("submit", async e => {
  e.preventDefault();
  const data = new FormData(registerForm);
  const frontFile = data.get("front"), backFile = data.get("back");
  if(!frontFile?.size || !backFile?.size){formMessage.textContent="앞면과 뒷면 이미지를 모두 선택해 주세요.";return;}
  if(frontFile.size>5*1024*1024 || backFile.size>5*1024*1024){formMessage.textContent="이미지는 각각 5MB 이하로 선택해 주세요.";return;}
  // Demo mode only: browser-local storage is not shared across users.
  const toDataUrl = file => new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsDataURL(file);});
  formMessage.textContent="이미지를 준비하고 있어요…";
  try {
    const item = {
      id: crypto.randomUUID(), createdAt: Date.now(),
      nameKo:String(data.get("nameKo")||"").trim(), nameJa:String(data.get("nameJa")||"").trim(),
      tag:String(data.get("tag")||""), xId:String(data.get("xId")||"").trim(),
      displayName:String(data.get("displayName")||"").trim(), myCharacter:String(data.get("myCharacter")||"").trim(),
      characterOwner:String(data.get("characterOwner")||"").trim(),
      front:await toDataUrl(frontFile), back:await toDataUrl(backFile)
    };
    if(!item.nameKo && !item.nameJa){formMessage.textContent="한국어 또는 일본어 코디명을 하나 이상 입력해 주세요.";return;}
    coords.push(item);
    try { saveCoords(); } catch { coords.pop(); formMessage.textContent="브라우저 저장 공간이 부족해요. 이미지 크기를 줄여 다시 시도해 주세요.";return; }
    registerForm.reset();registerDialog.close();render();
  } catch { formMessage.textContent="이미지를 읽지 못했어요. 다시 시도해 주세요."; }
});
render();
