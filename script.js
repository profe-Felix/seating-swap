// Autoload-enabled version
const state = {
  pics: new Map(),    // name(lowercase) -> File (from manual) OR URL string (from autoload)
  rows: [],
  selected: [],
  urls: new Map(),    // object URLs for manual Files
  groupsFileName: "Class1.txt",
  picsFolder: "pics",
  autoloaded: false,
};

const $ = sel => document.querySelector(sel);
const $$ = sel => Array.from(document.querySelectorAll(sel));

const picsInput = $("#picsInput");
const groupsInput = $("#groupsInput");
const fillBtn = $("#fillBtn");
const clearBtn = $("#clearBtn");
const exportBtn = $("#exportBtn");
const grid = $("#grid");
const statusEl = $("#status");

function setStatus(msg){ statusEl.textContent = msg; }

function normalizeBaseName(filename){
  const dot = filename.lastIndexOf(".");
  const base = dot >= 0 ? filename.slice(0, dot) : filename;
  return base.trim().toLowerCase();
}

function pickPreferredURL(urls){
  // URLs are already filtered by exists check. Prioritize by extension.
  const score = u => {
    const n = u.toLowerCase();
    if (n.endsWith(".jpg")) return 3;
    if (n.endsWith(".jpeg")) return 2;
    if (n.endsWith(".png")) return 1;
    return 0;
  };
  return urls.sort((a,b) => score(b)-score(a))[0] || null;
}

function buildPicsMapFromFiles(fileList){
  // like before, but Files
  const map = new Map();
  const score = f => {
    const n = f.name.toLowerCase();
    if (n.endsWith(".jpg")) return 3;
    if (n.endsWith(".jpeg")) return 2;
    if (n.endsWith(".png")) return 1;
    return 0;
  };
  for(const f of fileList){
    const base = normalizeBaseName(f.name);
    const prev = map.get(base);
    if(!prev || score(f) > score(prev)) map.set(base, f);
  }
  return map;
}

function parseGroupsTxt(text){
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  return lines.map(ln => ln.split(",").map(s => s.trim()).filter(Boolean));
}

function rowsToText(rows){
  return rows.map(arr => arr.join(",")).join("\n");
}

function revokeURLs(){
  for(const url of state.urls.values()) URL.revokeObjectURL(url);
  state.urls.clear();
}

function clearGrid(){
  revokeURLs();
  grid.innerHTML = "";
  state.selected = [];
}

async function urlExists(url){
  try{
    const res = await fetch(url, { method: "HEAD", cache: "no-store" });
    return res.ok;
  }catch(e){
    return false;
  }
}

function getParams(){
  const u = new URL(location.href);
  const group = u.searchParams.get("group") || "groups/Class1.txt";
  const pics = u.searchParams.get("pics") || "pics";
  return { group, pics };
}

async function autoload(){
  const { group, pics } = getParams();
  state.picsFolder = pics;
  state.groupsFileName = group.split("/").pop() || "Class1.txt";

  try{
    const res = await fetch(group, { cache: "no-store" });
    if(!res.ok) throw new Error(`Failed to load ${group}`);
    const txt = await res.text();
    state.rows = parseGroupsTxt(txt);
    setStatus(`Autoload: parsed ${state.rows.length} row(s) from ${group}`);

    // Build URL map per name by trying jpg/jpeg/png in pics folder
    const urlMap = new Map();
    for(const row of state.rows){
      for(const name of row){
        const base = name.trim();
        const candidates = [
          `${pics}/${encodeURIComponent(base)}.jpg`,
          `${pics}/${encodeURIComponent(base)}.jpeg`,
          `${pics}/${encodeURIComponent(base)}.png`,
        ];
        const existing = [];
        for(const u of candidates){
          // eslint-disable-next-line no-await-in-loop
          if(await urlExists(u)) existing.push(u);
        }
        if(existing.length){
          urlMap.set(base.toLowerCase(), pickPreferredURL(existing));
        }
      }
    }
    // Merge into state.pics as URL strings (will be used directly)
    state.pics = new Map([...state.pics, ...urlMap]);
    state.autoloaded = true;
  }catch(err){
    setStatus(`Autoload failed: ${err.message}. You can use the manual pickers.`);
  }
}

function renderGrid(){
  clearGrid();
  const items = [];
  state.rows.forEach((arr, r) => {
    arr.forEach((name, c) => {
      const key = name.trim().toLowerCase();
      const val = state.pics.get(key) || null; // File OR URL string
      items.push({ name, val, r, c });
    });
  });

  items.forEach((item, idx) => {
    const card = document.createElement("div");
    card.className = "square";
    card.dataset.index = String(idx);

    const nameEl = document.createElement("div");
    nameEl.className = "name";
    nameEl.textContent = item.name;

    const idxChip = document.createElement("div");
    idxChip.className = "idx";
    idxChip.textContent = String(idx + 1);

    const img = document.createElement("div");
    img.className = "img";

    if(item.val){
      if (typeof item.val === "string"){
        // URL
        img.style.backgroundImage = `url("${item.val}")`;
      } else {
        // File
        const url = URL.createObjectURL(item.val);
        state.urls.set(idx, url);
        img.style.backgroundImage = `url("${url}")`;
      }
    } else {
      img.style.background = "repeating-conic-gradient(#f0f0f0 0 25%, #fff 0 50%) 50% / 20px 20px";
      nameEl.style.background = "rgba(255,255,255,.92)";
      nameEl.style.color = "#b91c1c";
      nameEl.title = item.name + " — (No image found)";
    }

    card.appendChild(img);
    card.appendChild(idxChip);
    card.appendChild(nameEl);
    card.addEventListener("click", onSquareClick);
    grid.appendChild(card);
  });

  exportBtn.disabled = state.rows.length === 0;
  setStatus(`Rendered ${items.length} square(s). Click two squares to swap.`);
}

function flatIndexToRowCol(idx){
  let count = 0;
  for(let r=0;r<state.rows.length;r++){
    for(let c=0;c<state.rows[r].length;c++){
      if(count===idx) return [r,c];
      count++;
    }
  }
  return [-1,-1];
}

function onSquareClick(e){
  const card = e.currentTarget;
  const idx = Number(card.dataset.index);

  if(!state.selected.includes(idx)){
    state.selected.push(idx);
  }
  $$(`.square`).forEach(el => el.classList.remove("selectA","selectB"));
  if(state.selected[0]!=null) grid.children[state.selected[0]]?.classList.add("selectA");
  if(state.selected[1]!=null) grid.children[state.selected[1]]?.classList.add("selectB");

  if(state.selected.length===2){
    doSwap(state.selected[0], state.selected[1]);
    state.selected = [];
  }
}

function doSwap(a,b){
  const [rA,cA] = flatIndexToRowCol(a);
  const [rB,cB] = flatIndexToRowCol(b);
  if(rA<0||rB<0) return;

  const nameA = state.rows[rA][cA];
  const nameB = state.rows[rB][cB];
  state.rows[rA][cA] = nameB;
  state.rows[rB][cB] = nameA;

  renderGrid();
}

function onExport(){
  if(!state.rows.length) return;
  const txt = rowsToText(state.rows);
  const blob = new Blob([txt], {type:"text/plain;charset=utf-8"});
  const base = state.groupsFileName.replace(/\.txt$/i,"");
  const filename = `${base}-updated.txt`;
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  setStatus(`Exported ${filename}.`);
}

// Manual overrides
picsInput.addEventListener("change", (e)=>{
  const files = e.target.files;
  if(!files || files.length===0){ setStatus("No pictures selected."); return; }
  const map = buildPicsMapFromFiles(files);
  // Override / extend existing
  for(const [k,v] of map.entries()) state.pics.set(k,v);
  setStatus(`Loaded ${map.size} picture(s) from manual selection.`);
});
groupsInput.addEventListener("change", async (e)=>{
  const file = e.target.files?.[0];
  if(!file){ setStatus("No groups file selected."); return; }
  state.groupsFileName = file.name || "Class1.txt";
  const txt = await file.text();
  state.rows = parseGroupsTxt(txt);
  setStatus(`Parsed groups (manual): ${state.rows.length} row(s).`);
});

fillBtn.addEventListener("click", renderGrid);
clearBtn.addEventListener("click", ()=>{ clearGrid(); setStatus("Cleared."); });
exportBtn.addEventListener("click", onExport);

// Kick off autoload, then render
(async function(){
  await autoload();
  if(state.rows.length) renderGrid();
})();