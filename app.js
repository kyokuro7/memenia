// Adapter sumber: hanya Oploverz yang endpoint-nya terverifikasi dalam dokumentasi proyek.
const SOURCES = {
  oploverz: { label: "Oploverz", base: "https://api.zetewstore.my.id/oploverz", enabled: true },
  otakudesu: { label: "Otakudesu", base: null, enabled: false },
  kuramanime: { label: "Kuramanime", base: null, enabled: false }
};
const ACTIVE_SOURCE = "oploverz";
const API = SOURCES[ACTIVE_SOURCE].base;

const GENRES = [
  ["Action","action"],["Adventure","adventure"],["Comedy","comedy"],["Drama","drama"],
  ["Fantasy","fantasy"],["Horror","horror"],["Romance","romance"],["Sci-Fi","sci-fi"],
  ["Slice of Life","slice-of-life"],["Sports","sports"],["Mystery","mystery"],["Supernatural","supernatural"],
  ["Ecchi","ecchi"],["School","school"],["Isekai","isekai"]
];

const state = {
  page: 1, loading: false, hasMore: true, currentView: "home",
  currentAnime: null, currentEpisode: null, lastCatalogMode: "catalog",
  searchQuery: "", catalogItems: [], bookmarks: readStorage("anifams_bookmarks", []),
  history: readStorage("anifams_history", []),
  lastAnime: readStorage("anifams_last_anime", null)
};

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

function readStorage(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
}
function writeStorage(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
}
function escapeHTML(value = "") {
  return String(value).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
}
function slugFromHref(href = "") {
  try { return new URL(href).pathname.split("/").filter(Boolean).pop() || ""; }
  catch { return String(href).split("/").filter(Boolean).pop() || ""; }
}
function getAvailableSources() {
  return Object.entries(SOURCES).filter(([, source]) => source.enabled);
}
function showToast(message) {
  const el = $("#toast"); el.textContent = message; el.classList.add("show");
  clearTimeout(showToast.timer); showToast.timer = setTimeout(() => el.classList.remove("show"), 2300);
}
const FS = {
  nativeSupported() { return !!(document.fullscreenEnabled || document.webkitFullscreenEnabled); },
  nativeElement() { return document.fullscreenElement || document.webkitFullscreenElement || null; },
  isActive() { return !!FS.nativeElement() || document.body.classList.contains("pseudo-fs"); },
  async enter(shell) {
    // 1) Coba Fullscreen API asli browser.
    if (FS.nativeSupported()) {
      try {
        if (shell.requestFullscreen) await shell.requestFullscreen();
        else if (shell.webkitRequestFullscreen) shell.webkitRequestFullscreen();
        else throw new Error("no-api");
        try { await screen.orientation?.lock?.("landscape"); } catch {}
        return "native";
      } catch {}
    }
    // 2) Fallback: layar penuh buatan (mengisi seluruh area halaman/preview).
    shell.classList.add("pseudo-fs");
    document.body.classList.add("pseudo-fs");
    return "pseudo";
  },
  async exit() {
    try {
      if (document.fullscreenElement && document.exitFullscreen) await document.exitFullscreen();
      else if (document.webkitFullscreenElement && document.webkitExitFullscreen) document.webkitExitFullscreen();
    } catch {}
    try { screen.orientation?.unlock?.(); } catch {}
    document.body.classList.remove("pseudo-fs");
    document.querySelector(".player-shell")?.classList.remove("pseudo-fs");
  },
  syncUI() {
    const btn = document.querySelector("#fullscreenPlayer");
    if (btn) btn.textContent = FS.isActive() ? "✕ Keluar layar penuh" : "⛶ Layar penuh";
  }
};
document.addEventListener("fullscreenchange", () => { if (!FS.nativeElement()) { document.body.classList.remove("pseudo-fs"); try { screen.orientation?.unlock?.(); } catch {} } FS.syncUI(); });
document.addEventListener("webkitfullscreenchange", () => { FS.syncUI(); });
document.addEventListener("keydown", e => { if (e.key === "Escape" && document.body.classList.contains("pseudo-fs")) { FS.exit().then(FS.syncUI); } });

function setView(name) {
  if (name !== "watch" && FS.isActive()) FS.exit();
  state.currentView = name;
  $$(".view").forEach(v => v.classList.add("hidden"));
  const target = $(`#${name}View`); if (target) target.classList.remove("hidden");
  $$(".nav-link").forEach(b => b.classList.toggle("active", b.dataset.nav === name));
  window.scrollTo({top:0, behavior:"smooth"});
}
async function api(path) {
  const response = await fetch(`${API}${path}`, {headers:{"Accept":"application/json"}});
  if (!response.ok) throw new Error(`Server API merespons HTTP ${response.status}`);
  const json = await response.json();
  if (json.statusCode && json.statusCode >= 400) throw new Error(json.message || "Data tidak tersedia.");
  if (json.data == null) throw new Error(json.message || "Data kosong dari API.");
  return json.data;
}
function getAnimeArray(data) {
  if (Array.isArray(data?.animeList)) return data.animeList;
  if (Array.isArray(data?.latestRelease?.animeList)) return data.latestRelease.animeList;
  return [];
}
function placeholderPoster(title) {
  return `<div class="poster-placeholder">${escapeHTML((title || "A").slice(0,1).toUpperCase())}</div>`;
}
function cardTemplate(item) {
  const title = item.title || item.seriesName || "Anime tanpa judul";
  const slug = item.slug || slugFromHref(item.href);
  const saved = state.bookmarks.some(x => x.slug === slug);
  const poster = item.poster ? `<img src="${escapeHTML(item.poster)}" alt="${escapeHTML(title)}" loading="lazy" onerror="this.outerHTML='<div class=&quot;poster-placeholder&quot;>A</div>'">` : placeholderPoster(title);
  const status = item.status || item.episode || item.type || "Anime";
  return `<article class="anime-card" data-open="${escapeHTML(slug)}" data-title="${escapeHTML(title)}">
    <div class="poster-wrap">${poster}<span class="card-badge">${escapeHTML(status)}</span>
      <button class="bookmark-button ${saved ? "saved" : ""}" data-bookmark="${escapeHTML(slug)}" aria-label="Simpan anime">${saved ? "♥" : "♡"}</button>
    </div>
    <h3 class="card-title">${escapeHTML(title)}</h3>
    <div class="card-meta">${escapeHTML(item.type || "Anime")}</div>
  </article>`;
}
function renderCards(container, items, emptyText = "Belum ada anime untuk ditampilkan.") {
  if (!items.length) { container.innerHTML = `<div class="empty-state"><strong>Belum ada hasil</strong>${escapeHTML(emptyText)}</div>`; return; }
  container.innerHTML = items.map(cardTemplate).join("");
}
function fillGenres() {
  $("#genreFilter").innerHTML = `<option value="">Semua genre</option>` + GENRES.map(([name,slug]) => `<option value="${slug}">${name}</option>`).join("");
  $("#homeGenres").innerHTML = GENRES.slice(0,10).map(([name,slug]) => `<button class="genre-chip" data-genre="${slug}">${name}</button>`).join("");
}
async function loadHome() {
  const grid = $("#latestGrid");
  grid.innerHTML = `<div class="loading-state">Memuat rilis terbaru...</div>`;
  try {
    const data = await api("/home");
    const items = getAnimeArray(data);
    renderCards(grid, items.slice(0,12), "API belum mengirimkan rilis terbaru.");
  } catch (err) { grid.innerHTML = `<div class="error-state">${escapeHTML(err.message)}<br><br>Periksa koneksi internet atau coba lagi nanti.</div>`; }
}
function catalogPath(page, append = false) {
  const params = new URLSearchParams({page:String(page)});
  const genre = $("#genreFilter").value, status = $("#statusFilter").value, order = $("#orderFilter").value;
  if (genre) params.set("genre", genre);
  if (status) params.set("status", status);
  if (order) params.set("order", order);
  return `/anime?${params.toString()}`;
}
async function loadCatalog({reset = true, mode = "catalog"} = {}) {
  if (state.loading) return;
  if (reset) {
    state.page = 1; state.hasMore = true; state.catalogItems = [];
    $("#catalogGrid").innerHTML = `<div class="loading-state">Memuat katalog anime...</div>`;
  }
  if (!state.hasMore) return;
  state.loading = true;
  $("#loadMore").disabled = true;
  try {
    const data = await api(catalogPath(state.page));
    const items = getAnimeArray(data);
    state.catalogItems = reset ? items : [...state.catalogItems, ...items];
    renderCards($("#catalogGrid"), state.catalogItems);
    $("#resultLabel").textContent = `${state.catalogItems.length} anime ditampilkan`;
    $("#pageLabel").textContent = `Halaman ${state.page}`;
    // API tidak menyediakan total halaman; tombol tetap tersedia selama halaman berisi data.
    state.hasMore = items.length > 0;
    if (items.length) state.page += 1;
    $("#loadMore").classList.toggle("hidden", !state.hasMore);
  } catch (err) {
    $("#catalogGrid").innerHTML = `<div class="error-state">${escapeHTML(err.message)}</div>`;
    $("#loadMore").classList.add("hidden");
  } finally { state.loading = false; $("#loadMore").disabled = false; }
}
async function runSearch(query) {
  const clean = query.trim();
  if (!clean) { showToast("Masukkan judul anime terlebih dahulu."); return; }
  state.searchQuery = clean; state.currentView = "catalog";
  setView("catalog");
  $("#catalogTitle").textContent = `Hasil: ${clean}`;
  $("#catalogDescription").textContent = "Hasil pencarian berdasarkan judul anime.";
  $("#catalogGrid").innerHTML = `<div class="loading-state">Mencari anime...</div>`;
  $("#loadMore").classList.add("hidden");
  try {
    const data = await api(`/search?q=${encodeURIComponent(clean)}`);
    const items = getAnimeArray(data);
    state.catalogItems = items; renderCards($("#catalogGrid"), items, "Coba kata kunci lain.");
    $("#resultLabel").textContent = `${items.length} hasil pencarian`;
    $("#pageLabel").textContent = "";
  } catch (err) { $("#catalogGrid").innerHTML = `<div class="error-state">${escapeHTML(err.message)}</div>`; }
}
async function openAnime(slug) {
  if (!slug) return;
  setView("detail"); $("#detailContent").innerHTML = `<div class="loading-state">Memuat detail anime...</div>`;
  try {
    const data = await api(`/anime/${encodeURIComponent(slug)}`);
    const d = data.details || data;
    state.currentAnime = {...d, slug};
    state.lastAnime = {slug, title:d.title, poster:d.poster, status:d.status, type:d.type};
    writeStorage("anifams_last_anime", state.lastAnime);
    const episodes = Array.isArray(d.episodeList) ? d.episodeList : [];
    const synopsis = Array.isArray(d.synopsis?.paragraphList) ? d.synopsis.paragraphList : [];
    const genres = Array.isArray(d.genres) ? d.genres : [];
    const isSaved = state.bookmarks.some(x => x.slug === slug);
    $("#detailContent").innerHTML = `
      <div class="detail-hero">
        <img class="detail-poster" src="${escapeHTML(d.poster || "")}" alt="${escapeHTML(d.title || "Poster anime")}" onerror="this.style.visibility='hidden'">
        <div class="detail-info">
          <span class="section-kicker">ANIME DETAILS</span>
          <h1>${escapeHTML(d.title || "Tanpa judul")}</h1>
          <div class="detail-tags">${genres.map(g => `<span class="detail-tag">${escapeHTML(g)}</span>`).join("")}</div>
          <div class="detail-facts">
            <span>Status: <b>${escapeHTML(d.status || "-")}</b></span>
            <span>Rating: <b>${escapeHTML(d.rating || "-")}</b></span>
            <span>Tahun: <b>${escapeHTML(d.releasedOn || "-")}</b></span>
            <span>Studio: <b>${escapeHTML(d.studio || "-")}</b></span>
            <span>Durasi: <b>${escapeHTML(d.duration || "-")}</b></span>
          </div>
          <div class="synopsis">${synopsis.map(p => `<p>${escapeHTML(p)}</p>`).join("") || "Sinopsis belum tersedia."}</div>
          <div class="detail-actions">
            <button class="primary-button" id="startWatching">Mulai menonton <span>▶</span></button>
            <button class="reset-button" id="detailBookmark">${isSaved ? "♥ Tersimpan" : "♡ Simpan anime"}</button>
          </div>
        </div>
      </div>
      <div class="episode-section">
        <div class="episode-heading"><h2>Daftar episode</h2><span class="card-meta">${episodes.length} episode</span></div>
        <div class="episode-list">${episodes.map(ep => {
          const epSlug = slugFromHref(ep.href);
          return `<button class="episode-item" data-episode="${escapeHTML(epSlug)}"><strong>Episode ${escapeHTML(ep.episode || "?")}</strong><small>${escapeHTML(ep.date || ep.title || "")}</small></button>`;
        }).join("") || `<div class="empty-state">Daftar episode belum tersedia.</div>`}</div>
      </div>`;
    $("#startWatching").addEventListener("click", () => {
      if (episodes.length) openEpisode(slugFromHref(episodes[episodes.length - 1].href));
      else showToast("Episode belum tersedia.");
    });
    $("#detailBookmark").addEventListener("click", () => toggleBookmark({slug, title:d.title, poster:d.poster, status:d.status, type:d.type}));
    $$("#detailContent [data-episode]").forEach(btn => btn.addEventListener("click", () => openEpisode(btn.dataset.episode)));
  } catch (err) { $("#detailContent").innerHTML = `<div class="error-state">${escapeHTML(err.message)}</div>`; }
}
async function openEpisode(slug) {
  if (!slug) return;
  setView("watch"); $("#watchContent").innerHTML = `<div class="loading-state">Memuat pemutar episode...</div>`;
  try {
    const data = await api(`/episode/${encodeURIComponent(slug)}`);
    const d = data.details || data;
    state.currentEpisode = {...d, slug};
    const stream = d.streamingUrl || "";
    const previousHistory = state.history.find(x => x.slug === slug);
    const historyItem = {slug, title:d.title, seriesName:d.seriesName, poster:state.currentAnime?.poster || previousHistory?.poster || ""};
    state.history = [historyItem, ...state.history.filter(x => x.slug !== slug)].slice(0,50);
    writeStorage("anifams_history", state.history);
    renderHistory();
    $("#watchContent").innerHTML = `
      <div class="watch-heading"><span class="section-kicker">${escapeHTML(d.seriesName || "ANIFAMS PLAYER")}</span>
        <h1>${escapeHTML(d.title || "Episode")}</h1><p>Episode ${escapeHTML(d.episodeNumber || "-")} · Sumber pemutar pihak ketiga</p>
      </div>
      <div class="player-shell" id="playerShell">
        ${stream ? `<div class="player-toolbar"><span>ANIFAMS PLAYER</span><span class="player-tools"><a class="player-open" href="${escapeHTML(stream)}" target="_blank" rel="noopener noreferrer">↗ Buka di tab baru</a><button type="button" id="fullscreenPlayer" aria-label="Buka layar penuh">⛶ Layar penuh</button></span></div><iframe class="player-frame" id="playerFrame" src="${escapeHTML(stream)}" title="Pemutar anime" allow="autoplay; encrypted-media; picture-in-picture; fullscreen; clipboard-write" referrerpolicy="no-referrer-when-downgrade" allowfullscreen webkitallowfullscreen mozallowfullscreen></iframe>
        <div class="player-fallback">Jika video tidak muncul, server streaming mungkin sedang tidak tersedia atau menolak pemutaran dalam iframe.</div>`
        : `<div class="player-fallback">Link streaming tidak tersedia untuk episode ini.</div>`}
      </div>
      <div class="watch-controls">
        <button id="prevEpisode" ${d.hasPrevEpisode && d.prevEpisode?.href ? "" : "disabled"}>← Episode sebelumnya</button>
        <button id="backSeries">Daftar episode</button>
        <button id="nextEpisode" ${d.hasNextEpisode && d.nextEpisode?.href ? "" : "disabled"}>Episode berikutnya →</button>
      </div>`;
    $("#fullscreenPlayer")?.addEventListener("click", async () => {
      if (FS.isActive()) { await FS.exit(); FS.syncUI(); return; }
      const mode = await FS.enter($("#playerShell"));
      FS.syncUI();
      if (mode === "pseudo") showToast("Browser/preview menolak fullscreen asli. Memakai mode layar penuh AniFams. Untuk fullscreen penuh, buka di Chrome atau tab baru.");
    });
    $("#prevEpisode").addEventListener("click", () => d.prevEpisode?.href && openEpisode(slugFromHref(d.prevEpisode.href)));
    $("#nextEpisode").addEventListener("click", () => d.nextEpisode?.href && openEpisode(slugFromHref(d.nextEpisode.href)));
    $("#backSeries").addEventListener("click", () => d.seriesSlug ? openAnime(d.seriesSlug) : setView("home"));
  } catch (err) { $("#watchContent").innerHTML = `<div class="error-state">${escapeHTML(err.message)}</div>`; }
}

function renderHistory() {
  const grid = $("#historyGrid");
  if (!grid) return;
  if (!state.history.length) {
    grid.innerHTML = `<div class="history-empty">Belum ada riwayat. Anime yang terakhir kamu tonton akan muncul di sini.</div>`;
    return;
  }
  grid.innerHTML = state.history.slice(0,8).map(item => `
    <article class="history-card">
      <div class="history-poster">${item.poster ? `<img src="${escapeHTML(item.poster)}" alt="" loading="lazy">` : `<span>ア</span>`}</div>
      <div class="history-info"><strong>${escapeHTML(item.seriesName || item.title || "Anime")}</strong><small>${escapeHTML(item.title || "Episode terakhir")}</small>
      <button class="text-button" data-resume="${escapeHTML(item.slug)}">Lanjutkan →</button></div>
    </article>`).join("");
}
function clearHistory() {
  state.history = []; writeStorage("anifams_history", state.history); renderHistory(); showToast("Riwayat tontonan dihapus.");
}

function toggleBookmark(item) {
  if (!item?.slug) return;
  const exists = state.bookmarks.some(x => x.slug === item.slug);
  state.bookmarks = exists ? state.bookmarks.filter(x => x.slug !== item.slug) : [item, ...state.bookmarks];
  writeStorage("anifams_bookmarks", state.bookmarks);
  showToast(exists ? "Dihapus dari tersimpan." : "Anime disimpan.");
  renderCards($("#bookmarkGrid"), state.bookmarks, "Simpan anime dari katalog untuk melihatnya di sini.");
  if (state.currentAnime?.slug === item.slug && $("#detailBookmark")) $("#detailBookmark").textContent = exists ? "♡ Simpan anime" : "♥ Tersimpan";
  // Refresh ikon kartu tanpa memuat ulang data.
  const card = document.querySelector(`[data-bookmark="${CSS.escape(item.slug)}"]`);
  if (card) { card.classList.toggle("saved", !exists); card.textContent = exists ? "♡" : "♥"; }
}
function openCatalog(mode = "catalog") {
  state.searchQuery = ""; $("#searchInput").value = "";
  $("#catalogTitle").textContent = mode === "ongoing" ? "Anime ongoing" : mode === "completed" ? "Anime completed" : "Jelajahi anime";
  $("#catalogDescription").textContent = mode === "ongoing" ? "Serial yang masih berlanjut." : mode === "completed" ? "Serial yang sudah tamat." : "Temukan serial yang cocok untuk menemani waktumu.";
  $("#statusFilter").value = mode === "ongoing" ? "ongoing" : mode === "completed" ? "completed" : "";
  $("#genreFilter").value = ""; $("#orderFilter").value = "update";
  setView("catalog"); loadCatalog({reset:true,mode});
}
function openBookmarks() {
  setView("bookmarks"); renderCards($("#bookmarkGrid"), state.bookmarks, "Simpan anime dari katalog untuk melihatnya di sini.");
}
function bindEvents() {
  $$("[data-nav]").forEach(btn => btn.addEventListener("click", () => {
    const nav = btn.dataset.nav;
    if (nav === "home") { setView("home"); loadHome(); }
    else openCatalog(nav);
  }));
  $("#exploreButton").addEventListener("click", () => openCatalog());
  $("#bookmarkNav").addEventListener("click", openBookmarks);
  $("#clearHistory").addEventListener("click", clearHistory);
  $("#historyGrid").addEventListener("click", e => {
    const btn = e.target.closest("[data-resume]");
    if (btn) openEpisode(btn.dataset.resume);
  });
  $("#searchToggle").addEventListener("click", () => {
    $("#searchPanel").classList.toggle("hidden");
    if (!$("#searchPanel").classList.contains("hidden")) $("#searchInput").focus();
  });
  $("#searchClear").addEventListener("click", () => $("#searchPanel").classList.add("hidden"));
  $("#searchInput").addEventListener("keydown", e => { if (e.key === "Enter") runSearch(e.target.value); });
  $("#genreFilter").addEventListener("change", () => { $("#catalogTitle").textContent = "Jelajahi anime"; loadCatalog({reset:true}); });
  $("#statusFilter").addEventListener("change", () => { $("#catalogTitle").textContent = "Jelajahi anime"; loadCatalog({reset:true}); });
  $("#orderFilter").addEventListener("change", () => loadCatalog({reset:true}));
  $("#resetFilters").addEventListener("click", () => { $("#genreFilter").value="";$("#statusFilter").value="";$("#orderFilter").value="update";loadCatalog({reset:true}); });
  $("#loadMore").addEventListener("click", () => loadCatalog({reset:false}));
  $("#detailBack").addEventListener("click", () => state.currentView === "detail" ? openCatalog() : setView("home"));
  $("#watchBack").addEventListener("click", () => state.currentEpisode?.seriesSlug ? openAnime(state.currentEpisode.seriesSlug) : setView("home"));
  document.addEventListener("click", e => {
    const genre = e.target.closest("[data-genre]");
    if (genre) { openCatalog(); $("#genreFilter").value = genre.dataset.genre; loadCatalog({reset:true}); }
    const bookmark = e.target.closest("[data-bookmark]");
    if (bookmark) {
      e.stopPropagation();
      const slug = bookmark.dataset.bookmark;
      const item = [...state.catalogItems, ...state.bookmarks].find(x => x.slug === slug) || {slug, title:document.querySelector(`[data-open="${CSS.escape(slug)}"]`)?.dataset.title || slug};
      toggleBookmark(item);
      return;
    }
    const card = e.target.closest("[data-open]");
    if (card && !e.target.closest("button")) openAnime(card.dataset.open);
  });
}
fillGenres(); bindEvents(); renderHistory(); loadHome();
