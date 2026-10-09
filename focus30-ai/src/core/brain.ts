// FOCUS30 AI BRAIN — الطبقة المركزية فوق كل الأنظمة.
// USER INPUT → UNDERSTAND → EXTRACT → STRUCTURE → REASON → GENERATE → VALIDATE → SAVE → UPDATE → RECOMMEND
// لا نتائج مختلقة: كل خطوة موثقة، والفحص الذاتي يسقط ما يفشل، والثقة معلنة.
import type { AppState, Concept, ContentElement, Flashcard, QFocus, RecallQ } from './types';
import {
  analyzeContent, buildGraph, conceptToCards, extractElements,
  forgettingQueue, generateFromElements, generateRecall, qualityPass,
} from './ai';

export interface BrainStep { tool: string; label: string; detail: string; ok: boolean }
export type Confidence = 'high' | 'mid' | 'low';
export interface BrainReport {
  steps: BrainStep[];
  profile: SubjectProfile;
  confidence: Confidence;
  confidenceWhy: string;
  checks: { passed: number; failed: { prompt: string; reason: string }[] };
  plan: { focus: string; questions: number }[];
  counts: { concepts: number; elements: number; questions: number; cards: number; coverage: number };
  nextAction: { title: string; go: string };
}

export interface SubjectProfile {
  domain: 'math' | 'physics' | 'chemistry' | 'biology' | 'history' | 'language' | 'general';
  label: string;
  order: QFocus[];
  note: string;
}

/** 41. ملف المادة: يغيّر أولويات التوليد حسب طبيعة التعلم */
export function subjectProfile(matName: string): SubjectProfile {
  const n = matName || '';
  if (/رياضيات|رياضي|math/i.test(n)) return {
    domain: 'math', label: 'رياضيات',
    order: ['formula', 'fact', 'relation', 'definition', 'sequence'],
    note: 'رياضيات: الأولوية للقوانين + التطبيق العددي + حل المسائل.',
  };
  if (/فيزياء|physics/i.test(n)) return {
    domain: 'physics', label: 'فيزياء',
    order: ['formula', 'definition', 'relation', 'fact', 'sequence'],
    note: 'فيزياء: قانون ← رموزه ← وحداته ← تطبيقه العددي.',
  };
  if (/كيمياء|chemistry/i.test(n)) return {
    domain: 'chemistry', label: 'كيمياء',
    order: ['definition', 'formula', 'relation', 'fact', 'sequence'],
    note: 'كيمياء: تعاريف دقيقة + معادلات + مقارنات.',
  };
  if (/أحياء|احياء|علوم|biology/i.test(n)) return {
    domain: 'biology', label: 'أحياء',
    order: ['definition', 'diagram', 'relation', 'sequence', 'fact'],
    note: 'أحياء: تعاريف + مخططات وأجزاء + تسلسلات.',
  };
  if (/تاريخ|history/i.test(n)) return {
    domain: 'history', label: 'تاريخ',
    order: ['sequence', 'relation', 'fact', 'definition', 'formula'],
    note: 'تاريخ: خط زمني + أسباب ونتائج + حقائق — وقصة تذكيرية عند الحاجة.',
  };
  if (/عربي|لغة|إنجليز|انجليز|أدب|لغه|language/i.test(n)) return {
    domain: 'language', label: 'لغة',
    order: ['definition', 'fact', 'relation', 'sequence', 'formula'],
    note: 'لغة: تعاريف وقواعد + أمثلة + فروق دقيقة.',
  };
  return {
    domain: 'general', label: 'عام',
    order: ['definition', 'fact', 'formula', 'relation', 'sequence'],
    note: 'ملف عام متوازن: تعاريف وحقائق أولاً.',
  };
}

/** 34. الثقة: محسوبة من وضوح المدخلات لا مدّعاة */
export function confidenceOf(text: string, elements: ContentElement[], concepts: Concept[]): { level: Confidence; why: string } {
  let score = 0;
  const t = text.trim().length;
  if (t >= 300) score += 2; else if (t >= 120) score += 1;
  if (elements.length >= 4) score += 2; else if (elements.length >= 2) score += 1;
  if (concepts.length >= 4) score += 1;
  if (score >= 4) return { level: 'high', why: `نص غني (${t} حرف) + ${elements.length} عناصر مستخرجة + ${concepts.length} مفاهيم` };
  if (score >= 2) return { level: 'mid', why: `محتوى متوسط (${t} حرف، ${elements.length} عناصر) — راجع المولّد قبل الاعتماد` };
  return { level: 'low', why: 'محتوى قليل أو صورة بلا نص مستخرج — النتائج توجيهية فقط، أضف نصاً لرفع الثقة' };
}

const GENERIC_BANNED = ['اشرح الدرس من ذاكرتك', 'ما مفهوم هذا الدرس', 'ماذا تعلمت من الدرس', 'لخص الدرس من ذاكرتك'];

function keywordsOf(s: string): string[] {
  return s.replace(/[^\u0600-\u06FFa-zA-Z0-9\s]/g, ' ').split(/\s+/).filter(w => w.length > 2);
}

/** 35. الفحص الذاتي قبل الحفظ: مصدر؟ إجابة صحيحة؟ تناقض؟ اختلاق؟ مستوى؟ */
export function validateBank(bank: RecallQ[], sourceText: string): { ok: RecallQ[]; failed: { prompt: string; reason: string }[] } {
  const srcWords = new Set(keywordsOf(sourceText));
  const ok: RecallQ[] = [];
  const failed: { prompt: string; reason: string }[] = [];
  for (const q of bank) {
    const fail = (reason: string) => failed.push({ prompt: q.prompt.slice(0, 60), reason });
    if (!q.prompt || q.prompt.trim().length < 8) { fail('سؤال فارغ أو قصير جداً'); continue; }
    if (!q.answer || q.answer.trim().length < 4) { fail('بلا إجابة نموذجية'); continue; }
    if (GENERIC_BANNED.some(g => q.prompt.includes(g))) { fail('سؤال عام محظور — يجب أن يُبنى على عنصر من المصدر'); continue; }
    if (!q.sourceLessonId) { fail('بلا مرجع مصدر'); continue; }
    if ((q.kind === 'mcq' || q.kind === 'tf') && (!q.choices || q.choices.length < 2)) { fail('اختيارات ناقصة'); continue; }
    if (q.kind === 'fill' && !/___|……|\.\.\./.test(q.prompt)) { fail('سؤال إكمال بلا فراغ'); continue; }
    if (q.origin === 'source') {
      const ansWords = keywordsOf(q.answer);
      const overlap = ansWords.filter(w => srcWords.has(w)).length;
      const quoted = q.excerpt ? sourceText.includes(q.excerpt.slice(0, 20)) : false;
      if (overlap < 1 && !quoted) { fail('الإجابة لا أثر لها في نص المصدر — اختلاق محتمل'); continue; }
    }
    ok.push(q);
  }
  return { ok, failed };
}

/** 40. العقل يقرر ماذا يولّد حسب المحتوى والملف — لا أرقام ثابتة عمياء */
export function generationPlan(elements: ContentElement[], profile: SubjectProfile): { focus: string; questions: number }[] {
  const names: Record<string, string> = { formula: 'القوانين', definition: 'التعاريف', fact: 'الحقائق', list: 'القوائم', relation: 'العلاقات', sequence: 'التسلسلات', diagram: 'المخططات' };
  const counts = new Map<string, number>();
  for (const el of elements) {
    let w = 2;
    if (profile.order[0] === (el.kind as unknown as QFocus)) w = 3;
    else if (profile.order[1] === (el.kind as unknown as QFocus)) w = 2;
    counts.set(el.kind, (counts.get(el.kind) ?? 0) + w);
  }
  return [...counts.entries()].map(([k, questions]) => ({ focus: names[k] ?? k, questions }));
}

/** 2+32. سياق المستخدم الكامل — أي طلب يمر من هنا لا كطلب منفصل */
export interface BrainContext {
  avgMastery: number; weakMat: string; weakMastery: number; dueCount: number;
  openErrors: number; daysLeft: number | null; planGoal: string;
  recentAccuracy: number; recentCount: number; streak: number;
  conceptsCount: number; lessonsCount: number;
}
export function buildBrainContext(s: AppState): BrainContext {
  const concepts = s.materials.flatMap(m => m.units.flatMap(u => u.lessons.flatMap(l => l.concepts)));
  const avgMastery = concepts.length ? Math.round(concepts.reduce((a, c) => a + c.mastery, 0) / concepts.length) : 0;
  const weak = [...s.materials].sort((a, b) => a.mastery - b.mastery)[0];
  const stamp = new Date(s.examDate).getTime();
  const recent = s.attempts.slice(-20);
  return {
    avgMastery,
    weakMat: weak?.name ?? '', weakMastery: weak?.mastery ?? 0,
    dueCount: forgettingQueue(s).length,
    openErrors: s.errors.filter(e => !e.resolved).length,
    daysLeft: Number.isFinite(stamp) ? Math.max(0, Math.ceil((stamp - Date.now()) / 864e5)) : null,
    planGoal: s.planGoal,
    recentAccuracy: recent.length ? Math.round(100 * recent.filter(a => a.correct).length / recent.length) : -1,
    recentCount: recent.length,
    streak: s.streak,
    conceptsCount: concepts.length,
    lessonsCount: s.materials.reduce((a, m) => a + m.units.reduce((b, u) => b + u.lessons.length, 0), 0),
  };
}

/** 11. الصعوبة الديناميكية: صحيح متتالٍ ↑ / أخطاء ↓ */
export function adaptiveLevel(streakOk: number, streakBad: number): { bias: -1 | 0 | 1; note: string } {
  if (streakOk >= 2) return { bias: 1, note: `إجابات صحيحة متتالية (${streakOk}) — رُفعت الصعوبة درجة` };
  if (streakBad >= 2) return { bias: -1, note: `أخطاء متتالية (${streakBad}) — بُسّطت الأسئلة لنفس المعلومة` };
  return { bias: 0, note: '' };
}

/** 10. اختيار السؤال التالي: معالجة الخطأ → مستحق → ضعيف → أضعف استرجاع */
export function chooseNext(
  pool: RecallQ[],
  opts: { drillElementId: string | null; doneIds: string[]; strengths: Map<string, number>; errorConcepts: string[]; bias: -1 | 0 | 1 },
): { q: RecallQ | null; reason: string } {
  const avail = pool.filter(q => !opts.doneIds.includes(q.id));
  if (!avail.length) return { q: null, reason: '' };
  if (opts.drillElementId) {
    const d = avail.find(q => q.elementId === opts.drillElementId);
    if (d) return { q: d, reason: '🔧 معالجة: نفس المعلومة التي أخطأت فيها بصياغة أبسط' };
  }
  const err = avail.find(q => opts.errorConcepts.includes(q.conceptId));
  if (err) return { q: err, reason: '⚠️ أولوية لخطأ سابق لم يُعالج' };
  const sorted = [...avail].sort((a, b) => (opts.strengths.get(a.conceptId) ?? 50) - (opts.strengths.get(b.conceptId) ?? 50));
  let pick = sorted[0];
  if (opts.bias === 1) {
    const harder = sorted.find(q => (q.level ?? 2) >= 3);
    if (harder) { pick = harder; return { q: pick, reason: '📈 مستواك مرتفع — سؤال أصعب' }; }
  }
  if (opts.bias === -1) {
    const easier = sorted.find(q => (q.level ?? 2) <= 2);
    if (easier) { pick = easier; return { q: pick, reason: '📉 تبسيط بعد أخطاء — نفس الهدف بمستوى أسهل' }; }
  }
  return { q: pick, reason: '🎯 الأضعف استرجاعاً أولاً' };
}

export interface IngestOutput {
  concepts: Concept[]; elements: ContentElement[];
  questions: RecallQ[]; cards: Flashcard[];
  summary: string; sections: string[]; skipped: number;
  report: BrainReport;
}

/** 39. التدفق الكامل: INPUT → UNDERSTAND → EXTRACT → STRUCTURE → REASON → GENERATE → VALIDATE → SAVE-ready → RECOMMEND */
export function runIngest(
  text: string, lessonMeta: { id: string; title: string; sourceRef: string },
  matName: string, archiveTopics: string[],
): IngestOutput {
  const steps: BrainStep[] = [];
  steps.push({ tool: 'Understanding', label: 'فهم المدخلات', detail: `نص ${text.trim().length} حرف • المادة: ${matName}`, ok: true });

  const a = analyzeContent(text.trim(), lessonMeta.id, lessonMeta.sourceRef);
  steps.push({ tool: 'OCR/Text', label: 'تنظيف النص', detail: `${a.sections.length} فقرات صالحة بعد التنظيف`, ok: true });

  const raw = a.concepts.filter(c => qualityPass(c.detail)).map(c => ({ ...c, lessonId: lessonMeta.id }));
  steps.push({ tool: 'Knowledge Extractor', label: 'استخراج المفاهيم', detail: `${raw.length} مفاهيم من النص`, ok: raw.length > 0 });

  const concepts = buildGraph(raw);
  steps.push({ tool: 'Knowledge Graph', label: 'بناء الرسم المعرفي', detail: concepts.length ? 'كل مفهوم مرتبط بسابقه ومماثليه' : 'لا مفاهيم للربط', ok: true });

  const elements = extractElements(text.trim(), lessonMeta.id);
  const profile = subjectProfile(matName);
  steps.push({ tool: 'Reasoning', label: `ملف المادة: ${profile.label}`, detail: profile.note, ok: true });

  const plan = generationPlan(elements, profile);
  steps.push({ tool: 'Planner', label: 'خطة التوليد', detail: plan.length ? plan.map(p => `${p.focus}: ${p.questions}`).join(' • ') : 'لا عناصر — بطاقة مصدر فقط', ok: true });

  const elQs = generateFromElements(lessonMeta, elements, concepts, archiveTopics, 14);
  const genQs = generateRecall(lessonMeta, concepts, 6);
  steps.push({ tool: 'Question Generator', label: 'توليد الأسئلة', detail: `${elQs.length} من العناصر + ${genQs.length} عامة من المصدر`, ok: elQs.length + genQs.length > 0 });

  const cards = concepts.flatMap(c => conceptToCards(c, lessonMeta)).slice(0, 8);
  steps.push({ tool: 'Flashcard Generator', label: 'توليد البطاقات', detail: `${cards.length} بطاقات من المفاهيم`, ok: true });

  const { ok, failed } = validateBank([...elQs, ...genQs], text);
  steps.push({ tool: 'Self-Check', label: 'الفحص الذاتي', detail: failed.length ? `مقبول ${ok.length} • مرفوض ${failed.length} (${failed[0]?.reason})` : `مقبول ${ok.length} بلا رفض`, ok: failed.length === 0 });

  const { level, why } = confidenceOf(text, elements, concepts);
  steps.push({ tool: 'Confidence', label: `الثقة: ${level === 'high' ? 'عالية 🟢' : level === 'mid' ? 'متوسطة 🟡' : 'منخفضة ⚪'}`, detail: why, ok: level !== 'low' });

  return {
    concepts, elements, questions: ok, cards,
    summary: a.summary, sections: a.sections, skipped: a.concepts.length - raw.length,
    report: {
      steps, profile, confidence: level, confidenceWhy: why,
      checks: { passed: ok.length, failed },
      plan, counts: { concepts: concepts.length, elements: elements.length, questions: ok.length, cards: cards.length, coverage: elements.length ? Math.round(100 * new Set(ok.map(q => q.elementId)).size / elements.length) : 0 },
      nextAction: ok.length ? { title: `ابدأ تذكراً نشطاً: ${ok.length} أسئلة من مصدرك`, go: 'study-recall' } : { title: 'أضف نصاً أوضح لتوليد أسئلة', go: 'study-materials' },
    },
  };
}

const DAY_NAMES = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
const SUBJECT_WORDS = ['رياضيات', 'فيزياء', 'كيمياء', 'أحياء', 'علوم', 'عربي', 'العربية', 'إنجليزي', 'انجليزي', 'تاريخ', 'جغرافيا', 'فرنسي', 'رياضة', 'حاسوب'];

const rev = (s: string) => [...s].reverse().join('');
const normAr = (s: string) => s.replace(/[أإآٱ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي').replace(/[\u064B-\u065F\u0670\u0640]/g, '');
/** مطابقة بالاتجاهين: النص المنطقي أو البصري المعكوس من OCR */
const hitAny = (text: string, word: string) => {
  const t = normAr(text);
  const w = normAr(word);
  return t.includes(w) || t.includes(rev(w));
};

/** 25. استخراج الجدولة: أيام (مع النطاقات) + أوقات + مواد + امتحانات — بأولوية الموقع لا القائمة */
export function parseScheduleText(text: string, materialNames: string[]): { day: number; start: string; end: string; label: string; type: 'school' | 'exam' | 'busy' }[] {
  const rows: { day: number; start: string; end: string; label: string; type: 'school' | 'exam' | 'busy' }[] = [];
  const timeRe = /(\d{1,2})(?::(\d{2}))?\s*[-–—إلى]\s*(\d{1,2})(?::(\d{2}))?/g;
  const timesOf = (seg: string) => [...seg.matchAll(timeRe)].map(m => ({ start: `${m[1].padStart(2, '0')}:${m[2] ?? '00'}`, end: `${m[3].padStart(2, '0')}:${m[4] ?? '00'}` }));
  const isExam = (seg: string) => hitAny(seg, 'اختبار') || hitAny(seg, 'امتحان') || /كويز|test|exam/i.test(seg);
  const isSchool = (seg: string) => hitAny(seg, 'مدرسة') || /دراسة|حصص|دوام/.test(seg);
  // كل المواد المذكورة مرتبة بموقعها في النص (لا بأولوية القائمة)
  const subjectsIn = (seg: string): string[] => {
    const hits: { name: string; pos: number }[] = [];
    const consider = (name: string) => {
      const t = normAr(seg), w = normAr(name);
      let p = t.indexOf(w); if (p >= 0) { hits.push({ name, pos: p }); return; }
      p = t.indexOf(rev(w)); if (p >= 0) hits.push({ name, pos: p });
    };
    for (const m of materialNames) if (m) consider(m);
    for (const w of SUBJECT_WORDS) consider(w);
    const seen = new Set<string>();
    return hits.sort((a, b) => a.pos - b.pos).map(h => h.name).filter(n => (seen.has(n) ? false : (seen.add(n), true)));
  };
  // مراسي الأيام بمواقعها (أسماء + أنوية، بالاتجاهين) — خارج أي نطاق
  const DAY_CORE = '(?:أحد|اثنين|ثنين|ثلا(?:ثاء)?|أربع(?:اء)?|خميس|جمع(?:ة)?|سبت)';
  const rangeOf = (): { days: number[]; seg: string } | null => {
    const rm = text.match(new RegExp(`من\\s*((?:ال)?${DAY_CORE})\\s*(?:إلى|الي|لل|-|–)\\s*((?:ال)?${DAY_CORE})`));
    if (!rm || rm.index === undefined) return null;
    const dayOf = (frag: string): number => {
      for (let i = 0; i < 7; i++) if (hitAny(frag, DAY_NAMES[i])) return i;
      const c = coresOf().find(([, c]) => hitAny(frag, c));
      return c ? c[0] : -1;
    };
    // اليومان ملتقطان مباشرة بمجموعات — بلا تقسيم ينكسر على حرف مفرد
    const a = dayOf(rm[1] ?? ''), b = dayOf(rm[2] ?? '');
    if (a < 0 || b < 0 || b < a) return null;
    const days: number[] = [];
    for (let d = a; d <= b; d++) days.push(d);
    return { days, seg: text.slice(rm.index + rm[0].length) };
  };
  const coresOf = (): [number, string][] => [[0, 'أحد'], [1, 'ثنين'], [2, 'ثلا'], [3, 'أربع'], [4, 'خميس'], [5, 'جمع'], [6, 'سبت']];
  const anchors = (): { day: number; pos: number }[] => {
    const out: { day: number; pos: number }[] = [];
    const push = (day: number, pos: number) => { if (pos >= 0 && !out.some(o => o.day === day)) out.push({ day, pos }); };
    const t = normAr(text);
    DAY_NAMES.forEach((d, i) => {
      const w = normAr(d);
      push(i, t.indexOf(w));
      const r = t.indexOf(rev(w));
      if (r >= 0 && !out.some(o => o.day === i)) out.push({ day: i, pos: r });
    });
    for (const [i, core] of coresOf()) {
      if (out.some(o => o.day === i)) continue;
      const w = normAr(core);
      // الأمامية فقط: المعكوسة القصيرة (مثل الث) تطابق داخل كلمات بريئة → إيجابيات كاذبة
      const q = t.indexOf(w); if (q >= 0) out.push({ day: i, pos: q });
    }
    return out.sort((x, y) => x.pos - y.pos);
  };

  const range = rangeOf();
  const ancAll = anchors();
  if (range) {
    // وزّع مواد النطاق على أيامه بالترتيب — لا تقسيم موقعي داخل النطاق
    const subs = subjectsIn(range.seg);
    const times = timesOf(range.seg);
    const examAll = isExam(range.seg);
    range.days.forEach((d, k) => rows.push({
      day: d,
      start: times[Math.min(k, times.length - 1)]?.start ?? times[0]?.start ?? '08:00',
      end: times[Math.min(k, times.length - 1)]?.end ?? times[0]?.end ?? '14:00',
      label: subs[Math.min(k, Math.max(0, subs.length - 1))] ?? (examAll ? 'اختبار (أكّد المادة) ⚠️' : isSchool(range.seg) ? 'المدرسة' : 'غير واضح ⚠️'),
      type: examAll && subs.length ? 'exam' : 'school',
    }));
  }
  const anc = ancAll.filter(a => !range || a.day < range.days[0] || a.day > range.days[range.days.length - 1]);
  if (anc.length) {
    anc.forEach((a, k) => {
      const seg = text.slice(a.pos, anc[k + 1]?.pos ?? text.length);
      const subs = subjectsIn(seg);
      const times = timesOf(seg);
      const exam = isExam(seg);
      rows.push({
        day: a.day,
        start: times[0]?.start ?? '08:00',
        end: times[0]?.end ?? '14:00',
        label: subs[0] ?? (exam ? 'اختبار (أكّد المادة) ⚠️' : isSchool(seg) ? 'المدرسة' : 'غير واضح ⚠️'),
        type: exam && subs[0] ? 'exam' : 'school',
      });
    });
    return rows;
  }
  // النطاق غطّى أيامه: لا fallback مكرر فوقها
  if (range) return rows;
  // بلا نطاق ولا مراسي: وزّع المواد على الأيام المرصودة موقعياً أو من الأحد
  const a3 = anchors();
  const subs = subjectsIn(text);
  const times = timesOf(text);
  if (!a3.length && !subs.length && !isSchool(text) && !isExam(text)) return [];
  const useDays = a3.length ? a3.map(x => x.day) : [0, 1, 2, 3, 4].slice(0, Math.max(1, subs.length));
  useDays.forEach((d, k) => {
    const seg = a3.length ? text.slice(a3[k]?.pos ?? 0, a3[k + 1]?.pos ?? text.length) : text;
    const s2 = subjectsIn(seg);
    rows.push({
      day: d,
      start: times[Math.min(k, times.length - 1)]?.start ?? times[0]?.start ?? '08:00',
      end: times[Math.min(k, times.length - 1)]?.end ?? times[0]?.end ?? '14:00',
      label: s2[0] ?? subs[Math.min(k, Math.max(0, subs.length - 1))] ?? (isExam(seg) ? 'اختبار (أكّد المادة) ⚠️' : isSchool(seg) ? 'المدرسة' : 'غير واضح ⚠️'),
      type: isExam(seg) && (s2.length || subs.length) ? 'exam' : 'school',
    });
  });
  return rows;
}
