// AI Providers — طبقة نماذج قابلة للتبديل، مجانية أولاً.
// الافتراضي: المحرك المحلي (قواعدي، يعمل دون إنترنت بعد التحميل، بلا حدود وبلا مفاتيح).
// الاختياري: مزود OpenAI-compatible من اختيار المستخدم (قد يكون مجانياً أو مدفوعاً لديه).
// لا ندّعي خدمة غير محدودة: كل مزود يعلن قيوده، والفشل يعود للمحلي مع إشعار صريح.
import type { BrainContext } from './brain';

export type ProviderKind = 'local' | 'openai-compatible';

export interface ProviderDef {
  id: string;
  kind: ProviderKind;
  label: string;
  desc: string;
  limits: string;
  requiresKey: boolean;
}

export const PROVIDERS: ProviderDef[] = [
  {
    id: 'local', kind: 'local', label: 'المحرك المحلي (افتراضي)',
    desc: 'قواعد + OCR داخل جهازك. يعمل دون إنترنت بعد أول تحميل، مجاني وغير محدود، لكنه ليس نموذجاً لغوياً ضخماً — جودة الشرح محدودة.',
    limits: 'بلا مفاتيح • بلا حصص • يحتاج مراجعتك للنصوص المستخرجة',
    requiresKey: false,
  },
  {
    id: 'openai-compatible', kind: 'openai-compatible', label: 'نموذج خارجي (اختياري)',
    desc: 'اربط أي مزود مجاني/مدفوع لديك عبر واجهة OpenAI-compatible (baseURL + key + model). يُستخدم للشرح فقط، والمصدر يبقى مرجع الإجابة.',
    limits: 'يخضع لحصص مزودك وأسعاره — راجع لوحته. المفتاح يُحفظ في جهازك فقط ولا يُرسل إلا لمزودك.',
    requiresKey: true,
  },
];

export interface RemoteCfg {
  baseURL: string;
  apiKey: string;
  model: string;
}

const SEL_KEY = 'focus30-ai-provider';
const CFG_KEY = 'focus30-ai-remote-cfg';

export function getProviderId(): string {
  try { return localStorage.getItem(SEL_KEY) || 'local'; } catch { return 'local'; }
}
export function setProviderId(id: string) {
  try { localStorage.setItem(SEL_KEY, id); } catch { /* ignore */ }
}
export function getRemoteCfg(): RemoteCfg {
  try {
    const raw = localStorage.getItem(CFG_KEY);
    if (raw) { const p = JSON.parse(raw); return { baseURL: p.baseURL ?? '', apiKey: p.apiKey ?? '', model: p.model ?? '' }; }
  } catch { /* ignore */ }
  return { baseURL: '', apiKey: '', model: '' };
}
export function setRemoteCfg(c: RemoteCfg) {
  try { localStorage.setItem(CFG_KEY, JSON.stringify(c)); } catch { /* ignore */ }
}
export function clearRemoteCfg() {
  try { localStorage.removeItem(CFG_KEY); } catch { /* ignore */ }
}

/** شرح خارجي اختياري — يُستدعى فقط عند اختيار المستخدم للمزود الخارجي وإدخال بياناته */
export async function remoteExplain(
  query: string,
  sourceExcerpt: string,
  ctx: BrainContext,
  onStage?: (s: string) => void,
): Promise<{ text: string; grounded: boolean } | { error: string }> {
  const cfg = getRemoteCfg();
  if (!cfg.baseURL.trim() || !cfg.apiKey.trim() || !cfg.model.trim()) {
    return { error: 'بيانات المزود الخارجي ناقصة — أدخل baseURL والمفتاح واسم النموذج، أو ابقَ على المحرك المحلي المجاني.' };
  }
  const base = cfg.baseURL.trim().replace(/\/+$/, '');
  const sys = [
    'أنت مدرس مساعد داخل تطبيق Focus30 AI.',
    'أجب بالعربية، واستخدم المقتطف المصدري أولاً حرفياً عند توفره.',
    'أي معلومة من خارج المقتطف ضع قبلها وسم [External Knowledge] صراحة.',
    'لا تخترع معادلات: انسخ المعادلة من المصدر كما هي، وإن كانت غير واضحة قل ذلك.',
    `سياق الطالب: إتقان عام ${ctx.avgMastery}% • أخطاء مفتوحة ${ctx.openErrors} • مراجعات مستحقة ${ctx.dueCount}.`,
  ].join('\n');
  const user = `سؤال الطالب: ${query}\n\n${sourceExcerpt ? `مقتطف المصدر (الأصل — اعتمد عليه أولاً):\n${sourceExcerpt.slice(0, 2000)}` : 'لا يوجد مقتطف مصدر — أجب كمعرفة عامة موسومة.'}`;
  try {
    onStage?.('إرسال للمزود الخارجي…');
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 45000);
    const res = await fetch(`${base}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.apiKey}` },
      body: JSON.stringify({
        model: cfg.model,
        messages: [{ role: 'system', content: sys }, { role: 'user', content: user }],
        temperature: 0.2,
      }),
      signal: ctrl.signal,
    }).finally(() => clearTimeout(timer));
    if (!res.ok) {
      const t = await res.text().catch(() => '');
      return { error: `رفض المزود الطلب (${res.status}) — ${t.slice(0, 160) || 'تحقق من المفتاح والنموذج والرصيد'}. عُد للمحرك المحلي المجاني.` };
    }
    const j = await res.json();
    const text = (j?.choices?.[0]?.message?.content ?? '').trim();
    if (!text) return { error: 'رد فارغ من المزود — عُد للمحرك المحلي المجاني.' };
    return { text, grounded: !!sourceExcerpt };
  } catch (e) {
    const msg = e instanceof Error && e.name === 'AbortError' ? 'انتهت المهلة (45 ثانية)' : 'تعذّر الاتصال بالمزود';
    return { error: `${msg} — تحقق من الإنترنت وbaseURL، أو عُد للمحرك المحلي المجاني.` };
  }
}
