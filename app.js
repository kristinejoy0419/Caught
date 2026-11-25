// Caught in PJs: votes, matchups and catches stored in a Google Sheet (see apps-script/Code.gs).
(() => {
  const $ = id => document.getElementById(id);
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch {} },
    del(k) { try { localStorage.removeItem(k); } catch {} },
  };

  const cfg = window.CAUGHT_CONFIG || {};
  const API = /^https:\/\/script\.google\.com\//.test(cfg.sheetUrl || "") ? cfg.sheetUrl.trim() : "";
  const sb = API ? true : null; // true once the Sheet is connected

  // Each browser gets a random voter id, so one device = one vote per matchup.
  let voter = store.get("caught.voter");
  if (!voter || !/^[\w-]{8,60}$/.test(voter)) { voter = (crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2) + Date.now()); store.set("caught.voter", voter); }

  // ---------- Sheet API ----------
  async function post(body) {
    try {
      const res = await fetch(API, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" }, // a "simple" request Apps Script accepts cross-origin
        body: JSON.stringify({ ...body, voter }),
      });
      const data = await res.json();
      if (!data.ok) return { error: new Error(data.error || "Not saved") };
      if (Array.isArray(data.players)) apply(data);
      return { data };
    } catch (err) { return { error: err }; }
  }
  // Turn the Sheet's answer into the shapes the page renders.
  function apply(d) {
    S.people = Object.fromEntries(d.players.map(p => [p.id, { id: p.id, name: p.name, photo_url: p.photo, open: p.open !== false }]));
    S.matchups = d.matchups.map(m => ({ id: m.id, a: m.a, b: m.b }));
    const mine = d.mine || {};
    S.votes = [];
    for (const m of d.matchups) for (const side of ["a", "b"]) {
      const n = (+m.votes?.[side] || 0) - (mine[m.id] === side ? 1 : 0);
      for (let i = 0; i < n; i++) S.votes.push({ matchup_id: m.id, voter: "", pick: side });
    }
    for (const [mid, pick] of Object.entries(mine)) S.votes.push({ matchup_id: mid, voter, pick });
    S.results = Object.fromEntries(d.matchups.filter(m => m.catcher).map(m => [m.id, { matchup_id: m.id, catcher: m.catcher }]));
    S.loaded = true;
    renderAll();
  }

  const S = { people: {}, matchups: [], votes: [], results: {}, loaded: false, showAll: false, suggestion: null, adminCode: store.get("caught.admin") };

  // ---------- avatars ----------
  const palettes = [["#ffb199","#ff5c8a"],["#a18cd1","#5b4bc4"],["#84fab0","#2aa198"],["#fbc2eb","#a6c1ee"],["#fddb92","#f6a04d"],["#8fd3f4","#4b8bf5"]];
  function initials(name) {
    let h = 0; for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    const [c1, c2] = palettes[h % palettes.length];
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></linearGradient></defs><rect width="100" height="100" fill="url(#g)"/><text x="50" y="62" text-anchor="middle" font-family="Arial" font-weight="700" font-size="36" fill="#fff">${esc((name[0] || "?").toUpperCase())}</text></svg>`;
    return "data:image/svg+xml;utf8," + encodeURIComponent(svg);
  }
  const safeUrl = u => typeof u === "string" && (/^photos\/[\w.-]+$/.test(u) || /^https:\/\//.test(u)) ? u : null;
  const photo = p => (p && safeUrl(p.photo_url)) || initials(p ? p.name : "?");
  const nameOf = id => S.people[id]?.name || "Someone";
  const img = (p, cls = "av") => `<img class="${cls}" src="${esc(photo(p))}" alt="${esc(p?.name || "")}" data-fallback="${esc(initials(p?.name || "?"))}">`;
  document.addEventListener("error", e => { const t = e.target; if (t.tagName === "IMG" && t.dataset.fallback && t.src !== t.dataset.fallback) t.src = t.dataset.fallback; }, true);

  function gauge(p, has) {
    const r = 38, cx = 46, cy = 46, len = Math.PI * r;
    const d = `M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`;
    return `<svg viewBox="0 0 92 54" aria-hidden="true">
      <path d="${d}" fill="none" stroke="${has ? "var(--b)" : "var(--card-line)"}" stroke-width="7" stroke-linecap="round"/>
      ${has ? `<path d="${d}" fill="none" stroke="var(--a)" stroke-width="7" stroke-linecap="round" stroke-dasharray="${len * p / 100} ${len}"/>` : ""}
    </svg>`;
  }

  // ---------- data ----------
  let inflight = 0; // skip background refreshes while a change is saving
  async function load() {
    if (!sb || inflight) return;
    try {
      const res = await fetch(API + (API.includes("?") ? "&" : "?") + "voter=" + encodeURIComponent(voter), { cache: "no-store" });
      const d = await res.json();
      if (!d.ok || !Array.isArray(d.players)) throw new Error("not ready");
      if (!inflight) apply(d);
    } catch (err) { if (!S.loaded) showError("The board couldn't load. Refresh to try again."); }
  }

  const tally = mid => {
    let a = 0, b = 0;
    for (const v of S.votes) if (v.matchup_id === mid) { if (v.pick === "a") a++; else if (v.pick === "b") b++; }
    return { a, b };
  };
  const myPick = mid => S.votes.find(v => v.matchup_id === mid && v.voter === voter)?.pick;

  function standings() {
    const rows = Object.values(S.people).map(p => ({ p, catches: 0, games: 0 }));
    const by = Object.fromEntries(rows.map(r => [r.p.id, r]));
    for (const m of S.matchups) {
      const res = S.results[m.id]; if (!res) continue;
      if (by[m.a]) by[m.a].games++; if (by[m.b]) by[m.b].games++;
      if (by[res.catcher]) by[res.catcher].catches++;
    }
    return rows.sort((x, y) => y.catches - x.catches || y.games - x.games || x.p.name.localeCompare(y.p.name));
  }

  // ---------- render ----------
  const isOpen = p => p.open !== false;

  function renderBoard() {
    const rows = standings();
    if (!rows.length) { $("board").innerHTML = `<li class="state" style="display:block">No players yet. Add the first person with “+ Add person”.</li>`; $("board-more").hidden = true; return; }
    const shown = S.showAll ? rows : rows.slice(0, 5);
    let rank = 0, prev = null;
    $("board").innerHTML = shown.map((r, i) => {
      if (prev === null || r.catches !== prev) rank = i + 1; prev = r.catches;
      const top = r.catches > 0 && rank <= 3 ? ` r${rank}` : "";
      return `<li class="${top}${isOpen(r.p) ? "" : " closed"}"><span class="rank">${rank}</span>${img(r.p)}<span class="who">${esc(r.p.name)}<span>${r.games} ${r.games === 1 ? "game" : "games"} played</span></span><span class="catches">${r.catches}</span><button class="pill ${isOpen(r.p) ? "open" : "closed"}" data-p="${r.p.id}" type="button" aria-label="${esc(r.p.name)}: ${isOpen(r.p) ? "open to matchups, tap to turn off" : "not open to matchups, tap to turn on"}">${isOpen(r.p) ? "Open" : "Not open"}</button></li>`;
    }).join("");
    $("board-more").hidden = rows.length <= 5;
    $("board-more").textContent = S.showAll ? "Show top 5" : `Show everyone (${rows.length})`;
  }

  function renderFeed() {
    const ms = S.matchups.filter(m => S.people[m.a] && S.people[m.b]);
    if (!ms.length) { $("feed").innerHTML = `<div class="state">No matchups yet. Use “Add matchup” above to put the first pair on the board.</div>`; return; }
    const admin = !!S.adminCode;
    $("feed").innerHTML = ms.map(m => {
      const A = S.people[m.a], B = S.people[m.b];
      const t = tally(m.id), total = t.a + t.b;
      const pa = total ? Math.round(t.a / total * 100) : 0, pb = total ? 100 - pa : 0;
      const pick = myPick(m.id);
      const res = S.results[m.id]?.catcher;
      const resSide = res === m.a ? "a" : res === m.b ? "b" : null;
      const tools = admin ? (resSide
        ? `<span class="admin"><button class="mini" data-act="clear" data-m="${m.id}" type="button">Undo result</button></span>`
        : `<span class="admin"><button class="mini" data-act="catch" data-m="${m.id}" data-p="${m.a}" type="button">${esc(A.name)} caught</button><button class="mini" data-act="catch" data-m="${m.id}" data-p="${m.b}" type="button">${esc(B.name)} caught</button></span>`) : "";
      return `<article class="card ${pick ? "voted" : ""}">
        <div class="versus">
          <div class="side a">${img(A)}<div class="name">${esc(A.name)}</div><div class="pct">${pa}%</div></div>
          <div class="gauge">${gauge(pa, total > 0)}<span class="vs">VS</span></div>
          <div class="side b">${img(B)}<div class="name">${esc(B.name)}</div><div class="pct">${pb}%</div></div>
        </div>
        <div class="bar" role="img" aria-label="${esc(A.name)} ${pa} percent, ${esc(B.name)} ${pb} percent"><i class="a" style="width:${pa}%"></i><i class="b" style="width:${pb}%"></i></div>
        <p class="q">${resSide ? "Final result" : "Who catches the other first?"}</p>
        <div class="two">
          <button class="vote a ${pick === "a" ? "picked" : ""}" data-m="${m.id}" data-side="a" type="button">${pick === "a" ? "✓ " : ""}${esc(A.name)} catches</button>
          <button class="vote b ${pick === "b" ? "picked" : ""}" data-m="${m.id}" data-side="b" type="button">${pick === "b" ? "✓ " : ""}${esc(B.name)} catches</button>
        </div>
        <div class="foot"><span>${total} ${total === 1 ? "vote" : "votes"}</span>${resSide ? `<span class="result ${resSide}">${esc(nameOf(res))} caught ${esc(nameOf(resSide === "a" ? m.b : m.a))}</span>` : ""}${tools}</div>
      </article>`;
    }).join("");
  }

  const pairKey = (x, y) => [x, y].sort().join("|");
  function shuffle() {
    const ids = Object.keys(S.people).filter(id => isOpen(S.people[id]));
    const hint = document.querySelector("#suggest .hint");
    if (hint) hint.textContent = `A random pairing from everyone open to matchups (${ids.length} of ${Object.keys(S.people).length}). Shuffle for another.`;
    const taken = new Set(S.matchups.map(m => pairKey(m.a, m.b)));
    const options = [];
    for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) if (!taken.has(pairKey(ids[i], ids[j]))) options.push([ids[i], ids[j]]);
    const prev = S.suggestion ? pairKey(...S.suggestion) : null;
    const pool = options.length > 1 ? options.filter(o => pairKey(...o) !== prev) : options;
    if (!pool.length) { S.suggestion = null; $("suggest").hidden = true; return; }
    let s = pool[Math.floor(Math.random() * pool.length)];
    if (Math.random() < .5) s = [s[1], s[0]];
    S.suggestion = s;
    $("suggest").hidden = false;
    const [x, y] = s;
    $("pair").innerHTML = `<div class="pa">${img(S.people[x])}<b>${esc(S.people[x].name)}</b></div><span class="vs">VS</span><div class="pb">${img(S.people[y])}<b>${esc(S.people[y].name)}</b></div>`;
  }

  function renderAll() {
    renderBoard(); renderFeed();
    const s = S.suggestion;
    if (!s || !S.people[s[0]] || !S.people[s[1]] || S.matchups.some(m => pairKey(m.a, m.b) === pairKey(...s))) shuffle();
  }

  function note(text, err) { const n = $("note"); n.textContent = text; n.style.color = err ? "var(--danger)" : ""; }
  function showError(t) { $("board").innerHTML = `<li class="state" style="display:block">${esc(t)}</li>`; $("feed").innerHTML = ""; }

  // ---------- actions ----------
  $("feed").addEventListener("click", async e => {
    const v = e.target.closest(".vote");
    if (v && sb) {
      const mid = v.dataset.m, side = v.dataset.side, cur = myPick(mid);
      S.votes = S.votes.filter(x => !(x.matchup_id === mid && x.voter === voter));
      if (cur !== side) S.votes.push({ matchup_id: mid, voter, pick: side });
      renderFeed();
      inflight++;
      const { error } = await post({ action: "vote", matchup: mid, pick: cur === side ? "" : side });
      inflight--;
      if (error) { note("Your vote didn't save. Try again.", true); load(); }
      return;
    }
    const a = e.target.closest(".mini");
    if (a && sb && S.adminCode) {
      const { error } = await post({ action: "result", matchup: a.dataset.m, catcher: a.dataset.act === "catch" ? a.dataset.p : "", code: S.adminCode });
      if (error) { note("That result didn't save. Check the organizer code.", true); load(); }
    }
  });

  $("shuffle").addEventListener("click", shuffle);
  $("add-match").addEventListener("click", async () => {
    if (!S.suggestion) return;
    if (!sb) {
      // Preview mode: show the new card on this screen only.
      const [a, b] = S.suggestion;
      S.matchups.push({ id: "local" + Date.now(), a, b });
      S.suggestion = null; renderAll();
      document.querySelectorAll(".vote").forEach(x => x.disabled = true);
      return;
    }
    const [a, b] = S.suggestion;
    S.suggestion = null;
    const { error } = await post({ action: "matchup", a, b });
    if (error) { note(error.message && error.message !== "Not saved" ? error.message + "." : "The matchup didn't save. Try again.", true); load(); }
  });
  $("board").addEventListener("click", async e => {
    const b = e.target.closest(".pill"); if (!b) return;
    const p = S.people[b.dataset.p]; if (!p) return;
    const next = !isOpen(p);
    p.open = next;
    if (S.suggestion && !next && S.suggestion.includes(p.id)) S.suggestion = null;
    renderBoard(); shuffle();
    if (!sb) { document.querySelectorAll(".vote").forEach(x => x.disabled = true); return; }
    inflight++;
    const { error } = await post({ action: "open", id: p.id, open: next });
    inflight--;
    if (error) { note("That change didn't save. Try again.", true); load(); }
  });
  $("board-more").addEventListener("click", () => { S.showAll = !S.showAll; renderBoard(); });

  // Add person
  let cropped = null;
  const blank = "data:image/gif;base64,R0lGODlhAQABAAAAACw=";
  const setMsg = (t, err) => { const m = $("add-msg"); m.textContent = t; m.classList.toggle("err", !!err); };
  function resetAdd() { $("add-panel").hidden = true; $("add-form").reset(); cropped = null; $("add-preview").src = blank; setMsg("Use a photo where their face is near the middle. It gets cropped to a circle."); }
  $("open-add").hidden = !sb;
  $("open-add").addEventListener("click", () => { $("add-panel").hidden = false; $("add-name").focus(); });
  $("add-cancel").addEventListener("click", resetAdd);
  $("add-photo").addEventListener("change", async e => {
    const f = e.target.files[0]; if (!f) return;
    try {
      const bmp = await createImageBitmap(f, { imageOrientation: "from-image" }).catch(() => createImageBitmap(f));
      const side = Math.min(bmp.width, bmp.height), size = 400;
      const c = document.createElement("canvas"); c.width = c.height = size;
      c.getContext("2d").drawImage(bmp, (bmp.width - side) / 2, (bmp.height - side) / 2, side, side, 0, 0, size, size);
      cropped = await new Promise(r => c.toBlob(r, "image/jpeg", 0.85));
      $("add-preview").src = URL.createObjectURL(cropped);
      setMsg("Photo ready.");
    } catch { cropped = null; setMsg("That photo couldn't be read. Try a JPG or PNG.", true); }
  });
  $("add-form").addEventListener("submit", async e => {
    e.preventDefault();
    const name = $("add-name").value.trim();
    if (!name) { setMsg("Enter a name first.", true); $("add-name").focus(); return; }
    if (Object.values(S.people).some(p => p.name.toLowerCase() === name.toLowerCase())) { setMsg(`${name} is already playing.`, true); return; }
    $("add-save").disabled = true; setMsg("Saving…");
    try {
      let photo = null;
      if (cropped) {
        const dataUrl = await new Promise((ok, fail) => { const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = fail; r.readAsDataURL(cropped); });
        photo = { data: String(dataUrl).split(",")[1], type: "image/jpeg" };
        setMsg("Uploading the photo…");
      }
      inflight++;
      const { error } = await post({ action: "join", name, photo });
      inflight--;
      if (error) throw error;
      resetAdd(); note(`Added ${name}.`);
    } catch (err) { setMsg("Couldn't add them: " + (err?.message || "try again."), true); }
    finally { $("add-save").disabled = false; }
  });

  // Organizer unlock
  function showAdminState() { $("admin-msg").textContent = S.adminCode ? "Unlocked. Use the buttons on each card to record who caught who." : "Unlock to record who caught who."; $("admin-go").textContent = S.adminCode ? "Lock" : "Unlock"; $("admin-code").hidden = !!S.adminCode; }
  $("admin-form").addEventListener("submit", async e => {
    e.preventDefault();
    if (S.adminCode) { S.adminCode = null; store.del("caught.admin"); showAdminState(); renderFeed(); return; }
    const code = $("admin-code").value.trim(); if (!code || !sb) return;
    const { data, error } = await post({ action: "check", code });
    if (error || !data?.valid) { $("admin-msg").textContent = "That code didn't match."; return; }
    S.adminCode = code; store.set("caught.admin", code); $("admin-code").value = ""; showAdminState(); renderFeed();
  });
  if (S.adminCode) $("organizer").open = true;
  showAdminState();

  // ---------- boot ----------
  if (!sb) {
    // Preview mode until config.js is filled in: show the starting board, voting off.
    const seed = [["daniel","Daniel"],["kristine","Kristine"],["theresa","Theresa"],["jg","JG"],["jas","Jas"],["mike","Mike"],["panha","Panha"],["kat","Kat"],["dan","Dan"],["liz","Liz"],["adam","Adam"]];
    S.people = Object.fromEntries(seed.map(([id, name]) => [id, { id, name, photo_url: `photos/${id}.jpg` }]));
    S.matchups = [["daniel","kristine"],["theresa","jg"],["jas","mike"],["panha","kat"],["dan","liz"]].map(([a, b], i) => ({ id: "m" + i, a, b }));
    S.loaded = true;
    renderAll();
    document.querySelectorAll(".vote").forEach(b => b.disabled = true);
    $("organizer").hidden = true;
    $("banner").hidden = false;
    return;
  }
  load();
  setInterval(() => { if (!document.hidden) load(); }, 8000);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) load(); });
})();
