// PDF محلي مجاني (pdfjs-dist legacy، مفتوح المصدر) — استخراج النص صفحة صفحة.
// النسخة legacy تعمل في المتصفح وNode معاً. يحافظ على ترقيم الصفحات لتتبع المصدر.
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';

let workerReady = false;
let workerError = '';
function ensureWorker() {
  if (workerReady) return;
  try {
    // workerSrc يقبل نصاً فقط (URL object يُرفض) — toString إجباري
    const w = new URL('pdfjs-dist/legacy/build/pdf.worker.min.mjs', import.meta.url).toString();
    (pdfjs as unknown as { GlobalWorkerOptions: { workerSrc: string } }).GlobalWorkerOptions.workerSrc = w;
  } catch (e) {
    workerError = e instanceof Error ? e.message : String(e);
  }
  workerReady = true;
}

export interface PdfPage { page: number; text: string }

/** يستخرج نص PDF محلياً (حتى 30 صفحة افتراضياً) مع أرقام الصفحات */
export async function extractPdf(
  file: File,
  onProgress?: (p: number) => void,
  maxPages = 30,
): Promise<{ pages: PdfPage[] } | { error: string }> {
  try {
    ensureWorker();
    if (workerError) return { error: `تعذّرت تهيئة قارئ PDF (${workerError}) — الصق النص يدوياً.` };
    onProgress?.(5);
    const buf = await file.arrayBuffer();
    const doc = await pdfjs.getDocument({ data: buf }).promise;
    const n = Math.min(doc.numPages, maxPages);
    if (n === 0) return { error: 'ملف PDF بلا صفحات مقروءة.' };
    const pages: PdfPage[] = [];
    for (let i = 1; i <= n; i++) {
      onProgress?.(Math.round(5 + (90 * i) / n));
      const page = await doc.getPage(i);
      const tc = await page.getTextContent();
      const parts: string[] = [];
      for (const it of tc.items as Array<{ str?: string; hasEOL?: boolean }>) {
        if (typeof it.str === 'string' && it.str) parts.push(it.str + (it.hasEOL ? '\n' : ' '));
      }
      const text = parts.join('').replace(/[ \t]+\n/g, '\n').trim();
      if (text.replace(/[^ء-غف-يa-zA-Z0-9]/g, '').length >= 4) pages.push({ page: i, text });
      try { page.cleanup(); } catch { /* ignore */ }
    }
    try { await doc.destroy(); } catch { /* ignore */ }
    onProgress?.(100);
    if (!pages.length) return { error: 'PDF ممسوح ضوئياً بلا طبقة نص — حوّله لصور واستخدم استخراج الصور، أو الصق النص يدوياً.' };
    return { pages };
  } catch (e) {
    const why = e instanceof Error ? e.message : String(e);
    return { error: `تعذّرت قراءة PDF (${why.slice(0, 120) || 'سبب غير معروف'}) — جرّب ملفاً آخر أو الصق النص يدوياً.` };
  }
}

/** يدمج الصفحات في نص واحد مع علامات [صفحة N] للتتبع */
export function pdfToText(pages: PdfPage[]): string {
  return pages.map(p => `[صفحة ${p.page}]\n${p.text}`).join('\n\n').trim();
}
