// فحوص جودة حقيقية تعمل داخل التطبيق — تثبت أن المحتوى يتغير حسب كل درس.
// تُشغَّل من لوحة محرك AI وتعرض نتائجها — لا واجهة شكلية.
import { runIngest, validateBank } from './brain';
import { extractEquations, renderMathHTML, validateLatex } from './math';
import type { RecallQ } from './types';

export interface SelfTest { name: string; passed: boolean; detail: string }

export function runSelfTests(): SelfTest[] {
  const out: SelfTest[] = [];
  try {
    // T1: درسان مختلفان → مخرجات مختلفة (لا قوالب ثابتة)
    const phys = runIngest(
      'قانون نيوتن الثاني: F = m × a حيث F القوة و m الكتلة و a التسارع. وحدة القوة هي نيوتن.',
      { id: 't_phys', title: 'نيوتن', sourceRef: 'اختبار ذاتي' }, 'الفيزياء', [],
    );
    const hist = runIngest(
      'أولاً قيام الدولة، ثم ازدهار التجارة، بعد ذلك ضعف السلطة. من أسباب السقوط: الصراع الداخلي والغزو الخارجي.',
      { id: 't_hist', title: 'الدولة', sourceRef: 'اختبار ذاتي' }, 'التاريخ', [],
    );
    const pq = phys.questions.map(q => q.prompt).join('|');
    const hq = hist.questions.map(q => q.prompt).join('|');
    const diff = pq !== hq && phys.questions.length > 0 && hist.questions.length > 0;
    const physFormula = phys.questions.some(q => q.focus === 'formula');
    const histSeq = hist.questions.some(q => q.focus === 'sequence' || q.focus === 'relation');
    out.push({
      name: 'المحتوى يتغير حسب الدرس',
      passed: diff && physFormula && histSeq,
      detail: diff
        ? `فيزياء: ${phys.questions.length} سؤال (قوانين ✓) • تاريخ: ${hist.questions.length} سؤال (تسلسل/علاقات ${histSeq ? '✓' : '✗'})`
        : 'المخرجات متطابقة أو فارغة — فشل',
    });
  } catch (e) {
    out.push({ name: 'المحتوى يتغير حسب الدرس', passed: false, detail: `استثناء: ${e instanceof Error ? e.message : '؟'}` });
  }
  try {
    // T2: معادلات (كسر + جذر + أس) تُستخرج وتُعرض
    const eqs = extractEquations('السرعة: v = d / t والطاقة: E = m × c² والجذر: √16 = 4 والكسر: 1/2');
    const withLatex = eqs.filter(e => e.latex && e.latex.length > 0);
    const rendered = eqs.filter(e => renderMathHTML(e.latex) !== null).length;
    out.push({
      name: 'استخراج المعادلات وعرضها',
      passed: eqs.length >= 3 && rendered >= 2,
      detail: `مكتشفة: ${eqs.length} • صالحة للعرض: ${rendered} • مثال: ${withLatex[0]?.latex ?? '—'}`,
    });
  } catch (e) {
    out.push({ name: 'استخراج المعادلات وعرضها', passed: false, detail: `استثناء: ${e instanceof Error ? e.message : '؟'}` });
  }
  try {
    // T3: الفحص الذاتي يرفض المختلق
    const src = 'قانون أوم: V = I × R حيث V الجهد و I التيار و R المقاومة.';
    const fake: RecallQ = {
      id: 'fake', conceptId: 'c1', kind: 'qa', prompt: 'ما عاصمة فرنسا؟', answer: 'باريس — لا علاقة بالمصدر',
      hint: '', sourceLessonId: 'l1', sourceRef: 'اختبار', section: 0, difficulty: 1, origin: 'source',
    };
    const { ok, failed } = validateBank([fake], src);
    out.push({
      name: 'منع الاختلاق (Self-Check)',
      passed: ok.length === 0 && failed.length === 1,
      detail: failed.length ? `رُفض: ${failed[0].reason}` : 'قُبِل المختلق — فشل',
    });
    // T4: معادلة مكسورة تُوسم منخفضة ولا تُستخدم للحل
    const v = validateLatex('F = m \\frac{a}{b', 'F = m × (ناقص)');
    out.push({
      name: 'التحقق قبل الحل',
      passed: v.confidence === 'low',
      detail: `معادلة ناقصة → ثقة ${v.confidence} (${v.doubts[0] ?? 'بلا سبب'})`,
    });
  } catch (e) {
    out.push({ name: 'الفحص الذاتي', passed: false, detail: `استثناء: ${e instanceof Error ? e.message : '؟'}` });
  }
  return out;
}
