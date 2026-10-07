// My AI Builder — frontend (REAL builds, resilient streaming)
const $ = (s) => document.querySelector(s);
const messagesEl = $("#messages"), chipsEl = $("#chips"), promptInput = $("#promptInput");

const STAGE_LABELS = {
  analyze: "تحليل الطلب", plan: "تخطيط المشروع", fusion: "Fusion — عمل النماذج",
  collect: "جمع نتائج Fusion", ui: "بناء الواجهة", logic: "بناء المنطق",
  files: "إنشاء الملفات", test: "اختبار المشروع", fix: "إصلاح الأخطاء", preview: "تشغيل Preview",
};

const state = {
  project: null, projects: [], models: [], engines: [],
  backendUp: false, cloud: { mode: "", notice: "" },
  mode: "fusion", singleModel: "qwen",
  fusionOn: ["qwen","deepseek","llama","gemma","mistral","glm","nemotron","minimax","phi","muse-spark-1.3"],
  attach: [], files: [], building: false, currentRun: null,
};

async function api(m, u, b, timeoutMs = 15000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(u, { method: m, headers: { "Content-Type": "application/json" }, body: b ? JSON.stringify(b) : undefined, signal: ctrl.signal });
    if (!r.ok) throw new Error("HTTP " + r.status);
    return r.json();
  } finally { clearTimeout(t); }
}
const esc = (s) => String(s ?? "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");

// ── init ─────────────────────────────────────────────
async function init() {
  bindUI();
  try {
    const h = await api("GET", "/api/health", null, 8000);
    state.backendUp = true; state.cloud = h;
    const badge = $("#connBadge");
    badge.textContent = "● نماذج حقيقية: " + h.mode;
    badge.className = "conn on";
    $("#engineNote").textContent = h.notice;
  } catch {
    state.backendUp = false;
    const badge = $("#connBadge");
    badge.textContent = "● Backend غير متصل";
    badge.className = "conn off";
    addMsg("ai", "⚠️ <b>الخادم غير متصل.</b> شغّل <code dir=\"ltr\">npm start</code> ثم حدّث الصفحة — البناء يحتاج الخادم لأنه يتحدث إلى نماذج ذكاء حقيقية. لن أعرض أي بناء وهمي.");
    $("#buildBtn").onclick = () => addMsg("ai", "⚠️ الخادم غير متصل — شغّل <code dir=\"ltr\">npm start</code> أولًا.");
    return;
  }
  try {
    const m = await api("GET", "/api/models");
    state.models = m.models; state.engines = m.engines || [];
    renderModels(); renderFusion();
  } catch { /* non-fatal */ }
  await refreshProjects();
  if (!state.projects.length) {
    try {
      const { project } = await api("POST", "/api/projects", { name: "My Strategy Game" });
      await refreshProjects(project.id);
    } catch { addMsg("ai", "تعذر إنشاء مشروع — تحقق من الخادم."); return; }
  } else selectProject(state.projects[0].id);
  addMsg("ai", "أهلًا بك في <b>My AI</b> — صف مشروعك بدقة ثم اضغط <b>Build</b>. نماذج حقيقية ستكتب الكود فعلًا، والPreview سيشغّل الناتج الحقيقي.");
}

async function refreshProjects(activeId) {
  let projects = [];
  try { ({ projects } = await api("GET", "/api/projects")); } catch { return; }
  state.projects = projects;
  const side = $("#sideProjects"); side.innerHTML = "";
  const list = $("#projectList"); list.innerHTML = "";
  const rel = (iso) => { const d = (Date.now() - new Date(iso).getTime())/36e5; if (d < 1) return "Updated recently"; if (d < 24) return `Updated ${Math.max(1,Math.round(d))}h ago`; return `Updated ${Math.round(d/24)}d ago`; };
  for (const p of projects) {
    const s = document.createElement("div");
    s.className = "side-item" + (p.id === (activeId || state.project?.id) ? " active" : "");
    s.innerHTML = `<b>${esc(p.name)}</b><small>${rel(p.updatedAt)} · ${p.files || 0} files</small>`;
    s.onclick = () => { selectProject(p.id); closeNav(); };
    side.appendChild(s);
    const c = document.createElement("div");
    c.className = "proj";
    c.innerHTML = `<b>${esc(p.name)}</b><small>${rel(p.updatedAt)} · app · ${p.files || 0} files</small>
      <div class="row"><button class="pill-btn sm" data-a="open">Open</button>
      <button class="pill-btn sm" data-a="rename">Rename</button>
      <button class="pill-btn sm" data-a="del">Delete</button></div>`;
    c.querySelector('[data-a="open"]').onclick = () => { selectProject(p.id); $("#projectsPage").hidden = true; };
    c.querySelector('[data-a="rename"]').onclick = async () => { const n = prompt("اسم جديد:", p.name); if (n) { await api("PATCH", "/api/projects/" + p.id, { name: n }); refreshProjects(); } };
    c.querySelector('[data-a="del"]').onclick = async () => { if (confirm("حذف المشروع؟")) { await api("DELETE", "/api/projects/" + p.id); refreshProjects(); } };
    list.appendChild(c);
  }
  if (activeId) { const p = projects.find((x) => x.id === activeId); if (p) setProject(p); }
}

async function selectProject(id) {
  try {
    const { project } = await api("GET", "/api/projects/" + id);
    setProject(project);
    messagesEl.innerHTML = "";
    for (const m of project.chat.slice(-20)) addMsg(m.role === "user" ? "user" : "ai", esc(m.text));
    await loadFiles();
    await refreshProjects(id);
  } catch { addMsg("ai", "تعذر فتح المشروع."); }
}
function setProject(p) {
  state.project = p;
  $("#projectName").textContent = p.name;
  $("#chatSubtitle").textContent = `آخر تحديث: ${new Date(p.updatedAt).toLocaleString("ar")} · ${p.files?.length || 0} ملفات`;
}

// ── chat ─────────────────────────────────────────────
function addMsg(role, html) {
  const d = document.createElement("div");
  d.className = "msg " + role;
  d.innerHTML = `<div class="who">${role === "user" ? "User" : "AI"}</div><div>${html}</div>`;
  messagesEl.appendChild(d);
  messagesEl.scrollTop = messagesEl.scrollHeight;
  return d;
}

// ── UI bindings ──────────────────────────────────────
function bindUI() {
  $("#projectsBtn").onclick = () => { $("#projectsPage").hidden = false; };
  $("#closeProjects").onclick = () => { $("#projectsPage").hidden = true; };
  const newProj = async () => { const { project } = await api("POST", "/api/projects", { name: "مشروع جديد " + new Date().toLocaleTimeString("ar") }); await refreshProjects(project.id); $("#projectsPage").hidden = true; };
  $("#newProjectBtn").onclick = newProj; $("#newProjectBtn2").onclick = newProj;
  $("#menuBtn").onclick = () => { $("#sideNav").classList.add("open"); $("#scrim").hidden = false; };
  window.closeNav = () => { $("#sideNav").classList.remove("open"); $("#scrim").hidden = true; };
  $("#scrim").onclick = window.closeNav;

  $("#settingsBtn").onclick = async () => {
    $("#settingsSheet").hidden = false;
    try {
      const s = await api("GET", "/api/settings");
      $("#setOR").placeholder = s.openrouterKey ? `محفوظ (${s.openrouterKey})` : "sk-or-...";
      $("#setBase").value = s.customBase || ""; $("#setModel").value = s.customModel || "";
    } catch { /* noop */ }
  };
  $("#closeSettings").onclick = () => { $("#settingsSheet").hidden = true; };
  $("#saveSettings").onclick = async () => {
    $("#setStatus").textContent = "جارٍ الحفظ...";
    try {
      await api("POST", "/api/settings", {
        ...( $("#setOR").value ? { openrouterKey: $("#setOR").value } : {}),
        customBase: $("#setBase").value, customModel: $("#setModel").value,
        ...($("#setKey").value ? { customKey: $("#setKey").value } : {}),
      });
      $("#setOR").value = ""; $("#setKey").value = "";
      $("#setStatus").textContent = "✓ حُفظت المفاتيح محليًا.";
      const m = await api("GET", "/api/models");
      state.engines = m.engines || []; renderModels(); renderFusion();
    } catch { $("#setStatus").textContent = "تعذر الحفظ — تحقق من الخادم."; }
  };

  $("#attachBtn").onclick = () => $("#fileInput").click();
  $("#fileInput").onchange = (e) => {
    for (const f of e.target.files) state.attach.push({ name: f.name, size: f.size });
    renderChips(); e.target.value = "";
  };
  $("#modelBtn").onclick = () => { $("#modelSheet").hidden = false; };
  $("#closeModel").onclick = () => { $("#modelSheet").hidden = true; };
  $("#fusionBtn").onclick = () => { $("#fusionSheet").hidden = false; };
  $("#closeFusion").onclick = () => { $("#fusionSheet").hidden = true; };
  $("#manageModels").onclick = () => { $("#fusionSheet").hidden = true; $("#modelSheet").hidden = false; };
  $("#fusionModeBtn").onclick = () => { state.mode = "fusion"; syncModelBtn(); $("#modelSheet").hidden = true; };

  document.querySelectorAll(".seg button").forEach((b) => b.onclick = () => {
    document.querySelectorAll(".seg button").forEach((x) => x.classList.remove("on"));
    b.classList.add("on");
    $("#pvFrameWrap").className = "pv-frame " + b.dataset.vp;
  });
  const openPv = () => { $("#previewPanel").classList.add("open"); };
  $("#previewBtn").onclick = openPv; $("#previewBtn2").onclick = openPv;
  $("#pvBack").onclick = () => { $("#previewPanel").classList.remove("open"); $("#previewPanel").classList.remove("fullscreen"); };
  $("#pvExpand").onclick = () => {
    $("#previewPanel").classList.add("open");
    $("#previewPanel").classList.toggle("fullscreen");
    $("#pvBack").style.display = $("#previewPanel").classList.contains("fullscreen") ? "" : "";
  };
  $("#pvRefresh").onclick = () => { const f = $("#pvFrame"); if (f.src) f.src = f.src; };
  $("#pvStop").onclick = () => { $("#pvFrame").removeAttribute("src"); };
  $("#pvRun").onclick = () => loadPreview();

  $("#filesBtn").onclick = openFiles; $("#filesBtn2").onclick = openFiles;
  $("#closeFiles").onclick = () => { $("#filesDrawer").hidden = true; };
  $("#buildBtn").onclick = startBuild;
  promptInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) startBuild();
  });
}
function renderChips() {
  chipsEl.innerHTML = "";
  state.attach.forEach((a, i) => {
    const c = document.createElement("span");
    c.className = "chip";
    c.innerHTML = `${esc(a.name)} <button>×</button>`;
    c.querySelector("button").onclick = () => { state.attach.splice(i, 1); renderChips(); };
    chipsEl.appendChild(c);
  });
}
function engineOf(id) { return state.engines.find((e) => e.registryId === id); }
function modelName(id) { return state.models.find((m) => m.id === id)?.name || id; }
function syncModelBtn() {
  $("#modelName").textContent = state.mode === "single" ? modelName(state.singleModel) : "Fusion 🔥";
  $("#fusionBtn").style.opacity = state.mode === "single" ? .55 : 1;
}
function renderModels() {
  const box = $("#modelList"); box.innerHTML = "";
  for (const m of state.models) {
    const eng = engineOf(m.id);
    const b = document.createElement("button");
    b.className = "model-row" + (state.mode === "single" && state.singleModel === m.id ? " on" : "");
    b.innerHTML = `<span>${eng?.available === false ? "○" : "◉"}</span><span><b>${esc(m.name)}</b> <small>${esc(m.org)} · ${esc(m.role)} — ${esc(m.strengths)}</small><small dir="ltr">${esc(eng?.label || "")}</small></span>`;
    b.onclick = () => { state.mode = "single"; state.singleModel = m.id; syncModelBtn(); renderModels(); $("#modelSheet").hidden = true; };
    box.appendChild(b);
  }
  syncModelBtn();
}
function renderFusion() {
  const box = $("#fusionList"); box.innerHTML = "";
  for (const m of state.models) {
    const on = state.fusionOn.includes(m.id);
    const eng = engineOf(m.id);
    const b = document.createElement("button");
    b.className = "model-row" + (on ? " on" : "");
    b.innerHTML = `<span>${on ? "✓" : "○"}</span><span><b>${esc(m.name)}</b><small>${esc(m.role)}</small><small dir="ltr">${esc(eng?.label || "")}</small></span><span class="switch">${on ? "مفعّل" : "مطفأ"}</span>`;
    b.onclick = () => {
      const i = state.fusionOn.indexOf(m.id);
      if (i >= 0) state.fusionOn.splice(i, 1); else state.fusionOn.push(m.id);
      state.mode = "fusion"; syncModelBtn(); renderFusion();
    };
    box.appendChild(b);
  }
}

// ── files / preview ──────────────────────────────────
async function loadFiles() {
  if (!state.project) return;
  try {
    const { files } = await api("GET", `/api/projects/${state.project.id}/files`);
    state.files = files;
  } catch { state.files = []; }
  const tree = $("#fileTree"); tree.innerHTML = "";
  $("#fileView").textContent = state.files.length ? "اختر ملفًا لعرض الكود…" : "لا ملفات بعد — اضغط Build.";
  for (const f of state.files) {
    const r = document.createElement("div");
    r.className = "frow"; r.textContent = "📄 " + f.path;
    r.onclick = () => { $("#fileView").textContent = f.content; };
    tree.appendChild(r);
  }
}
async function openFiles() { await loadFiles(); $("#filesDrawer").hidden = false; }
function loadPreview() {
  if (!state.project || !state.files.length) {
    addMsg("ai", "لا معاينة بعد — ابنِ المشروع أولًا بزر <b>Build</b>.");
    return;
  }
  $("#previewPanel").classList.add("open");
  $("#pvEmpty").style.display = "none";
  $("#pvFrame").src = `/preview/${state.project.id}/index.html?ts=${Date.now()}`;
}

// ── REAL build with resilient streaming ──────────────
async function startBuild() {
  if (state.building) return;
  if (!state.backendUp) { addMsg("ai", "⚠️ الخادم غير متصل — شغّل <code dir=\"ltr\">npm start</code> أولًا."); return; }
  const text = promptInput.value.trim();
  if (!text) { promptInput.focus(); return; }
  if (!state.project) return alert("أنشئ مشروعًا أولًا");
  if (state.mode === "fusion" && !state.fusionOn.length) { alert("فعّل نموذجًا واحدًا على الأقل في Fusion"); return; }

  state.building = true;
  const buildBtn = $("#buildBtn");
  buildBtn.disabled = true; buildBtn.textContent = "Building...";

  try { await api("POST", `/api/projects/${state.project.id}/chat`, { role: "user", text }); } catch { /* non-fatal */ }
  addMsg("user", esc(text));
  if (state.attach.length) {
    addMsg("user", "📎 المرفقات (أسماء فقط تُرسل للنماذج): " + state.attach.map((a) => esc(a.name)).join("، "));
  }
  const attachNames = state.attach.map((a) => a.name);
  state.attach = []; renderChips();
  promptInput.value = "";

  const aiMsg = addMsg("ai", "أتصل بالنماذج الحقيقية وأبدأ البناء...");
  const prog = document.createElement("div");
  prog.className = "prog";
  prog.innerHTML = `<div class="prog-top"><span>⏳</span><b>أبدأ...</b><span class="st" data-r="pct"></span></div>
    <div class="bar"><i data-r="bar"></i></div><div data-r="stages"></div>
    <div data-r="fusion"></div>
    <details class="details"><summary>Show details — التفاصيل التقنية</summary><pre data-r="logs">بانتظار الأحداث…</pre></details>
    <div class="result-btns" data-r="btns" hidden></div>
    <div class="result-btns"><button class="pill-btn sm" data-r="cancel">إلغاء البناء</button></div>`;
  aiMsg.appendChild(prog);
  const q = (n) => prog.querySelector(`[data-r="${n}"]`);
  const stageBox = q("stages"), fusionBox = q("fusion"), logsEl = q("logs");
  const order = Object.keys(STAGE_LABELS);
  const status = Object.fromEntries(order.map((s) => [s, "queued"]));
  let lastProgress = 0, finished = false;
  const logs = [];
  const log = (line) => { logs.push(line); logsEl.textContent = logs.slice(-80).join("\n"); };

  const paint = () => {
    stageBox.innerHTML = order.map((s) => {
      const st = status[s];
      const icon = st === "completed" ? "✓" : st === "running" ? "●" : st === "failed" ? "!" : st === "skipped" ? "–" : "○";
      const word = st === "completed" ? "اكتمل" : st === "running" ? "جارٍ الآن" : st === "failed" ? "فشل" : st === "skipped" ? "تخطي" : "لم يبدأ";
      return `<div class="stage" data-s="${st}"><span class="dot">${icon}</span><span>${STAGE_LABELS[s]}</span><span class="st">${word}</span></div>`;
    }).join("");
    q("bar").style.width = lastProgress + "%";
    q("pct").textContent = lastProgress + "%";
  };
  paint();

  let runId;
  try {
    ({ runId } = await api("POST", "/api/build", {
      projectId: state.project.id, prompt: text, mode: state.mode,
      model: state.singleModel, fusionModels: state.fusionOn, attachments: attachNames,
    }, 20000));
  } catch {
    prog.querySelector(".prog-top b").textContent = "⚠️ تعذر بدء البناء — الخادم لا يستجيب.";
    cleanup(); return;
  }
  state.currentRun = runId;
  q("cancel").onclick = async () => {
    try { await api("DELETE", `/api/build/${runId}`); } catch { /* noop */ }
    prog.querySelector(".prog-top b").textContent = "أُلغي البناء.";
    cleanup();
  };

  function cleanup() {
    state.building = false; state.currentRun = null;
    buildBtn.disabled = false; buildBtn.innerHTML = "Build →";
    const c = q("cancel"); if (c) c.remove();
  }

  const onEvent = async (e) => {
    if (!e || !e.type || finished) return;
    lastEventAt = Date.now();
    if (e.type === "build_started") {
      prog.querySelector(".prog-top b").textContent = e.message || "بدأ البناء";
    } else if (e.type === "engines") {
      log("المحركات الحقيقية: " + e.engines.map((x) => `${x.model} [${x.provider}:${x.engineModel}]`).join(" | "));
    } else if (e.type === "stage_started") {
      status[e.stage] = "running"; lastProgress = e.progress ?? lastProgress;
      prog.querySelector(".prog-top b").textContent = e.message || STAGE_LABELS[e.stage];
      paint();
    } else if (e.type === "stage_completed") {
      status[e.stage] = e.status || "completed"; lastProgress = e.progress ?? lastProgress; paint();
    } else if (e.type === "fusion_started") {
      fusionBox.innerHTML = `<b>🔥 Fusion — نماذج حقيقية تعمل بالتوازي</b><div class="fusion-grid">` +
        e.assignments.map((a) => `<div class="fmod" data-m="${a.modelId}"><span>○</span><span><b>${esc(a.model)}</b><br><small>${esc(a.task)}</small><br><small dir="ltr">${esc(a.engine || "")}</small></span></div>`).join("") + `</div>`;
    } else if (e.type === "model_started") {
      const el = fusionBox.querySelector(`[data-m="${CSS.escape(e.modelId)}"] span:first-child`);
      if (el) el.textContent = "🔵";
      log(`→ ${e.model} يعمل... [${e.engine || ""}]`);
    } else if (e.type === "model_completed") {
      const el = fusionBox.querySelector(`[data-m="${CSS.escape(e.modelId)}"] span:first-child`);
      if (el) el.textContent = "✓";
      log(`✓ ${e.model} سلّم (${e.files ?? "?"} ملفات) [${e.engine || ""}]`);
    } else if (e.type === "model_failed") {
      const el = fusionBox.querySelector(`[data-m="${CSS.escape(e.modelId)}"] span:first-child`);
      if (el) el.textContent = "✕";
      log(`✕ ${e.model} فشل: ${(e.error || "").slice(0, 120)}`);
    } else if (e.type === "fusion_completed") {
      const h = document.createElement("div");
      h.className = "stage"; h.dataset.s = "completed";
      h.innerHTML = `<span class="dot">✓</span><span>${esc(e.message || "")}</span>`;
      fusionBox.appendChild(h);
    } else if (e.type === "file_created") {
      prog.querySelector(".prog-top b").textContent = `أكتب الملفات الحقيقية: ${e.created} جديدة، ${e.modified} محدثة...`;
    } else if (e.type === "test_started") {
      prog.querySelector(".prog-top b").textContent = "أختبر المشروع بفحوصات حقيقية...";
    } else if (e.type === "test_completed") {
      log(`الاختبارات: ${e.passed} ناجحة، ${e.failed} فاشلة${e.failures?.length ? " — " + e.failures.join(" | ").slice(0, 200) : ""}`);
    } else if (e.type === "error_found") {
      const w = document.createElement("div");
      w.className = "stage"; w.dataset.s = "failed";
      w.innerHTML = `<span class="dot">!</span><span>⚠️ وجدت مشكلة أثناء الاختبار — أطلب إصلاحًا حقيقيًا الآن.</span>`;
      stageBox.appendChild(w);
    } else if (e.type === "fix_started") {
      prog.querySelector(".prog-top b").textContent = "🔧 " + (e.message || "أصلح...");
    } else if (e.type === "fix_completed") {
      prog.querySelector(".prog-top b").textContent = "✓ " + (e.message || "تم الإصلاح");
    } else if (e.type === "log") { log(e.line); }
    else if (e.type === "build_cancelled") { finished = true; cleanup(); }
    else if (e.type === "build_completed") {
      finished = true; cleanup();
      if (!e.ok) {
        prog.querySelector(".prog-top b").textContent = "⚠️ " + (e.error || "فشل البناء");
        const rb = document.createElement("div");
        rb.className = "result-btns";
        rb.innerHTML = `<button class="pill-btn sm accent">إعادة المحاولة</button>`;
        rb.querySelector("button").onclick = () => { promptInput.value = text; startBuild(); };
        prog.appendChild(rb);
        return;
      }
      lastProgress = 100;
      Object.keys(status).forEach((k) => { if (status[k] !== "skipped") status[k] = "completed"; });
      paint();
      prog.querySelector(".prog-top b").textContent = "✓ " + (e.message || "تم البناء بنجاح.");
      const info = document.createElement("div");
      info.className = "stage";
      info.innerHTML = `<span>📦</span><span>الملفات: ${e.files.list.length} حقيقية · الاختبارات: ${e.tests.passed} ناجحة · الإصلاحات: ${e.fixes}</span>`;
      prog.appendChild(info);
      const eng = document.createElement("div");
      eng.className = "stage";
      eng.innerHTML = `<span>🤖</span><span>المحركات: ${(e.engines || []).map(esc).join(" · ").slice(0, 400)}</span>`;
      prog.appendChild(eng);
      const btns = q("btns"); btns.hidden = false;
      btns.innerHTML = `<button class="pill-btn sm accent" data-b="pv">Preview</button>
        <button class="pill-btn sm" data-b="files">Open Files</button>
        <button class="pill-btn sm" data-b="edit">Continue editing</button>
        <button class="pill-btn sm" data-b="exp">Export</button>`;
      btns.querySelector('[data-b="pv"]').onclick = () => loadPreview();
      btns.querySelector('[data-b="files"]').onclick = openFiles;
      btns.querySelector('[data-b="edit"]').onclick = () => promptInput.focus();
      btns.querySelector('[data-b="exp"]').onclick = () => window.open(`/api/projects/${state.project.id}/export`);
      await loadFiles();
      if (state.files.length) loadPreview();
      refreshProjects(state.project.id);
      messagesEl.scrollTop = messagesEl.scrollHeight;
    }
  };

  // transport: SSE primary, polling fallback, global timeout
  let lastEventAt = Date.now(), es = null, pollTimer = null, usingPolling = false;
  const seen = new Set();
  const handle = (e) => {
    const key = e.at + "|" + e.type + "|" + (e.stage || e.modelId || e.path || "");
    if (seen.has(key)) return;
    seen.add(key);
    onEvent(e);
  };
  const startPolling = () => {
    if (usingPolling || finished) return;
    usingPolling = true;
    log("انقطع البث المباشر — أتابع عبر الاستطلاع الدوري...");
    const tick = async () => {
      if (finished) return;
      try {
        const h = await api("GET", `/api/build/${runId}/history`, null, 12000);
        for (const ev of h.events) handle(ev);
        if (h.done && !finished) {
          if (![...seen].some((k) => k.includes("build_completed"))) {
            prog.querySelector(".prog-top b").textContent = "⚠️ توقف الخادم دون نتيجة — أعد المحاولة.";
            finished = true; cleanup();
          }
        }
      } catch { /* retry next tick */ }
      if (!finished) pollTimer = setTimeout(tick, 3000);
    };
    tick();
  };
  try {
    es = new EventSource(`/api/build/${runId}/events`);
    es.onmessage = (ev) => { try { handle(JSON.parse(ev.data)); } catch { /* noop */ } };
    es.onerror = () => { try { es.close(); } catch { /* noop */ } startPolling(); };
  } catch { startPolling(); }
  // watchdog: SSE silent >60s → polling
  const watch = setInterval(() => {
    if (finished) { clearInterval(watch); return; }
    if (!usingPolling && Date.now() - lastEventAt > 60000) { try { es?.close(); } catch { /* noop */ } startPolling(); }
    if (Date.now() - lastEventAt > 630000) {
      clearInterval(watch);
      if (!finished) {
        prog.querySelector(".prog-top b").textContent = "⚠️ تجاوز البناء المهلة (10 دقائق) — أُلغي. أعد المحاولة بطلب أصغر.";
        finished = true; cleanup();
        try { fetch(`/api/build/${runId}`, { method: "DELETE" }); } catch { /* noop */ }
      }
    }
  }, 5000);
}

init();
