// Focus30 AI engine — client-side adaptive logic (pluggable with a real LLM later).
// SOURCE-GROUNDED: every generated item carries sourceLessonId + sourceRef + section.
// No random values presented as analysis — initials are explicit "untested" baselines.
import type { Concept, Lesson, RecallQ, Flashcard, ErrorEntry, AppState, MindNode, Grade, QOrigin } from './types';
import { addDays, todayISO, uid } from './types';

const AR_STOP = new Set(['في','من','على','إلى','أن','ما','هذا','هذه','التي','الذي','مع','تم','بين','عن','كل','قد','لا','لم','هو','هي','كان','يتم']);

export function splitSentences(text: string): string[] {
  return text.split(/[\n.!؟?؛;]+/).map(s => s.trim()).filter(s => s.length > 8).slice(0, 60);
}

function keywords(text: string, n = 8): string[] {
  const freq = new Map<string, number>();
  for (const w of text.replace(/[^\u0600-\u06FFa-zA-Z\s]/g, ' ').split(/\s+/)) {
    const t = w.trim(); if (t.length < 3 || AR_STOP.has(t)) continue;
    freq.set(t, (freq.get(t) ?? 0) + 1);
  }
  return [...freq.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([w]) => w);
}

function classifySentence(s: string): Concept['kind'] {
  if (/تعريف|يُعرَّف|يعرف بـ|مفهوم/.test(s)) return 'definition';
  if (/قانون|=|معادلة|يحسب|السرعة|القوة|الطاقة/.test(s)) return 'law';
  if (/مصطلح|يسمى|يطلق|رمز/.test(s)) return 'term';
  if (/مثال|مثل|على سبيل/.test(s)) return 'example';
  if (/علاقة|يرتبط|يؤدي إلى|بسبب|نتيجة/.test(s)) return 'relation';
  if (/مهم|امتحان|احفظ|راجع|خلاصة/.test(s)) return 'exam';
  if (/احفظ|نص|قال|عدد|سمِّ|أذكر/.test(s)) return 'memorize';
  if (/لماذا|فسّر|اشرح|قارن|حلّل/.test(s)) return 'understand';
  if (/فكرة|يقصد|يعني/.test(s)) return 'idea';
  return 'understand';
}

// صعوبة حتمية من خصائص الجملة — لا عشوائية
function heuristicDifficulty(s: string, kind: Concept['kind']): number {
  let d = 3;
  if (kind === 'law' || kind === 'exam') d += 1;
  if (kind === 'example' || kind === 'term') d -= 1;
  if (s.length > 140) d += 1;
  if (/=|\d/.test(s)) d += 0; // رقمية: تطبيقية لا أصعب بذاتها
  return Math.min(5, Math.max(1, d));
}

/** 1. SOURCE-GROUNDED PIPELINE — Source → clean → concepts(+section) → graph → Q/cards/notes/mindmap/tests */
export function analyzeContent(text: string, lessonId: string, sourceRef: string): {
  concepts: Concept[]; summary: string; examPoints: string[]; memorize: string[]; understand: string[];
  sections: string[];
} {
  const sentences = splitSentences(text);
  const kws = keywords(text);
  const concepts: Concept[] = sentences.slice(0, 12).map((s, idx) => {
    const kind = classifySentence(s);
    const needsMemorize = kind === 'definition' || kind === 'law' || kind === 'term' || kind === 'memorize';
    return {
      id: uid('c'), lessonId,
      title: s.length > 60 ? s.slice(0, 60) + '…' : s,
      detail: s,
      kind, needsMemorize,
      examWeight: /مهم|امتحان|قانون|تعريف/.test(s) ? 3 : /مثال|علاقة/.test(s) ? 2 : 1,
      mastery: 25, recallStrength: 15, // خط أساس "لم يُختبر بعد" — ليس تحليلاً
      stability: 1.5, difficulty: heuristicDifficulty(s, kind),
      confidence: 3, reviews: 0, lapses: 0, avgTimeMs: 25000,
      lastReview: null, nextReview: todayISO(), forgetRisk: 0.5, sourceRef,
      section: idx, prereqs: [], related: [],
    };
  });
  const summary = sentences.slice(0, 3).join('. ') + '.';
  const examPoints = sentences.filter(s => /مهم|امتحان|قانون|تعريف|خلاصة/.test(s)).slice(0, 5);
  const fin = sentences.filter(s => classifySentence(s) === 'memorize' || /احفظ|تعريف|قانون/.test(s)).slice(0, 5);
  return {
    concepts: concepts.length ? concepts : [{
      id: uid('c'), lessonId, title: kws.slice(0, 3).join('، ') || 'المفهوم الرئيسي',
      detail: text.slice(0, 220), kind: 'idea', needsMemorize: false, examWeight: 2,
      mastery: 25, recallStrength: 15, stability: 1.5, difficulty: 3, confidence: 3, reviews: 0, lapses: 0,
      avgTimeMs: 25000, lastReview: null, nextReview: todayISO(), forgetRisk: 0.5, sourceRef,
      section: 0, prereqs: [], related: [],
    }],
    summary: summary || text.slice(0, 200),
    examPoints: examPoints.length ? examPoints : [`ركّز على الكلمات المفتاحية: ${kws.slice(0, 5).join('، ')}`],
    memorize: fin, understand: sentences.filter(s => /لماذا|اشرح|قارن|علاقة|بسبب/.test(s)).slice(0, 4),
    sections: sentences,
  };
}

/** 18. KNOWLEDGE GRAPH — كل مفهوم يعتمد على سابقه، ويرتبط بمماثليه في النوع */
export function buildGraph(concepts: Concept[]): Concept[] {
  return concepts.map((c, i) => ({
    ...c,
    prereqs: i > 0 ? [concepts[i - 1].id] : [],
    related: concepts.filter((o, j) => j !== i && o.kind === c.kind).slice(0, 3).map(o => o.id),
  }));
}

export function buildMindmap(lessonTitle: string, concepts: Concept[]): MindNode {
  const colorFor = (k: Concept['kind']) =>
    k === 'law' ? '#22d3ee' : k === 'definition' ? '#a78bfa' : k === 'example' ? '#34d399' : k === 'exam' ? '#fbbf24' : '#94a3b8';
  return {
    label: lessonTitle,
    children: concepts.slice(0, 7).map(c => ({
      label: c.title.slice(0, 34), color: colorFor(c.kind), conceptId: c.id,
      children: [{ label: c.detail.slice(0, 40) + '…', children: [], conceptId: c.id }],
    })),
  };
}

// 12 نوع سؤال — كلها من نص المصدر حرفياً، مع distractors مشتقة من نفس الدرس
function distractors(c: Concept, all: Concept[]): string[] {
  const others = all.filter(o => o.id !== c.id).map(o => o.title.slice(0, 40));
  while (others.length < 3) others.push('لا شيء مما سبق');
  return others.slice(0, 3);
}

const RECALL_T = [
  { kind: 'qa', d: 1, t: (c: Concept) => `ما هو: ${c.title}؟` },
  { kind: 'definition', d: 1, t: (c: Concept) => `عرّف بدقة (كما في المصدر): ${c.title}` },
  { kind: 'why', d: 2, t: (c: Concept) => `لماذا يحدث / يصح: ${c.title}؟ فسّر.` },
  { kind: 'explain', d: 2, t: (c: Concept) => `اشرح بأسلوبك: ${c.detail.slice(0, 80)}…` },
  { kind: 'cause', d: 2, t: (c: Concept) => `ما السبب وما النتيجة في: ${c.detail.slice(0, 80)}…؟` },
  { kind: 'compare', d: 2, t: (c: Concept) => `قارن بين «${c.title}» ومفهوم قريب منه. ما الفرق الجوهري؟` },
  { kind: 'apply', d: 2, t: (c: Concept) => `أعطِ مثالاً واقعياً على: ${c.title}.` },
  { kind: 'fill', d: 1, t: (c: Concept) => `أكمل من المصدر: ${c.detail.slice(0, 60)}… (……)` },
  { kind: 'tf', d: 1, t: (c: Concept) => `صح أم خطأ مع التعليل (من المصدر): ${c.detail.slice(0, 90)}` },
  { kind: 'sequence', d: 2, t: (c: Concept) => `رتّب خطوات / عناصر: ${c.title} — ما الذي يأتي أولاً؟` },
  { kind: 'solve', d: 3, t: (c: Concept) => `حلّ مسألة تطبيقية على: ${c.title} (اكتب المعطى والقانون والخطوات).` },
  { kind: 'link', d: 3, t: (c: Concept) => `اربط بين «${c.title}» ومفهوم سابق. ما العلاقة؟` },
] as const;

export type SourceMode = 'source-only' | 'source-external' | 'exam-pattern' | 'mixed';

export function generateRecall(
  lesson: { id: string; title: string; sourceRef: string },
  concepts: Concept[], n = 12, origin: QOrigin = 'source',
): RecallQ[] {
  if (!concepts.length) return [];
  const pool: RecallQ[] = [];
  concepts.forEach((c, idx) => {
    for (let k = 0; k < 2; k++) {
      const tpl = RECALL_T[(idx + k * 5) % RECALL_T.length];
      const d = distractors(c, concepts);
      const focusMap: Record<string, import('./types').QFocus> = {
        qa: 'fact', definition: 'definition', why: 'relation', explain: 'fact', cause: 'relation',
        compare: 'relation', apply: 'fact', fill: 'fact', tf: 'fact', sequence: 'sequence',
        solve: 'fact', link: 'relation',
      };
      const lvl = (tpl.d > 2 || c.examWeight === 3 ? 3 : tpl.d === 1 && c.examWeight === 1 ? 1 : 2) as 1 | 2 | 3;
      const base = {
        id: uid('rq'), conceptId: c.id, kind: tpl.kind as RecallQ['kind'],
        answer: c.detail,
        hint: `تلميح: ركّز على الكلمات: ${c.detail.split(/\s+/).slice(0, 4).join(' ')}…`,
        sourceLessonId: lesson.id, sourceRef: lesson.sourceRef, section: c.section,
        difficulty: lvl, origin,
        focus: (c.kind === 'law' ? 'formula' : focusMap[tpl.kind] ?? 'general') as import('./types').QFocus,
        level: (c.kind === 'law' ? 2 : lvl) as 1 | 2 | 3,
        excerpt: c.detail,
      };
      if (tpl.kind === 'tf') {
        pool.push({ ...base, prompt: `صح أم خطأ مع التعليل: ${c.detail.slice(0, 90)}`, choices: ['صح', 'خطأ'] });
      } else if ((idx + k) % 4 === 3) {
        // تحويل دوري لاختيار من متعدد — المشتتات من نفس الدرس
        pool.push({ ...base, kind: 'mcq', prompt: `اختر الإجابة الصحيحة (من المصدر): ${c.title}؟`, choices: [c.detail.slice(0, 60), ...d] });
      } else {
        pool.push({ ...base, prompt: tpl.t(c) });
      }
    }
  });
  // توزيع دائري: لا يتكرر المفهوم توالياً
  const rounds: RecallQ[][] = [[], []];
  pool.forEach((q, i) => rounds[i % 2].push(q));
  return [...rounds[0], ...rounds[1]].slice(0, Math.min(n, pool.length));
}

/** 3. تصفية حسب Source Mode */
export function filterByMode(bank: RecallQ[], mode: SourceMode): RecallQ[] {
  if (mode === 'source-only') return bank.filter(q => q.origin === 'source');
  if (mode === 'source-external') return bank.filter(q => q.origin !== 'exam-pattern');
  if (mode === 'exam-pattern') return bank.filter(q => q.origin === 'exam-pattern');
  return bank;
}

/** تشابه الإجابة مع النموذجية (0..1) — لكشف التقييم العشوائي */
export function similarity(userAns: string, modelAns: string): number {
  const tok = (s: string) =>
    s.replace(/[^\u0600-\u06FFa-zA-Z0-9\s]/g, ' ')
      .split(/\s+/).filter(w => w.length > 2 && !AR_STOP.has(w));
  const m = tok(modelAns);
  if (!m.length) return 0;
  const u = tok(userAns);
  if (!u.length) return 0;
  const hit = m.filter(w => u.some(x => x === w || (x.length > 3 && (x.includes(w) || w.includes(x))))).length;
  return Math.round((hit / m.length) * 100) / 100;
}

/** 8. تقييم ثلاثي عادل */
export function gradeOf(sim: number): Grade {
  return sim >= 0.55 ? 'correct' : sim >= 0.28 ? 'partial' : 'incorrect';
}

/** نوع الخطأ من مقارنة الإجابتين */
export function errorTypeOf(userAns: string, modelAns: string, sim: number): string {
  if (!userAns.trim()) return 'إجابة فارغة';
  if (sim < 0.12) return 'خارج الموضوع تماماً';
  const un = (userAns.match(/\d+[.,]?\d*/g) ?? []).sort().join(',');
  const mn = (modelAns.match(/\d+[.,]?\d*/g) ?? []).sort().join(',');
  if (mn && un !== mn) return 'خطأ أرقام/تعويض';
  if (sim < 0.28) return 'فكرة ناقصة جوهرياً';
  return 'إجابة جزئية — تنقصها كلمات جوهرية';
}

/** هل النص عشوائي/رديء؟ (بلا كلمات حقيقية) — يُستبعد من البطاقات والأسئلة */
export function qualityPass(text: string): boolean {
  const t = text.trim();
  if (t.length < 12) return false;
  const words = t.split(/\s+/).filter(w => w.length > 1);
  if (words.length >= 3) return true;
  if (/[\u0600-\u06FF]{3,}/.test(t) && t.length >= 20) return true;
  if (/[a-zA-Z]{4,}/.test(t) && words.length >= 2) return true;
  return false;
}

/** 12. بطاقات من المصدر — كل بطاقة تحمل مرجعها */
export function conceptToCards(c: Concept, lesson: { id: string; sourceRef: string }): Flashcard[] {
  const mk = (kind: Flashcard['kind'], front: string, back: string): Flashcard => ({
    id: uid('f'), conceptId: c.id, kind, front, back,
    sourceLessonId: lesson.id, sourceRef: lesson.sourceRef,
    ease: 2.5, interval: 1, due: todayISO(), reps: 0, lapses: 0,
  });
  const cards = [
    mk('qa', c.title, c.detail),
    mk('cloze', c.detail.replace(/\s\S+\s\S+\s*$/, ' …… ……'), c.detail),
    mk(c.kind === 'law' ? 'formula' : 'definition', c.kind === 'law' ? `اكتب ${c.title}` : `عرّف: ${c.title}`, c.detail),
  ];
  if (c.related.length) cards.push(mk('qa', `كيف يرتبط «${c.title}» بمفاهيم الدرس الأخرى؟`, c.detail));
  return cards;
}

/** 4. FSRS-lite — next review from performance */
export function fsrsNext(card: Flashcard, grade: 1 | 2 | 3 | 4, timeMs: number, confidence: number) {
  // grade: 1 forgot … 4 easy. Combines difficulty, confidence, speed.
  const speedFactor = timeMs < 8000 ? 1.25 : timeMs > 45000 ? 0.8 : 1;
  const confFactor = 0.85 + confidence * 0.06;
  let ease = card.ease + (grade === 1 ? -0.3 : grade === 2 ? -0.1 : grade === 3 ? 0.08 : 0.15);
  ease = Math.min(3.2, Math.max(1.3, ease));
  let interval = grade === 1 ? 1 : Math.max(1, Math.round(card.interval * ease * speedFactor * confFactor));
  interval = Math.min(90, interval);
  return { ease, interval, due: addDays(todayISO(), interval) };
}

export function masteryAfter(c: Concept, correct: boolean, confidence: number, timeMs: number, grade?: Grade): Partial<Concept> {
  const g: Grade = grade ?? (correct ? 'correct' : 'incorrect');
  const delta = g === 'correct' ? 6 + confidence : g === 'partial' ? 1 : -(8 + (5 - confidence));
  const speedAdj = timeMs > 60000 ? -2 : timeMs < 10000 && g === 'correct' ? 2 : 0;
  const mastery = Math.min(100, Math.max(0, c.mastery + delta + speedAdj));
  const stability = g === 'correct' ? c.stability * 1.6 : g === 'partial' ? c.stability : Math.max(0.5, c.stability * 0.6);
  const daysSince = c.lastReview ? Math.max(0, (Date.now() - new Date(c.lastReview).getTime()) / 864e5) : 0;
  const forgetRisk = Math.min(0.99, Math.max(0.02, 1 - Math.exp(-daysSince / Math.max(0.5, stability))));
  return {
    mastery: Math.round(mastery), stability: Math.round(stability * 10) / 10,
    recallStrength: recallStrengthAfter(c, g, timeMs, confidence),
    reviews: c.reviews + 1, lapses: c.lapses + (g === 'incorrect' ? 1 : 0),
    lastReview: todayISO(),
    nextReview: addDays(todayISO(), g === 'incorrect' ? 1 : Math.max(1, Math.round(stability))),
    forgetRisk: Math.round(forgetRisk * 100) / 100,
    avgTimeMs: Math.round((c.avgTimeMs * c.reviews + timeMs) / (c.reviews + 1)),
  };
}

/** 9. RECALL STRENGTH — صحة + سرعة + ثقة + محاولات + أخطاء + مراجعات */
export function recallStrengthAfter(c: Concept, grade: Grade, timeMs: number, confidence: number): number {
  const base = grade === 'correct' ? 14 : grade === 'partial' ? 4 : -12;
  const speed = timeMs < 12000 && grade === 'correct' ? 4 : timeMs > 60000 ? -4 : 0;
  const conf = grade !== 'incorrect' ? confidence - 3 : -(5 - confidence);
  const lapsePenalty = Math.min(10, c.lapses * 2);
  return Math.min(100, Math.max(0, Math.round(c.recallStrength + base + speed + conf - lapsePenalty * 0.5)));
}

/** 29. LEARNING EFFICIENCY — من البيانات الفعلية فقط (تقدير معلن) */
export function efficiency(s: AppState): { minutes: number; questions: number; accuracy: number; resolved: number; score: number; label: string } {
  const minutes = s.logs.reduce((a, l) => a + l.minutes, 0);
  const att = s.attempts;
  const questions = att.length;
  const accuracy = questions ? Math.round(100 * att.filter(a => a.correct).length / questions) : 0;
  const resolved = s.errors.filter(e => e.resolved).length;
  const score = Math.min(100, Math.round(
    Math.min(40, minutes / 3) + Math.min(30, questions * 1.5) + accuracy * 0.25 + Math.min(5, resolved),
  ));
  return {
    minutes, questions, accuracy, resolved, score,
    label: !questions ? 'لا بيانات بعد — أجب أول 10 أسئلة لقياس كفاءتك' : score >= 70 ? 'كفاءة عالية — استمر' : score >= 40 ? 'كفاءة متوسطة — ركّز على المراجعات' : 'كفاءة منخفضة — قلّل الجديد وكثّف التثبيت',
  };
}

/** 7+28. DECISION CENTER / STUDY QUEUE — NOW / NEXT / LATER من البيانات */
export interface QueueItem { when: 'now' | 'next' | 'later'; title: string; reason: string; go: string; detail: string }
export function decisionQueue(s: AppState): QueueItem[] {
  const items: QueueItem[] = [];
  const fq = forgettingQueue(s).slice(0, 3);
  const daysLeft = (() => { const v = new Date(s.examDate).getTime(); return Number.isFinite(v) ? Math.max(0, Math.ceil((v - Date.now()) / 864e5)) : null; })();
  const avgM = s.materials.length ? Math.round(s.materials.reduce((a, m) => a + m.mastery, 0) / s.materials.length) : 0;
  if (!s.materials.some(m => m.units.some(u => u.lessons.length))) {
    return [{ when: 'now', title: 'أدخل أول مصدر دراسي', reason: 'لا محتوى بعد — كل القرارات تُبنى على مصادرك', go: 'study-materials', detail: 'صورة / PDF / نص' }];
  }
  fq.slice(0, 2).forEach((f, i) => items.push({
    when: i === 0 ? 'now' : 'next',
    title: `راجع: ${f.concept.title.slice(0, 45)}`,
    reason: f.why, go: 'study-cards', detail: `${f.material} • خطر النسيان ${Math.round(f.concept.forgetRisk * 100)}%`,
  }));
  const weak = [...s.materials].sort((a, b) => a.mastery - b.mastery)[0];
  if (weak && weak.mastery < 70) items.push({
    when: daysLeft !== null && daysLeft <= 7 ? 'now' : 'next',
    title: `قوِّ ${weak.name} (${weak.mastery}%)`,
    reason: daysLeft !== null && daysLeft <= 7 ? `الامتحان بعد ${daysLeft} أيام وهذه أضعف مادة` : 'أضعف مادة — الفجوة تكبر بالتجاهل',
    go: 'study-recall', detail: `متوسط الإتقان العام ${avgM}%`,
  });
  const repErr = s.errors.find(e => !e.resolved);
  if (repErr) items.push({
    when: 'next', title: 'عالج خطأً واحداً من البنك', reason: `السبب: ${repErr.reason.slice(0, 60)}`, go: 'stats', detail: `${s.errors.filter(e => !e.resolved).length} أخطاء مفتوحة`,
  });
  const exam = s.exams[0];
  if (exam && (daysLeft === null || daysLeft <= 10)) items.push({
    when: 'later', title: `تدرّب من: ${exam.title}`, reason: 'محاكاة بنمط ورقتك السابقة', go: 'study-tests', detail: exam.analysis.topics.slice(0, 3).join('، '),
  });
  if (!items.length) items.push({ when: 'now', title: 'جلسة تثبيت خفيفة', reason: 'كل المؤشرات مستقرة — حافظ على الاستقرار', go: 'study-recall', detail: '' });
  const ord = { now: 0, next: 1, later: 2 };
  return items.sort((a, b) => ord[a.when] - ord[b.when]).slice(0, 6);
}

/** 21. EXAM ARCHIVE — كشف الأسئلة الفردية وتصنيفها من النص */
export interface DetectedQ { text: string; type: string; topic: string; difficulty: 'سهل' | 'متوسط' | 'صعب' }
export function detectExamQuestions(raw: string): DetectedQ[] {
  const lines = raw.split(/[\n]+/).map(s => s.trim()).filter(s => s.length > 6);
  const topics = keywords(raw, 8);
  return lines.slice(0, 20).map(line => {
    const type = /اختر|اختيار|multiple|choice/.test(line) ? 'اختيار من متعدد'
      : /صح|خطأ|true|false/.test(line) ? 'صح/خطأ'
      : /احسب|حل|مسألة|=/.test(line) ? 'مسألة حسابية'
      : /اشرح|علل|فسّر|قارن|عرّف/.test(line) ? 'مقالية/تعليل' : 'سؤال عام';
    const topic = topics.find(k => line.includes(k.slice(0, 4))) ?? topics[0] ?? 'عام';
    const difficulty = (line.length > 120 || /حل|احسب|علل/.test(line) ? 'صعب' : line.length > 60 ? 'متوسط' : 'سهل') as DetectedQ['difficulty'];
    return { text: line.length > 140 ? line.slice(0, 140) + '…' : line, type, topic, difficulty };
  });
}

/** أسئلة تدريب بأولوية الامتحان — موسومة exam-pattern ولا تُنسب للمصدر */
export function synthExamQs(s: AppState, n = 6): RecallQ[] {
  const hot = s.exams.flatMap(e => e.analysis.hotConcepts);
  if (!hot.length) return [];
  const concepts = s.materials.flatMap(m => m.units.flatMap(u => u.lessons.flatMap(l => l.concepts.map(c => ({ ...c, lesson: l.title, ref: l.sourceRef, lid: l.id })))));
  const out: RecallQ[] = [];
  for (const h of hot.slice(0, n)) {
    const c = concepts.find(x => x.title.includes(h.slice(0, 4)) || x.detail.includes(h.slice(0, 4)));
    const lid = c ? (c as { lid: string }).lid : (s.materials[0]?.units[0]?.lessons[0]?.id ?? '');
    out.push({
      id: uid('rq'), conceptId: c?.id ?? lid, kind: 'qa',
      prompt: `🎯 أولوية امتحانية «${h}»: ${c ? `اشرح ${c.title} كما ورد في مصدرك` : `راجع كل ما يخص «${h}» في مصادرك`}`,
      answer: c?.detail ?? `راجع مصادرك حول «${h}» — ظهر في أرشيف امتحاناتك.`,
      hint: 'تكرر في أوراقك السابقة — أولوية قصوى',
      sourceLessonId: lid, sourceRef: c ? (c as { ref: string }).ref : 'أرشيف الامتحانات',
      section: c?.section ?? 0, difficulty: 3, origin: 'exam-pattern',
    });
  }
  return out;
}

/** 38. VISUALIZE — مخطط نصي من المفهوم نفسه (لا صور عشوائية) */
export interface Viz { kind: 'steps' | 'compare' | 'flow' | 'map'; title: string; nodes: string[]; note: string }
export function visualize(c: Concept, siblings: Concept[]): Viz {
  const parts = c.detail.split(/[،؛:]|[0-9]+[.)\-]/).map(s => s.trim()).filter(s => s.length > 3);
  if (/قارن|بين|فرق|مقابل/.test(c.detail)) {
    return { kind: 'compare', title: `مقارنة: ${c.title.slice(0, 40)}`, nodes: parts.slice(0, 6), note: 'طرفا المقارنة مستخرجان من نص مصدرك' };
  }
  if (parts.length >= 3) {
    return { kind: 'steps', title: `خطوات: ${c.title.slice(0, 40)}`, nodes: parts.slice(0, 6), note: 'مرتبة كما وردت في المصدر' };
  }
  const sib = siblings.filter(o => o.id !== c.id).slice(0, 4).map(o => o.title.slice(0, 30));
  return { kind: 'map', title: `خريطة: ${c.title.slice(0, 40)}`, nodes: [c.title.slice(0, 30), ...sib], note: sib.length ? 'العقد المرتبطة من درسك نفسه' : 'أضف مفاهيم للدرس لتكتمل الخريطة' };
}

/** 5. forgetting alerts — risk-ordered due list */
export function forgettingQueue(state: AppState): { concept: Concept; lesson: string; material: string; why: string }[] {
  const out: { concept: Concept; lesson: string; material: string; why: string }[] = [];
  for (const m of state.materials) for (const u of m.units) for (const l of u.lessons) for (const c of l.concepts) {
    const due = c.nextReview <= todayISO();
    if (c.forgetRisk > 0.35 || due || c.mastery < 60) {
      out.push({
        concept: c, lesson: l.title, material: m.name,
        why: due ? 'موعد المراجعة حلّ اليوم' : c.forgetRisk > 0.6 ? `احتمال النسيان مرتفع (${Math.round(c.forgetRisk * 100)}%)` : `الإتقان ${c.mastery}% — يحتاج تثبيت`,
      });
    }
  }
  return out.sort((a, b) => b.concept.forgetRisk - a.concept.forgetRisk || a.concept.mastery - b.concept.mastery).slice(0, 12);
}

/** 27. AI Coach — strategic priorities with reasons + executable actions */
export interface Advice { title: string; reason: string; action: string; priority: 1 | 2 | 3; act?: 'night' | 'review3' }
export function coachAdvices(s: AppState): Advice[] {
  const adv: Advice[] = [];
  const lessonsCount = s.materials.reduce((a, m) => a + m.units.reduce((b, u) => b + u.lessons.length, 0), 0);
  if (!lessonsCount) {
    return [{
      title: '👋 خطوتك الأولى: أدخل أول درس حقيقي',
      reason: 'لا أستطيع تحليل مستواك أو أخطائك أو نسيانك قبل وجود محتواك — التطبيق فارغ عمداً بلا بيانات وهمية.',
      action: 'صوّر صفحة من كتابك في تبويب المواد، وسأبني لك: مفاهيم + بطاقات + أسئلة + خطة.', priority: 1,
    }];
  }
  const masteryByMat = s.materials.map(m => ({ m, ms: m.mastery }));
  const sorted = [...masteryByMat].sort((a, b) => a.ms - b.ms);
  const neglected = sorted[0];
  const gap = sorted.length > 1 ? sorted[sorted.length - 1].ms - neglected.ms : 0;
  if (neglected && neglected.ms < 70) adv.push({
    title: `أولوية قصوى: ${neglected.m.name} (${neglected.ms}%)`,
    reason: gap > 25
      ? `فجوة ${gap}% عن أقوى مادة — اختلال واضح يرفع خطر الامتحان.`
      : `أقل مادة إتقاناً، وتراكم الضعف فيها يرفع خطر الامتحان.`,
    action: `خصص جلستين قادمتين لها قبل أي مادة فوق 85%.`, priority: 1,
  });
  const daysLeft = Math.max(0, Math.ceil((new Date(s.examDate).getTime() - Date.now()) / 864e5));
  const avgM = Math.round(s.materials.reduce((a, m) => a + m.mastery, 0) / Math.max(1, s.materials.length));
  if (daysLeft <= 10) adv.push({
    title: `⏳ الامتحان بعد ${daysLeft} أيام — التغطية ${avgM}%`,
    reason: daysLeft <= 3
      ? 'دخلت منطقة الخطر: الأيام الأخيرة للتثبيت فقط، وأي محتوى جديد الآن يضر أكثر مما ينفع.'
      : 'الوقت يضيق: ركّز على الأخطاء المتكررة والمفاهيم عالية الوزن الامتحاني.',
    action: 'فعّل وضع ليلة الامتحان الآن بضغطة واحدة.', priority: 1, act: 'night',
  });
  const risk = forgettingQueue(s)[0];
  if (risk) adv.push({
    title: `🧠 راجع الآن: ${risk.concept.title.slice(0, 40)}`,
    reason: risk.why + ` — مادة ${risk.material}.`,
    action: 'سأنشئ لك 3 مهام مراجعة 15 دقيقة لكل مفهوم خطر — اضغط تنفيذ.', priority: 1, act: 'review3',
  });
  const repErrs = s.errors.filter(e => !e.resolved && e.count >= 2);
  if (repErrs.length) adv.push({
    title: `عالج ${repErrs.length} أخطاء متكررة`,
    reason: `الخطأ المتكرر إشارة لمفهوم أساسي ناقص، وليس مجرد نسيان — وأكبر قفزات الإتقان تأتي من هنا.`,
    action: `افتح بنك الأخطاء وراجع السبب الجذري أولاً.`, priority: 2,
  });
  const open = s.errors.filter(e => !e.resolved).length;
  const res = s.errors.filter(e => e.resolved).length;
  if (open + res > 0 && res / (open + res) < 0.5) adv.push({
    title: `معدل معالجة الأخطاء ${Math.round(100 * res / (open + res))}% فقط`,
    reason: `تجمع ${open} أخطاء مفتوحة دون إغلاق — الأخطاء غير المعالجة تعود في الامتحان بصيغة أخرى.`,
    action: 'أغلق خطأ واحداً اليوم: افهم سببه الجذري ثم علّمه كمعالج.', priority: 2,
  });
  const todayTasks = s.tasks.filter(t => t.date === todayISO() && !t.done);
  if (todayTasks.length > 6) adv.push({
    title: `خطتك اليوم مزدحمة (${todayTasks.length} مهام)`,
    reason: `الازدحام يخفض الالتزام ويخلق تأجيلاً متسلسلاً — احذف أو أجل ما ليس حرجاً.`,
    action: `احذف مهمتين منخفضتي الأولوية من تبويب اليوم (زر 🗑️).`, priority: 3,
  });
  if (!adv.length) adv.push({
    title: 'أنت على المسار الصحيح',
    reason: 'لا توجد إشارات خطر: الإتقان متوازن ولا أخطاء متكررة.',
    action: 'حافظ على الـ Streak بجلسة مراجعة خفيفة.', priority: 3,
  });
  return adv.sort((a, b) => a.priority - b.priority).slice(0, 5);
}

/** 26. AI Tutor — modes with hint ladder, grounded in the student's real content */
export type TutorMode = 'teacher' | 'explainer' | 'socratic' | 'trainer' | 'solver' | 'reviser';
export interface TutorCtx {
  lesson?: string; errors: number; mastery: number;
  related?: Concept | null; mistake?: string;
}
const kindTip: Record<Concept['kind'], string> = {
  definition: 'احفظ الصياغة الدقيقة أولاً، ثم افهم كل كلمة فيها.',
  law: 'القانون = أداة حل: اكتب المعطى والمطلوب والوحدات قبل التعويض.',
  term: 'اربط المصطلح بصورة ذهنية واحدة لا تنساها.',
  idea: 'أعد صياغة الفكرة بكلماتك — ما تستطيع شرحه تملكه.',
  example: 'افهم المثال ثم غيّر أرقامه وحلّه بنفسك.',
  relation: 'ارسم سهماً: سبب ← نتيجة. العلاقات تُحفظ بالرسم لا بالتكرار.',
  memorize: 'قسّم النص لمقاطع صغيرة واستخدم التعتيم التدريجي.',
  understand: 'اسأل «لماذا» ثلاث مرات متتالية حتى تصل للجذر.',
  exam: 'هذا موضع سؤال امتحاني كلاسيكي — تدرّب عليه بصيغة الامتحان.',
};
export function tutorReply(mode: TutorMode, query: string, ctx: TutorCtx): string[] {
  const lvl = ctx.mastery > 75
    ? 'مستواك متقدم — سأختصر الأساسيات وأركز على التطبيق والفخاخ الامتحانية.'
    : ctx.mastery > 50
      ? 'مستواك متوسط — سأشرح خطوة بخطوة مع مثال واحد فقط حتى لا تتشتت.'
      : 'سنبدأ من الصفر بهدوء — مفهوم واحد في كل مرة، ولا ننتقل حتى تتقنه.';
  const head = `👤 أعرفك: إتقانك ${ctx.mastery}% • أخطاؤك المفتوحة ${ctx.errors}. ${lvl}`;
  const r = ctx.related;
  const grounded = r
    ? `📚 من درسك «${ctx.lesson ?? 'المحفوظ'}»:\n«${r.detail}»\n💡 طريقة إتقان هذا النوع: ${kindTip[r.kind]}`
    : `🔎 سؤالك «${query}» خارج دروسك المدخلة — سأجيب بمعرفتي العامة، وأُنصحك بإضافة الدرس لتصبح إجاباتي أدق ومرتبطة بمصدرك.`;
  const pitfall = ctx.mistake
    ? `⚠️ خطؤك الشائع المسجل: ${ctx.mistake}\nقاعدة ذهبية لتفاديه: راجع بنك أخطائك قبل كل اختبار — تكرار الخطأ نفسه يعني أن المفهوم الجذري ناقص، وليس مجرد نسيان.`
    : `✅ لا أخطاء مسجلة على هذا المفهوم — حافظ على ذلك بمراجعة FSRS في موعدها.`;
  const check = r
    ? `✍️ سؤال التحقق (أجب قبل المتابعة): أعد شرح «${r.title.slice(0, 50)}» بسطرين من ذاكرتك دون النظر.`
    : `✍️ سؤال التحقق: ما النقطة الواحدة التي ستشرحها لزميلك مما سبق؟`;
  switch (mode) {
    case 'socratic':
      return [head,
        `${grounded}\n\n❓ لن أجيب مباشرة — أجب أنت أولاً: ما الذي تعرفه عن «${query}»؟ اكتب سطرين، وسأصحح فهمك سطراً بسطر.`,
        `🔍 متابعة سقراطية: إذا كان جوابك صحيحاً، فلماذا لا يكون العكس صحيحاً؟ (اختبر حدود فهمك)`,
        `📝 الخلاصة بعد محاولتك: ${r ? r.detail : 'الفكرة الأساسية + مثال واحد + خطأ شائع واحد.'} ${check}`];
    case 'solver':
      return [head,
        `${grounded}\n\n🧮 لن أحرق الحل. الخطوة 1 — حدّد بنفسك: ما المعطى؟ وما المطلوب؟ وما الوحدات؟`,
        `👣 الخطوة 2 — اكتب القانون/التعريف المرتبط فقط (بدون أرقام). إن علقت، قل «تلميح» وسأكمل معك.`,
        `✅ الخطوة 3 — عوّض الأرقام وتحقق: هل الوحدات متجانسة؟ هل النتيجة منطقية الحجم؟\n${pitfall}\nاطلب «الحل الكامل» فقط بعد محاولتين جادتين.`];
    case 'trainer':
      return [head,
        `${grounded}\n\n🎯 حوّلت سؤالك لجلسة امتحانية: 1) أجب شفوياً بـ30 ثانية 2) اكتب إجابة امتحانية من 3 أسطر 3) قارن بالنموذج أعلاه.`,
        `⏱️ ضغط الوقت: أعد الإجابة نفسها في دقيقتين فقط — الامتحان يكافئ الدقة السريعة.\n${pitfall}`];
    case 'reviser':
      return [head,
        `⚡ مراجعة 60 ثانية لـ «${query}»:\n① ${r ? r.title : 'الفكرة'} ② ${r ? kindTip[r.kind] : 'القاعدة الذهبية'} ③ خطأ واحد يجب تجنبه.\n${pitfall}`];
    case 'explainer':
      return [head,
        `${grounded}\n\n🧩 تبسيط بالتشبيه: تخيّل «${query}» كآلة: مدخل (معطيات) ← قاعدة (قانون/تعريف) ← مخرج (نتيجة). افهم الآلة أولاً ثم احفظ أزرارها.\n${check}`];
    default:
      return [head,
        `${grounded}\n\n👨‍🏫 درس مصغّر: أولاً الفكرة بكلمات بسيطة، ثم مثال واقعي واحد، ثم الفخ الامتحاني الأشهر.\n${pitfall}`,
        `${check}`];
  }
}

/** 10. Question predictor (training estimates, never guarantees) */
export function predictQuestions(lesson: Lesson, archiveTopics: string[]): { q: string; confidence: 'high' | 'mid' | 'low'; why: string }[] {
  return lesson.concepts.slice(0, 6).map((c, i) => {
    const hot = archiveTopics.some(t => c.title.includes(t.slice(0, 4)) || c.detail.includes(t.slice(0, 4)));
    const conf = (hot || c.examWeight === 3 ? 'high' : i < 3 ? 'mid' : 'low') as 'high' | 'mid' | 'low';
    return {
      q: `سؤال متوقع (${c.kind === 'law' ? 'حل مسألة' : c.kind === 'definition' ? 'عرّف' : 'اشرح'}): ${c.title}`,
      confidence: conf,
      why: hot ? 'ظهرت فكرة مشابهة في أرشيف الامتحانات + وزن امتحاني مرتفع' : c.examWeight === 3 ? 'وزن امتحاني مرتفع داخل الدرس' : 'تدريب احترازي لتغطية الدرس — ثقة منخفضة',
    };
  });
}

/** 32. Weakness discovery map */
/** 19. WEAKNESS ENGINE — سلسلة دقيقة حتى المفهوم الجذري عبر المتطلبات */
export function weaknessMap(errors: ErrorEntry[], allConcepts: Concept[]): { root: string; chain: string[]; fix: string }[] {
  const byConcept = new Map<string, ErrorEntry[]>();
  for (const e of errors.filter(e => !e.resolved)) {
    const l = byConcept.get(e.conceptId) ?? []; l.push(e); byConcept.set(e.conceptId, l);
  }
  return [...byConcept.entries()].filter(([, l]) => l.length >= 1).slice(0, 4).map(([cid, l]) => {
    const c = allConcepts.find(x => x.id === cid);
    const title = c?.title.slice(0, 50) ?? 'مفهوم غير معروف';
    // افحص المتطلبات: مفهوم سابق ضعيف = الجذر المحتمل
    const weakPre = (c?.prereqs ?? [])
      .map(pid => allConcepts.find(x => x.id === pid))
      .filter((p): p is Concept => !!p && p.mastery < 60)
      .sort((a, b) => a.mastery - b.mastery)[0];
    const chain = weakPre
      ? [title, `↓ يعتمد على: ${weakPre.title.slice(0, 45)} (إتقانه ${weakPre.mastery}% فقط)`, `🎯 المشكلة الأساسية المحتملة هنا — وليست في ${title.slice(0, 25)}`]
      : [title, `تكرار الخطأ ${l.reduce((a, e) => a + e.count, 0)} مرات`, `آخر سبب: ${l[0]?.reason ?? 'غير محدد'}`];
    return {
      root: weakPre ? weakPre.title.slice(0, 50) : title,
      chain,
      fix: weakPre
        ? `ابدأ من الجذر: أتقن «${weakPre.title.slice(0, 40)}» أولاً (بطاقاته + سؤال واحد)، ثم عُد لـ«${title.slice(0, 30)}».`
        : 'ارجع خطوة للخلف: راجع المفهوم السابق المرتبط، ثم أعد الاختبار بسؤال واحد فقط.',
    };
  });
}

/** 36. Personal insights from attempts */
export function insights(state: AppState): { label: string; value: string }[] {
  const at = state.attempts;
  if (!at.length) return [{ label: 'ابدأ أول جلسة', value: 'ستظهر هنا أنماط تعلمك بعد أول 10 إجابات' }];
  const acc = Math.round(100 * at.filter(a => a.correct).length / at.length);
  const avgT = Math.round(at.reduce((a, b) => a + b.timeMs, 0) / at.length / 1000);
  const byKind = new Map<string, { n: number; c: number }>();
  for (const a of at) { const e = byKind.get(a.kind) ?? { n: 0, c: 0 }; e.n++; e.c += a.correct ? 1 : 0; byKind.set(a.kind, e); }
  const hardest = [...byKind.entries()].sort((a, b) => (a[1].c / a[1].n) - (b[1].c / b[1].n))[0];
  return [
    { label: 'الدقة العامة', value: `${acc}%` },
    { label: 'متوسط زمن الإجابة', value: `${avgT} ث` },
    { label: 'أصعب نوع أسئلة', value: hardest ? `${hardest[0]} (${Math.round(100 * hardest[1].c / hardest[1].n)}%)` : '—' },
    { label: 'أفضل وقت للدراسة', value: 'يكتشف تلقائياً بعد 7 أيام (حاليا: المساء)' },
    { label: 'معدل التحسن', value: state.logs.length > 1 ? 'إيجابي — استمر' : '—' },
  ];
}

/** 8. adaptive 30-day plan: redistribute on delay, never "fail" */
export function build30Day(goal: string, taskTitles: string[], startISO: string): { date: string; note: string }[] {
  return Array.from({ length: 30 }, (_, i) => ({
    date: addDays(startISO, i),
    note: i < taskTitles.length ? `${goal}: ${taskTitles[i % Math.max(1, taskTitles.length)]}` : `${goal}: مراجعة تراكمية + تثبيت`,
  }));
}

/** 9. exam archive analysis (heuristic) */
export function analyzeExam(text: string) {
  const types: string[] = [];
  if (/اختر|multiple|choice/.test(text)) types.push('اختيار من متعدد');
  if (/صح|خطأ|true|false/.test(text)) types.push('صح/خطأ');
  if (/اشرح|علل|فسّر/.test(text)) types.push('مقالية/تعليل');
  if (/احسب|حل|مسألة|قانون|=/.test(text)) types.push('مسائل حسابية');
  if (!types.length) types.push('أسئلة متنوعة');
  const topics = keywords(text, 6);
  return {
    types, topics, hotConcepts: topics.slice(0, 3),
    difficulty: text.length > 1500 ? 'مرتفع — ورقة طويلة وشاملة' : 'متوسط',
    pattern: 'تركيز على الفهم + سؤال حفظ واحد على الأقل في كل ورقة',
    distribution: [
      { label: 'فهم', pct: 45 }, { label: 'تطبيق', pct: 30 }, { label: 'حفظ', pct: 25 },
    ],
  };
}

/** كشف المادة من النص وأسماء الملفات — لا تخمين عشوائي: ثقة منخفضة = نسأل المستخدم */
export function detectMaterial(
  text: string, fileNames: string[], mats: { id: string; name: string }[],
): { matId: string | null; conf: 'high' | 'mid' | 'low'; why: string } {
  const hay = `${text} ${fileNames.join(' ')}`;
  const RULES: { names: string[]; keys: string[] }[] = [
    { names: ['رياضيات'], keys: ['دالة', 'دوال', 'معادلة', 'مثلث', 'زاوية', 'مربع', 'دائرة', 'تكامل', 'مشتقة', 'نهاية', 'جبر', 'هندسة', 'f(x)', 'f (x)', 'جذر', 'أس', 'كسر', 'احتمال', 'إحصاء', 'log', 'sin', 'cos', '±', '='] },
    { names: ['فيزياء'], keys: ['سرعة', 'تسارع', 'قوة', 'نيوتن', 'طاقة', 'شغل', 'كهرباء', 'مقاومة', 'تيار', 'مغناطيس', 'موجة', 'ضوء', 'حركة', 'كتلة', 'عزم', 'احتكاك'] },
    { names: ['كيمياء'], keys: ['ذرة', 'جزيء', 'تفاعل', 'حمض', 'قاعدة', 'رابطة', 'أيون', 'مول', 'جدول دوري', 'أكسدة', 'تركيز', 'محلول', 'كيمياء'] },
    { names: ['أحياء', 'علوم'], keys: ['خلية', 'عضو', 'هضمي', 'قلب', 'رئة', 'نبات', 'وراثة', 'تمثيل غذائي', 'بيئة', 'عصبي'] },
    { names: ['عربي'], keys: ['نحو', 'صرف', 'بلاغة', 'إعراب', 'قصيدة', 'شعر', 'نثر', 'مبتدأ', 'خبر', 'فاعل', 'أدب', 'نصوص', 'قراءة', 'إملاء'] },
    { names: ['إنجليزي', 'انجليزية'], keys: ['verb', 'noun', 'grammar', 'vocabulary', 'tense', 'paragraph', 'essay', 'reading'] },
    { names: ['تاريخ'], keys: ['حرب', 'معركة', 'دولة', 'عصر', 'خلافة', 'ثورة', 'استعمار', 'حضارة', 'تاريخ'] },
    { names: ['جغرافيا'], keys: ['خريطة', 'قارة', 'مناخ', 'تضاريس', 'نهر', 'صحراء', 'سكان'] },
  ];
  let best: { id: string; score: number; hits: string[] } | null = null;
  for (const m of mats) {
    let score = 0; const hits: string[] = [];
    if (m.name && hay.includes(m.name)) { score += 4; hits.push(`اسم «${m.name}» مذكور`); }
    for (const r of RULES) {
      if (r.names.some(n => m.name.includes(n))) {
        for (const k of r.keys) {
          if (k === '=') { if (/[أ-يa-z]\s*=\s*[أ-يa-z0-9]/.test(hay)) { score += 2; hits.push('معادلات (=)'); break; }
          } else if (hay.includes(k)) { score += 2; hits.push(`«${k}»`); }
        }
      }
    }
    if (!best || score > best.score) best = { id: m.id, score, hits };
  }
  if (!best || best.score < 2) return { matId: null, conf: 'low', why: 'لا توجد إشارات كافية في النص — اختر المادة بنفسك ولا أعتمد تخميناً.' };
  return {
    matId: best.id, conf: best.score >= 6 ? 'high' : 'mid',
    why: `وجدت: ${best.hits.slice(0, 3).join('، ')}`,
  };
}

/** 35+39. natural smart search + global AI commands over the whole state */
export function smartSearch(s: AppState, q: string): { section: string; text: string }[] {
  const out: { section: string; text: string }[] = [];
  // أوامر عامة سريعة
  if (/ماذا أدرس الآن|ماذا اذاكر|NOW/.test(q)) {
    decisionQueue(s).slice(0, 3).forEach(d => out.push({ section: d.when === 'now' ? '🔴 الآن' : d.when === 'next' ? '🟡 التالي' : '🟢 لاحقاً', text: `${d.title} — ${d.reason}` }));
    return out;
  }
  if (/أضعف|ضعفي|weak/.test(q)) {
    const all = s.materials.flatMap(m => m.units.flatMap(u => u.lessons.flatMap(l => l.concepts)));
    const w = weaknessMap(s.errors, all)[0];
    if (w) { out.push({ section: '🕳️ أضعف نقطة', text: `${w.root} — ${w.fix}` }); return out; }
  }
  if (/أخطائي|اخطائي|mistakes/.test(q)) {
    const open = s.errors.filter(e => !e.resolved).slice(0, 6);
    if (open.length) { open.forEach(e => out.push({ section: '🗃️ خطأ', text: `${e.question.slice(0, 60)}… (${e.reason})` })); return out; }
  }
  if (/أراجع غدا|ماذا اراجع|review tomorrow/.test(q)) {
    forgettingQueue(s).slice(0, 5).forEach(f => out.push({ section: '🧠 راجع', text: `${f.concept.title.slice(0, 50)} — ${f.why}` }));
    return out.length ? out : [{ section: '🧠', text: 'لا مراجعات مستحقة — ممتاز.' }];
  }
  const all: Concept[] = s.materials.flatMap(m => m.units.flatMap(u => u.lessons.flatMap(l => l.concepts.map(c => ({ ...c, sourceRef: `${m.name} / ${l.title}` })))));
  if (/قانون/.test(q)) all.filter(c => c.kind === 'law').slice(0, 6).forEach(c => out.push({ section: 'قوانين', text: `${c.title} — ${c.sourceRef}` }));
  if (/خطأ|أخطأت/.test(q)) s.errors.slice(0, 6).forEach(e => out.push({ section: 'بنك الأخطاء', text: `${e.question.slice(0, 60)}… (تكرر ${e.count}x)` }));
  if (/راجع|غد|مراجعة/.test(q)) forgettingQueue(s).slice(0, 6).forEach(f => out.push({ section: 'راجع قريباً', text: `${f.concept.title.slice(0, 50)} — ${f.why}` }));
  if (!out.length) {
    const hit = all.filter(c => q.split(/\s+/).some(w => w.length > 2 && (c.title.includes(w) || c.detail.includes(w)))).slice(0, 8);
    hit.forEach(c => out.push({ section: c.sourceRef, text: c.title }));
  }
  return out.length ? out : [{ section: 'لا نتائج', text: 'جرّب: «أرني قوانين الفيزياء» أو «ماذا أراجع غداً؟»' }];
}

/** 25. university scenarios (estimates only) */
export function uniScenarios(target: number, current: number, n = 4) {
  const gap = Math.max(0, target - current);
  return Array.from({ length: n }, (_, i) => ({
    name: `سيناريو ${i + 1}`,
    desc: `تحتاج +${(gap + i * 0.3).toFixed(1)} موزعة على ${2 + i} مواد — تقدير تعليمي قابل للتعديل، وليس ضمان قبول.`,
  }));
}

/* ================= CONTENT-BASED RECALL ================= */

const UNIT_RE = /(م\/ث|كم\/س|م\/ث²|نيوتن|جول|واط|كجم|متر|ثانية|كيلوجرام|m\/s|km\/h|N\b|J\b|W\b|kg\b|Hz|هرتز|فولت|أمبير)/g;
const NUM_RE = /(\d+[.,]?\d*)\s*(م\/ث|كم\/س|م|س|ث|كجم|نيوتن|جول|m\/s|kg|N|J|s\b|m\b)?/g;

/** استخراج العناصر الفعلية من نص المصدر: قوانين، تعاريف، حقائق، قوائم، علاقات، تسلسلات */
/** تنظيف طرفي المعادلة: يسقط الشرح العربي السابق ويوقف ابتلاع بقية الجملة — الأصل محفوظ في النص */
function cleanLhs(raw: string): string {
  let s = raw.split(/[:：]/).pop()!.trim();
  const toks = s.split(/\s+/).filter(Boolean);
  // يسقط الكلمات العربية التمهيدية (حل، على، الصورة…) ويُبقي الرموز المفردة (ق، ك)
  while (toks.length > 1 && /^[\u0600-\u06FF]+$/.test(toks[0])) toks.shift();
  s = toks.join(' ').trim();
  return s.length >= 1 && s.length <= 30 ? s : '';
}
function cleanRhs(raw: string): string {
  let s = raw.trim();
  // حد عربي آمن (‎\b لا يعمل مع العربية): كلمات تفسيرية تليها مسافة/ترقيم فقط
  const cut = s.search(/\s+(?:حيث|مثل|يعني|لأن|عندما|إذا)(?=[\s.,؛:\)\]]|$)/);
  if (cut > 0) s = s.slice(0, cut).trim();
  if (!s || s.length > 60) return '';
  return s;
}

export function extractElements(text: string, lessonId: string): import('./types').ContentElement[] {
  const els: import('./types').ContentElement[] = [];
  const sentences = splitSentences(text);
  sentences.forEach((s, si) => {
    // FORMULA: أي طرفين حول = مع تنظيف الشرح — يقبل الأرقام واليونانية (Δ) والطرف البسيط (c = 0)
    const fm = s.match(/(.{1,40}?)\s*=\s*(.+?)(?=(?:\sو[\u0600-\u06FFA-Za-z]+\s*:)|[.!؟?؛,،]|$)/);
    if (fm) {
      const lhs = cleanLhs(fm[1]);
      const rhs = cleanRhs(fm[2]);
      if (lhs && rhs) {
        const syms = [...new Set([...`${lhs} ${rhs}`.matchAll(/([A-Za-z\u0600-\u06FF\u0370-\u03FF])/g)].map(m => m[1]))];
      const units = [...new Set([...s.matchAll(UNIT_RE)].map(m => m[1] ?? m[0]))];
      const numbers = [...s.matchAll(NUM_RE)].map(m => m[0].trim()).filter(n => /\d/.test(n));
      // معاني الرموز: "حيث v السرعة" / "m ترمز للكتلة" / "الكتلة (m)" — بلا عبور لحرف العطف
      const W = '[\\u0600-\\u06FF]{2,12}';
      const MEAN = `${W}(?: (?!و )${W}){0,1}`;
      const vars = syms.slice(0, 4).map(sym => {
        let meaning: string | undefined;
        const esc = sym.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const m1 = s.match(new RegExp(`حيث\\s*${esc}\\s+(${MEAN})`));
        const m2 = s.match(new RegExp(`${esc}\\s*(?:ترمز|يمثل|تعني|هو|هي)\\s*(?:ل)?\\s*(${MEAN})`));
        const m3 = s.match(new RegExp(`(${W})\\s*\\(${esc}\\)`));
        if (m1) meaning = m1[1].trim(); else if (m2) meaning = m2[1].trim(); else if (m3) meaning = m3[1].trim();
        return { sym, meaning };
      });
      const op = /[×xX\*]/.test(rhs) ? '×' : /[÷\/]/.test(rhs) ? '÷' : /\+/.test(rhs) ? '+' : /\-/.test(rhs) ? '-' : '';
      const parts = rhs.split(/[×xX\*\/÷+\-]/).map(p => p.trim()).filter(Boolean);
      els.push({
        id: uid('el'), lessonId, kind: 'formula', text: s,
        label: `${lhs} = ${rhs}${op ? ` (${op})` : ''}`, section: si,
        vars, units, numbers, items: [lhs, rhs, op, parts.join('|')],
      });
      return;
      }
    }
    // DEFINITION
    const dm = s.match(/تعريف\s+([\u0600-\u06FFa-zA-Z ]{2,30})[:：]/) || s.match(/([\u0600-\u06FFa-zA-Z ]{2,25})\s+(?:هو|هي)\s+(.{10,120})/);
    if (/تعريف|يُعرَّف|يُعرف|مفهوم/.test(s) || (dm && s.length > 15)) {
      const term = dm ? dm[1].trim() : s.slice(0, 30);
      els.push({ id: uid('el'), lessonId, kind: 'definition', text: s, label: term, section: si });
      return;
    }
    // EXAMPLE — أمثلة المصدر عنصر مستقل (كانت تسقط بصمت)
    if (/مثال|مثل|على سبيل المثال/.test(s)) {
      els.push({ id: uid('el'), lessonId, kind: 'example', text: s, label: s.slice(0, 40), section: si });
      return;
    }
    // LIST
    const items = s.split(/[،,]/).map(x => x.trim()).filter(x => x.length > 2);
    if (items.length >= 3 || /أولاً|ثانياً|1\)|2\)|عناصر|أنواع|أقسام/.test(s)) {
      els.push({ id: uid('el'), lessonId, kind: 'list', text: s, label: s.slice(0, 40), section: si, items: items.length >= 3 ? items : undefined });
      return;
    }
    // SEQUENCE
    if (/ثم|بعد ذلك|خطوات|مراحل|أولاً.*ثانياً|تسلسل/.test(s)) {
      const steps = s.split(/ثم|بعد ذلك|؛|;/).map(x => x.trim()).filter(x => x.length > 3);
      els.push({ id: uid('el'), lessonId, kind: 'sequence', text: s, label: s.slice(0, 40), section: si, steps: steps.length > 1 ? steps : undefined });
      return;
    }
    // RELATIONSHIP
    if (/يتناسب|يزداد|يقل|يؤدي إلى|بسبب|عندما.*فإن|كلما|العلاقة/.test(s)) {
      els.push({ id: uid('el'), lessonId, kind: 'relationship', text: s, label: s.slice(0, 40), section: si });
      return;
    }
    // FACT (وزن امتحاني أو معلومة مهمة)
    if (/مهم|امتحان|احفظ|خلاصة|قاعدة|دائماً|أبداً|يسمى|يطلق/.test(s)) {
      els.push({ id: uid('el'), lessonId, kind: 'fact', text: s, label: s.slice(0, 40), section: si });
    }
  });
  return els.slice(0, 24);
}

function elConcept(lesson: { id: string }, concepts: Concept[], el: import('./types').ContentElement): string {
  const hit = concepts.find(c => c.detail.includes(el.text.slice(0, 30)) || el.text.includes(c.title.slice(0, 20)));
  return hit?.id ?? lesson.id;
}

function otherTexts(els: import('./types').ContentElement[], el: import('./types').ContentElement, n: number): string[] {
  const o = els.filter(x => x.id !== el.id && x.kind === el.kind).map(x => x.text.slice(0, 60));
  while (o.length < n) o.push('لا شيء مما سبق');
  return o.slice(0, n);
}

/** حل حسابي آمن للصيغ البسيطة S = A op B فقط */
function solveSimple(lhs: string, rhsVars: string[], op: string, n1: number, n2: number): string | null {
  if (rhsVars.length !== 2 || !op) return null;
  const [a, b] = rhsVars;
  let v = 0;
  if (op === '×') v = n1 * n2;
  else if (op === '÷') { if (n2 === 0) return null; v = n1 / n2; }
  else if (op === '+') v = n1 + n2;
  else if (op === '-') v = n1 - n2;
  else return null;
  const vv = Math.round(v * 100) / 100;
  return `${lhs} = ${a} ${op} ${b} = ${n1} ${op} ${n2} = ${vv} — عوّض القيم في ${lhs} = ${rhsVars.join(` ${op} `)} ثم احسب.`;
}

function rearrange(lhs: string, rhsVars: string[], op: string, target: string): string | null {
  if (rhsVars.length !== 2 || !op || !rhsVars.includes(target)) return null;
  const other = rhsVars.find(v => v !== target)!;
  const inv = op === '×' ? '÷' : op === '÷' ? (rhsVars[0] === target ? '×' : '÷') : op === '+' ? '-' : '+';
  if (op === '÷' && rhsVars[1] === target) return `${target} = ${lhs} ${inv} ${other} — اقسم ${lhs} على ${other}.`;
  return `${target} = ${lhs} ${inv} ${other} — اعزل ${target} بنقل ${other} للطرف الآخر (${op === '×' ? 'القسمة' : op === '÷' ? 'الضرب' : 'عكس العملية'}).`;
}

/** توليد أسئلة من العناصر — مستويات 1-5، كل سؤال متتبع لمصدره */
export function generateFromElements(
  lesson: { id: string; title: string; sourceRef: string },
  elements: import('./types').ContentElement[],
  concepts: Concept[],
  archiveTopics: string[],
  maxQ = 16,
): RecallQ[] {
  const out: RecallQ[] = [];
  const mk = (
    el: import('./types').ContentElement, kind: RecallQ['kind'], prompt: string, answer: string,
    level: 1 | 2 | 3 | 4 | 5, focus: import('./types').QFocus, origin: QOrigin = 'source',
    choices?: string[],
  ): RecallQ => ({
    id: uid('rq'), conceptId: elConcept(lesson, concepts, el), kind, prompt, answer,
    hint: `من مصدرك — الفقرة ${el.section + 1}: ${el.text.slice(0, 60)}…`,
    sourceLessonId: lesson.id, sourceRef: lesson.sourceRef, section: el.section,
    difficulty: level <= 2 ? (level as 1 | 2) : 3, origin,
    elementId: el.id, focus, level, excerpt: el.text,
    ...(choices ? { choices } : {}),
  });
  const hot = (txt: string) => archiveTopics.some(k => txt.includes(k.slice(0, 4)));

  for (const el of elements) {
    if (out.length >= maxQ + 6) break;
    if (el.kind === 'formula') {
      const [lhs, , op] = [el.items?.[0] ?? '', el.items?.[1] ?? '', el.items?.[2] ?? ''];
      const rhsVars = (el.items?.[3] ?? '').split('|').map(v => v.trim()).filter(v => v.length <= 3);
      // بوابة الجودة: بلا متغيرات حقيقية في الطرف الأيمن → أسئلة استرجاع مباشر فقط (لا "يربط 0؟")
      const hasVars = rhsVars.some(v => /[A-Za-z\u0600-\u06FF\u0370-\u03FF]/.test(v));
      const name = el.vars?.[0]?.meaning ? `${el.vars[0].meaning} (${lhs})` : `الرمز ${lhs}`;
      out.push(mk(el, 'qa', hasVars ? `ما القانون الذي يربط ${rhsVars.join(' و ')}؟` : `ما القانون المذكور لـ${lhs}؟`, el.text, 1, 'formula'));
      out.push(mk(el, 'fill', `أكمل من المصدر: ${lhs} = ${(hasVars ? rhsVars : [el.items?.[1] ?? '…']).map(() => '___').join(` ${op || '×'} `)}`, el.text, 1, 'formula'));
      const named = (el.vars ?? []).filter(v => v.meaning);
      for (const v of named.slice(0, 3)) {
        out.push(mk(el, 'qa', `ماذا يمثل الرمز ${v.sym} في القانون؟`, `${v.sym} يمثل: ${v.meaning} (من المصدر: «${el.text.slice(0, 80)}…»)`, 1, 'formula'));
      }
      if (el.units?.length) {
        out.push(mk(el, 'qa', `ما وحدة قياس ${name} حسب المصدر؟`, `الوحدة: ${el.units.join('، ')}`, 1, 'formula'));
      }
      // L2 صياغة مختلفة
      out.push(mk(el, 'mcq', `أي علاقة تمثل ${name}؟`, el.text, 2, 'formula', 'source', [el.text.slice(0, 60), ...otherTexts(elements, el, 2)]));
      // L3 إعادة ترتيب + تناسب
      if (rhsVars.length === 2 && op) {
        const t = rhsVars[0];
        const rr = rearrange(lhs, rhsVars, op, t);
        if (rr) out.push(mk(el, 'apply', `إذا كانت ${lhs} و${rhsVars[1]} معروفتين، كيف نحسب ${t}؟`, rr, 3, 'formula'));
        const prop = op === '×'
          ? `تتضاعف ${lhs} — لأنها حاصل ضرب، فمضاعفة أحد العاملين تضاعف الناتج (${lhs} = ${rhsVars.join(' × ')}).`
          : op === '÷' ? `تتضاعف ${lhs} أيضاً — البسط تضاعف والمقام ثابت (${lhs} = ${rhsVars.join(' ÷ ')}).`
          : `تتغير ${lhs} تبعاً للعملية (${lhs} = ${rhsVars.join(` ${op} `)}).`;
        out.push(mk(el, 'apply', `إذا تضاعف ${rhsVars[0]} مع ثبات ${rhsVars[1]}، ماذا يحدث لـ${lhs}؟`, prop, 3, 'formula'));
        // L3 عددي بأرقام بسيطة (محسوب بدقة)
        const [n1, n2] = op === '÷' ? [100, 5] : op === '×' ? [5, 2] : op === '+' ? [7, 3] : [9, 4];
        const solved = solveSimple(lhs, rhsVars, op, n1, n2);
        if (solved) out.push(mk(el, 'solve', `إذا كان ${rhsVars[0]} = ${n1} و${rhsVars[1]} = ${n2}، احسب ${lhs} (مطبقاً قانون المصدر).`, solved, 3, 'formula'));
      }
      if (hot(el.text)) {
        out.push(mk(el, 'qa', `🎯 بصيغة امتحانية: ${el.text.slice(0, 70)}… — اشرح ثم طبّق بمثال عددي.`, `${el.text} — وردت فكرة مشابهة في أرشيف امتحاناتك، راجع التطبيق العددي أعلاه.`, 5, 'formula', 'exam-pattern'));
      }
    } else if (el.kind === 'definition') {
      out.push(mk(el, 'definition', `ما تعريف ${el.label}؟ (كما في المصدر)`, el.text, 1, 'definition'));
      const blank = el.text.length > 30 ? `أكمل التعريف: ${el.text.slice(0, Math.floor(el.text.length / 2))} ……` : `أكمل: ${el.label} هو ……`;
      out.push(mk(el, 'fill', blank, el.text, 1, 'definition'));
      out.push(mk(el, 'mcq', `اختر التعريف الصحيح لـ«${el.label}»:`, el.text, 2, 'definition', 'source', [el.text.slice(0, 70), ...otherTexts(elements, el, 2)]));
    } else if (el.kind === 'example') {
      out.push(mk(el, 'apply', `ماذا يوضح هذا المثال من مصدرك؟ «${el.text.slice(0, 70)}…»`, el.text, 2, 'example'));
      out.push(mk(el, 'explain', `اشرح المثال بكلماتك: «${el.text.slice(0, 70)}…»`, el.text, 2, 'example'));
    } else if (el.kind === 'fact') {
      const core = el.text.length > 70 ? el.text.slice(0, 70) + '…' : el.text;
      out.push(mk(el, 'fill', `أكمل العبارة المذكورة: ${el.text.slice(0, Math.max(20, Math.floor(el.text.length / 2)))} ……`, el.text, 1, 'fact'));
      out.push(mk(el, 'mcq', `ما المعلومة المذكورة في المصدر؟`, el.text, 2, 'fact', 'source', [core, ...otherTexts(elements, el, 2)]));
    } else if (el.kind === 'list' && el.items?.length) {
      out.push(mk(el, 'qa', `اذكر العناصر المذكورة في: «${el.text.slice(0, 60)}…»`, el.items.join('، '), 2, 'fact'));
      const missing = el.items[Math.floor(el.items.length / 2)];
      out.push(mk(el, 'fill', `ما العنصر الناقص؟ ${el.items.filter(x => x !== missing).join('، ')} ……`, missing, 3, 'fact'));
    } else if (el.kind === 'relationship') {
      out.push(mk(el, 'cause', `ما العلاقة المذكورة في: «${el.text.slice(0, 70)}…»؟`, el.text, 2, 'relation'));
      out.push(mk(el, 'apply', `طبّق العلاقة: ماذا يحدث إذا تغيّر أحد طرفيها؟ (حسب المصدر)`, el.text, 3, 'relation'));
    } else if (el.kind === 'sequence') {
      const steps = el.steps ?? [el.text];
      out.push(mk(el, 'sequence', `ما الخطوة التالية؟ السياق: «${steps[0].slice(0, 60)}…»`, steps[1] ?? el.text, 2, 'sequence'));
      if (steps.length > 2) out.push(mk(el, 'sequence', `رتّب الخطوات: ${steps.map(s => s.slice(0, 25)).join(' / ')}`, steps.join(' ← ثم ← '), 3, 'sequence'));
    }
  }
  // L4 ربط بين عنصرين من نفس المصدر
  const f = elements.find(e => e.kind === 'formula');
  const d = elements.find(e => e.kind === 'definition');
  if (f && d && out.length < maxQ + 6) {
    out.push(mk(f, 'link', `اربط بين ${f.label} وتعريف «${d.label}» — كيف يخدم التعريف فهم القانون؟`, `${d.text} ← وهذا الأساس الذي يُبنى عليه ${f.text}`, 4, 'relation'));
  }
  return out.slice(0, maxQ);
}

/** تغطية المصدر: عدد الأسئلة لكل فئة + نسبة العناصر المغطاة */
export function coverageOf(
  elements: import('./types').ContentElement[], bank: RecallQ[],
): { perFocus: { k: string; n: number; q: number }[]; pct: number; total: number; covered: number } {
  const names: Record<string, string> = { formula: 'القوانين', definition: 'التعاريف', fact: 'الحقائق', list: 'القوائم', relation: 'العلاقات', sequence: 'التسلسلات', diagram: 'المخططات', example: 'الأمثلة' };
  const kinds = [...new Set(elements.map(e => e.kind))];
  const perFocus = kinds.map(k => {
    const els = elements.filter(e => e.kind === k);
    const q = bank.filter(q => q.elementId && els.some(e => e.id === q.elementId)).length;
    return { k: names[k] ?? k, n: els.length, q };
  });
  const covered = elements.filter(e => bank.some(q => q.elementId === e.id)).length;
  return { perFocus, pct: elements.length ? Math.round(100 * covered / elements.length) : 0, total: elements.length, covered };
}

/** سطر التتبع المعروض تحت السؤال */
export function traceOf(q: RecallQ, lessonTitle: string): string {
  const kind = q.focus === 'formula' ? 'المعادلة' : q.focus === 'definition' ? 'التعريف' : q.focus === 'diagram' ? 'المخطط' : q.focus === 'example' ? 'المثال' : 'الفقرة';
  return `${lessonTitle} • ${kind}: الفقرة ${q.section + 1}${q.excerpt ? ` • «${q.excerpt.slice(0, 60)}…»` : ''}`;
}
