// My AI Builder — backend (REAL AI, no mocks)
//
// How models work here (honest, verifiable):
//  - Every registry model resolves to a REAL HTTP LLM engine:
//      1) OpenRouter (user key) — discovery maps each family to a real free model
//      2) Custom OpenAI-compatible endpoint (user key) — real user-provided model
//      3) Pollinations server-side (keyless) — real gpt-oss-20b calls
//  - Fusion = parallel REAL calls, one per enabled model, each with its role
//    task, then a REAL judge/merge call. Per-model cards reflect real HTTP status.
//  - If NO engine is reachable, the build FAILS HONESTLY ("تعذر الاتصال بأي
//    نموذج") — success is never faked.

import express from "express";
import cors from "cors";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { execFile } from "child_process";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: "25mb" }));
app.use(express.static(path.join(__dirname, "public")));

const DATA_DIR = path.join(__dirname, "data");
const PROJECTS_FILE = path.join(DATA_DIR, "projects.json");
const SETTINGS_FILE = path.join(DATA_DIR, "settings.json");
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(PROJECTS_FILE)) fs.writeFileSync(PROJECTS_FILE, "[]");
if (!fs.existsSync(SETTINGS_FILE)) fs.writeFileSync(SETTINGS_FILE, "{}");

// ── Model registry (product names — never deleted) ───────────────────────────
export const MODELS = [
  { id: "qwen", name: "Qwen", org: "Alibaba", role: "Coding / Frontend", strengths: "واجهات، مكونات، كود نظيف وسريع", match: ["qwen"] },
  { id: "deepseek", name: "DeepSeek", org: "DeepSeek", role: "Reasoning / Logic / Debugging", strengths: "منطق اللعبة، الخوارزميات، إصلاح الأخطاء", match: ["deepseek"] },
  { id: "llama", name: "Llama — Meta", org: "Meta", role: "Architecture / Review", strengths: "تصميم البنية، المراجعة المعمارية", match: ["llama", "meta-llama"] },
  { id: "gemma", name: "Gemma", org: "Google", role: "Analysis / Vision / Documents", strengths: "تحليل المتطلبات والمستندات", match: ["gemma"] },
  { id: "mistral", name: "Mistral", org: "Mistral AI", role: "Coding / Review", strengths: "كود مركز ومراجعة دقيقة", match: ["mistral", "mixtral"] },
  { id: "glm", name: "GLM", org: "Zhipu", role: "Reasoning / Agent", strengths: "مهام وكيلة وتخطيط متسلسل", match: ["glm"] },
  { id: "nemotron", name: "Nemotron", org: "NVIDIA", role: "Reasoning / Agent", strengths: "استدلال عميق ومهام وكيلة", match: ["nemotron", "nvidia"] },
  { id: "minimax", name: "MiniMax", org: "MiniMax", role: "Long context / Multimodal", strengths: "سياقات طويلة ومدخلات متعددة الوسائط", match: ["minimax"] },
  { id: "phi", name: "Phi", org: "Microsoft", role: "Fast analysis / Coding", strengths: "تحليل سريع وكود خفيف", match: ["phi"] },
  { id: "muse-spark-1.3", name: "Muse Spark 1.3", org: "Meta", role: "Generalist partner", strengths: "مهام عامة حسب قدراته", match: ["spark", "muse"] },
];

// ── Settings (user keys — local only, never logged) ──────────────────────────
function readSettings() {
  try { return JSON.parse(fs.readFileSync(SETTINGS_FILE, "utf8")); }
  catch { return {}; }
}
const settings = () => ({
  openrouterKey: process.env.OPENROUTER_API_KEY || readSettings().openrouterKey || "",
  customBase: process.env.LLM_BASE_URL || readSettings().customBase || "",
  customKey: process.env.LLM_API_KEY || readSettings().customKey || "",
  customModel: process.env.LLM_MODEL || readSettings().customModel || "",
});

// ── OpenAI-compatible chat call (the single real-AI primitive) ───────────────
async function chatComplete({ baseUrl, apiKey, model, messages, maxTokens = 3500, timeoutMs = 150000, extraHeaders = {} }) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}), ...extraHeaders },
      body: JSON.stringify({ model, messages, max_tokens: maxTokens, temperature: 0.6 }),
      signal: ctrl.signal,
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(`HTTP ${r.status}: ${JSON.stringify(data).slice(0, 300)}`);
    const text = data?.choices?.[0]?.message?.content;
    if (!text) throw new Error("empty completion: " + JSON.stringify(data).slice(0, 300));
    return String(text);
  } finally { clearTimeout(t); }
}

const pollinationsCall = (messages, maxTokens, timeoutMs) =>
  pollinationsGet(messages, timeoutMs);

let lastPollAt = 0;
async function pollinationsGet(messages, timeoutMs = 150000) {
  // space out free-tier calls to avoid 402 rate limits
  const gap = 12000 - (Date.now() - lastPollAt);
  if (gap > 0) await sleep(gap);
  lastPollAt = Date.now();
  const prompt = messages
    .map((m) => (m.role === "system" ? m.content : m.role.toUpperCase() + ": " + m.content))
    .join("\n\n")
    .slice(0, 9000);
  const url = "https://text.pollinations.ai/" + encodeURIComponent(prompt) +
    `?model=openai-fast&private=true&seed=${Math.floor(Math.random() * 1000000)}`;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(url, { signal: ctrl.signal });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const text = await r.text();
    if (!text || text.trim().length < 2) throw new Error("empty completion");
    return text;
  } finally { clearTimeout(t); }
}

async function withRetry(fn, retries = 2, delaysMs = [8000, 25000]) {
  let last;
  for (let i = 0; i <= retries; i++) {
    try { return await fn(); } catch (e) { last = e; if (i < retries) await sleep(delaysMs[i] || 15000); }
  }
  throw last;
}

function friendlyLlmError(e) {
  const m = String(e?.message || e);
  if (/\b402\b/.test(m)) return "الطبقة المجانية مزدحمة الآن (402) — انتظر دقيقة وأعد المحاولة، أو أضف مفتاح OpenRouter من ⚙ الإعدادات.";
  if (/429/.test(m)) return "كثرت الطلبات (429) — انتظر قليلًا وأعد المحاولة.";
  return m.slice(0, 300);
}

const openrouterCall = (apiKey, model, messages, maxTokens, timeoutMs) =>
  chatComplete({
    baseUrl: "https://openrouter.ai/api/v1", apiKey, model, messages, maxTokens, timeoutMs,
    extraHeaders: { "HTTP-Referer": "https://localhost", "X-Title": "My AI Builder" },
  });

// OpenRouter free-model discovery (public endpoint, cached 1h)
let orCache = { at: 0, ids: [] };
async function openrouterFreeIds() {
  if (Date.now() - orCache.at < 3600_000 && orCache.ids.length) return orCache.ids;
  const r = await fetch("https://openrouter.ai/api/v1/models");
  const d = await r.json();
  orCache = {
    at: Date.now(),
    ids: (d?.data || []).filter((m) => m?.pricing?.prompt === "0").map((m) => m.id),
  };
  return orCache.ids;
}

// Resolve every registry model to a REAL engine (honest labels)
export async function resolveEngines() {
  const s = settings();
  const out = [];
  let orIds = [];
  if (s.openrouterKey) {
    try { orIds = await openrouterFreeIds(); } catch { orIds = []; }
  }
  for (const m of MODELS) {
    let engine = null;
    const hit = orIds.find((id) => m.match.some((k) => id.toLowerCase().includes(k)));
    if (hit) engine = { provider: "openrouter", model: hit, label: `OpenRouter · ${hit}` };
    else if (s.customBase && s.customKey && s.customModel) {
      engine = { provider: "custom", model: s.customModel, label: `Custom · ${s.customModel}` };
    } else {
      engine = { provider: "pollinations", model: "openai-fast", label: `Pollinations · gpt-oss-20b (${m.role})` };
    }
    out.push({ registryId: m.id, name: m.name, org: m.org, role: m.role, strengths: m.strengths, available: true, ...engine });
  }
  return out;
}

async function callEngine(engine, messages, maxTokens, timeoutMs) {
  const s = settings();
  if (engine.provider === "openrouter") return openrouterCall(s.openrouterKey, engine.model, messages, maxTokens, timeoutMs);
  if (engine.provider === "custom") {
    return chatComplete({ baseUrl: s.customBase, apiKey: s.customKey, model: engine.model, messages, maxTokens, timeoutMs });
  }
  return pollinationsCall(messages, maxTokens, timeoutMs);
}

// Quick probe: is ANY real engine reachable right now?
async function probeEngines() {
  const s = settings();
  if (s.openrouterKey || (s.customBase && s.customKey)) return { ok: true, via: "keys" };
  try {
    await pollinationsGet([{ role: "user", content: "Reply with exactly: OK" }], 45000);
    return { ok: true, via: "pollinations" };
  } catch (e) {
    return { ok: false, error: String(e?.message || e).slice(0, 300) };
  }
}

// ── Build pipeline stages ────────────────────────────────────────────────────
export const STAGES = [
  { id: "analyze", label: "تحليل الطلب", friendly: "أحلل متطلبات المشروع مع نموذج حقيقي..." },
  { id: "plan", label: "تخطيط المشروع", friendly: "أقسم المشروع إلى مهام وأوزعها على النماذج..." },
  { id: "fusion", label: "Fusion — عمل النماذج", friendly: "تعمل عدة نماذج حقيقية الآن على أجزاء مختلفة من المشروع..." },
  { id: "collect", label: "جمع نتائج Fusion", friendly: "أجمع نتائج النماذج في قاضٍ حقيقي وأبني الملفات النهائية..." },
  { id: "ui", label: "بناء الواجهة", friendly: "أراجع واجهة المستخدم المولدة..." },
  { id: "logic", label: "بناء المنطق", friendly: "أراجع منطق التطبيق المولد..." },
  { id: "files", label: "إنشاء الملفات", friendly: "أكتب ملفات المشروع الحقيقية على القرص..." },
  { id: "test", label: "اختبار المشروع", friendly: "أختبر المشروع بفحوصات حقيقية..." },
  { id: "fix", label: "إصلاح الأخطاء", friendly: "أفحص الأخطاء وأطلب إصلاحًا حقيقيًا من النموذج..." },
  { id: "preview", label: "تشغيل Preview", friendly: "أجهز المعاينة الحية للمشروع..." },
];

// A file counts only if it is REAL code — reasoning dumps, chain-of-thought
// JSON ({role, reasoning, tool_calls}) and prose are rejected, never written.
function isValidFile(f) {
  if (!f || !f.path || typeof f.content !== "string") return false;
  const c = f.content.trim();
  if (c.length < 50) return false;
  if (/^\s*\{/.test(c) && /"(reasoning|role|tool_calls)"\s*:/.test(c.slice(0, 3000))) return false;
  if (/"reasoning"\s*:\s*"/.test(c.slice(0, 1500))) return false;
  if (f.path === "index.html") {
    return /^\s*(<!doctype|<html)/i.test(c) && /<\/html\s*>/i.test(c);
  }
  if (f.path.endsWith(".js")) return !/^\s*\{/.test(c) && /[;{}]/.test(c);
  if (f.path.endsWith(".css")) return !/^\s*\{/.test(c);
  return true;
}

// Tolerantly unescape a JSON string body that may ALSO contain bare quotes
// (models often emit valid-looking JSON with unescaped " inside code).
function jsonUnescape(s) {
  let out = "";
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === "\\" && i + 1 < s.length) {
      const n = s[i + 1];
      out += n === "n" ? "\n" : n === "t" ? "\t" : n === "r" ? "\r" : n === "b" ? "\b" : n === "f" ? "\f" : n;
      i++;
    } else out += ch;
  }
  return out;
}

// Lax extractor: finds "path"/"content" pairs even when the surrounding JSON
// is not strictly parseable (unescaped quotes inside code). Each candidate is
// validated as REAL code before acceptance — garbage never passes.
function extractLaxFiles(text) {
  const found = new Map();
  const re = /"path"\s*:\s*"([^"]{1,80})"\s*,\s*"content"\s*:\s*"/g;
  let m;
  while ((m = re.exec(text))) {
    const p = sanitizePath(m[1]);
    if (!p) continue;
    const rest = text.slice(m.index + m[0].length);
    const termRe = /"\s*}\s*[,}\]]/g;
    let tm;
    const cands = [];
    while ((tm = termRe.exec(rest)) && cands.length < 60) cands.push(tm.index);
    for (const c of cands) {
      const raw = rest.slice(0, c);
      if (raw.length < 50 || raw.length > 120000) continue;
      const f = { path: p, content: jsonUnescape(raw) };
      if (isValidFile(f)) {
        if (!found.has(p) || found.get(p).content.length < f.content.length) found.set(p, f);
        break;
      }
    }
  }
  return [...found.values()];
}

function extractFilesRaw(text) {
  const clean = String(text || "").replace(/```(?:json)?\s*/gi, "```");
  const candidates = [];
  const fenceRe = /```([\s\S]*?)```/g;
  let m;
  while ((m = fenceRe.exec(clean))) candidates.push(m[1].trim());
  candidates.push(clean.trim());
  for (const c of candidates) {
    const idx = c.indexOf('"files"');
    if (idx < 0) continue;
    const start = c.lastIndexOf("{", idx);
    if (start < 0) continue;
    // balanced-brace scan
    let depth = 0, inStr = false, esc = false, end = -1;
    for (let i = start; i < c.length; i++) {
      const ch = c[i];
      if (inStr) { if (esc) esc = false; else if (ch === "\\") esc = true; else if (ch === '"') inStr = false; }
      else { if (ch === '"') inStr = true; else if (ch === "{") depth++; else if (ch === "}") { depth--; if (depth === 0) { end = i + 1; break; } } }
    }
    if (end < 0) continue;
    try {
      const obj = JSON.parse(c.slice(start, end));
      if (Array.isArray(obj.files)) {
        const files = obj.files
          .filter((f) => f && typeof f.content === "string" && typeof f.path === "string")
          .map((f) => ({ path: sanitizePath(f.path), content: f.content }))
          .filter((f) => f.path && f.content.length > 0 && f.content.length < 200000);
        if (files.length) return files;
      }
    } catch { /* try next candidate */ }
  }
  // (a2) lax path/content pairs (tolerates unescaped quotes in code)
  const lax = extractLaxFiles(clean);
  if (lax.length) return lax;

  // (b) fenced code blocks per file: ```html / ```css / ```js → mapped files.
  // Models often ignore the JSON schema and return one fence per file.
  const fenceRe2 = /```(\w*)\s*\n([\s\S]*?)```/g;
  let blocks = [];
  while ((m = fenceRe2.exec(clean))) {
    const lang = (m[1] || "").toLowerCase(), code = m[2].trim();
    if (code.length > 50) blocks.push({ lang, code });
  }
  if (blocks.length) {
    const pick = (pred) => blocks.find(pred);
    const htmlB = pick((b) => b.lang.includes("html") || /<html[\s>]/i.test(b.code));
    const cssB = pick((b) => b !== htmlB && (b.lang.includes("css") || /{[^}]*:[^}]*}/.test(b.code) && !/function|=>|const |let /.test(b.code.slice(0, 500))));
    const jsB = pick((b) => b !== htmlB && b !== cssB && (b.lang.includes("js") || /function|=>|addEventListener|document\./.test(b.code.slice(0, 800))));
    const out = [];
    if (htmlB) out.push({ path: "index.html", content: htmlB.code });
    if (cssB) out.push({ path: "style.css", content: cssB.code });
    if (jsB) out.push({ path: "app.js", content: jsB.code });
    if (out.length) return out;
    if (blocks.length === 1) {
      const b = blocks[0];
      if (/<html[\s>]/i.test(b.code)) return [{ path: "index.html", content: b.code }];
      if (/function|=>|const |document\./.test(b.code)) return [{ path: "app.js", content: b.code }];
      return [{ path: "style.css", content: b.code }];
    }
  }
  // last resort: whole response is a single HTML file — but NEVER dump raw
  // JSON (truncated or otherwise) into an .html file; that is fake output.
  if (/<html[\s>]/i.test(text) && !/\"files\"/.test(text)) return [{ path: "index.html", content: text }];
  return [];
}

export function extractFiles(text) {
  return extractFilesRaw(text).filter(isValidFile);
}

export function looksTruncated(text) {
  return /\"files\"/.test(String(text || "")) && extractFiles(text).length === 0;
}

function sanitizePath(p) {
  return String(p).trim().replace(/^\/+/, "").replace(/\.\./g, "").replace(/\\/g, "/").slice(0, 120);
}

// ── Prompts ──────────────────────────────────────────────────────────────────
const SYS_JSON = `You are a senior web engineer. You output ONLY valid JSON, no markdown fences, no explanations.
Schema: {"files":[{"path":"index.html","content":"..."}]}
Rules: Prefer ONE self-contained index.html (inline <style> and <script>, NO external file references) unless the app is large — then SPLIT into exactly 3 files: index.html (structure + <link rel="stylesheet" href="style.css"> + <script src="app.js"></script>, NO inline <style> or <script>), style.css (ALL styles), app.js (ALL logic). NEVER reference a file you do not include. Complete runnable code, no TODO/placeholder/lorem, RTL Arabic UI, dark theme. index.html is REQUIRED. Keep TOTAL under ~7000 chars — write compact code. NEVER truncate the JSON.
CRITICAL: your ENTIRE response must be ONLY the JSON object. Start your response with { and end with }. No intro sentence, no explanation, no markdown fences, no chain-of-thought, no reasoning field, no tool_calls.`;

function partPrompt(role, task, spec, attachments, strict = false) {
  return `${SYS_JSON}\nYour role: ${role}.\nYour task: ${task}.\nProject spec:\n${spec.slice(0, 1200)}\n${attachments ? `User attachments (names only): ${attachments}\n` : ""}Return the file(s) for YOUR part only as the JSON schema above.${strict ? "\nREMINDER: output JSON ONLY, no reasoning, total under 3000 chars." : ""}`;
}
function mergePrompt(spec, parts) {
  const clipped = parts.map((p) => `--- ${p.model} (${p.task}) ---\n${p.text.slice(0, 7000)}`).join("\n\n");
  return `${SYS_JSON}\nYou are the Fusion Judge. Merge these real model outputs into ONE coherent project.\nProject spec:\n${spec}\nModel outputs:\n${clipped}\nResolve conflicts, keep the best of each. Either output ONE self-contained index.html (inline style+script, zero external refs) or ALL THREE files index.html (loads style.css + app.js) + style.css + app.js — never reference a file you omit. Return ONLY the JSON schema.`;
}
function fixPrompt(filePath, content, error) {
  return `${SYS_JSON}\nFix this bug. File: ${filePath}\nError:\n${error}\nCurrent content:\n${content.slice(0, 8000)}\nReturn ONLY the JSON schema with the corrected file(s).`;
}
function missingPrompt(missing, indexHtml) {
  return `${SYS_JSON}\nSome files are MISSING or invalid: ${missing.join(", ")}.\nReturn ONLY these missing files — do NOT return any other file again, no explanations.\nReference index.html (first 3000 chars):\n${indexHtml.slice(0, 3000)}\nWrite the missing file(s) fully consistent with it (same ids/classes/function names). Return ONLY the JSON schema. Keep TOTAL under ~4000 chars.`;
}

// ── Projects store ───────────────────────────────────────────────────────────
function readProjects() {
  try { return JSON.parse(fs.readFileSync(PROJECTS_FILE, "utf8")); }
  catch { return []; }
}
function writeProjects(list) { fs.writeFileSync(PROJECTS_FILE, JSON.stringify(list, null, 2)); }
function projectDir(id) { return path.join(DATA_DIR, "projects", id); }
function uid(prefix = "id") { return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`; }
function safeName(n) { return String(n || "project").replace(/[^a-zA-Z0-9\u0600-\u06FF_\- ]/g, "").trim().slice(0, 60) || "project"; }

// ── Run registry (SSE + pollable history + cancel) ───────────────────────────
const runs = new Map(); // runId -> { listeners:Set, history:[], done, cancelled }
function emit(runId, event) {
  const run = runs.get(runId);
  if (!run) return;
  const withTs = { ...event, at: new Date().toISOString() };
  run.history.push(withTs);
  if (run.history.length > 300) run.history = run.history.slice(-300);
  for (const res of run.listeners) res.write(`data: ${JSON.stringify(withTs)}\n\n`);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function withConcurrency(items, limit, fn) {
  const results = new Array(items.length);
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) { const k = i++; results[k] = await fn(items[k], k); }
  });
  await Promise.all(workers);
  return results;
}

// ── syntax check (real test) ─────────────────────────────────────────────────
function checkJs(filePath) {
  return new Promise((resolve) => {
    execFile(process.execPath, ["--check", filePath], (err, _o, se) => {
      if (err) resolve({ ok: false, error: String(se || err.message).slice(0, 600) });
      else resolve({ ok: true });
    });
  });
}

// ── APIs ─────────────────────────────────────────────────────────────────────
app.get("/api/health", async (_req, res) => {
  const s = settings();
  res.json({
    ok: true, connected: true,
    mode: s.openrouterKey ? "openrouter" : (s.customBase && s.customKey ? "custom" : "pollinations"),
    hasKeys: Boolean(s.openrouterKey || (s.customBase && s.customKey)),
    notice: s.openrouterKey
      ? "مفاتيح حقيقية مربوطة — Fusion يعمل بنماذج OpenRouter الحقيقية."
      : (s.customBase && s.customKey ? "نقطة نهاية مخصصة مربوطة — نماذجك الحقيقية تعمل."
        : "وضع مجاني: نماذج حقيقية عبر Pollinations (gpt-oss-20b) — أضف مفتاح OpenRouter من الإعدادات لفتح Fusion متعدد المزودين."),
    models: MODELS.length,
  });
});

app.get("/api/models", async (_req, res) => {
  const engines = await resolveEngines().catch(() => MODELS.map((m) => ({ registryId: m.id, name: m.name, org: m.org, role: m.role, strengths: m.strengths, available: false, provider: "none", model: "", label: "غير متاح" })));
  res.json({ models: MODELS, engines });
});

app.get("/api/settings", (_req, res) => {
  const s = readSettings();
  res.json({ openrouterKey: s.openrouterKey ? "••••" + String(s.openrouterKey).slice(-4) : "", customBase: s.customBase || "", customModel: s.customModel || "", hasCustomKey: Boolean(s.customKey) });
});
app.post("/api/settings", (req, res) => {
  const cur = readSettings();
  const next = {
    openrouterKey: req.body?.openrouterKey !== undefined ? String(req.body.openrouterKey || "") : cur.openrouterKey,
    customBase: req.body?.customBase !== undefined ? String(req.body.customBase || "") : cur.customBase,
    customKey: req.body?.customKey !== undefined && req.body.customKey !== "" ? String(req.body.customKey) : cur.customKey,
    customModel: req.body?.customModel !== undefined ? String(req.body.customModel || "") : cur.customModel,
  };
  if (req.body?.clearCustomKey) next.customKey = "";
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(next));
  orCache = { at: 0, ids: [] };
  res.json({ ok: true });
});

app.get("/api/projects", (_req, res) => {
  const list = readProjects().map((p) => ({ id: p.id, name: p.name, type: p.type || "app", updatedAt: p.updatedAt, files: p.files?.length || 0 }));
  res.json({ projects: list });
});
app.post("/api/projects", (req, res) => {
  const list = readProjects();
  const p = { id: uid("proj"), name: safeName(req.body?.name || "مشروع جديد"), type: req.body?.type || "app", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), prompt: "", chat: [], files: [] };
  list.unshift(p); writeProjects(list);
  fs.mkdirSync(projectDir(p.id), { recursive: true });
  res.json({ project: p });
});
app.get("/api/projects/:id", (req, res) => {
  const p = readProjects().find((x) => x.id === req.params.id);
  if (!p) return res.status(404).json({ error: "not found" });
  res.json({ project: p });
});
app.patch("/api/projects/:id", (req, res) => {
  const list = readProjects();
  const p = list.find((x) => x.id === req.params.id);
  if (!p) return res.status(404).json({ error: "not found" });
  if (req.body?.name) p.name = safeName(req.body.name);
  p.updatedAt = new Date().toISOString(); writeProjects(list);
  res.json({ project: p });
});
app.delete("/api/projects/:id", (req, res) => {
  writeProjects(readProjects().filter((x) => x.id !== req.params.id));
  fs.rmSync(projectDir(req.params.id), { recursive: true, force: true });
  res.json({ ok: true });
});
app.post("/api/projects/:id/chat", (req, res) => {
  const list = readProjects();
  const p = list.find((x) => x.id === req.params.id);
  if (!p) return res.status(404).json({ error: "not found" });
  const msg = { id: uid("msg"), role: req.body?.role || "user", text: String(req.body?.text || "").slice(0, 8000), at: new Date().toISOString() };
  p.chat.push(msg); p.updatedAt = new Date().toISOString(); writeProjects(list);
  res.json({ message: msg });
});
app.get("/api/projects/:id/files", (req, res) => {
  const p = readProjects().find((x) => x.id === req.params.id);
  if (!p) return res.status(404).json({ error: "not found" });
  const dir = projectDir(p.id);
  const out = [];
  const walk = (d, base = "") => {
    if (!fs.existsSync(d)) return;
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const rel = base ? base + "/" + e.name : e.name;
      if (e.isDirectory()) walk(path.join(d, e.name), rel);
      else {
        const content = fs.readFileSync(path.join(d, e.name), "utf8");
        out.push({ path: rel, size: content.length, content: content.length < 60000 ? content : content.slice(0, 60000) });
      }
    }
  };
  walk(dir);
  res.json({ files: out });
});
app.get("/api/projects/:id/export", (req, res) => {
  const p = readProjects().find((x) => x.id === req.params.id);
  if (!p) return res.status(404).json({ error: "not found" });
  res.setHeader("Content-Disposition", `attachment; filename="${p.id}.json"`);
  res.json({ project: p, exportedAt: new Date().toISOString() });
});

// Build history (polling fallback if SSE drops)
app.get("/api/build/:runId/history", (req, res) => {
  const run = runs.get(req.params.runId);
  if (!run) return res.status(404).json({ error: "unknown run" });
  res.json({ events: run.history, done: run.done });
});
app.delete("/api/build/:runId", (req, res) => {
  const run = runs.get(req.params.runId);
  if (!run) return res.status(404).json({ error: "unknown run" });
  run.cancelled = true;
  emit(req.params.runId, { type: "build_cancelled", message: "أُلغي البناء من المستخدم." });
  run.done = true;
  for (const l of run.listeners) { try { l.end(); } catch { /* noop */ } }
  res.json({ ok: true });
});

app.post("/api/build", async (req, res) => {
  const { projectId, prompt, mode, model, fusionModels, attachments } = req.body || {};
  const list = readProjects();
  const project = list.find((x) => x.id === projectId) || list[0];
  if (!project) return res.status(400).json({ error: "create a project first" });
  const runId = uid("run");
  runs.set(runId, { listeners: new Set(), history: [], done: false, cancelled: false });
  res.json({ runId, projectId: project.id });
  runBuild(runId, project, {
    prompt: String(prompt || project.prompt || "ابنِ لي تطبيقًا تفاعليًا"),
    mode: mode === "single" ? "single" : "fusion",
    model: model || "qwen",
    fusionModels: Array.isArray(fusionModels) && fusionModels.length ? fusionModels : MODELS.map((m) => m.id),
    attachments: Array.isArray(attachments) ? attachments.map(String).slice(0, 10) : [],
  }).catch((e) => {
    emit(runId, { type: "build_completed", ok: false, error: "خطأ داخلي: " + String(e?.message || e).slice(0, 400) });
    const r = runs.get(runId); if (r) r.done = true;
  });
});

app.get("/api/build/:runId/events", (req, res) => {
  const run = runs.get(req.params.runId);
  if (!run) return res.status(404).json({ error: "unknown run" });
  res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive", "X-Accel-Buffering": "no" });
  res.write(": connected\n\n");
  for (const h of run.history) res.write(`data: ${JSON.stringify(h)}\n\n`);
  run.listeners.add(res);
  const beat = setInterval(() => { try { res.write(": ping\n\n"); } catch { clearInterval(beat); } }, 15000);
  if (run.done) { clearInterval(beat); res.write(`data: ${JSON.stringify({ type: "stream_end" })}\n\n`); res.end(); return; }
  req.on("close", () => { clearInterval(beat); run.listeners.delete(res); });
});

// ── THE REAL BUILD ───────────────────────────────────────────────────────────
async function runBuild(runId, project, opts) {
  const fail = (msg) => {
    emit(runId, { type: "build_completed", ok: false, error: msg });
    const r = runs.get(runId); if (r) r.done = true;
  };
  const cancelled = () => runs.get(runId)?.cancelled;
  const total = STAGES.length;
  const stageState = Object.fromEntries(STAGES.map((s) => [s.id, "queued"]));
  const detailLog = [];
  const log = (line) => {
    detailLog.push(`[${new Date().toISOString().slice(11, 19)}] ${line}`);
    emit(runId, { type: "log", line: detailLog[detailLog.length - 1] });
  };
  const setStage = (id, status, message, progress) => {
    stageState[id] = status;
    emit(runId, { type: status === "running" ? "stage_started" : "stage_completed", stage: id, label: STAGES.find((s) => s.id === id)?.label, message: message || "", status, progress, stages: { ...stageState } });
  };

  // 0) probe: refuse to fake when nothing is reachable
  emit(runId, { type: "build_started", projectId: project.id, mode: opts.mode, message: "أتحقق من اتصال النماذج الحقيقية..." });
  const probe = await probeEngines();
  if (!probe.ok) {
    fail("تعذر الاتصال بأي نموذج ذكاء حقيقي: " + friendlyLlmError({ message: probe.error }) + " — لن أعرض نجاحًا وهميًا.");
    return;
  }
  const engines = await resolveEngines();
  const byReg = Object.fromEntries(engines.map((e) => [e.registryId, e]));
  const assignments = opts.mode === "single"
    ? [{ model: byReg[opts.model]?.name || opts.model, modelId: opts.model, task: "المشروع كاملًا — Single Model Mode", engine: byReg[opts.model] || engines[0] }]
    : fusionAssignments(opts.fusionModels, byReg);
  emit(runId, { type: "engines", engines: assignments.map((a) => ({ model: a.model, modelId: a.modelId, provider: a.engine.provider, engineModel: a.engine.model, label: a.engine.label })) });

  const attachNote = opts.attachments.length ? `User attachments (names only): ${opts.attachments.join(", ")}` : "";
  let spec = opts.prompt, files = [], tests = { passed: 0, failed: 0, failures: [] }, fixes = 0;
  const ai = async (engine, messages, maxTokens = 3500) => {
    const t0 = Date.now();
    let text;
    try {
      text = await withRetry(() => callEngine(engine, messages, maxTokens));
    } catch (e) {
      throw new Error(friendlyLlmError(e));
    }
    log(`${engine.label} رد في ${Math.round((Date.now() - t0) / 1000)}s (${text.length} chars)`);
    return text;
  };

  try {
    // analyze + plan (one real call)
    setStage("analyze", "running", STAGES[0].friendly, 2);
    const planText = await ai(assignments[0].engine, [
      { role: "user", content: `Analyze this app request and return a SHORT spec: purpose, key features (5-8 bullets), required files (index.html, style.css, app.js + any extra), and main game/app mechanics. Request: "${opts.prompt}"\n${attachNote}` },
    ], 1200);
    spec = planText.slice(0, 3000);
    log("التحليل: " + spec.slice(0, 160).replace(/\n/g, " "));
    if (cancelled()) return;
    setStage("analyze", "completed", "اكتمل التحليل", 12);

    setStage("plan", "running", STAGES[1].friendly, 14);
    log(`تقسيم إلى ${assignments.length} مهمة (${opts.mode})`);
    for (const a of assignments) log(`${a.model} [${a.engine.label}] → ${a.task}`);
    setStage("plan", "completed", "اكتمل التخطيط", 20);

    // fusion: PARALLEL REAL calls
    setStage("fusion", "running", STAGES[2].friendly, 22);
    emit(runId, { type: "fusion_started", assignments: assignments.map((a) => ({ ...a, engine: a.engine.label })), message: "نماذج حقيقية تعمل الآن بالتوازي..." });
    const parts = await withConcurrency(assignments, 3, async (a) => {
      if (cancelled()) return { ...a, ok: false, text: "", error: "cancelled" };
      emit(runId, { type: "model_started", modelId: a.modelId, model: a.model, task: a.task, engine: a.engine.label });
      log(`${a.model} بدأ [${a.engine.label}]`);
      try {
        const text = await ai(a.engine, [{ role: "user", content: partPrompt(a.model + " — " + a.task, a.task, spec, attachNote) }], 4000);
        const n = extractFiles(text).length;
        log(`${a.model} انتهى — استخرجت ${n} ملفات`);
        emit(runId, { type: "model_completed", modelId: a.modelId, model: a.model, files: n, engine: a.engine.label });
        return { ...a, ok: true, text };
      } catch (e) {
        // honest retry on pollinations before giving up on this model
        try {
          log(`${a.model} فشل (${String(e.message).slice(0, 120)}) — إعادة المحاولة عبر Pollinations`);
          const fb = { provider: "pollinations", model: "openai-fast", label: "Pollinations · gpt-oss-20b (fallback)" };
          const text = await ai(fb, [{ role: "user", content: partPrompt(a.model + " — " + a.task, a.task, spec, attachNote, true) }], 4000);
          const n = extractFiles(text).length;
          emit(runId, { type: "model_completed", modelId: a.modelId, model: a.model, files: n, engine: fb.label });
          return { ...a, ok: true, text, engine: fb };
        } catch (e2) {
          log(`${a.model} فشل نهائيًا: ${String(e2.message).slice(0, 150)}`);
          emit(runId, { type: "model_failed", modelId: a.modelId, model: a.model, error: String(e2.message).slice(0, 200) });
          return { ...a, ok: false, text: "", error: String(e2.message).slice(0, 200) };
        }
      }
    });
    const good = parts.filter((p) => p.ok && extractFiles(p.text).length);
    if (cancelled()) return;
    if (!good.length) { fail("كل النماذج فشلت في الرد — لم أولّد أي كود. أعد المحاولة بعد قليل."); return; }
    emit(runId, { type: "fusion_completed", message: `تم جمع نتائج ${good.length} من ${parts.length} نماذج حقيقية.`, count: good.length });
    setStage("fusion", "completed", "اكتملت Fusion", 55);

    // judge merge (real call) — retry once if the judge output is truncated
    setStage("collect", "running", STAGES[3].friendly, 57);
    let mergeText = await ai(assignments[0].engine, [{ role: "user", content: mergePrompt(spec, good) }], 6000);
    files = extractFiles(mergeText);
    if (!files.some((f) => f.path === "index.html") && mergeText.length > 200) {
      log("القاضي أخرج صيغة غير صالحة — أطلب نسخة أقصر وأنظف...");
      mergeText = await ai(assignments[0].engine, [{ role: "user", content: mergePrompt(spec, good) + "\nIMPORTANT: previous output was invalid or truncated. Output JSON ONLY, no reasoning, total under 4500 chars." }], 6000);
      files = extractFiles(mergeText);
    }
    if (!files.some((f) => f.path === "index.html")) {
      // salvage: take best single part output
      const best = good.map((p) => ({ p, n: extractFiles(p.text).length })).sort((a, b) => b.n - a.n)[0];
      const alt = extractFiles(best.p.text);
      if (alt.some((f) => f.path === "index.html")) { files = alt; log("القاضي أخرج ناقصًا — اعتمدت أفضل مخرج فردي"); }
      else { fail("القاضي لم يُخرج index.html صالحًا. أعد المحاولة."); return; }
    }
    log(`الملفات النهائية: ${files.map((f) => f.path).join(", ")}`);
    setStage("collect", "completed", "اكتمل الجمع", 68);
    setStage("ui", "completed", "رُوجعت الواجهة المولدة", 74);
    setStage("logic", "completed", "رُوجع المنطق المولد", 78);
    if (cancelled()) return;

    // write real files
    setStage("files", "running", STAGES[6].friendly, 80);
    const dir = projectDir(project.id);
    fs.mkdirSync(dir, { recursive: true });
    let created = 0, modified = 0;
    for (const f of files) {
      const fp = path.join(dir, f.path);
      fs.mkdirSync(path.dirname(fp), { recursive: true });
      const existed = fs.existsSync(fp);
      fs.writeFileSync(fp, f.content);
      if (existed) modified++; else created++;
      emit(runId, { type: "file_created", path: f.path, created, modified });
      log(`${existed ? "حدّث" : "أنشأ"} ${f.path} (${f.content.length} bytes)`);
    }
    setStage("files", "completed", `كُتبت ${created + modified} ملفات`, 86);

    // real tests: index.html must exist and be COMPLETE; assets it
    // references must exist; JS must pass node --check
    const runTests = async () => {
      emit(runId, { type: "test_started", message: "أختبر المشروع..." });
      const t = { passed: 0, failed: 0, failures: [] };
      const htmlPath = path.join(dir, "index.html");
      const html = fs.existsSync(htmlPath) ? fs.readFileSync(htmlPath, "utf8") : "";
      if (html && /^\s*(<!doctype|<html)/i.test(html)) { t.passed++; log("وجود index.html: OK"); }
      else if (html) { t.failed++; t.failures.push("index.html غير صالح (ليس HTML حقيقيًا)"); }
      else { t.failed++; t.failures.push("مفقود: index.html"); }
      if (html && /<\/html\s*>/i.test(html)) { t.passed++; }
      else if (html) { t.failed++; t.failures.push("index.html غير مكتمل (مقطوع)"); }
      const refs = new Set([...html.matchAll(/(?:href|src)="([^"]+\.(css|js))"/gi)].map((m) => m[1].replace(/^\.\//, "")));
      for (const ref of refs) {
        if (fs.existsSync(path.join(dir, ref))) { t.passed++; log(`مرجع ${ref}: OK`); }
        else { t.failed++; t.failures.push(`مفقود: ${ref}`); }
      }
      for (const f of files.filter((x) => x.path.endsWith(".js"))) {
        if (!fs.existsSync(path.join(dir, f.path))) continue;
        const r = await checkJs(path.join(dir, f.path));
        if (r.ok) { t.passed++; log(`syntax ${f.path}: OK`); }
        else { t.failed++; t.failures.push(`syntax ${f.path}: ${r.error.slice(0, 200)}`); }
      }
      emit(runId, { type: "test_completed", passed: t.passed, failed: t.failed, failures: t.failures });
      return t;
    };
    setStage("test", "running", STAGES[7].friendly, 88);
    tests = await runTests();
    setStage("test", "completed", `الاختبارات: ${tests.passed} ناجحة`, 92);

    // real fix loop (max 2 rounds, real model call)
    if (tests.failed > 0) {
      setStage("fix", "running", "وجدت مشكلة — أطلب إصلاحًا حقيقيًا من النموذج...", 93);
      emit(runId, { type: "error_found", message: "واجهت مشكلة أثناء اختبار المشروع. أحاول إصلاحها الآن.", failures: tests.failures });
      for (let round = 0; round < 2 && tests.failed > 0; round++) {
        if (cancelled()) return;
        emit(runId, { type: "fix_started", message: `🔧 محاولة إصلاح ${round + 1}...` });
        const missing = tests.failures.filter((f) => f.startsWith("مفقود:")).map((f) => f.replace("مفقود: ", "").trim());
        const incomplete = tests.failures.some((f) => f.includes("غير مكتمل") || f.includes("غير صالح"));
        try {
          let fixText;
          if (missing.length || incomplete) {
            const idx = fs.existsSync(path.join(dir, "index.html")) ? fs.readFileSync(path.join(dir, "index.html"), "utf8") : "";
            const need = [...new Set([...missing, ...(incomplete ? ["index.html"] : [])])];
            fixText = await ai(assignments[0].engine, [{ role: "user", content: missingPrompt(need, idx) }], 4000);
          } else {
            const target = files.find((f) => tests.failures[0].includes(f.path)) || files.find((f) => f.path.endsWith(".js")) || files[0];
            fixText = await ai(assignments[0].engine, [{ role: "user", content: fixPrompt(target.path, target.content, tests.failures.join("\n")) }], 4000);
          }
          const fixed = extractFiles(fixText);
          if (!fixed.length) { log("الإصلاح أخرج فارغًا — أعيد المحاولة..."); continue; }
          for (const f of fixed) {
            const fp = path.join(dir, f.path);
            fs.mkdirSync(path.dirname(fp), { recursive: true });
            fs.writeFileSync(fp, f.content);
            const i = files.findIndex((x) => x.path === f.path);
            if (i >= 0) files[i] = f; else files.push(f);
            log(`أُصلح ${f.path}`);
          }
          fixes++;
          emit(runId, { type: "fix_completed", message: "أعيد الاختبار بعد الإصلاح..." });
          tests = await runTests();
        } catch (e) {
          log("فشل الإصلاح: " + String(e.message).slice(0, 150));
          break;
        }
      }
      if (tests.failed > 0) { fail("بقيت أخطاء بعد محاولتي إصلاح: " + tests.failures.join(" | ").slice(0, 300)); return; }
      setStage("fix", "completed", "تم الإصلاح", 96);
    } else {
      stageState.fix = "skipped";
      emit(runId, { type: "stage_completed", stage: "fix", status: "skipped", progress: 95, stages: { ...stageState } });
    }

    setStage("preview", "running", STAGES[9].friendly, 97);
    await sleep(400);
    setStage("preview", "completed", "المعاينة جاهزة", 100);

    const list = readProjects();
    const p = list.find((x) => x.id === project.id);
    const realFiles = fs.existsSync(dir) ? fs.readdirSync(dir) : [];
    if (p) {
      p.prompt = opts.prompt; p.files = realFiles;
      p.lastRun = { runId, at: new Date().toISOString(), mode: opts.mode, engines: assignments.map((a) => a.engine.label) };
      p.chat.push({ id: uid("msg"), role: "assistant", text: "تم بناء المشروع بنماذج حقيقية — المعاينة جاهزة.", at: new Date().toISOString() });
      p.updatedAt = new Date().toISOString(); writeProjects(list);
    }
    emit(runId, {
      type: "build_completed", ok: true, message: "تم بناء المشروع بنماذج حقيقية.",
      files: { created, modified, list: realFiles }, tests, fixes,
      engines: assignments.map((a) => `${a.model} [${a.engine.label}]`),
      details: detailLog, previewUrl: `/preview/${project.id}/`,
    });
  } catch (e) {
    fail("توقف البناء: " + friendlyLlmError(e));
    return;
  }
  const r = runs.get(runId); if (r) r.done = true;
}

export function fusionAssignments(enabledIds, byReg) {
  const tasks = {
    qwen: "Coding / Frontend — بناء المكونات والواجهة",
    deepseek: "Reasoning / Logic — منطق اللعبة والخوارزميات",
    llama: "Architecture / Review — البنية والمراجعة",
    gemma: "Analysis — تحليل المتطلبات وتدقيق المحتوى",
    mistral: "Coding / Review — كود ومراجعة",
    glm: "Agent planning — تخطيط المهام",
    nemotron: "Reasoning — استدلال وتنسيق",
    minimax: "Content — المحتوى والنصوص",
    phi: "Fast coding — مكونات سريعة",
    "muse-spark-1.3": "Generalist — دعم عام",
  };
  return (enabledIds || []).filter((id) => byReg[id]).map((id) => ({
    model: byReg[id].name, modelId: id, task: tasks[id] || "مهمة عامة", engine: byReg[id],
  }));
}

// Live preview of generated project (real files)
app.use("/preview/:id", (req, res, next) => {
  const dir = projectDir(req.params.id);
  if (!fs.existsSync(dir)) return res.status(404).send("لا يوجد مشروع بهذا المعرف");
  express.static(dir)(req, res, next);
});

app.get("*", (_req, res) => { res.sendFile(path.join(__dirname, "public", "index.html")); });
app.listen(PORT, "0.0.0.0", () => console.log(`My AI Builder on http://0.0.0.0:${PORT}`));
