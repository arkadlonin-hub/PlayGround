// استخراج المعادلات والرموز العلمية جذرياً — لا تخمين، لا استبدال عشوائي.
// المصدر: النص المستخرج (OCR/PDF/يدوي). المخرجات: معادلات LaTeX متحقق منها + مواضع شك معلنة.
// القاعدة: الغامض يُوسم ⚠️ ويُطلب له صورة أوضح — لا يُستخدم في شرح/أسئلة/حل قبل التحقق.
import katex from 'katex';

export type MathConfidence = 'high' | 'mid' | 'low';

export interface MathEquation {
  id: string;
  /** النص الأصلي كما ورد في المصدر — لا يُمس */
  raw: string;
  /** تفسير LaTeX المقترح للعرض — قابل للمراجعة اليدوية */
  latex: string;
  confidence: MathConfidence;
  doubts: string[];
  section: number;
}

let eqSeq = 0;
const eqId = () => `eq_${Date.now().toString(36)}_${eqSeq++}`;

// رموز آمنة التحويل فقط — أي شيء آخر يُترك كما هو ويُوسم
const SYM2LATEX: Array<[RegExp, string]> = [
  [/×/g, '\\times '], [/÷/g, '\\div '], [/−/g, '-'], [/–/g, '-'], [/—/g, '-'],
  [/π/g, '\\pi '], [/θ/g, '\\theta '], [/λ/g, '\\lambda '], [/Δ/g, '\\Delta '],
  [/δ/g, '\\delta '], [/α/g, '\\alpha '], [/β/g, '\\beta '], [/γ/g, '\\gamma '],
  [/∞/g, '\\infty '], [/≈/g, '\\approx '], [/≠/g, '\\neq '], [/≤/g, '\\le '],
  [/≥/g, '\\ge '], [/⇒/g, '\\Rightarrow '], [/→/g, '\\to '], [/±/g, '\\pm '],
  [/∂/g, '\\partial '], [/∫/g, '\\int '], [/Σ/g, '\\sum '], [/∇/g, '\\nabla '],
  [/°/g, '^{\\circ}'], [/·/g, '\\cdot '],
];

const SUPER_MAP: Record<string, string> = {
  '⁰': '0', '¹': '1', '²': '2', '³': '3', '⁴': '4', '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9',
  '⁺': '+', '⁻': '-', 'ⁿ': 'n', 'ˣ': 'x',
};
const SUB_MAP: Record<string, string> = {
  '₀': '0', '₁': '1', '₂': '2', '₃': '3', '₄': '4', '₅': '5', '₆': '6', '₇': '7', '₈': '8', '₉': '9',
  '₊': '+', '₋': '-', 'ₓ': 'x', 'ₙ': 'n',
};

function convertRoots(s: string, doubts: string[]): string {
  // √x / √(…) / √[... ] → \sqrt{…}
  return s.replace(/√\s*(\([^()]*\)|\[[^\]]*\]|[A-Za-z\u0600-\u06FF0-9]+)/g, (_m, g: string) => {
    const inner = g.replace(/^[(\[]|[)\]]$/g, '');
    if (!inner) { doubts.push('جذر بلا محتوى واضح'); return _m; }
    return `\\sqrt{${inner}}`;
  });
}

function convertSupSub(s: string): string {
  // أسس مرتفعة يونيكود: x² → x^{2}
  s = s.replace(/([A-Za-z\u0600-\u06FF0-9)\\\]}])([⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻ⁿˣ]+)/g, (_m, base: string, sup: string) => {
    const mapped = [...sup].map(c => SUPER_MAP[c] ?? '').join('');
    return mapped ? `${base}^{${mapped}}` : _m;
  });
  // مؤشرات سفلية يونيكود
  s = s.replace(/([A-Za-z\u0600-\u06FF0-9)\\\]}])([₀₁₂₃₄₅₆₇₈₉₊₋ₓₙ]+)/g, (_m, base: string, sub: string) => {
    const mapped = [...sub].map(c => SUB_MAP[c] ?? '').join('');
    return mapped ? `${base}_{${mapped}}` : _m;
  });
  // a^b / a_b الصريحة → تجميع
  s = s.replace(/\^\s*([A-Za-z0-9\u0600-\u06FF])/g, '^{$1}');
  s = s.replace(/_\s*([A-Za-z0-9\u0600-\u06FF])/g, '_{$1}');
  return s;
}

function convertFractions(s: string, doubts: string[]): string {
  // كسر واضح من رموز مفردة: a/b → \frac{a}{b} (فقط رموز/أرقام مفردة لتفادي ابتلاع الجمل)
  return s.replace(/(^|[\s(=])\s*([A-Za-z\u0600-\u06FF0-9]+)\s*\/\s*([A-Za-z\u0600-\u06FF0-9]+)(?=[\s).,;،؛]|$)/g,
    (m, pre: string, a: string, b: string) => {
      if (a.length > 4 || b.length > 4) { doubts.push(`كسر غير مؤكد: ${a}/${b} — راجع الأصل`); return m; }
      return `${pre}\\frac{${a}}{${b}}`;
    });
}

function toLatex(raw: string, doubts: string[]): string {
  let s = raw.trim();
  // أزل $ المحيطة إن وجدت (نحفظ الأصل في raw)
  s = s.replace(/^\$+|\$+$/g, '').trim();
  s = convertRoots(s, doubts);
  for (const [re, rep] of SYM2LATEX) s = s.replace(re, rep);
  s = convertSupSub(s);
  s = convertFractions(s, doubts);
  // \frac{}{} و \sqrt{} المكتوبة أصلاً تُترك كما هي
  return s.replace(/\s+/g, ' ').trim();
}

function balanced(s: string): string[] {
  const out: string[] = [];
  const stack: string[] = [];
  const pairs: Record<string, string> = { '(': ')', '[': ']', '{': '}' };
  for (const ch of s) {
    if (pairs[ch]) stack.push(ch);
    else if (Object.values(pairs).includes(ch)) {
      const last = stack.pop();
      if (!last || pairs[last] !== ch) { out.push(`أقواس غير متوازنة قرب «${ch}»`); break; }
    }
  }
  if (stack.length) out.push('قوس مفتوح بلا إغلاق');
  // أقواس LaTeX
  const open = (s.match(/\\(frac|sqrt|text)\{/g) ?? []).length;
  const close = (s.match(/\{/g) ?? []).length;
  void open; void close;
  let depth = 0;
  for (const ch of s) {
    if (ch === '{') depth++;
    if (ch === '}') depth--;
    if (depth < 0) { out.push('إغلاق زائد }'); break; }
  }
  if (depth > 0) out.push('قوس { بلا إغلاق');
  return out;
}

const UNKNOWN_RE = /[�□▯�◻◼☀-⛿⬀-⭿\u{1F300}-\u{1FAFF}]/u;

export function validateLatex(latex: string, raw: string): { confidence: MathConfidence; doubts: string[] } {
  const doubts = [...balanced(latex)];
  if (UNKNOWN_RE.test(raw)) doubts.push('رموز غير مقروءة في الأصل (�/□) — اطلب صورة أوضح');
  if (/[?؟]{2,}/.test(raw)) doubts.push('علامات استفهام متكررة في الأصل — قد تكون رموزاً ضائعة');
  const sides = latex.split('=');
  if (latex.includes('=') && sides.some(x => !x.trim())) doubts.push('طرف فارغ حول =');
  if (/\\frac\{[^}]*$/.test(latex)) doubts.push('كسر ناقص');
  try {
    katex.renderToString(latex, { throwOnError: true, strict: false });
  } catch {
    doubts.push('تعذّر عرض المعادلة — تحقق من بنيتها');
    return { confidence: 'low', doubts };
  }
  if (!doubts.length) return { confidence: 'high', doubts };
  if (doubts.every(d => d.startsWith('كسر غير مؤكد'))) return { confidence: 'mid', doubts };
  return { confidence: doubts.length === 1 ? 'mid' : 'low', doubts };
}

/** هل السطر مرشح معادلة؟ (= أو رموز رياضية أو LaTeX صريح) */
function isEquationLine(s: string): boolean {
  if (/\\(frac|sqrt|sum|int|begin|end)\{/.test(s)) return true;
  if (/\$[^$]+\$/.test(s)) return true;
  if (/[=√∫Σ∂πθλΔ∞≈≠≤≥]/.test(s)) return true;
  if (/\^|_[A-Za-z0-9\u0600-\u06FF{]/.test(s) && /[A-Za-z=]/.test(s)) return true;
  if (/[٠-٩0-9]+\s*\/\s*[٠-٩0-9A-Za-z\u0600-\u06FF]+/.test(s) && s.length < 60) return true;
  return false;
}

/** تنظيف طرفي المعادلة — نسخة العرض (تطابق منطق الاستخراج، والأصل محفوظ دائماً) */
function cleanLhsM(raw: string): string {
  let s = raw.split(/[:：]/).pop()!.trim();
  const toks = s.split(/\s+/).filter(Boolean);
  while (toks.length > 1 && /^[\u0600-\u06FF]+$/.test(toks[0])) toks.shift();
  s = toks.join(' ').trim();
  return s.length >= 1 && s.length <= 30 ? s : '';
}
function cleanRhsM(raw: string): string {
  let s = raw.trim();
  const cut = s.search(/\s+(?:حيث|مثل|يعني|لأن|عندما|إذا)(?=[\s.,؛:\)\]]|$)/);
  if (cut > 0) s = s.slice(0, cut).trim();
  if (!s || s.length > 60) return '';
  return s;
}

/** استخراج المعادلات من النص مع الحفاظ على ترتيبها ومواضعها.
 *  يقسّم السطر أولاً عند حدود الأمثلة (و + كلمة + :) حتى لا تبتلع معادلةٌ جملتها. */
export function extractEquations(text: string): MathEquation[] {
  const out: MathEquation[] = [];
  const lines = text.split('\n');
  lines.forEach((line, li) => {
    const segs = line
      .split(/(?=\sو[\u0600-\u06FFA-Za-z]+\s*:)|[؛;]/)
      .map(x => x.trim()).filter(Boolean);
    for (const seg of segs) {
      if (seg.length < 2 || seg.length > 220) continue;
      if (!isEquationLine(seg)) continue;
      // مسح شامل: كل معادلات المقطع واحدة واحدة (لا الأولى فقط)
      const re = /(.{1,40}?)\s*=\s*(.+?)(?=(?:\sو[\u0600-\u06FFA-Za-z]+\s*:)|[.!؟?؛,،]|$)/g;
      let m: RegExpExecArray | null;
      let found = false;
      while ((m = re.exec(seg)) !== null) {
        const lhs = cleanLhsM(m[1]);
        const rhs = cleanRhsM(m[2]);
        if (lhs && rhs) {
          const raw = `${lhs} = ${rhs}`;
          const doubts: string[] = [];
          const latex = toLatex(raw, doubts);
          const v = validateLatex(latex, raw);
          out.push({ id: eqId(), raw, latex, confidence: v.confidence, doubts: [...doubts, ...v.doubts], section: li });
          found = true;
          if (out.length >= 30) return;
        }
        if (re.lastIndex >= seg.length) break;
      }
      if (found) continue;
      // بلا = (كسر/جذر مفرد): احتفظ بالمقطع كاملاً دون تخمين
      const doubts: string[] = [];
      const latex = toLatex(seg, doubts);
      const v = validateLatex(latex, seg);
      out.push({ id: eqId(), raw: seg, latex, confidence: v.confidence, doubts: [...doubts, ...v.doubts], section: li });
      if (out.length >= 30) return;
    }
  });
  return out;
}

/** عرض آمن: يعيد HTML أو null عند الفشل (لا يُرمى خطأ للواجهة أبداً) */
export function renderMathHTML(latex: string): string | null {
  try {
    return katex.renderToString(latex, { throwOnError: true, strict: false, displayMode: false });
  } catch {
    return null;
  }
}

/** مواضع الشك في نص خام — تُعرض للمستخدم لطلب صورة أوضح */
export function doubtSpots(text: string): string[] {
  const spots: string[] = [];
  const lines = text.split('\n');
  lines.forEach((ln, i) => {
    if (UNKNOWN_RE.test(ln)) spots.push(`سطر ${i + 1}: رموز غير مقروءة — صوّر أوضح`);
    else if (/[?؟]{3,}/.test(ln)) spots.push(`سطر ${i + 1}: غموض متكرر — راجع الأصل`);
  });
  return spots.slice(0, 8);
}
