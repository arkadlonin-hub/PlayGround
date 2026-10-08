// Focus30 AI engine — client-side adaptive logic (pluggable with a real LLM later).
// Covers: content analysis, StudyPack, FSRS-lite, forgetting prediction, coach, tutor,
// question predictor, weakness map, insights, 30-day planner, exam analysis, search.
import type { Concept, Lesson, RecallQ, Flashcard, ErrorEntry, AppState, MindNode } from './types';
import { addDays, todayISO, uid } from './types';

const AR_STOP = new Set(['في','من','على','إلى','أن','ما','هذا','هذه','التي','الذي','مع','تم','بين','عن','كل','قد','لا','لم','هو','هي','كان','يتم']);

function splitSentences(text: string): string[] {
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
  return Math.random() > 0.5 ? 'understand' : 'memorize';
}

/** 1. ADVANCED STUDY SYSTEM — analyze raw content into Material→Unit→Lesson→Concepts */
export function analyzeContent(text: string, lessonId: string, sourceRef: string): {
  concepts: Concept[]; summary: string; examPoints: string[]; memorize: string[]; understand: string[];
} {
  const sentences = splitSentences(text);
  const kws = keywords(text);
  const concepts: Concept[] = sentences.slice(0, 12).map((s) => {
    const kind = classifySentence(s);
    const needsMemorize = kind === 'definition' || kind === 'law' || kind === 'term' || kind === 'memorize';
    return {
      id: uid('c'), lessonId,
      title: s.length > 60 ? s.slice(0, 60) + '…' : s,
      detail: s,
      kind, needsMemorize,
      examWeight: /مهم|امتحان|قانون|تعريف/.test(s) ? 3 : /مثال|علاقة/.test(s) ? 2 : 1,
      mastery: 20 + Math.round(Math.random() * 20),
      stability: 1.5, difficulty: 2 + Math.round(Math.random() * 2),
      confidence: 3, reviews: 0, lapses: 0, avgTimeMs: 25000,
      lastReview: null, nextReview: todayISO(), forgetRisk: 0.5, sourceRef,
    };
  });
  const summary = sentences.slice(0, 3).join('. ') + '.';
  const examPoints = sentences.filter(s => /مهم|امتحان|قانون|تعريف|خلاصة/.test(s)).slice(0, 5);
  const fin = sentences.filter(s => classifySentence(s) === 'memorize' || /احفظ|تعريف|قانون/.test(s)).slice(0, 5);
  return {
    concepts: concepts.length ? concepts : [{
      id: uid('c'), lessonId, title: kws.slice(0, 3).join('، ') || 'المفهوم الرئيسي',
      detail: text.slice(0, 220), kind: 'idea', needsMemorize: false, examWeight: 2,
      mastery: 25, stability: 1.5, difficulty: 3, confidence: 3, reviews: 0, lapses: 0,
      avgTimeMs: 25000, lastReview: null, nextReview: todayISO(), forgetRisk: 0.5, sourceRef,
    }],
    summary: summary || text.slice(0, 200),
    examPoints: examPoints.length ? examPoints : [`ركّز على الكلمات المفتاحية: ${kws.slice(0, 5).join('، ')}`],
    memorize: fin, understand: sentences.filter(s => /لماذا|اشرح|قارن|علاقة|بسبب/.test(s)).slice(0, 4),
  };
}

export function buildMindmap(lessonTitle: string, concepts: Concept[]): MindNode {
  const colorFor = (k: Concept['kind']) =>
    k === 'law' ? '#22d3ee' : k === 'definition' ? '#a78bfa' : k === 'example' ? '#34d399' : k === 'exam' ? '#fbbf24' : '#94a3b8';
  return {
    label: lessonTitle,
    children: concepts.slice(0, 7).map(c => ({
      label: c.title.slice(0, 34), color: colorFor(c.kind),
      children: [{ label: c.detail.slice(0, 40) + '…', children: [] }],
    })),
  };
}

const RECALL_T = [
  { kind: 'qa', t: (c: Concept) => `ما هو: ${c.title}؟` },
  { kind: 'why', t: (c: Concept) => `لماذا يحدث / يصح: ${c.title}؟ فسّر.` },
  { kind: 'explain', t: (c: Concept) => `اشرح بأسلوبك: ${c.detail.slice(0, 80)}…` },
  { kind: 'compare', t: (c: Concept) => `قارن بين «${c.title}» ومفهوم قريب منه. ما الفرق الجوهري؟` },
  { kind: 'apply', t: (c: Concept) => `أعطِ مثالاً واقعياً على: ${c.title}.` },
  { kind: 'fill', t: (c: Concept) => `أكمل: ${c.detail.slice(0, 60)}… (……)` },
  { kind: 'tf', t: (c: Concept) => `صح أم خطأ مع التعليل: ${c.detail.slice(0, 90)}` },
  { kind: 'link', t: (c: Concept) => `اربط بين «${c.title}» ودرس سابق. ما العلاقة؟` },
] as const;

export function generateRecall(concepts: Concept[], n = 10): RecallQ[] {
  if (!concepts.length) return [];
  // مسبح متنوع: لكل مفهوم نوعان مختلفان، ثم توزيع دائري حتى لا يتكرر المفهوم توالياً
  const pool: RecallQ[] = [];
  concepts.forEach((c, idx) => {
    for (let k = 0; k < 2; k++) {
      const tpl = RECALL_T[(idx + k * 3) % RECALL_T.length];
      pool.push({
        id: uid('rq'), conceptId: c.id, kind: tpl.kind as RecallQ['kind'],
        prompt: tpl.t(c), answer: c.detail,
        hint: `تلميح: ركّز على الكلمات: ${c.detail.split(/\s+/).slice(0, 4).join(' ')}…`,
      });
    }
  });
  const rounds: RecallQ[][] = [[], []];
  pool.forEach((q, i) => rounds[i % 2].push(q));
  const ordered = [...rounds[0], ...rounds[1]];
  return ordered.slice(0, Math.min(n, ordered.length));
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

export function conceptToCards(c: Concept): Flashcard[] {
  const mk = (kind: Flashcard['kind'], front: string, back: string): Flashcard => ({
    id: uid('f'), conceptId: c.id, kind, front, back,
    ease: 2.5, interval: 1, due: todayISO(), reps: 0, lapses: 0,
  });
  return [
    mk('qa', c.title, c.detail),
    mk('cloze', c.detail.replace(/\s\S+\s\S+\s*$/, ' …… ……'), c.detail),
    mk('formula', c.kind === 'law' ? `اكتب ${c.title}` : `عرّف: ${c.title}`, c.detail),
  ];
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

export function masteryAfter(c: Concept, correct: boolean, confidence: number, timeMs: number): Partial<Concept> {
  const delta = correct ? 6 + confidence : -(8 + (5 - confidence));
  const speedAdj = timeMs > 60000 ? -2 : timeMs < 10000 && correct ? 2 : 0;
  const mastery = Math.min(100, Math.max(0, c.mastery + delta + speedAdj));
  const stability = correct ? c.stability * 1.6 : Math.max(0.5, c.stability * 0.6);
  const daysSince = c.lastReview ? Math.max(0, (Date.now() - new Date(c.lastReview).getTime()) / 864e5) : 0;
  const forgetRisk = Math.min(0.99, Math.max(0.02, 1 - Math.exp(-daysSince / Math.max(0.5, stability))));
  return {
    mastery: Math.round(mastery), stability: Math.round(stability * 10) / 10,
    reviews: c.reviews + 1, lapses: c.lapses + (correct ? 0 : 1),
    lastReview: todayISO(),
    nextReview: addDays(todayISO(), correct ? Math.max(1, Math.round(stability)) : 1),
    forgetRisk: Math.round(forgetRisk * 100) / 100,
    avgTimeMs: Math.round((c.avgTimeMs * c.reviews + timeMs) / (c.reviews + 1)),
  };
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
export function weaknessMap(errors: ErrorEntry[], allConcepts: Concept[]): { root: string; chain: string[]; fix: string }[] {
  const byConcept = new Map<string, ErrorEntry[]>();
  for (const e of errors.filter(e => !e.resolved)) {
    const l = byConcept.get(e.conceptId) ?? []; l.push(e); byConcept.set(e.conceptId, l);
  }
  return [...byConcept.entries()].filter(([, l]) => l.length >= 1).slice(0, 4).map(([cid, l]) => {
    const c = allConcepts.find(x => x.id === cid);
    const title = c?.title.slice(0, 50) ?? 'مفهوم غير معروف';
    return {
      root: title,
      chain: [title, `تكرار الخطأ ${l.reduce((a, e) => a + e.count, 0)} مرات`, `آخر سبب: ${l[0]?.reason ?? 'غير محدد'}`],
      fix: 'ارجع خطوة للخلف: راجع المفهوم السابق المرتبط، ثم أعد الاختبار بسؤال واحد فقط.',
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

/** 35. natural smart search over the whole state */
export function smartSearch(s: AppState, q: string): { section: string; text: string }[] {
  const out: { section: string; text: string }[] = [];
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
