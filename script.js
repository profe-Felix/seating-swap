// Seating Swapper with Layouts + Editor

const state = {
  pics: new Map(),        // name(lower) -> File or URL string
  rows: [],               // groups rows of names
  groupsFileName: "Class1.txt",
  picsFolder: "pics",
  layout: null,           // { name, width, height, slots:[{id,x,y,w,h,r}] }
  layoutUrl: null,
  selected: [],
  urls: new Map(),        // objectURLs for Files
  scale: 1,               // stage scaling to fit container
  editMode: false,
};

const $ = s => document.querySelector(s);
const $$ = s => Array.from(document.querySelectorAll(s));

const groupsInput = $("#groupsInput");
const picsInput = $("#picsInput");
const layoutInput = $("#layoutInput");
const renderBtn = $("#renderBtn");
const clearBtn = $("#clearBtn");
const exportGroupsBtn = $("#exportGroupsBtn");
const exportLayoutBtn = $("#exportLayoutBtn");
const editToggle = $("#editToggle");
const stageWrap = $("#stageWrap");
const stage = $("#stage");
const statusEl = $("#status");

function setStatus(msg){ statusEl.textContent = msg; }
function normalizeBaseName(fn){ const i=fn.lastIndexOf("."); return (i>=0?fn.slice(0,i):fn).trim().toLowerCase(); }
function rowsToText(rows){ return rows.map(a=>a.join(",")).join("\n"); }

function getParams(){
  const u = new URL(location.href);
  return {
    group: u.searchParams.get("group") || "groups/Class1.txt",
    pics:  u.searchParams.get("pics") || "pics",
    layout: u.searchParams.get("layout") || "layout/class1Tables.json",
  };
}

async function urlExists(url){
  try{
    const res = await fetch(url, { method:"HEAD", cache:"no-store" });
    return res.ok;
  }catch{ return false; }
}

function buildPicsMapFromFiles(files){
  const map = new Map();
  const score = n => n.endsWith(".jpg")?3 : n.endsWith(".jpeg")?2 : n.endsWith(".png")?1 : 0;
  for(const f of files){
    const base = normalizeBaseName(f.name);
    const prev = map.get(base);
    if(!prev || score(f.name.toLowerCase()) > score(prev.name.toLowerCase())) map.set(base, f);
  }
  return map;
}

function parseGroupsTxt(txt){
  const lines = txt.split(/\r?\n/).map(x=>x.trim()).filter(Boolean);
  return lines.map(ln => ln.split(",").map(s=>s.trim()).filter(Boolean));
}

// ------- Autoload -------

async function autoload(){
  const { group, pics, layout } = getParams();
  state.picsFolder = pics;
  state.layoutUrl = layout;

  try{
    const gRes = await fetch(group, { cache: "no-store" });
    if(!gRes.ok) throw new Error(`groups: ${group}`);
    const gTxt = await gRes.text();
    state.groupsFileName = group.split("/").pop() || "Class1.txt";
    state.rows = parseGroupsTxt(gTxt);
    setStatus(`Loaded groups (${state.rows.length} row(s)) from ${group}`);
  }catch(e){
    setStatus(`Autoload groups failed: ${e.message}. You can choose a file manually.`);
  }

  // Pics URL map
  try{
    const urlMap = new Map();
    for(const row of state.rows){
      for(const name of row){
        const base = name.trim();
        const cands = [
          `${pics}/${encodeURIComponent(base)}.jpg`,
          `${pics}/${encodeURIComponent(base)}.jpeg`,
          `${pics}/${encodeURIComponent(base)}.png`,
        ];
        const found = [];
        for(const u of cands){
          // eslint-disable-next-line no-await-in-loop
          if(await urlExists(u)) found.push(u);
        }
        if(found.length){
          // prioritize jpg > jpeg > png
          found.sort((a,b)=> (b.endsWith(".jpg")?3:b.endsWith(".jpeg")?2:1) - (a.endsWith(".jpg")?3:a.endsWith(".jpeg")?2:1));
          urlMap.set(base.toLowerCase(), found[0]);
        }
      }
    }
    // merge
    for(const [k,v] of urlMap.entries()) state.pics.set(k,v);
  }catch(e){
    setStatus(`Autoload pics failed. You can choose pictures manually.`);
  }

  if(state.layoutUrl){
    await loadLayoutFromUrl(state.layoutUrl);
  }else{
    state.layout = null;
  }
}

async function loadLayoutFromUrl(url){
  try{
    const res = await fetch(url, { cache: "no-store" });
    if(!res.ok) throw new Error(url);
    state.layout = await res.json();
    setStatus(`Loaded layout: ${url}`);
  }catch(e){
    setStatus(`Autoload layout failed: ${e.message}. You can load a JSON manually or render grid.`);
    state.layout = null;
  }
}

// ------- Rendering -------

function clearStage(){
  for(const u of state.urls.values()) URL.revokeObjectURL(u);
  state.urls.clear();
  stage.innerHTML = "";
  state.selected = [];
  exportGroupsBtn.disabled = state.rows.length===0;
  exportLayoutBtn.disabled = !state.layout;
}

function computeScale(w,h){
  const pad = 20;
  const maxW = stageWrap.clientWidth - pad;
  const maxH = Math.max(stageWrap.clientHeight, 400) - pad;
  const sx = maxW / w;
  const sy = maxH / h;
  return Math.min(1, sx, sy);
}

function render(){
  clearStage();

  const items = flattenStudents();
  if(state.layout){
    // Use layout slots
    const { width, height, slots=[] } = state.layout;
    const W = width || 1200, H = height || 800;
    state.scale = computeScale(W,H);
    stage.style.width = (W*state.scale)+"px";
    stage.style.height = (H*state.scale)+"px";
    stage.style.position = "relative";

    // place items -> slots
    const placed = placeIntoSlots(items, slots);
    for(const p of placed){
      const seat = makeSeatNode(p.slot, p.student);
      stage.appendChild(seat);
    }
  }else{
    // fallback grid (auto)
    const cols = Math.min(8, Math.max(3, Math.ceil(Math.sqrt(items.length))));
    const size = 120;
    const gap = 12;
    const rows = Math.ceil(items.length/cols);
    const W = cols*size + (cols-1)*gap + 24;
    const H = rows*size + (rows-1)*gap + 24;
    state.scale = computeScale(W,H);
    stage.style.width = (W*state.scale)+"px";
    stage.style.height = (H*state.scale)+"px";

    items.forEach((student, i)=>{
      const r = Math.floor(i/cols);
      const c = i%cols;
      const slot = { id: `S${i+1}`, x: 12 + c*(size+gap), y: 12 + r*(size+gap), w: size, h: size, r: 0 };
      const seat = makeSeatNode(slot, student);
      stage.appendChild(seat);
    });
  }

  setStatus(`Rendered ${items.length} seat(s). ${state.layout? "Layout: "+(state.layout.name||"custom") : "Auto-grid"}. Click two seats to swap.`);
}

function flattenStudents(){
  const arr = [];
  state.rows.forEach(row => row.forEach(name => {
    const key = name.trim().toLowerCase();
    arr.push({ name, key });
  }));
  return arr;
}

function placeIntoSlots(students, slots){
  // 1) by id matches first
  const idMap = new Map(slots.map(s => [String(s.id).trim().toLowerCase(), s]));
  const used = new Set();
  const placed = [];
  students.forEach(stu => {
    const slot = idMap.get(stu.name.trim().toLowerCase());
    if(slot){
      placed.push({ student: stu, slot });
      used.add(slot);
    }
  });
  // 2) sequential fill remaining
  let i=0;
  for(const slot of slots){
    if(used.has(slot)) continue;
    if(i >= students.length) break;
    while(i<students.length && placed.some(p => p.student===students[i])) i++;
    if(i>=students.length) break;
    placed.push({ student: students[i], slot });
    i++;
  }
  return placed;
}

function makeSeatNode(slot, student){
  const seat = document.createElement("div");
  seat.className = "seat";
  seat.dataset.id = slot.id ?? "";
  seat.dataset.name = student.name;
  seat.dataset.x = slot.x; seat.dataset.y = slot.y;
  seat.dataset.w = slot.w; seat.dataset.h = slot.h;
  seat.dataset.r = slot.r || 0;

  const s = state.scale;
  seat.style.left = (slot.x*s)+"px";
  seat.style.top = (slot.y*s)+"px";
  seat.style.width = (slot.w*s)+"px";
  seat.style.height = (slot.h*s)+"px";
  seat.style.transform = `rotate(${slot.r||0}deg)`;

  const img = document.createElement("div");
  img.className = "img";

  const source = state.pics.get(student.key) || null;
  if(typeof source === "string"){
    img.style.backgroundImage = `url("${source}")`;
  }else if(source){ // File
    const url = URL.createObjectURL(source);
    state.urls.set(student.key, url);
    img.style.backgroundImage = `url("${url}")`;
  }else{
    img.style.background = "repeating-conic-gradient(#f0f0f0 0 25%, #fff 0 50%) 50% / 20px 20px";
  }

  const nm = document.createElement("div");
  nm.className = "name";
  nm.textContent = student.name;

  const idchip = document.createElement("div");
  idchip.className = "id";
  idchip.textContent = slot.id ?? "";

  const info = document.createElement("div");
  info.className = "info";
  info.textContent = `${Math.round(slot.x)},${Math.round(slot.y)} ${Math.round(slot.w)}×${Math.round(slot.h)} r${slot.r||0}`;
  info.style.display = "none";

  seat.appendChild(img);
  seat.appendChild(nm);
  seat.appendChild(idchip);
  seat.appendChild(info);

  seat.addEventListener("click", onSeatClick);

  if(state.editMode){
    seat.classList.add("editable");
    addEditGrips(seat);
  }
  return seat;
}

// ------- Selection + swap -------
function onSeatClick(e){
  if(state.editMode) return;
  const seat = e.currentTarget;
  const all = $$(".seat");
  const idx = all.indexOf(seat);

  if(!state.selected.includes(idx)) state.selected.push(idx);
  all.forEach(n => n.classList.remove("selectA","selectB"));
  if(state.selected[0]!=null) all[state.selected[0]].classList.add("selectA");
  if(state.selected[1]!=null) all[state.selected[1]].classList.add("selectB");

  if(state.selected.length === 2){
    doSwap(state.selected[0], state.selected[1]);
    state.selected = [];
  }
}

function doSwap(iA, iB){
  const flat = [];
  state.rows.forEach((row,r)=> row.forEach((_,c)=> flat.push([r,c])) );
  const [rA,cA] = flat[iA] || [-1,-1];
  const [rB,cB] = flat[iB] || [-1,-1];
  if(rA<0 || rB<0) return;
  const tmp = state.rows[rA][cA];
  state.rows[rA][cA] = state.rows[rB][cB];
  state.rows[rB][cB] = tmp;
  render();
}

// ------- Editor -------
function addEditGrips(seat){
  const br = document.createElement("div");
  br.className = "grip br";
  const rot = document.createElement("div");
  rot.className = "grip rot";

  seat.appendChild(br);
  seat.appendChild(rot);

  seat.querySelector(".info").style.display = "block";

  // Drag move
  let moving=false, startX=0, startY=0, ox=0, oy=0;
  seat.addEventListener("pointerdown", e=>{
    if(e.target.classList.contains("grip")) return;
    moving = true; seat.setPointerCapture(e.pointerId);
    startX = e.clientX; startY = e.clientY;
    ox = parseFloat(seat.dataset.x)||0;
    oy = parseFloat(seat.dataset.y)||0;
  });
  seat.addEventListener("pointermove", e=>{
    if(!moving) return;
    const dx = (e.clientX - startX) / state.scale;
    const dy = (e.clientY - startY) / state.scale;
    const nx = ox + dx, ny = oy + dy;
    seat.dataset.x = nx; seat.dataset.y = ny;
    seat.style.left = (nx*state.scale)+"px";
    seat.style.top = (ny*state.scale)+"px";
    seat.querySelector(".info").textContent = `${Math.round(nx)},${Math.round(ny)} ${Math.round(parseFloat(seat.dataset.w))}×${Math.round(parseFloat(seat.dataset.h))} r${seat.dataset.r||0}`;
  });
  seat.addEventListener("pointerup", e=>{ moving=false; seat.releasePointerCapture(e.pointerId); });

  // Resize
  let resizing=false, rw=0, rh=0, sx=0, sy=0;
  br.addEventListener("pointerdown", e=>{
    e.stopPropagation();
    resizing=true; br.setPointerCapture(e.pointerId);
    sx = e.clientX; sy = e.clientY;
    rw = parseFloat(seat.dataset.w)||100;
    rh = parseFloat(seat.dataset.h)||100;
  });
  br.addEventListener("pointermove", e=>{
    if(!resizing) return;
    const dx = (e.clientX - sx) / state.scale;
    const dy = (e.clientY - sy) / state.scale;
    const nw = Math.max(40, rw + dx);
    const nh = Math.max(40, rh + dy);
    seat.dataset.w = nw; seat.dataset.h = nh;
    seat.style.width = (nw*state.scale)+"px";
    seat.style.height = (nh*state.scale)+"px";
    seat.querySelector(".info").textContent = `${Math.round(parseFloat(seat.dataset.x))},${Math.round(parseFloat(seat.dataset.y))} ${Math.round(nw)}×${Math.round(nh)} r${seat.dataset.r||0}`;
  });
  br.addEventListener("pointerup", e=>{ resizing=false; br.releasePointerCapture(e.pointerId); });

  // Rotate
  let rotating=false, cx=0, cy=0, startA=0, r0=0;
  rot.addEventListener("pointerdown", e=>{
    e.stopPropagation();
    rotating=true; rot.setPointerCapture(e.pointerId);
    const seatRect = seat.getBoundingClientRect();
    cx = seatRect.left + seatRect.width/2;
    cy = seatRect.top + seatRect.height/2;
    const dx = e.clientX - cx;
    const dy = e.clientY - cy;
    startA = Math.atan2(dy, dx);
    r0 = (parseFloat(seat.dataset.r)||0) * Math.PI/180;
  });
  rot.addEventListener("pointermove", e=>{
    if(!rotating) return;
    const dx = e.clientX - cx;
    const dy = e.clientY - cy;
    const a = Math.atan2(dy, dx);
    const deg = ((a - startA) + r0) * 180/Math.PI;
    seat.dataset.r = deg;
    seat.style.transform = `rotate(${deg}deg)`;
    seat.querySelector(".info").textContent = `${Math.round(parseFloat(seat.dataset.x))},${Math.round(parseFloat(seat.dataset.y))} ${Math.round(parseFloat(seat.dataset.w))}×${Math.round(parseFloat(seat.dataset.h))} r${deg.toFixed(0)}`;
  });
  rot.addEventListener("pointerup", e=>{ rotating=false; rot.releasePointerCapture(e.pointerId); });
}

function collectLayoutFromStage(){
  const seats = $$(".seat");
  if(seats.length===0) return null;
  const base = state.layout || { width: 1200, height: 800, name: "custom" };
  const slots = seats.map(s => ({
    id: s.dataset.id || "",
    x: parseFloat(s.dataset.x)||0,
    y: parseFloat(s.dataset.y)||0,
    w: parseFloat(s.dataset.w)||100,
    h: parseFloat(s.dataset.h)||100,
    r: parseFloat(s.dataset.r)||0
  }));
  return { name: base.name || "custom", width: base.width, height: base.height, slots };
}

// Events
groupsInput.addEventListener("change", async e=>{
  const f = e.target.files?.[0];
  if(!f) return;
  state.groupsFileName = f.name;
  const txt = await f.text();
  state.rows = parseGroupsTxt(txt);
  setStatus(`Loaded groups (manual): ${state.rows.length} row(s).`);
});

picsInput.addEventListener("change", e=>{
  const files = e.target.files;
  if(!files || files.length===0) return;
  const map = buildPicsMapFromFiles(files);
  for(const [k,v] of map.entries()) state.pics.set(k,v);
  setStatus(`Loaded ${map.size} pics (manual).`);
});

layoutInput.addEventListener("change", async e=>{
  const f = e.target.files?.[0];
  if(!f) return;
  try{
    const json = JSON.parse(await f.text());
    state.layout = json;
    setStatus(`Loaded layout (manual): ${json.name || "(unnamed)"}`);
  }catch{
    setStatus("Layout JSON parse error.");
  }
});

renderBtn.addEventListener("click", render);
clearBtn.addEventListener("click", ()=>{ stage.innerHTML=""; setStatus("Cleared stage."); });
exportGroupsBtn.addEventListener("click", ()=>{
  if(!state.rows.length) return;
  const txt = rowsToText(state.rows);
  const blob = new Blob([txt], {type:"text/plain;charset=utf-8"});
  const base = state.groupsFileName.replace(/\.txt$/i, "");
  const a = document.createElement("a");
  const url = URL.createObjectURL(blob);
  a.href = url; a.download = `${base}-updated.txt`; document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
  setStatus(`Exported ${base}-updated.txt`);
});
exportLayoutBtn.addEventListener("click", ()=>{
  const json = collectLayoutFromStage();
  if(!json){ setStatus("Nothing to export."); return; }
  const blob = new Blob([JSON.stringify(json, null, 2)], {type:"application/json"});
  const a = document.createElement("a");
  const url = URL.createObjectURL(blob);
  a.href = url; a.download = `${(json.name||"layout")}.json`; document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
  setStatus(`Exported ${json.name||"layout"}.json`);
});
editToggle.addEventListener("change", e=>{
  state.editMode = !!e.target.checked;
  render();
});
window.addEventListener("resize", ()=>{ if(!state.layout) return; render(); });

// Startup
(async function(){
  await autoload();
  render();
})();