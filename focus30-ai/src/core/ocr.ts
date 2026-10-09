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

/** معالجة مسبقة للصورة قبل OCR: تكبير + رمادي + تباين — تحسّن قراءة الجداول والخط اليدوي كثيراً */
function preprocessImage(dataUrl: string): Promise<string> {
  return new Promise(res => {
    try {
      const img = new globalThis.Image();
      img.onload = () => {
        try {
          const scale = Math.min(2.5, Math.max(1.2, 1600 / Math.max(1, img.naturalWidth || 800)));
          const c = document.createElement('canvas');
          c.width = Math.round((img.naturalWidth || 800) * scale);
          c.height = Math.round((img.naturalHeight || 600) * scale);
          const ctx = c.getContext('2d');
          if (!ctx) { res(dataUrl); return; }
          ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, c.width, c.height);
          ctx.drawImage(img, 0, 0, c.width, c.height);
          const d = ctx.getImageData(0, 0, c.width, c.height);
          const px = d.data;
          // رمادي + تمديد تباين + عتبة ناعمة لإبراز الحبر الداكن
          for (let i = 0; i < px.length; i += 4) {
            const g = 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
            const v = g < 140 ? Math.max(0, (g - 40) * 1.25) : Math.min(255, 160 + (g - 140) * 1.1);
            px[i] = px[i + 1] = px[i + 2] = v;
          }
          ctx.putImageData(d, 0, 0);
          res(c.toDataURL('image/png'));
        } catch { res(dataUrl); }
      };
      img.onerror = () => res(dataUrl);
      img.src = dataUrl;
    } catch { res(dataUrl); }
  });
}

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
    const clean = await preprocessImage(dataUrl);
    onProgress?.(55);
    const { data } = await worker.recognize(clean);
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
