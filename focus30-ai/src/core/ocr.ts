// OCR حقيقي داخل المتصفح (Tesseract عبر CDN — يُحمَّل عند الحاجة فقط).
// يستخرج النص العربي والإنجليزي من صور الدروس والسبورة ليتحول لمحتوى دراسي.
// عند غياب الشبكة أو فشل الاستخراج: يُرجع null بصدق بدل اختلاق نص.

const AR_WORD = /[\u0600-\u06FF\uFB50-\uFDFF\uFE70-\uFEFF]/;
const KNOWN_AR = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت', 'فيزياء', 'رياضيات', 'كيمياء', 'أحياء', 'عربي', 'تعريف', 'قانون', 'مدرسة', 'اختبار', 'امتحان', 'السرعة', 'الوراثة'];

function restoreLine(line: string): string {
  const clean = line.replace(/[\u200E\u200F\u202A-\u202E]/g, '');
  if (!AR_WORD.test(clean)) return clean;
  if (KNOWN_AR.some(w => clean.includes(w))) return clean; // ترتيب منطقي سليم — لا تلمسه
  // ترتيب بصري معكوس: اعكس ترتيب الكلمات ثم حروف الكلمات العربية فقط (الأرقام واللاتينية تبقى)
  return clean.split(/\s+/).reverse().map(tok => AR_WORD.test(tok) ? [...tok].reverse().join('') : tok).join(' ');
}

/** تطبيع نص OCR: إصلاح الترتيب البصري المعكوس للعربية */
export function normalizeOcrText(text: string): string {
  return text.split('\n').map(restoreLine).join('\n').replace(/[ \t]+\n/g, '\n').trim();
}

type OcrWorker = { recognize: (img: string) => Promise<{ data: { text: string } }>; terminate: () => Promise<void> };
let workerPromise: Promise<OcrWorker | null> | null = null;

async function getWorker() {
  if (!workerPromise) {    workerPromise = (async () => {
      const url = 'https://cdn.jsdelivr.net/npm/tesseract.js@6/dist/tesseract.esm.min.js';
      const mod = await new Function('u', 'return import(/* @vite-ignore */u)')(url) as {
        default?: { createWorker: (langs: string[]) => Promise<{ recognize: (img: string) => Promise<{ data: { text: string } }>; terminate: () => Promise<void> }> };
        createWorker?: (langs: string[]) => Promise<{ recognize: (img: string) => Promise<{ data: { text: string } }>; terminate: () => Promise<void> }>;
      };
      const createWorker = mod.default?.createWorker ?? mod.createWorker;
      if (!createWorker) throw new Error('no createWorker');
      const worker = await createWorker(['ara', 'eng']);
      return worker;
    })().catch(() => {
      workerPromise = null;
      return null as never;
    });
  }
  return workerPromise;
}

export async function ocrImage(
  dataUrl: string,
  onProgress?: (p: number) => void,
): Promise<{ text: string } | { error: string }> {
  try {
    onProgress?.(5);
    const worker = await getWorker();
    if (!worker) return { error: 'تعذّر تحميل محرك القراءة (تحقق من الاتصال بالإنترنت).' };
    onProgress?.(30);
    const { data } = await worker.recognize(dataUrl);
    onProgress?.(100);
    const text = normalizeOcrText(data.text ?? '');
    if (text.replace(/[^ء-غف-يa-zA-Z0-9]/g, '').length < 8) {
      return { error: 'الصورة غير واضحة أو بلا نص مقروء — جرّب صورة أوضح، أو اكتب سطراً واحداً بنفسك.' };
    }
    return { text };
  } catch {
    workerPromise = null;
    return { error: 'فشل الاستخراج — اكتب سطراً واحداً بنفسك بدلاً من ذلك.' };
  }
}
