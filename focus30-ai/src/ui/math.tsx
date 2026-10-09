// عرض المعادلات بـKaTeX مع الحفاظ على RTL للنص وLTR للرياضيات.
// آمن: أي فشل يعرض الأصل كنص — لا يُرمى خطأ أبداً.
import { useMemo } from 'react';
import { extractEquations, renderMathHTML, type MathConfidence, type MathEquation } from '../core/math';

export function MathTex({ latex, raw, confidence, doubts }: {
  latex: string; raw?: string; confidence?: MathConfidence; doubts?: string[];
}) {
  const html = useMemo(() => renderMathHTML(latex), [latex]);
  const badge = confidence === 'high' ? '🟢' : confidence === 'mid' ? '🟡' : confidence === 'low' ? '⚪' : '';
  if (!html) {
    return (
      <span className="mattex-fallback" dir="ltr" style={{ fontFamily: 'monospace', background: 'rgba(248,113,113,.12)', borderRadius: 8, padding: '2px 8px', display: 'inline-block' }}>
        {raw ?? latex}
        <span className="tiny mut"> ⚠️ تعذّر العرض — راجع الأصل</span>
      </span>
    );
  }
  return (
    <span style={{ display: 'inline-flex', flexDirection: 'column', gap: 2, maxWidth: '100%' }}>
      <span dir="ltr" style={{ display: 'inline-block', maxWidth: '100%', overflowX: 'auto' }} dangerouslySetInnerHTML={{ __html: html }} />
      {(confidence || (doubts ?? []).length > 0) && (
        <span className="tiny mut">
          {badge} {confidence === 'low' ? 'تحقق قبل الاستخدام — ' : ''}{(doubts ?? []).slice(0, 2).join(' • ')}
        </span>
      )}
    </span>
  );
}

/** عرض تلقائي: يكتشف المعادلات في أي نص ويعرضها KaTeX باتجاه LTR داخل نص RTL.
 *  الأصل محفوظ دائماً (tooltip + fallback)، والغامض موسوم ⚠️ — لا تخمين. */
export function AutoMath({ text, equations }: { text: string; equations?: MathEquation[] }) {
  const segs = useMemo(() => {
    const eqs = equations ?? extractEquations(text);
    if (!eqs.length) return [{ t: 'txt', v: text } as const];
    const out: Array<{ t: 'txt'; v: string } | { t: 'eq'; e: MathEquation }> = [];
    let rest = text; let guard = 0;
    while (rest && guard++ < 12) {
      let best: MathEquation | null = null; let pos = -1;
      for (const e of eqs) {
        const p = rest.indexOf(e.raw);
        if (p >= 0 && (pos < 0 || p < pos)) { pos = p; best = e; }
      }
      if (!best || pos < 0) break;
      if (pos > 0) out.push({ t: 'txt', v: rest.slice(0, pos) });
      out.push({ t: 'eq', e: best });
      rest = rest.slice(pos + best.raw.length);
    }
    if (rest) out.push({ t: 'txt', v: rest });
    return out.length ? out : [{ t: 'txt', v: text } as const];
  }, [text, equations]);
  return (
    <span style={{ overflowWrap: 'break-word' }}>
      {segs.map((s, i) => s.t === 'txt'
        ? <span key={i} dir="auto">{s.v}</span>
        : <MathTex key={i} latex={s.e.latex} raw={s.e.raw} confidence={s.e.confidence} doubts={s.e.doubts} />)}
    </span>
  );
}
