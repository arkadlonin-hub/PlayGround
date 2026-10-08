// OCR حقيقي داخل المتصفح (Tesseract عبر CDN — يُحمَّل عند الحاجة فقط).
// يستخرج النص العربي والإنجليزي من صور الدروس والسبورة ليتحول لمحتوى دراسي.
// عند غياب الشبكة أو فشل الاستخراج: يُرجع null بصدق بدل اختلاق نص.

let workerPromise: Promise<{ recognize: (img: string) => Promise<{ data: { text: string } }>; terminate: () => Promise<void> }> | null = null;

async function getWorker() {
  if (!workerPromise) {
    workerPromise = (async () => {
      const url = 'https://cdn.jsdelivr.net/npm/tesseract.js@6/dist/tesseract.esm.min.js';
      const mod = await new Function('u', 'return import(/* @vite-ignore */u)')(url) as {
        createWorker: (langs: string[]) => Promise<{ recognize: (img: string) => Promise<{ data: { text: string } }>; terminate: () => Promise<void> }>;
      };
      const worker = await mod.createWorker(['ara', 'eng']);
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
    const text = (data.text ?? '').replace(/[ \t]+\n/g, '\n').trim();
    if (text.replace(/[^ء-غف-يa-zA-Z0-9]/g, '').length < 8) {
      return { error: 'الصورة غير واضحة أو بلا نص مقروء — جرّب صورة أوضح، أو اكتب سطراً واحداً بنفسك.' };
    }
    return { text };
  } catch {
    workerPromise = null;
    return { error: 'فشل الاستخراج — اكتب سطراً واحداً بنفسك بدلاً من ذلك.' };
  }
}
