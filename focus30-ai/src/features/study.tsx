import { useMemo, useState } from 'react';
import { Brain, Camera, Link2, Plus, Shuffle } from 'lucide-react';
import { useStore, addXP } from '../core/store';
import type { Flashcard, Lesson, SourceKind } from '../core/types';
import { addDays, bandColor, bandOf, todayISO, uid } from '../core/types';
import { analyzeExam, buildMindmap, coverageOf, detectExamQuestions, detectMaterial, errorTypeOf, filterByMode, fsrsNext, gradeOf, masteryAfter, qualityPass, similarity, synthExamQs, traceOf, visualize } from '../core/ai';
import { adaptiveLevel, chooseNext, runIngest } from '../core/brain';
function lessonMeta0(id: string, title: string, sourceRef: string) { return { id, title, sourceRef }; }
import { Bar, Btn, Chip, Glass, MasteryDot, MindView, Modal, PickSheet, Ring, Sheet } from '../ui/kit';
import { AttachSheet, AttList, collectFiles, useFilePicker, type AttachOption, type AttFile } from '../ui/attach';

export function EmptyContent({ what, hint }: { what: string; hint: string }) {
  return (
    <Glass level={2} className="glow-purple pop">
      <h2>📭 لا يوجد {what} بعد</h2>
      <div className="small mut">{hint}</div>
      <div className="small mt" style={{ display: 'grid', gap: 4 }}>
        <div>📸 صوّر درساً من كتابك أو دفترك</div>
        <div>📄 أو أرفق PDF / ملاحظات / رابط / فيديو</div>
        <div>✨ وسيولّد AI {what} من محتواك أنت فقط</div>
      </div>
      <div className="tiny mut mt">لا نعرض أي سؤال جاهز أو وهمي — كل شيء من دروسك الحقيقية.</div>
    </Glass>
  );
}

export function Materials({ go }: { go: (t: string) => void }) {
  const { s, set } = useStore();
  const [open, setOpen] = useState(false);
  const [sel, setSel] = useState<string | null>(null);
  const [srcType, setSrcType] = useState('نص');
  const [text, setText] = useState('');
  const [pack, setPack] = useState<string | null>(null);
  const [concept, setConcept] = useState<string | null>(null);
  const [matPick, setMatPick] = useState('');
  const [newMat, setNewMat] = useState(false);
  const [nm, setNm] = useState('');
  const [nc, setNc] = useState('#22d3ee');
  const [delArm, setDelArm] = useState<string | null>(null);
  const [delLesson, setDelLesson] = useState<string | null>(null);
  const [attachOpen, setAttachOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState('');
  const [lessonTitle, setLessonTitle] = useState('');
  const [ocrBusy, setOcrBusy] = useState(false);
  const [ocrPct, setOcrPct] = useState(0);
  const [ocrMsg, setOcrMsg] = useState<string | null>(null);
  const [files, setFiles] = useState<AttFile[]>([]);
  const filePicker = useFilePicker(fl => {
    if (!fl) return;
    collectFiles(fl, t => setText(prev => (prev ? prev + '\n' : '') + t)).then(fs => setFiles(prev => [...prev, ...fs]));
  });
  const lesson: Lesson | undefined = useMemo(() => {
    for (const m of s.materials) for (const u of m.units) { const l = u.lessons.find(x => x.id === sel); if (l) return l; }
    return undefined;
  }, [s.materials, sel]);

  const onAttachPick = (o: AttachOption) => { setSrcType(o.type); filePicker.open(o.accept, o.capture); };
  const runOcr = async () => {
    const shots = files.filter(f => f.preview);
    if (!shots.length || ocrBusy) return;
    setOcrBusy(true); setOcrPct(2); setOcrMsg(null);
    try {
      const mod = await import('../core/ocr');
      const parts: string[] = [];
      for (let k = 0; k < shots.length; k++) {
        setOcrPct(Math.round(5 + (90 * k) / shots.length));
        const r = await mod.ocrImage(shots[k].preview!, p => setOcrPct(Math.round(5 + (90 * k + p * 0.9) / shots.length)));
        if ('text' in r) parts.push(r.text);
        else if (shots.length === 1) setOcrMsg(`⚠️ ${r.error}`);
      }
      if (parts.length) {
        setText(t => (t ? t + '\n' : '') + parts.join('\n'));
        setOcrMsg(`✅ استُخرج النص من ${parts.length} صورة — راجعه سريعاً ثم اضغط تحليل.`);
        if (!lessonTitle.trim() && parts[0]) setLessonTitle(parts[0].split('\n')[0].slice(0, 40));
      } else if (!ocrMsg) setOcrMsg('⚠️ لم يُستخرج نص — اكتب سطراً واحداً بنفسك.');
    } catch {
      setOcrMsg('⚠️ تعذّر تشغيل الاستخراج — اكتب سطراً واحداً بنفسك.');
    }
    setOcrBusy(false); setOcrPct(0);
  };
  const resetForm = () => {
    setText(''); setLinkUrl(''); setFiles([]); setSrcType('نص'); setMatPick(''); setLessonTitle(''); setOpen(false);
  };
  // اقتراح AI للمادة — يُعرض للمستخدم ولا يُعتمد تلقائياً أبداً
  const suggestion = useMemo(
    () => detectMaterial(text, files.map(f => f.name), s.materials.map(m => ({ id: m.id, name: m.name }))),
    [text, files, s.materials],
  );
  const sugName = s.materials.find(m => m.id === suggestion.matId)?.name;
  const [skipNote, setSkipNote] = useState<string | null>(null);
  const [brainRep, setBrainRep] = useState<{ report: import('../core/brain').BrainReport; title: string; lessonId: string } | null>(null);
  const [reviewLesson, setReviewLesson] = useState<string | null>(null);
  // حذف درس مع كل ما تولّد منه (بطاقات + أسئلة + مهام مرتبطة — بما فيها المرتبطة بمعرف الدرس نفسه)
  const deleteLesson = (lid: string) => {
    const cids = new Set(
      s.materials.flatMap(m => m.units.flatMap(u => u.lessons))
        .find(l => l.id === lid)?.concepts.map(c => c.id) ?? [],
    );
    set(p => ({
      ...p,
      materials: p.materials.map(m => ({ ...m, units: m.units.map(u => ({ ...u, lessons: u.lessons.filter(l => l.id !== lid) })) })),
      flashcards: p.flashcards.filter(f => !cids.has(f.conceptId) && f.conceptId !== lid),
      recallBank: p.recallBank.filter(q => !cids.has(q.conceptId) && q.conceptId !== lid),
      tasks: p.tasks.filter(t => t.lessonId !== lid),
    }));
  };

  const addContent = () => {
    const hasText = text.trim().length >= 4;
    const hasFiles = files.length > 0;
    const hasLink = linkUrl.trim().length > 0;
    if ((!hasText && !hasFiles && !hasLink) || !matPick) return;
    const targetMat = s.materials.find(m => m.id === matPick);
    if (!targetMat) return;
    const bits = [srcType];
    if (files.length) bits.push(`ملفات: ${files.map(f => f.name).join('، ')}`);
    if (linkUrl.trim()) bits.push(`رابط: ${linkUrl.trim()}`);
    bits.push(new Date().toLocaleDateString('ar'));
    const ref = bits.join(' — ');
    const title = lessonTitle.trim() || text.trim().slice(0, 40) || files[0]?.name || linkUrl.trim() || 'درس جديد';
    const lid = uid('l');
    // العقل المركزي: INPUT → UNDERSTAND → EXTRACT → STRUCTURE → REASON → GENERATE → VALIDATE
    const ingest = hasText && qualityPass(text)
      ? runIngest(text.trim(), lessonMeta0(lid, title, ref), targetMat.name, s.exams.flatMap(e => e.analysis.topics))
      : null;
    const concepts = ingest?.concepts ?? [];
    const elements = ingest?.elements ?? [];
    const skipped = ingest?.skipped ?? 0;
    const a = ingest ? { summary: ingest.summary, sections: ingest.sections } : null;
    // عناصر المخططات المرفقة من أداة المخططات لاحقاً تُربط هنا
    const imgs = files.filter(f => f.preview);
    const nl: Lesson = {
      id: lid, unitId: targetMat.units[0]?.id ?? 'u1', title,
      sourceText: text.trim(), sourceRef: ref, sections: a?.sections ?? [], elements,
      concepts, summary: a?.summary ?? (imgs.length ? `درس مصوّر: ${imgs.length} صورة — أضف سطراً واحداً عما فيها لتتولد أسئلة نصية.` : title),
      mindmap: buildMindmap(title, concepts),
      mastery: concepts.length ? Math.round(concepts.reduce((x, c) => x + c.mastery, 0) / concepts.length) : 20,
      attachments: files.map(f => ({ name: f.name, preview: f.preview })),
    };
    const cards: Flashcard[] = ingest?.cards ?? [];
    const rq: import('../core/types').RecallQ[] = ingest?.questions ?? [];
    // بطاقات نصية لكل درس — تُظهر أن محتوى أُضيف (لا تعرض الصورة نفسها):
    // من النص إن وُجد، وإلا بطاقة مراجعة مصدر توجه لفتح الدرس وإكماله
    const srcCards: Flashcard[] = concepts.length ? [] : [{
      id: uid('f'), conceptId: lid, kind: 'qa' as const,
      front: `📚 درس «${title}» — ما موضوعه بكلماتك؟`,
      back: text.trim()
        ? text.trim().slice(0, 200)
        : `مصدرك: ${files.map(f => f.name).join('، ') || linkUrl.trim() || 'مرفق'}. افتح الدرس من المواد، اقرأ المصدر، واكتب سطراً واحداً — ستتولد أسئلة دقيقة فوراً.`,
      sourceLessonId: lid, sourceRef: ref,
      ease: 2.5, interval: 1, due: todayISO(), reps: 0, lapses: 0,
    }];
    const srcQs: import('../core/types').RecallQ[] = concepts.length ? [] : [{
      id: uid('rq'), conceptId: lid, kind: 'explain' as const,
      prompt: `📚 اشرح من ذاكرتك: ما موضوع درس «${title}»؟ (مصدرك: ${files.map(f => f.name).join('، ') || linkUrl.trim() || 'مرفق'})`,
      answer: text.trim() || `موضوع الدرس: ${title}. افتح المصدر من تبويب المواد واكتب أهم 3 نقاط.`,
      hint: 'افتح الدرس، اقرأ المصدر 5 دقائق، ثم أجب دون النظر.',
      sourceLessonId: lid, sourceRef: ref, section: 0, difficulty: 1, origin: 'source',
    }];
    set(p => ({
      ...p,
      materials: p.materials.map(m => m.id === targetMat.id ? {
        ...m, units: m.units.map((u, j) => j === 0 ? { ...u, lessons: [...u.lessons, nl] } : u),
      } : m),
      flashcards: [...p.flashcards, ...cards, ...srcCards], recallBank: [...p.recallBank, ...rq, ...srcQs],
    }));
    resetForm(); addXP(set, 30);
    if (ingest) {
      setBrainRep({ report: ingest.report, title, lessonId: lid });
      setSkipNote(null);
    } else if (skipped > 0) setSkipNote(`🧹 تم تخطي ${skipped} مقاطع ضعيفة الجودة (حروف عشوائية) — لن تُبنى عليها أسئلة.`);
    else if (!concepts.length) setSkipNote(`📚 حُفظ «${title}» وظهر في البطاقات والتذكر والاختبارات — استخدم زر الاستخراج من الصورة أو أضف سطراً واحداً لتتولد أسئلة دقيقة.`);
  };

  return (
    <div>
      <div className="between mb"><h1>📚 المواد والدروس</h1>
        <div className="row"><Btn sm onClick={() => setNewMat(true)}><Plus size={14} /> مادة</Btn>
          <Btn kind="pri" sm onClick={() => setOpen(true)}><Plus size={14} /> إضافة محتوى</Btn></div></div>
      <div className="small mut mb">المادة ← الوحدة ← الدرس ← المفاهيم (بدون نظام الفصول). كل عنصر مرتبط بمصدره الأصلي.</div>
      {skipNote && <Glass level={2} className="mb"><div className="between"><span className="small">{skipNote}</span><Btn sm onClick={() => setSkipNote(null)}>✕</Btn></div></Glass>}
      {brainRep && <BrainPanel title={brainRep.title} report={brainRep.report} go={go}
        onReview={() => setReviewLesson(brainRep.lessonId)} onClose={() => setBrainRep(null)} />}
      {reviewLesson && <GeneratedReview lessonId={reviewLesson} onClose={() => setReviewLesson(null)} go={go} />}
      {s.materials.map(m => {
        const lessonsN = m.units.reduce((a, u) => a + u.lessons.length, 0);
        return (
        <Glass key={m.id} className="mb">
          <div className="between"><div className="row"><span className="dot" style={{ background: m.color }} />
            <b>{m.name}</b><MasteryDot m={m.mastery} /></div>
            <span className="row"><span className="small mut">{m.mastery}% • {m.minutes} د</span>
            {lessonsN === 0 && (
              delArm === m.id
                ? <button className="btn sm" onClick={() => { set(p => ({ ...p, materials: p.materials.filter(x => x.id !== m.id) })); setDelArm(null); }}>تأكيد الحذف؟</button>
                : <button className="btn sm ghost" title="حذف المادة الفارغة" onClick={() => setDelArm(m.id)}>✕</button>
            )}</span></div>
          <div className="mt"><Bar v={m.mastery} color={m.color} /></div>
          {m.units.map(u => (
            <div key={u.id} className="mt"><div className="small" style={{ fontWeight: 600 }}>📖 {u.title} — {u.mastery}%</div>
              {u.lessons.map(l => (
                <div key={l.id} className="task mt">
                  <div className="row" style={{ flex: 1, cursor: 'pointer' }} onClick={() => setSel(l.id)}>
                    {l.attachments?.[0]?.preview
                      ? <img src={l.attachments[0].preview} alt="" style={{ width: 40, height: 40, borderRadius: 10, objectFit: 'cover', flexShrink: 0 }} />
                      : <Brain size={15} color={m.color} />}
                    <div style={{ flex: 1 }}><div className="small" style={{ fontWeight: 600 }}>{l.title}</div>
                      <div className="tiny mut">{l.concepts.length} مفاهيم{(l.attachments?.length ?? 0) > 0 ? ` • 📷 ${l.attachments!.length} صور` : ''} • مصدر: {l.sourceRef}</div></div>
                    <MasteryDot m={l.mastery} />
                  </div>
                  {delLesson === l.id
                    ? <button className="btn sm" onClick={() => { deleteLesson(l.id); setDelLesson(null); }}>حذف؟</button>
                    : <button className="btn sm ghost" title="حذف الدرس ومرفقاته" onClick={() => setDelLesson(l.id)}>🗑️</button>}
                </div>
              ))}</div>
          ))}
        </Glass>
        );
      })}
      {newMat && <Modal onClose={() => setNewMat(false)}>
        <h2>➕ مادة جديدة</h2>
        <label className="lbl">اسم المادة (مثال: العربي، الإنجليزي، الأحياء)</label>
        <input placeholder="مثال: اللغة العربية" value={nm} onChange={e => setNm(e.target.value)} />
        <label className="lbl">اللون</label>
        <div className="wrap">
          {['#22d3ee', '#a78bfa', '#34d399', '#fbbf24', '#fb923c', '#f87171', '#60a5fa', '#f472b6'].map(c => (
            <button key={c} onClick={() => setNc(c)} style={{ width: 34, height: 34, borderRadius: '50%', background: c, border: nc === c ? '3px solid #fff' : '1px solid rgba(255,255,255,.2)', cursor: 'pointer' }} aria-label={c} />
          ))}
        </div>
        <div className="mt row"><Btn kind="pri" disabled={!nm.trim()} onClick={() => {
          const id = uid('m');
          set(p => ({
            ...p, materials: [...p.materials, {
              id, name: nm.trim(), color: nc, icon: 'book',
              units: [{ id: uid('u'), materialId: id, title: 'الوحدة 1', lessons: [], mastery: 0 }],
              mastery: 0, minutes: 0,
            }],
          }));
          setNm(''); setNewMat(false);
        }}>إنشاء المادة ✓</Btn><Btn kind="ghost" onClick={() => setNewMat(false)}>إلغاء</Btn></div>
      </Modal>}
      {open && <Modal onClose={() => setOpen(false)}>
        <h2>➕ إضافة محتوى دراسي</h2>
        {filePicker.el}
        <PickSheet label="المادة * (إجباري — لا إضافة عشوائية)" value={matPick}
          options={s.materials.map(m => ({ id: m.id, name: m.name, color: m.color }))}
          onPick={setMatPick} placeholder="— اختر المادة —" />
        {(text.trim() || files.length > 0) && (
          <div className="tiny mt">
            {suggestion.matId ? (
              <span className="row">🤖 AI يقترح: <b>{sugName}</b>
                <span className="chip">{suggestion.conf === 'high' ? 'ثقة عالية 🟢' : 'ثقة متوسطة 🟡'}</span>
                <button className="btn sm" onClick={() => suggestion.matId && setMatPick(suggestion.matId)}>اعتماد ✓</button>
                <span className="mut">({suggestion.why})</span></span>
            ) : <span className="mut">🤖 {suggestion.why}</span>}
          </div>
        )}
        <label className="lbl">نوع المحتوى</label>
        <div className="wrap mb">
          {['PDF', 'صورة كتاب', 'سبورة', 'ملاحظات', 'كتابة يدوية', 'نص', 'رابط', 'فيديو', 'ملاحظة شخصية'].map(t => (
            <Chip key={t} on={srcType === t} onClick={() => setSrcType(t)}>{t}</Chip>
          ))}
        </div>
        <label className="lbl">أرفق من تصميم التطبيق</label>
        <div className="wrap mb">
          <Btn sm kind="pri" onClick={() => setAttachOpen(true)}><Camera size={13} /> 📎 إرفاق صورة / ملف</Btn>
          <Btn sm onClick={() => setSrcType('رابط')}><Link2 size={13} /> رابط</Btn>
        </div>
        {attachOpen && <AttachSheet onClose={() => setAttachOpen(false)} onPick={onAttachPick} />}
        {(srcType === 'رابط' || srcType === 'فيديو') && (
          <div className="mb"><input placeholder="الصق الرابط هنا… https://…" value={linkUrl} onChange={e => setLinkUrl(e.target.value)} /></div>
        )}
        <label className="lbl">عنوان الدرس (مثال: درس الكسور — حتى لو أرفقت صورة فقط)</label>
        <input placeholder="عنوان الدرس…" value={lessonTitle} onChange={e => setLessonTitle(e.target.value)} />
        {(srcType === 'سبورة' || files.some(f => f.preview)) && !text.trim() && (
          <Glass level={2} className="mb">
            <div className="small">📋 <b>صورة سبورة/لوح مرفقة بلا نص</b> — للتحليل الدقيق اكتب سطراً واحداً على الأقل مما كُتب على اللوح (أهم قانون/تعريف/فكرة). لا أستطيع قراءة الصور تلقائياً بعد، ولن أخمّن محتواها.</div>
          </Glass>
        )}
        <AttList files={files} onRemove={i => setFiles(files.filter((_, j) => j !== i))} />
        {!!files.some(f => f.preview) && (
          <div className="mb">
            <Btn sm kind="pri" disabled={ocrBusy} onClick={runOcr}>🔍 {ocrBusy ? `استخراج النص… ${ocrPct}%` : 'استخراج النص من الصور بالذكاء الاصطناعي'}</Btn>
            {ocrBusy && <div className="mt"><Bar v={ocrPct} /></div>}
            {ocrMsg && <div className="tiny mt">{ocrMsg}</div>}
            {!ocrMsg && <div className="tiny mut mt">يقرأ النص العربي من صور الكتب والسبورة ويضعه في مربع النص — راجعه قبل التحليل.</div>}
          </div>
        )}
        {!!files.length && (
          <div className="tiny mut mb">📝 ملفات النص تُقرأ تلقائياً في مربع النص. لصور الكتب والسبورة: اكتب أو الصق النص بجانب الصورة — لا نختلق قراءة وهمية.</div>
        )}
        <textarea placeholder="النص (اختياري مع الصور — لكنه يصنع أسئلة أدق)… الصق النص أو اكتب ملاحظاتك وسيحللها AI إلى: تعاريف، قوانين، مصطلحات، أفكار، أمثلة، علاقات، حفظ/فهم، نقاط امتحانية" value={text} onChange={e => setText(e.target.value)} />
        {!matPick && <div className="tiny mut mt">⚠️ اختر المادة أولاً — لن يُضاف الدرس عشوائياً لأي مادة.</div>}
        {!!files.length && !text.trim() && <div className="tiny mut mt">🖼️ صورة بلا نص: ستُحفظ وتظهر في البطاقات والتذكر كسؤال بصري — وأي سطر تكتبه عنها يولّد أسئلة نصية دقيقة.</div>}
        <div className="mt row"><Btn kind="pri" disabled={(!text.trim() && !files.length && !linkUrl.trim()) || !matPick} onClick={addContent}>تحليل بالذكاء الاصطناعي ✨</Btn><Btn kind="ghost" onClick={() => setOpen(false)}>إلغاء</Btn></div>
      </Modal>}
      {lesson && <LessonSheet lesson={lesson} onClose={() => setSel(null)} onPack={() => setPack(lesson.id)} onConcept={setConcept} />}
      {pack && <PackSheet lessonId={pack} onClose={() => setPack(null)} go={go} />}
      {concept && <ConceptSheet conceptId={concept} onClose={() => setConcept(null)} go={go} />}
    </div>
  );
}

/** 36+43. تقرير العقل المركزي: الأدوات المنسقة + الثقة + الفحص — لا نتائج مجهولة */
export function BrainPanel({ title, report, go, onReview, onClose }: {
  title: string; report: import('../core/brain').BrainReport; go: (t: string) => void;
  onReview: () => void; onClose: () => void;
}) {
  const confAr = { high: 'عالية 🟢', mid: 'متوسطة 🟡', low: 'منخفضة ⚪' } as const;
  return (
    <Glass level={2} className="mb glow-cyan pop">
      <div className="between"><h2>🧠 العقل المركزي حلّل «{title}»</h2><Btn sm onClick={onClose}>✕</Btn></div>
      <div className="small mut">الثقة: {confAr[report.confidence]} — {report.confidenceWhy}</div>
      <div className="mt" style={{ display: 'grid', gap: 4 }}>
        {report.steps.map((st, i) => (
          <div key={i} className="small"><span>{st.ok ? '✅' : '⚠️'}</span> <b>{st.tool}:</b> {st.label} — <span className="mut">{st.detail}</span></div>
        ))}
      </div>
      <div className="small mt">📋 {report.profile.label}: {report.profile.note}</div>
      <div className="small">🔍 الفحص الذاتي: مقبول {report.checks.passed}{report.checks.failed.length ? ` • مرفوض ${report.checks.failed.length} (${report.checks.failed[0].reason})` : ' بلا رفض'}</div>
      <div className="small">📊 {report.counts.concepts} مفاهيم • {report.counts.elements} عناصر • {report.counts.questions} أسئلة • {report.counts.cards} بطاقات • التغطية {report.counts.coverage}%</div>
      <div className="mt wrap">
        <Btn kind="pri" sm onClick={() => { onClose(); go(report.nextAction.go); }}>{report.nextAction.title} ⚡</Btn>
        <Btn sm onClick={onReview}>👁️ مراجعة وتعديل المولّد (أنت المتحكم)</Btn>
      </div>
    </Glass>
  );
}

/** 42. الإنسان المتحكم: تعديل/حذف أي سؤال أو بطاقة — ويُحفظ التصحيح */
export function GeneratedReview({ lessonId, onClose, go }: { lessonId: string; onClose: () => void; go: (t: string) => void }) {
  const { s, set } = useStore();
  const [eq, setEq] = useState<string | null>(null);
  const [qp, setQp] = useState(''); const [qa, setQa] = useState('');
  const [ec, setEc] = useState<string | null>(null);
  const [cf, setCf] = useState(''); const [cb, setCb] = useState('');
  const lesson = s.materials.flatMap(m => m.units.flatMap(u => u.lessons)).find(l => l.id === lessonId);
  const qs = s.recallBank.filter(q => q.sourceLessonId === lessonId);
  const cards = s.flashcards.filter(f => f.sourceLessonId === lessonId);
  const nav = (r: string) => { onClose(); go(r); };
  return (
    <Sheet title={`👁️ مراجعة المولّد: ${lesson?.title ?? ''}`} onClose={onClose}>
      <div className="tiny mut">عدّل أو احذف — تصحيحك يُحفظ فوراً ويُستخدم في الجلسات القادمة. لا شيء نهائي دون موافقتك.</div>
      <h3 className="mt">❓ الأسئلة ({qs.length})</h3>
      <div style={{ display: 'grid', gap: 8 }}>
        {qs.map(q => (
          <div key={q.id}>
            <div className="task">
              <div style={{ flex: 1 }}><div className="small" style={{ fontWeight: 600 }}>{q.prompt.slice(0, 70)}</div>
                <div className="tiny mut">الفقرة {q.section + 1} • مستوى {q.level ?? 2} • {q.focus}</div></div>
              <Btn sm onClick={() => { setEq(q.id); setQp(q.prompt); setQa(q.answer); }}>تعديل</Btn>
              <button className="btn sm ghost" onClick={() => set(p => ({ ...p, recallBank: p.recallBank.filter(x => x.id !== q.id) }))}>🗑️</button>
            </div>
            {eq === q.id && (
              <Glass level={2} className="mt"><label className="lbl">السؤال</label>
                <textarea value={qp} onChange={e => setQp(e.target.value)} />
                <label className="lbl">الإجابة النموذجية</label>
                <textarea value={qa} onChange={e => setQa(e.target.value)} />
                <div className="mt wrap"><Btn kind="pri" sm disabled={qp.trim().length < 8 || qa.trim().length < 4} onClick={() => {
                  set(p => ({ ...p, recallBank: p.recallBank.map(x => x.id === q.id ? { ...x, prompt: qp.trim(), answer: qa.trim() } : x) }));
                  setEq(null);
                }}>حفظ التصحيح ✓</Btn><Btn sm onClick={() => setEq(null)}>إلغاء</Btn></div></Glass>
            )}
          </div>
        ))}
        {!qs.length && <div className="small mut">لا أسئلة محفوظة لهذا الدرس.</div>}
      </div>
      <h3 className="mt">🃏 البطاقات ({cards.length})</h3>
      <div style={{ display: 'grid', gap: 8 }}>
        {cards.map(c => (
          <div key={c.id}>
            <div className="task"><div style={{ flex: 1 }}><div className="small" style={{ fontWeight: 600 }}>{c.front.slice(0, 70)}</div>
              <div className="tiny mut">{c.kind}</div></div>
              <Btn sm onClick={() => { setEc(c.id); setCf(c.front); setCb(c.back); }}>تعديل</Btn>
              <button className="btn sm ghost" onClick={() => set(p => ({ ...p, flashcards: p.flashcards.filter(x => x.id !== c.id) }))}>🗑️</button>
            </div>
            {ec === c.id && (
              <Glass level={2} className="mt"><label className="lbl">الوجه</label>
                <textarea value={cf} onChange={e => setCf(e.target.value)} />
                <label className="lbl">الظهر</label>
                <textarea value={cb} onChange={e => setCb(e.target.value)} />
                <div className="mt wrap"><Btn kind="pri" sm disabled={cf.trim().length < 2 || cb.trim().length < 2} onClick={() => {
                  set(p => ({ ...p, flashcards: p.flashcards.map(x => x.id === c.id ? { ...x, front: cf.trim(), back: cb.trim() } : x) }));
                  setEc(null);
                }}>حفظ التصحيح ✓</Btn><Btn sm onClick={() => setEc(null)}>إلغاء</Btn></div></Glass>
            )}
          </div>
        ))}
        {!cards.length && <div className="small mut">لا بطاقات محفوظة لهذا الدرس.</div>}
      </div>
      <div className="mt wrap"><Btn kind="pri" sm onClick={() => nav('study-recall')}>ابدأ التذكر 🧠</Btn><Btn sm onClick={onClose}>إغلاق</Btn></div>
    </Sheet>
  );
}

function LessonSheet({ lesson, onClose, onPack, onConcept }: { lesson: Lesson; onClose: () => void; onPack: () => void; onConcept: (id: string) => void }) {
  const { s, set } = useStore();
  const [mv, setMv] = useState('');
  const kindName: Record<string, string> = { definition: 'تعريف', law: 'قانون', term: 'مصطلح', idea: 'فكرة', example: 'مثال', relation: 'علاقة', memorize: 'حفظ', understand: 'فهم', exam: 'امتحاني' };
  const curMat = s.materials.find(m => m.units.some(u => u.lessons.some(l => l.id === lesson.id)));
  const move = () => {
    if (!mv || mv === curMat?.id) return;
    set(p => ({
      ...p,
      materials: p.materials.map(m => {
        if (m.id === curMat?.id) return { ...m, units: m.units.map(u => ({ ...u, lessons: u.lessons.filter(l => l.id !== lesson.id) })) };
        if (m.id === mv) return { ...m, units: m.units.map((u, j) => j === 0 ? { ...u, lessons: [...u.lessons, lesson] } : u) };
        return m;
      }),
    }));
    onClose();
  };
  return (
    <Sheet title={lesson.title} onClose={onClose}>
      <div className="tiny mut">🔗 المصدر: {lesson.sourceRef} • 📁 المادة: {curMat?.name}</div>
      {!!(lesson.attachments?.length) && (
        <div className="mt" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
          {lesson.attachments!.map((a, i) => a.preview ? (
            <img key={i} src={a.preview} alt={a.name} style={{ width: '100%', aspectRatio: '1', objectFit: 'cover', borderRadius: 12, border: '1px solid rgba(255,255,255,.12)' }} />
          ) : (
            <div key={i} className="tiny mut" style={{ padding: 10, border: '1px solid rgba(255,255,255,.12)', borderRadius: 12 }}>📄 {a.name}</div>
          ))}
        </div>
      )}
      <PickSheet label="نقل الدرس لمادة أخرى 📦" value={mv}
        options={s.materials.filter(m => m.id !== curMat?.id).map(m => ({ id: m.id, name: m.name, color: m.color }))}
        onPick={id => { setMv(id); }} placeholder="اختر المادة…" />
      {!!mv && <div className="mt"><Btn sm kind="pri" onClick={move}>تأكيد النقل ✓</Btn></div>}
      <Glass className="mt"><h3>📝 الملخص</h3><div className="small">{lesson.summary}</div></Glass>
      <h3 className="mt">🧩 المفاهيم ({lesson.concepts.length})</h3>
      <div style={{ display: 'grid', gap: 8 }}>
        {lesson.concepts.map(c => (
          <button key={c.id} className="task" style={{ cursor: 'pointer', fontFamily: 'inherit', color: 'inherit', textAlign: 'start', width: '100%' }} onClick={() => onConcept(c.id)}>
            <MasteryDot m={c.mastery} />
            <div style={{ flex: 1 }}><div className="small" style={{ fontWeight: 600 }}>{c.title}</div>
              <div className="tiny mut">{kindName[c.kind]} • {c.needsMemorize ? 'يحتاج حفظاً' : 'يحتاج فهماً'} • وزن امتحاني {'⭐'.repeat(c.examWeight)} • إتقان {c.mastery}%</div></div>
            <Chip>{kindName[c.kind]} ‹</Chip></button>
        ))}
      </div>
      <h3 className="mt">🗺️ خريطة ذهنية (من الرسم المعرفي — اضغط أي عقدة)</h3>
      <div className="mind"><MindView node={lesson.mindmap as never} onSelect={onConcept} /></div>
      <div className="mt wrap"><Btn kind="pri" sm onClick={onPack}>🎒 تحويل إلى Study Pack</Btn><Btn sm onClick={onClose}>إغلاق</Btn></div>
    </Sheet>
  );
}

function PackSheet({ lessonId, onClose, go }: { lessonId: string; onClose: () => void; go: (t: string) => void }) {
  const { s, set } = useStore();
  const [planned, setPlanned] = useState(false);
  const lesson = s.materials.flatMap(m => m.units.flatMap(u => u.lessons)).find(l => l.id === lessonId);
  if (!lesson) return null;
  const weak = lesson.concepts.filter(c => c.mastery < 60).map(c => c.title);
  const matId = s.materials.find(m => m.units.some(u => u.lessons.some(l => l.id === lessonId)))?.id ?? '';
  const cardN = s.flashcards.filter(f => lesson.concepts.some(c => c.id === f.conceptId)).length;
  const qN = s.recallBank.filter(q => lesson.concepts.some(c => c.id === q.conceptId)).length;
  const makePlan = () => {
    const t = todayISO();
    set(p => ({
      ...p,
      tasks: [...p.tasks,
        { id: uid('t'), title: `مراجعة حزمة: ${lesson.title.slice(0, 35)}`, materialId: matId, lessonId, date: t, mins: 20, kind: 'review', done: false, priority: 1 },
        { id: uid('t'), title: `تثبيت حزمة: ${lesson.title.slice(0, 35)}`, materialId: matId, lessonId, date: addDays(t, 3), mins: 15, kind: 'review', done: false, priority: 2 },
        { id: uid('t'), title: `اختبار حزمة: ${lesson.title.slice(0, 35)}`, materialId: matId, lessonId, date: addDays(t, 7), mins: 20, kind: 'test', done: false, priority: 2 },
      ],
    }));
    setPlanned(true);
  };
  const nav = (r: string) => { onClose(); go(r); };
  return (
    <Sheet title={`🎒 Study Pack: ${lesson.title}`} onClose={onClose}>
      <div className="tiny mut">كل عنصر مرتبط بالمصدر: {lesson.sourceRef}</div>
      <Glass className="mt"><h3>📝 ملخص</h3><div className="small">{lesson.summary}</div></Glass>
      <Glass className="mt"><h3>🗒️ ملاحظات منظمة</h3><div className="small" style={{ whiteSpace: 'pre-line' }}>{lesson.concepts.slice(0, 4).map(c => `• ${c.title}`).join('\n')}</div></Glass>
      <Glass className="mt"><div className="between"><div><h3>🃏 بطاقات ({cardN})</h3><div className="small mut">سؤال/جواب • فراغات • قوانين</div></div><Btn sm kind="pri" onClick={() => nav('study-cards')}>ابدأ 🃏</Btn></div></Glass>
      <Glass className="mt"><div className="between"><div><h3>🧠 تذكّر نشط ({qN})</h3><div className="small mut">بلا إجابة قبل محاولتك</div></div><Btn sm kind="pri" onClick={() => nav('study-recall')}>ابدأ 🧠</Btn></div></Glass>
      <Glass className="mt"><div className="between"><div><h3>💡 أمثلة واقعية</h3><div className="small mut">من حياتك اليومية</div></div><Btn sm onClick={() => nav('ai-examples')}>عرض 🌍</Btn></div></Glass>
      <Glass className="mt"><div className="between"><div><h3>🔮 أسئلة متوقعة</h3><div className="small mut">بمستوى ثقة لكل سؤال</div></div><Btn sm onClick={() => nav('ai-predictor')}>توقّع 🔮</Btn></div></Glass>
      <Glass className="mt"><div className="between"><div><h3>⚠️ نقاط ضعف محتملة</h3><div className="small">{weak.length ? weak.join('؛ ') : 'لا نقاط حرجة حالياً'}</div></div><Btn sm onClick={() => nav('ai-weak')}>الخريطة 🕳️</Btn></div></Glass>
      <Glass className="mt"><div className="between"><div><h3>🔁 خطة مراجعة FSRS</h3><div className="small mut">اليوم + بعد 3 أيام + بعد أسبوع</div></div>
        {planned ? <Chip on>✓ أُنشئت 3 مهام</Chip> : <Btn sm kind="pri" onClick={makePlan}>أنشئ المهام ⚡</Btn>}</div></Glass>
      <Glass className="mt"><div className="between"><div><h3>📝 اختبار الحزمة</h3><div className="small mut">من أسئلة هذا الدرس فقط</div></div><Btn sm onClick={() => nav('study-tests')}>اختبر 📝</Btn></div></Glass>
      <div className="mt"><Btn sm onClick={onClose}>إغلاق</Btn></div>
    </Sheet>
  );
}

export function ConceptSheet({ conceptId, onClose, go }: { conceptId: string; onClose: () => void; go: (t: string) => void }) {
  const { s } = useStore();
  const [viz, setViz] = useState(false);
  const all = s.materials.flatMap(m => m.units.flatMap(u => u.lessons.flatMap(l => l.concepts.map(c => ({ ...c, lesson: l.title, mat: m.name, lessonId: l.id })))));
  const found = all.find(c => c.id === conceptId);
  if (!found) return null;
  const kindName: Record<string, string> = { definition: 'تعريف', law: 'قانون', term: 'مصطلح', idea: 'فكرة', example: 'مثال', relation: 'علاقة', memorize: 'حفظ', understand: 'فهم', exam: 'امتحاني' };
  const cards = s.flashcards.filter(f => f.conceptId === conceptId).length;
  const qs = s.recallBank.filter(q => q.conceptId === conceptId).length;
  const errs = s.errors.filter(e => e.conceptId === conceptId && !e.resolved).length;
  const pre = all.filter(c => found.prereqs.includes(c.id));
  const rel = all.filter(c => found.related.includes(c.id));
  const v = visualize(found, all.filter(c => c.lessonId === found.lessonId));
  const nav = (r: string) => { onClose(); go(r); };
  return (
    <Sheet title={`💡 ${found.title.slice(0, 50)}`} onClose={onClose}>
      <div className="wrap"><Chip on>{kindName[found.kind] ?? found.kind}</Chip><Chip>{found.mat} / {found.lesson}</Chip><Chip>الفقرة {found.section + 1} في المصدر</Chip></div>
      <Glass className="mt"><div className="small">{found.detail}</div></Glass>
      <div className="mt"><div className="between small"><span>الإتقان</span><span>{found.mastery}%</span></div><Bar v={found.mastery} /></div>
      <div className="mt"><div className="between small"><span>💪 قوة الاسترجاع</span><span>{found.recallStrength}%</span></div>
        <Bar v={found.recallStrength} color={found.recallStrength >= 70 ? '#34d399' : found.recallStrength >= 40 ? '#fbbf24' : '#f87171'} />
        <div className="tiny mut">تتغير بصحتك وسرعتك وثقتك ومحاولاتك وأخطائك ومراجعاتك — ليست رقماً ثابتاً.</div></div>
      <div className="small mut mt">🃏 {cards} بطاقات • 🧠 {qs} أسئلة • ⚠️ {errs} أخطاء مفتوحة • خطر النسيان {Math.round(found.forgetRisk * 100)}% • المراجعة: {found.nextReview}</div>
      {(pre.length > 0 || rel.length > 0) && (
        <Glass className="mt"><h3>🕸️ الرسم المعرفي</h3>
          {!!pre.length && <div className="small">⬆️ يعتمد على: {pre.map(p => <button key={p.id} className="chip" style={{ margin: 2, cursor: 'pointer', fontFamily: 'inherit' }} onClick={() => { onClose(); setTimeout(() => go('study-materials'), 0); }}>{p.title.slice(0, 25)}</button>)}</div>}
          {!!rel.length && <div className="small mt">🔗 مرتبط بـ: {rel.slice(0, 3).map(p => p.title.slice(0, 25)).join(' • ')}</div>}
          <div className="tiny mut mt">الخطأ هنا قد جذره في المفهوم السابق — راجعه أولاً.</div></Glass>
      )}
      <div className="mt wrap">
        <Btn sm onClick={() => setViz(!viz)}>🎨 صوّرها لي (Visualize)</Btn>
        <Btn sm kind="pri" onClick={() => nav('study-recall')}>اختبرني به 🧠</Btn>
        <Btn sm onClick={() => nav('study-cards')}>بطاقاته 🃏</Btn>
        <Btn sm onClick={() => nav('ai-tutor')}>اسأل المعلم 🤖</Btn>
      </div>
      {viz && (
        <Glass level={2} className="mt pop"><h3>{v.kind === 'steps' ? '🪜' : v.kind === 'compare' ? '⚖️' : '🗺️'} {v.title}</h3>
          <div style={{ display: 'grid', gap: 6 }}>
            {v.nodes.map((n, ix) => (
              <div key={ix} className="task"><span className="chip">{v.kind === 'steps' ? ix + 1 : v.kind === 'compare' ? (ix % 2 ? 'ب' : 'أ') : '•'}</span>
                <span className="small" style={{ flex: 1 }}>{n}</span></div>
            ))}
          </div>
          <div className="tiny mut mt">{v.note} — لا صور عشوائية، كل عنصر من مصدرك.</div></Glass>
      )}
    </Sheet>
  );
}


export type { SourceMode } from '../core/ai';
export type RecallFocus = import('../core/types').QFocus | 'all' | 'general';

const FOCUS_AR: { id: RecallFocus; n: string; icon: string }[] = [
  { id: 'all', n: 'كل شيء في الدرس', icon: '📚' },
  { id: 'formula', n: 'القوانين', icon: '🧮' },
  { id: 'definition', n: 'التعاريف', icon: '📖' },
  { id: 'fact', n: 'حقائق مهمة', icon: '📌' },
  { id: 'relation', n: 'علاقات وتطبيق', icon: '🔗' },
  { id: 'sequence', n: 'تسلسلات', icon: '🪜' },
  { id: 'general', n: 'مراجعة عامة', icon: '💭' },
];

export function Recall() {
  const { s, set } = useStore();
  const [started, setStarted] = useState(false);
  const [mode, setMode] = useState<import('../core/ai').SourceMode>('source-only');
  const [focus, setFocus] = useState<RecallFocus>('all');
  const [lessonFilter, setLessonFilter] = useState('');
  const [i, setI] = useState(0);
  const [tried, setTried] = useState(false);
  const [mine, setMine] = useState('');
  const [sim, setSim] = useState<number | null>(null);
  const [fb, setFb] = useState<'good' | 'mid' | 'bad' | null>(null);
  const [conf, setConf] = useState(3);
  const [t0, setT0] = useState(Date.now());
  const [showHint, setShowHint] = useState(false);
  const [picked, setPicked] = useState<string | null>(null);
  const [drill, setDrill] = useState<string | null>(null); // elementId قيد المعالجة
  const [doneIds, setDoneIds] = useState<string[]>([]);
  const [streak, setStreak] = useState({ ok: 0, bad: 0 });
  const [pickReason, setPickReason] = useState('');
  if (!s.recallBank.length) return (<div><h1>🧠 تذكّر نشط</h1>
    <EmptyContent what="أسئلة تذكّر نشط" hint="أضف أول مصدر دراسي لإنشاء الأسئلة." /></div>);
  const lessons = s.materials.flatMap(m => m.units.flatMap(u => u.lessons.map(l => ({ ...l, mat: m.name }))));
  const lesson = lessons.find(l => l.id === lessonFilter) ?? lessons.find(l => (l.elements?.length ?? 0) > 0) ?? lessons[0];
  const elements = lesson?.elements ?? [];
  const lessonBank = filterByMode(s.recallBank.filter(q => !lessonFilter || q.sourceLessonId === lessonFilter), mode);
  const cov = coverageOf(elements, lessonBank);
  const kindAr: Record<string, string> = { qa: 'سؤال وجواب', mcq: 'اختيار من متعدد', tf: 'صح/خطأ', fill: 'أكمل الفراغ', why: 'لماذا؟', explain: 'اشرح', compare: 'قارن', apply: 'طبّق', solve: 'حل مسألة', link: 'اربط', cause: 'سبب/نتيجة', sequence: 'ترتيب', definition: 'تعريف' };

  const buildQueue = (): typeof lessonBank => {
    let pool = lessonBank.filter(q => focus === 'all' ? q.focus !== 'general' : q.focus === focus);
    if (focus === 'general') pool = lessonBank.filter(q => q.focus === 'general' || !q.elementId);
    // الأضعف أولاً ثم المستوى تصاعدياً — لا عشوائية عمياء
    const strOf = (qid: string) => {
      const c = s.materials.flatMap(m => m.units.flatMap(u => u.lessons.flatMap(l => l.concepts))).find(c => c.id === s.recallBank.find(q => q.id === qid)?.conceptId);
      return c?.recallStrength ?? 50;
    };
    return [...pool].sort((a, b) => (strOf(a.id) - strOf(b.id)) || ((a.level ?? 2) - (b.level ?? 2))).slice(0, 20);
  };
  const [queue, setQueue] = useState<string[] | null>(null);
  const qs = (queue ?? []).map(id => lessonBank.find(q => q.id === id)!).filter(Boolean);
  const q = qs[i % Math.max(1, qs.length)];
  const start = () => { const bq = buildQueue(); setQueue(bq.map(x => x.id)); setI(0); setStarted(true); setTried(false); setT0(Date.now()); setDrill(null); setDoneIds([]); };

  if (!started) {
    return (
      <div>
        <div className="between mb"><h1>🧠 تذكّر نشط من المحتوى</h1></div>
        <div className="small mut mb">الأسئلة تُبنى من عناصر مصدرك الفعلية (قوانين، تعاريف، حقائق) — لا أسئلة عامة. اختر التركيز ثم ابدأ.</div>
        {lessons.length > 1 && (
          <><label className="lbl">الدرس (أسئلة من هذا الدرس فقط)</label>
            <div className="tabs mb">{lessons.map(l => <button key={l.id} className={`chip tab ${lessonFilter === l.id || (!lessonFilter && l.id === lesson?.id) ? 'on' : ''}`} onClick={() => setLessonFilter(l.id)}>{l.title.slice(0, 24)}</button>)}</div></>
        )}
        <Glass level={2}>
          <div className="between"><h2>📊 تحليل المحتوى: {lesson?.title.slice(0, 35)}</h2><Chip on>التغطية {cov.pct}%</Chip></div>
          <div className="small mut">نسبة المعلومات المهمة التي تحولت لفرص استرجاع.</div>
          <div className="mt" style={{ display: 'grid', gap: 4 }}>
            {cov.perFocus.map(p => <div key={p.k} className="between small"><span>{p.k}: {p.n} عناصر</span><span className="mut">{p.q} أسئلة</span></div>)}
            {!cov.total && <div className="small mut">لا عناصر مستخرجة بعد — أضف نصاً للدرس أو استخدم الاستخراج من الصورة.</div>}
          </div>
        </Glass>
        <label className="lbl">التركيز</label>
        <div className="wrap mb">{FOCUS_AR.map(f => <Chip key={f.id} on={focus === f.id} onClick={() => setFocus(f.id)}>{f.icon} {f.n}</Chip>)}</div>
        <label className="lbl">الوضع</label>
        <div className="tabs mb">
          {([['source-only', 'المصدر فقط'], ['source-external', 'مصدر + خارجي'], ['exam-pattern', 'نمط الامتحان'], ['mixed', 'مختلط']] as const).map(([m, n]) => (
            <button key={m} className={`chip tab ${mode === m ? 'on' : ''}`} onClick={() => setMode(m)}>{n}</button>
          ))}
        </div>
        <Btn kind="pri" onClick={start}>ابدأ الجلسة ⚡ ({buildQueuePreview()} أسئلة)</Btn>
      </div>
    );
  }
  function buildQueuePreview(): number {
    let pool = lessonBank.filter(q2 => focus === 'all' ? q2.focus !== 'general' : q2.focus === focus);
    if (focus === 'general') pool = lessonBank.filter(q2 => q2.focus === 'general' || !q2.elementId);
    return Math.min(20, pool.length);
  }
  if (!q) return (<div><h1>🧠 تذكّر نشط</h1>
    <Glass><div className="small">لا أسئلة بهذا التركيز/الوضع — بدّل التركيز أو الوضع.</div>
      <div className="mt"><Btn sm onClick={() => setStarted(false)}>↩ العودة للإعداد</Btn></div></Glass></div>);
  const meta = s.materials.flatMap(m => m.units.flatMap(u => u.lessons.flatMap(l => l.concepts.map(c => ({ id: c.id, mastery: c.mastery, strength: c.recallStrength, lesson: l.title, mat: m.name }))))).find(c => c.id === q.conceptId);
  const concept = meta ? s.materials.flatMap(m => m.units.flatMap(u => u.lessons.flatMap(l => l.concepts))).find(c => c.id === q.conceptId) : undefined;

  const grade = (g: import('../core/types').Grade) => {
    const timeMs = Date.now() - t0;
    const ok = g === 'correct';
    setFb(g === 'correct' ? 'good' : g === 'partial' ? 'mid' : 'bad');
    setTried(true);
    const patch = concept ? masteryAfter(concept, ok, conf, timeMs, g) : {};
    const et = g === 'correct' ? undefined : errorTypeOf(mine, q.answer, sim ?? 0);
    set(p => ({
      ...p,
      attempts: [...p.attempts, { id: uid('a'), date: todayISO(), conceptId: q.conceptId, kind: q.kind, correct: ok, grade: g, errorType: et, sourceLessonId: q.sourceLessonId, timeMs, confidence: conf as 1 | 2 | 3 | 4 | 5 }],
      materials: p.materials.map(m => ({
        ...m, units: m.units.map(u => ({
          ...u, lessons: u.lessons.map(l => ({
            ...l, concepts: l.concepts.map(c => c.id === q.conceptId ? { ...c, ...patch } : c),
          })),
        })),
      })),
      errors: ok ? p.errors : [...p.errors, {
        id: uid('e'), date: todayISO(), conceptId: q.conceptId, sourceLessonId: q.sourceLessonId, question: q.prompt,
        userAnswer: picked ?? mine ?? '(بدون إجابة)', correctAnswer: q.answer,
        reason: et ?? 'إجابة ناقصة', count: 1, lastReview: null, resolved: false,
      }],
    }));
    if (ok) addXP(set, 12); else if (g === 'partial') addXP(set, 5);
    setStreak(g === 'correct' ? { ok: streak.ok + 1, bad: 0 } : g === 'partial' ? { ok: 0, bad: 0 } : { ok: 0, bad: streak.bad + 1 });
    // سلم المعالجة: خطأ → أسئلة نفس العنصر بصيغ أخرى أولاً
    if (!ok && q.elementId) setDrill(q.elementId);
    if (ok && drill && q.elementId === drill) setDrill(null);
    setDoneIds([...doneIds, q.id]);
  };
  const check = () => {
    const v = similarity(mine, q.answer);
    setSim(v);
    if (v < 0.12) grade('incorrect');
    else setTried(true);
  };
  const answerChoice = (c: string) => {
    setPicked(c);
    const v = similarity(c, q.answer);
    setSim(v);
    if (v < 0.12) grade('incorrect');
    else setTried(true);
  };
  const next = () => {
    // العقل يختار التالي: معالجة → خطأ سابق → مستحق → أضعف + صعوبة ديناميكية
    const strengths = new Map<string, number>();
    for (const m of s.materials) for (const u of m.units) for (const l of u.lessons) for (const c of l.concepts) strengths.set(c.id, c.recallStrength);
    const errConcepts = [...new Set(s.errors.filter(e => !e.resolved).map(e => e.conceptId))];
    const { bias, note } = adaptiveLevel(streak.ok, streak.bad);
    const { q: nxt, reason } = chooseNext(qs, { drillElementId: drill, doneIds, strengths, errorConcepts: errConcepts, bias });
    if (!nxt) { setStarted(false); return; }
    if (drill && nxt.elementId !== drill) setDrill(null);
    setPickReason(reason + (note ? ` • ${note}` : ''));
    setI(qs.findIndex(x => x.id === nxt.id));
    setTried(false); setMine(''); setPicked(null); setFb(null); setSim(null); setShowHint(false); setT0(Date.now());
  };
  const done = doneIds.length;
  return (
    <div>
      <div className="between mb"><h1>🧠 {lesson?.title.slice(0, 30)}</h1>
        <span className="row"><Chip on>{kindAr[q.kind]} • مستوى {q.level ?? 2}</Chip><Btn sm onClick={() => setStarted(false)}>إنهاء</Btn></span></div>
      <div className="small mut mb">📎 {traceOf(q, lesson?.title ?? '')} • {done}/{qs.length} • {drill ? '🔧 وضع المعالجة: أسئلة نفس المعلومة' : lvlLine(q.level)}</div>
      {pickReason && <div className="tiny mb" style={{ color: '#22d3ee' }}>🧠 {pickReason}</div>}
      <div className="mb"><Bar v={qs.length ? (done / qs.length) * 100 : 0} /></div>
      <Glass level={2} className={fb === 'good' ? 'good' : fb === 'bad' ? 'bad' : ''}>
        <div className="between"><span className="small mut">❓ {kindAr[q.kind]}</span>
          {meta && <span className="tiny mut">إتقان {meta.mastery}% • استرجاع {meta.strength}%</span>}</div>
        <div style={{ fontSize: 17, fontWeight: 700, margin: '8px 0' }}>{q.prompt}</div>
        {(q.kind === 'mcq' || q.kind === 'tf') && q.choices && !tried ? <>
          <div style={{ display: 'grid', gap: 8 }}>
            {q.choices.map(c => (
              <button key={c} className={`task ${picked === c ? 'glow-cyan' : ''}`} style={{ cursor: 'pointer', fontFamily: 'inherit', color: 'inherit', textAlign: 'start' }} onClick={() => answerChoice(c)}>
                <span className="small" style={{ flex: 1 }}>{c}</span></button>
            ))}
          </div>
          <div className="tiny mut mt">اختر إجابة — التقييم فوري وعادل.</div>
        </> : !tried ? <>
          <textarea placeholder="اكتب إجابتك هنا قبل كشف الحل…" value={mine} onChange={e => setMine(e.target.value)} />
          <div className="mt row"><Btn sm onClick={() => setShowHint(!showHint)}>💡 تلميح</Btn>
            {showHint && <span className="tiny mut">{q.hint}</span>}</div>
          <label className="lbl">ثقتك بإجابتك (1-5)</label>
          <div className="wrap">{[1, 2, 3, 4, 5].map(n => <Chip key={n} on={conf === n} onClick={() => setConf(n)}>{n}</Chip>)}</div>
          <div className="mt wrap"><Btn kind="pri" sm disabled={mine.trim().length < 2} onClick={check}>تحقق من إجابتي 🔍</Btn></div>
        </> : <>
          <Glass className="mt"><h3>✅ الإجابة النموذجية (من مصدرك)</h3><div className="small">{q.answer}</div>
            {sim !== null && (
              <div className="small mt">{sim >= 0.55 ? `✅ صحيح (${Math.round(sim * 100)}%)` : sim >= 0.28 ? `🟡 صحيح جزئياً (${Math.round(sim * 100)}%) — راجع الكلمات الجوهرية الناقصة.` : `🔍 غير صحيح (${Math.round(sim * 100)}%) — سُجل نوع الخطأ وفُعّل سلم المعالجة.`}</div>
            )}
            <div className="small mut mt">سُجل: إجابتك + درجتها + زمنك + ثقتك + نوع الخطأ + المفهوم + المصدر.</div></Glass>
          {sim !== null && sim >= 0.12 && (
            <div className="mt wrap">
              <Btn kind="pri" sm onClick={() => grade('correct')}>✓ صحيح</Btn>
              <Btn sm onClick={() => grade('partial')}>◐ صحيح جزئياً</Btn>
              <Btn sm onClick={() => grade('incorrect')}>✕ غير صحيح</Btn>
            </div>
          )}
          <div className="mt wrap"><Btn kind="pri" sm onClick={next}>{drill ? 'التالي (معالجة نفس المعلومة) 🔧' : 'السؤال التالي'}</Btn>
            <Btn sm onClick={() => { setTried(false); setFb(null); setSim(null); }}>حاول مجدداً</Btn></div>
        </>}
      </Glass>
    </div>
  );
}
function lvlLine(l?: number): string {
  return ['', 'استرجاع مباشر من المصدر', 'نفس المعلومة بصياغة مختلفة', 'طبّق المعلومة', 'اربط معلومات المصدر', 'بأسلوب الامتحان'][l ?? 2] ?? '';
}

export function Cards() {
  const { s, set } = useStore();
  const [flip, setFlip] = useState(false);
  const [idx, setIdx] = useState(0);
  const [shuffled, setShuffled] = useState(false);
  if (!s.flashcards.length) return (<div><div className="between mb"><h1>🃏 البطاقات التعليمية</h1></div>
    <EmptyContent what="بطاقات تعليمية" hint="البطاقات تُصنع تلقائياً من دروسك: سؤال/جواب، فراغات، قوانين، خرائط." /></div>);
  const masteryOf = (cid: string) =>
    s.materials.flatMap(m => m.units.flatMap(u => u.lessons.flatMap(l => l.concepts))).find(c => c.id === cid)?.mastery ?? 50;
  // الأضعف أولاً دائماً (أذكى من العشوائية) — والخلط اختياري
  const due = s.flashcards.filter(f => f.due <= todayISO())
    .sort((a, b) => masteryOf(a.conceptId) - masteryOf(b.conceptId));
  const rest = s.flashcards.filter(f => f.due > todayISO())
    .sort((a, b) => masteryOf(a.conceptId) - masteryOf(b.conceptId));
  const deck = shuffled
    ? [...s.flashcards].sort(() => Math.random() - 0.5)
    : [...due, ...rest];
  const card = deck[idx % Math.max(1, deck.length)];
  const kindAr: Record<string, string> = { qa: 'سؤال/جواب', cloze: 'املأ الفراغ', image: 'بطاقة صورة', occlusion: 'إخفاء صورة', map: 'خريطة', formula: 'قانون', draw: 'ارسم بنفسك', definition: 'بطاقة تعريف', relation: 'بطاقة علاقة' };
  const rate = (g: 1 | 2 | 3 | 4) => {
    const r = fsrsNext(card, g, 15000, 3);
    set(p => ({ ...p, flashcards: p.flashcards.map(f => f.id === card.id ? { ...f, ease: r.ease, interval: r.interval, due: r.due, reps: f.reps + 1, lapses: f.lapses + (g === 1 ? 1 : 0) } : f) }));
    setFlip(false); setIdx(i => i + 1); addXP(set, g === 1 ? 3 : 10);
  };
  const delCard = () => {
    set(p => ({ ...p, flashcards: p.flashcards.filter(f => f.id !== card.id) }));
    setFlip(false);
  };
  return (
    <div>
      <div className="between mb"><h1>🃏 البطاقات التعليمية</h1>
        <span className="row"><Chip on={due.length > 0}>مستحق اليوم: {due.length}</Chip>
          <Btn sm onClick={() => { setShuffled(!shuffled); setIdx(0); }}><Shuffle size={13} /> {shuffled ? 'مرتّب (الأضعف أولاً)' : 'خلط عشوائي'}</Btn></span></div>
      <div className="small mut mb">بطاقة {(idx % deck.length) + 1} من {deck.length} • الترتيب الافتراضي: أضعف مفاهيمك أولاً — وليس عشوائياً.</div>
      <Glass level={3} className="glow-cyan" >
        <div className="between"><Chip>{kindAr[card.kind]}</Chip>
          <span className="row"><span className="tiny mut">الفاصل: {card.interval} يوم • التكرار {card.reps} • إتقان المفهوم {masteryOf(card.conceptId)}%</span>
            <button className="btn sm ghost" title="حذف البطاقة" onClick={delCard}>🗑️</button></span></div>
        {!!card.sourceRef && <div className="tiny mut" style={{ marginTop: 4 }}>📎 من: {card.sourceRef.slice(0, 60)}</div>}
        <div className="row mt" style={{ gap: 6 }}><span className="tiny mut">📅 المراجعة: {card.due}</span>
          <input type="date" value={card.due} onChange={e => e.target.value && set(p => ({ ...p, flashcards: p.flashcards.map(f => f.id === card.id ? { ...f, due: e.target.value } : f) }))} style={{ maxWidth: 150 }} />
          <span className="tiny mut">(غيّر الموعد متى شئت — القرار لك)</span></div>
        <div onClick={() => setFlip(!flip)} style={{ minHeight: 130, display: 'grid', placeItems: 'center', cursor: 'pointer', padding: 12 }}>
          {!flip ? <div style={{ fontSize: 17, fontWeight: 700, textAlign: 'center', width: '100%' }}>
            {card.front}<div className="tiny mut mt">اضغط للكشف 👆</div></div>
            : <div className="pop" style={{ textAlign: 'center', width: '100%' }}>
              <div className="small">{card.back}</div>
              {card.kind === 'draw' && <div className="tiny mut mt">🎨 ارسم المفهوم على ورقة ثم قارن.</div>}
              {card.kind === 'image' && <div className="tiny mut mt">🖼️ تخيّل صورة ذهنية تربط المصطلح بالشكل.</div>}</div>}
        </div>
        {flip && <div className="wrap mt">
          <Btn sm onClick={() => rate(1)}>نسيت (1 يوم)</Btn><Btn sm onClick={() => rate(2)}>صعب</Btn>
          <Btn sm onClick={() => rate(3)}>جيد</Btn><Btn kind="pri" sm onClick={() => rate(4)}>سهل</Btn></div>}
      </Glass>
      <div className="tiny mut mt" style={{ textAlign: 'center' }}>خوارزمية FSRS: الموعد القادم يعتمد على أدائك وصعوبة السؤال وثقتك وسرعتك وتاريخ مراجعاتك.</div>
      <Blackout />
      <DiagramMasker />
      <MemoryCreators />
      <MapCards />
    </div>
  );
}

export function Blackout() {
  const { s, set } = useStore();
  const [bid, setBid] = useState('');
  const [test, setTest] = useState(false);
  const [ans, setAns] = useState('');
  const [score, setScore] = useState<number | null>(null);
  const [revealed, setRevealed] = useState<Set<number>>(new Set());
  const b = s.blackouts.find(x => x.id === bid) ?? s.blackouts[0];
  const lessons = s.materials.flatMap(m => m.units.flatMap(u => u.lessons));
  if (!b) return (
    <Glass className="mt"><h2>⬛ الحفظ بالتعتيم التدريجي</h2>
      {!lessons.some(l => l.sections.length) ? (
        <div className="small mut">يعمل على النص المستخرج من مصادرك — أضف درساً بنص أولاً، أو أنشئ جلسة يدوياً من «أنشئ أداة حفظ».</div>
      ) : (
        <div>
          <div className="small mut mb">اختر فقرة من مصادرك لبدء جلسة تعتيم:</div>
          <div style={{ display: 'grid', gap: 6 }}>
            {lessons.flatMap(l => l.sections.slice(0, 3).map((sec, k) => ({ l, sec, k }))).slice(0, 4).map(({ l, sec, k }, ix) => (
              <button key={ix} className="task" style={{ cursor: 'pointer', fontFamily: 'inherit', color: 'inherit', textAlign: 'start' }}
                onClick={() => {
                  const nid = uid('b');
                  set(p => ({ ...p, blackouts: [...p.blackouts, { id: nid, title: `${l.title} — فقرة ${k + 1}`, text: sec, stage: 0 }] }));
                  setBid(nid);
                }}>
                <span className="small" style={{ flex: 1 }}>📄 {l.title} — فقرة {k + 1}: {sec.slice(0, 50)}…</span></button>
            ))}
          </div>
        </div>
      )}
    </Glass>
  );
  const words = (b?.text ?? '').split(' ').filter(Boolean);
  const hideCount = Math.floor(words.length * [0, 0.2, 0.5, 0.8, 1][Math.min(4, b?.stage ?? 0)]);
  const doTest = () => {
    if (!b) return;
    const v = similarity(ans, b.text);
    setScore(v);
    if (v < 0.5) set(p => ({ ...p, blackouts: p.blackouts.map(x => x.id === b.id ? { ...x, stage: Math.max(0, x.stage - 1) } : x) }));
    else addXP(set, 10);
  };
  return (
    <Glass className="mt"><div className="between"><h2>⬛ الحفظ بالتعتيم التدريجي</h2>
      {s.blackouts.length > 1 && <span className="row">{s.blackouts.map(x => <Chip key={x.id} on={x.id === b.id} onClick={() => { setBid(x.id); setTest(false); setScore(null); }}>{x.title.slice(0, 14)}</Chip>)}</span>}</div>
      <div className="small mut">«{b.title}» — المرحلة {b.stage + 1}/5 (20% ← 50% ← 80% ← كامل) — من مصدرك حرفياً</div>
      {!test ? <>
        <div className="mt">{words.map((w, i) => {
          const hidden = i < hideCount && !revealed.has(i);
          return <span key={i} className={`mask-word ${hidden ? 'hide' : ''}`} onClick={() => setRevealed(new Set([...revealed, i]))}>{hidden ? '•••' : w}</span>;
        })}</div>
        <div className="mt wrap"><Btn sm kind="pri" onClick={() => set(p => ({ ...p, blackouts: p.blackouts.map(x => x.id === b.id ? { ...x, stage: Math.min(4, x.stage + 1) } : x) }))}>التالي ← إخفاء أكثر</Btn>
          <Btn sm onClick={() => { set(p => ({ ...p, blackouts: p.blackouts.map(x => x.id === b.id ? { ...x, stage: Math.max(0, x.stage - 1) } : x) })); setRevealed(new Set()); }}>↩ خطوة للخلف</Btn>
          <Btn sm kind="pri" onClick={() => { setTest(true); setScore(null); setAns(''); }}>✍️ اختبرني وقارن بالأصل</Btn></div>
      </> : <>
        <div className="mt"><textarea placeholder="اكتب النص كاملاً من ذاكرتك…" value={ans} onChange={e => setAns(e.target.value)} /></div>
        <div className="mt wrap"><Btn kind="pri" sm disabled={ans.trim().length < 4} onClick={doTest}>قارن بالنص الأصلي 🔍</Btn>
          <Btn sm onClick={() => setTest(false)}>عودة للتعتيم</Btn></div>
        {score !== null && (
          <div className="small mt">{score >= 0.7 ? `✅ تطابق ${Math.round(score * 100)}% — ممتاز، انتقل للمرحلة التالية.` : score >= 0.5 ? `🟡 تطابق ${Math.round(score * 100)}% — قريب، راجع الكلمات الناقصة (رجعنا خطوة).` : `❌ تطابق ${Math.round(score * 100)}% فقط — أعد قراءة الأصل (رجعنا خطوة).`}
            <div className="tiny mut mt">الأصل: {b.text.slice(0, 120)}…</div></div>
        )}
      </>}
    </Glass>
  );
}

export function DiagramMasker() {
  const { s, set } = useStore();
  const [di, setDi] = useState(0);
  const [shown, setShown] = useState<Set<number>>(new Set());
  const [picked2, setPicked2] = useState<number | null>(null);
  const d = s.diagrams[Math.min(di, Math.max(0, s.diagrams.length - 1))];
  if (!d) return null;
  const lesson = s.materials.flatMap(m => m.units.flatMap(u => u.lessons))[0];
  const askFor = picked2 === null ? Math.floor(Math.random() * d.labels.length) : picked2;
  const choose = (n: number) => {
    setPicked2(n);
    if (n !== askFor && lesson?.concepts[0]) {
      // ربط الخطأ بالمفهوم: يُسجل في البنك ويُعاد جدولته
      set(p => ({
        ...p,
        errors: [...p.errors, {
          id: uid('e'), date: todayISO(), conceptId: lesson.concepts[0].id,
          question: `مخطط «${d.title}»: أين «${d.labels[askFor]}»؟`,
          userAnswer: `اخترت المنطقة ${n + 1}`, correctAnswer: `المنطقة ${askFor + 1} — ${d.labels[askFor]}`,
          reason: 'خطأ تحديد في مخطط — اربط الاسم بالموقع المرئي', count: 1, lastReview: null, resolved: false,
        }],
      }));
    } else if (n === askFor) addXP(set, 8);
  };
  return (
    <Glass className="mt"><div className="between"><h2>🫀 مخفي التسميات التفاعلي</h2>
      {s.diagrams.length > 1 && <span className="row">{s.diagrams.map((x, xi) => <Chip key={x.id} on={xi === di} onClick={() => { setDi(xi); setPicked2(null); setShown(new Set()); }}>{x.title.slice(0, 12)}</Chip>)}</span>}</div>
      <div className="small mut">{d.title} — أين <b>«{d.labels[askFor]}»</b>؟ اختر المنطقة (الخطأ يُسجل في بنك أخطائك)</div>
      <div className="mt" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        {d.labels.map((l, i) => {
          const done = picked2 !== null;
          const isT = i === askFor;
          return (
            <button key={i} disabled={done} onClick={() => choose(i)}
              style={{ padding: 16, borderRadius: 14, fontWeight: 700, fontFamily: 'inherit', cursor: done ? 'default' : 'pointer', border: '1px solid rgba(255,255,255,.15)', background: done && isT ? 'rgba(52,211,153,.3)' : done && picked2 === i ? 'rgba(248,113,113,.3)' : 'linear-gradient(135deg,#22d3ee,#a78bfa)', color: done && !isT && picked2 !== i ? '#fff' : done ? '#fff' : '#04121a' }}>
              {done && (isT || picked2 === i) ? l : `؟ ${i + 1}`}</button>
          );
        })}
      </div>
      {picked2 !== null && (
        <div className="mt"><div className="small">{picked2 === askFor ? `✅ صحيح! «${d.labels[askFor]}» في المنطقة ${askFor + 1}.` : `❌ الصحيح: المنطقة ${askFor + 1} — سُجل الخطأ وسيُعاد اختبارك فيه.`}</div>
          <div className="mt wrap"><Btn sm kind="pri" onClick={() => setPicked2(null)}>تسمية جديدة 🎲</Btn>
            <Btn sm onClick={() => setShown(new Set(d.labels.map((_, x) => x)))}>كشف الكل 👀</Btn></div></div>
      )}
      {!picked2 && <div className="mt"><Btn sm onClick={() => setShown(new Set(d.labels.map((_, x) => x)))}>وضع المراجعة: كشف الكل 👀</Btn></div>}
      {!!shown.size && <div className="tiny mut mt">{d.labels.map((l, i) => shown.has(i) ? `${i + 1}. ${l}` : '').filter(Boolean).join(' • ')}</div>}
    </Glass>
  );
}

export function MemoryCreators() {
  const { set } = useStore();
  const [bt, setBt] = useState(''); const [bx, setBx] = useState('');
  const [dt, setDt] = useState(''); const [dl, setDl] = useState('');
  return (
    <Glass className="mt"><h2>➕ أنشئ أداة حفظ من محتواك</h2>
      <label className="lbl">تعتيم تدريجي: تعريف / قانون تريد حفظه حرفياً</label>
      <input placeholder="العنوان…" value={bt} onChange={e => setBt(e.target.value)} />
      <div className="mt"><textarea placeholder="النص المطلوب حفظه…" value={bx} onChange={e => setBx(e.target.value)} /></div>
      <div className="mt"><Btn sm kind="pri" disabled={!bt.trim() || !bx.trim()} onClick={() => {
        set(p => ({ ...p, blackouts: [...p.blackouts, { id: uid('b'), title: bt, text: bx, stage: 0 }] })); setBt(''); setBx('');
      }}>إنشاء جلسة تعتيم ⬛</Btn></div>
      <label className="lbl">مخطط بتسميات: ارفع رسماً واكتب تسمياته (افصل بفاصلة)</label>
      <input placeholder="عنوان المخطط…" value={dt} onChange={e => setDt(e.target.value)} />
      <div className="mt"><input placeholder="التسميات: البطارية، المقاومة، …" value={dl} onChange={e => setDl(e.target.value)} /></div>
      <div className="mt"><Btn sm kind="pri" disabled={!dt.trim() || !dl.trim()} onClick={() => {
        set(p => ({ ...p, diagrams: [...p.diagrams, { id: uid('d'), title: dt, labels: dl.split(/[،,]/).map(x => x.trim()).filter(Boolean), masked: true }] })); setDt(''); setDl('');
      }}>إنشاء مخطط مخفي 🫀</Btn></div>
    </Glass>
  );
}

export function MapCards() {
  const { s } = useStore();
  const [di, setDi] = useState(0);
  const [target, setTarget] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [score, setScore] = useState({ ok: 0, n: 0 });
  const d = s.diagrams[di];
  const pendingLessons = s.materials.flatMap(m => m.units.flatMap(u => u.lessons
    .filter(l => !l.concepts.length)
    .map(l => ({ title: l.title, mat: m.name })),
  ));
  if (!s.diagrams.length) return (
    <Glass className="mt"><h2>🗺️ بطاقات الخرائط المفرّغة</h2>
      {pendingLessons.length ? (
        <div className="small mut">لديك {pendingLessons.length} دروس بانتظار سطر واحد ({pendingLessons.map(l => `«${l.title}»`).join('، ')}) — استخدم زر الاستخراج من الصورة في المواد لتتحول لخرائط وأسئلة.</div>
      ) : (
        <div className="small mut">لا مخططات بعد — أنشئ مخططاً بتسمياته من أداة «أنشئ أداة حفظ» بالأعلى، وستتحول هنا لبطاقات تحديد ذكية تلقائياً.</div>
      )}
    </Glass>
  );
  if (!d) return null;
  const order = d.labels.map((_, i) => i).sort(() => Math.random() - 0.5);
  const t = d.labels[target % d.labels.length];
  const choose = (n: number) => {
    setPicked(n);
    setScore(sc => ({ ok: sc.ok + (n === (target % d.labels.length) + 1 ? 1 : 0), n: sc.n + 1 }));
  };
  const nextQ = () => { setTarget(Math.floor(Math.random() * d.labels.length)); setPicked(null); };
  return (
    <Glass className="mt"><div className="between"><h2>🗺️ بطاقات الخرائط المفرّغة</h2>
      <Chip on>الدقة {score.n ? Math.round(100 * score.ok / score.n) : 0}% ({score.ok}/{score.n})</Chip></div>
      {s.diagrams.length > 1 && (
        <div className="wrap mb">{s.diagrams.map((x, i) => <Chip key={x.id} on={di === i} onClick={() => { setDi(i); setPicked(null); }}>{x.title}</Chip>)}</div>
      )}
      <div className="small">«{d.title}» بلا أسماء — أين تقع <b>«{t}»</b>؟ اختر رقم المنطقة:</div>
      <div className="mt" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
        {order.map(i => {
          const num = i + 1;
          const isT = num === (target % d.labels.length) + 1;
          const wasPicked = picked === num;
          return (
            <button key={i} disabled={picked !== null} onClick={() => choose(num)}
              style={{ padding: 16, borderRadius: 14, cursor: picked !== null ? 'default' : 'pointer', fontWeight: 700, fontFamily: 'inherit', border: '1px solid rgba(255,255,255,.15)', background: picked !== null && isT ? 'rgba(52,211,153,.3)' : wasPicked ? 'rgba(248,113,113,.3)' : 'rgba(255,255,255,.05)', color: '#fff' }}>
              {picked !== null && isT ? d.labels[i] : `؟ ${num}`}</button>
          );
        })}
      </div>
      {picked !== null && (
        <div className="mt">
          <div className={`small ${picked === (target % d.labels.length) + 1 ? 'pop' : ''}`}>
            {picked === (target % d.labels.length) + 1 ? `✅ صحيح! المنطقة ${picked} هي «${t}».` : `❌ المنطقة ${picked} ليست «${t}» — الصحيحة مضيئة بالأخضر. تلميح: اربط الاسم بموقع مرئي مميز.`}
          </div>
          <div className="mt"><Btn sm kind="pri" onClick={nextQ}>سؤال جديد من مخططاتك 🎲</Btn></div>
        </div>
      )}
    </Glass>
  );
}

export function Tests() {
  const { s, set } = useStore();
  const [cfg, setCfg] = useState({ n: 5, mins: 10 });
  const [mode, setMode] = useState<import('../core/ai').SourceMode>('source-only');
  const [on, setOn] = useState(false);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [results, setResults] = useState<{ id: string; sim: number; ok: boolean }[] | null>(null);
  // عينة متنوعة: سؤال لكل مفهوم بالتناوب — لا تركيز على مفهوم واحد
  const concepts = s.materials.flatMap(m => m.units.flatMap(u => u.lessons.flatMap(l => l.concepts.map(c => ({ ...c, mat: m.name })))));
  const lessonIds = new Set(s.materials.flatMap(m => m.units.flatMap(u => u.lessons.map(l => l.id))));
  const bank = mode === 'exam-pattern' ? [...s.recallBank, ...synthExamQs(s, 8)] : filterByMode(s.recallBank, mode);
  const diverse = (() => {
    const byC = new Map<string, typeof s.recallBank>();
    for (const q of bank) {
      // يُقبل سؤال المفهوم وسؤال الدرس (المرتبط بمعرف الدرس مباشرة)
      if (!concepts.some(c => c.id === q.conceptId) && !lessonIds.has(q.conceptId)) continue;
      const l = byC.get(q.conceptId) ?? [];
      l.push(q);
      byC.set(q.conceptId, l);
    }
    const lists = [...byC.values()];
    const out: typeof s.recallBank = [];
    let added = true;
    while (added && out.length < Math.max(1, cfg.n)) {
      added = false;
      for (const l of lists) {
        if (l.length && out.length < cfg.n) { out.push(l.shift()!); added = true; }
      }
    }
    return out;
  })();
  const start = () => { setAnswers({}); setResults(null); setOn(true); };
  const finish = () => {
    const r = diverse.map(q => {
      const sim = similarity(answers[q.id] ?? '', q.answer);
      return { id: q.id, sim, ok: sim >= 0.35 };
    });
    setResults(r);
    const c = r.filter(x => x.ok).length;
    const perQ = Math.round((cfg.mins * 60000) / Math.max(1, diverse.length));
    set(p => ({
      ...p,
      attempts: [...p.attempts, ...diverse.map((q, i) => ({
        id: uid('a'), date: todayISO(), conceptId: q.conceptId, kind: 'test', correct: r[i].ok,
        grade: gradeOf(r[i].sim), errorType: r[i].ok ? undefined : errorTypeOf(answers[q.id] ?? '', q.answer, r[i].sim),
        sourceLessonId: q.sourceLessonId,
        timeMs: perQ, confidence: 3 as const,
      }))],
      errors: [...p.errors, ...diverse.map((q, i) => ({ q, i })).filter(({ i }) => !r[i].ok).map(({ q, i }) => ({
        id: uid('e'), date: todayISO(), conceptId: q.conceptId, sourceLessonId: q.sourceLessonId, question: q.prompt,
        userAnswer: answers[q.id] || '(بدون إجابة)', correctAnswer: q.answer,
        reason: `اختبار: ${errorTypeOf(answers[q.id] ?? '', q.answer, r[i].sim)}`, count: 1, lastReview: null, resolved: false,
      }))],
      logs: p.logs.map(l => l.date === todayISO() ? { ...l, attempts: l.attempts + diverse.length, correct: l.correct + c } : l),
    }));
    addXP(set, c * 10); setOn(false);
  };
  const tag = (qid: string) => {
    const q = diverse.find(x => x.id === qid);
    return concepts.find(c => c.id === q?.conceptId);
  };
  return (
    <div>
      <h1>📝 اختبارات تدريبية</h1>
      <div className="small mut mb">مخصصة من مفاهيمك الفعلية — سؤال لكل مفهوم بالتناوب (لا تركيز على مفهوم واحد)، مع تصحيح تلقائي عادل ومراجعة الأخطاء.</div>
      {!s.recallBank.length ? <EmptyContent what="اختبارات" hint="الاختبارات تُبنى من أسئلة دروسك — أضف درساً أولاً." /> : <>
        <div className="tabs mb">
          {([['source-only', 'المصدر فقط'], ['source-external', 'مصدر + خارجي'], ['exam-pattern', 'نمط الامتحان'], ['mixed', 'مختلط']] as const).map(([m, n]) => (
            <button key={m} className={`chip tab ${mode === m ? 'on' : ''}`} onClick={() => setMode(m)}>{n}</button>
          ))}
        </div>
        {mode === 'exam-pattern' && !s.exams.length && <Glass className="mb small">🎯 نمط الامتحان يحتاج ورقة سابقة في الأرشيف — أضف ورقة أولاً أو بدّل الوضع.</Glass>}
        <Glass level={2}>
          <div className="row"><div style={{ flex: 1 }}><label className="lbl">عدد الأسئلة</label>
            <input type="number" value={cfg.n} onChange={e => setCfg({ ...cfg, n: Math.max(1, Math.min(20, +e.target.value || 1)) })} /></div>
            <div style={{ flex: 1 }}><label className="lbl">المدة (دقائق)</label>
              <input type="number" value={cfg.mins} onChange={e => setCfg({ ...cfg, mins: +e.target.value })} /></div></div>
          <div className="small mut mt">سيغطي الاختبار {diverse.length} أسئلة من دروسك ({concepts.length} مفاهيم نصية).</div>
          <div className="mt"><Btn kind="pri" sm onClick={start}>بدء الاختبار (مؤقت {cfg.mins} د)</Btn></div>
        </Glass>
        {on && <Glass className="mt">
          {diverse.map((q, i) => {
            const t = tag(q.id);
            return (
              <div key={q.id} className="mb"><div className="small" style={{ fontWeight: 600 }}>{i + 1}. {q.prompt}</div>
                <div className="tiny mut">📚 {t?.mat} • إتقان المفهوم {t?.mastery}%</div>
                <input placeholder="إجابتك…" value={answers[q.id] ?? ''} onChange={e => setAnswers({ ...answers, [q.id]: e.target.value })} /></div>
            );
          })}
          <Btn kind="pri" onClick={finish}>إنهاء وتصحيح تلقائي ✓</Btn></Glass>}
        {results && (
          <Glass level={2} className="mt pop">
            <div className="between"><h2>📊 النتيجة: {results.filter(r => r.ok).length}/{results.length}</h2>
              <Ring v={results.length ? (100 * results.filter(r => r.ok).length) / results.length : 0} size={56} /></div>
            {diverse.map((q, i) => (
              <div key={q.id} className="task mt">
                <span className="dot" style={{ background: results[i].ok ? '#34d399' : '#f87171' }} />
                <div style={{ flex: 1 }}><div className="small" style={{ fontWeight: 600 }}>{q.prompt.slice(0, 60)}…</div>
                  <div className="tiny mut">{q.origin === 'exam-pattern' ? '🎯 نمط امتحاني' : `📎 ${q.sourceRef.slice(0, 40)}`} • تطابق {Math.round(results[i].sim * 100)}% • إجابتك: {(answers[q.id] || '—').slice(0, 50)}</div>
                  {!results[i].ok && <div className="tiny" style={{ color: '#34d399' }}>✓ النموذجية: {q.answer.slice(0, 80)}…</div>}</div>
              </div>
            ))}
            <div className="tiny mut mt">الأخطاء أُضيفت لبنك الأخطاء تلقائياً — عالجها من تبويب الإحصائيات.</div>
          </Glass>
        )}
      </>}
    </div>
  );
}


export function Archive() {
  const { s, set } = useStore();
  const [raw, setRaw] = useState('');
  const [train, setTrain] = useState(false);
  const [attachOpen, setAttachOpen] = useState(false);
  const [shots, setShots] = useState<AttFile[]>([]);
  const [ocrBusy, setOcrBusy] = useState(false);
  const [ocrMsg, setOcrMsg] = useState<string | null>(null);
  const picker = useFilePicker(fl => {
    if (!fl) return;
    collectFiles(fl, t => setRaw(prev => (prev ? prev + '\n' : '') + t)).then(fs => setShots(prev => [...prev, ...fs]));
  });
  const runOcr = async () => {
    const imgs = shots.filter(f => f.preview);
    if (!imgs.length || ocrBusy) return;
    setOcrBusy(true); setOcrMsg(null);
    try {
      const mod = await import('../core/ocr');
      let n = 0;
      for (const im of imgs) {
        const r = await mod.ocrImage(im.preview!);
        if ('text' in r) { setRaw(prev => (prev ? prev + '\n' : '') + r.text); n++; }
      }
      setOcrMsg(n ? `✅ استُخرج النص من ${n} صور — راجعه ثم حلل.` : '⚠️ تعذر قراءة الصور — الصق النص يدوياً.');
    } catch { setOcrMsg('⚠️ تعذّر التشغيل — الصق النص يدوياً.'); }
    setOcrBusy(false);
  };
  const add = () => {
    if (raw.trim().length < 10) return;
    const a = analyzeExam(raw);
    const qs = detectExamQuestions(raw);
    set(p => ({ ...p, exams: [...p.exams, { id: uid('x'), title: `ورقة ${p.exams.length + 1} — ${new Date().toLocaleDateString('ar')}`, materialId: p.materials[0]?.id ?? 'm1', date: todayISO(), rawText: raw, attachments: shots.map(f => f.name), analysis: { ...a, detected: qs } }] }));
    setRaw(''); setShots([]); addXP(set, 25);
  };
  return (
    <div>
      <h1>🗄️ أرشيف الامتحانات السابقة</h1>
      <Glass level={2}><h2>➕ إضافة ورقة (صورة / PDF / نص)</h2>
        {picker.el}
        <div className="wrap mb">
          <Btn sm kind="pri" onClick={() => setAttachOpen(true)}><Camera size={13} /> 📎 إرفاق ورقة (صورة/PDF)</Btn>
        </div>
        {attachOpen && <AttachSheet onClose={() => setAttachOpen(false)} onPick={o => picker.open(o.accept, o.capture)} />}
        <AttList files={shots} onRemove={i => setShots(shots.filter((_, j) => j !== i))} />
        {!!shots.length && <div className="tiny mut mb">🖼️ الصور مرفقة ومحفوظة مع الورقة — استخرج نصها بالزر أو انسخ نص الأسئلة ليحللها AI (ملفات النص تُقرأ تلقائياً).</div>}
        <div className="wrap mb">
          <Btn sm disabled={ocrBusy || !shots.some(f => f.preview)} onClick={runOcr}>🔍 {ocrBusy ? 'استخراج…' : 'استخراج النص من صور الورقة'}</Btn>
          {ocrMsg && <span className="tiny">{ocrMsg}</span>}
        </div>
        <textarea placeholder="الصق نص الورقة هنا ليحللها AI: أنواع الأسئلة، المواضيع المتكررة، الصعوبة، النمط، التوزيع…" value={raw} onChange={e => setRaw(e.target.value)} />
        <div className="mt"><Btn kind="pri" sm disabled={raw.trim().length < 10} onClick={add}>تحليل الورقة ✨</Btn></div></Glass>
      {s.exams.map(x => (
        <Glass key={x.id} className="mt">
          <div className="between"><b>{x.title}</b><Chip>{x.analysis.difficulty}</Chip></div>
          {!!(x.attachments?.length) && <div className="tiny mut mt">📎 مرفقات: {x.attachments.join('، ')}</div>}
          <div className="small mut mt">الأنماط: {x.analysis.types.join(' • ')}</div>
          <div className="mt wrap">{x.analysis.topics.map(t => <Chip key={t}>{t}</Chip>)}</div>
          <div className="small mt">🔥 الأكثر تكراراً: {x.analysis.hotConcepts.join('، ')}</div>
          <div className="small">🧬 النمط: {x.analysis.pattern}</div>
          {!!x.analysis.detected?.length && (
            <Glass level={2} className="mt"><h3>🔎 الأسئلة المكتشفة ({x.analysis.detected.length})</h3>
              {x.analysis.detected.slice(0, 8).map((dq, di) => (
                <div key={di} className="task mt"><span className="chip">{dq.type}</span>
                  <div style={{ flex: 1 }}><div className="small">{dq.text}</div>
                    <div className="tiny mut">الموضوع: {dq.topic} • الصعوبة: {dq.difficulty}</div></div></div>
              ))}
            </Glass>
          )}
          <div className="mt">{x.analysis.distribution.map(d => <div key={d.label} className="between small"><span>{d.label}</span><span>{d.pct}%</span></div>)}
            <Bar v={x.analysis.distribution[0].pct} /></div>
          <div className="mt"><Btn sm kind="pri" onClick={() => setTrain(!train)}>🎯 تدرب من هذه الورقة</Btn></div>
          {train && <div className="mt small">جلسة تدريب مولّدة: 5 أسئلة بنفس توزيع الورقة (فهم 45% / تطبيق 30% / حفظ 25%) — ابدأ من تبويب الاختبارات.</div>}
        </Glass>
      ))}
    </div>
  );
}

export function Sources() {
  const { s, set } = useStore();
  const [title, setTitle] = useState('');
  const [url, setUrl] = useState('');
  const [kind, setKind] = useState<SourceKind>('video');
  const [mat, setMat] = useState(s.materials[0]?.id ?? '');
  const [notes, setNotes] = useState('');
  const [importId, setImportId] = useState<string | null>(null);
  const [importText, setImportText] = useState('');
  const KINDS: { id: SourceKind; name: string; icon: string; tip: string }[] = [
    { id: 'video', name: 'فيديو', icon: '🎬', tip: 'شاهد 10 دقائق ثم أوقف ولخّص بصوتك قبل المتابعة — المشاهدة السلبية لا تثبّت.' },
    { id: 'article', name: 'مقال', icon: '📰', tip: 'استخرج 3 أفكار فقط ثم حوّل كل فكرة لسؤال تذكّر نشط.' },
    { id: 'pdf', name: 'PDF', icon: '📄', tip: 'ادرس بجرعات 25 دقيقة، وظلّل التعاريف والقوانين فقط.' },
    { id: 'book', name: 'كتاب', icon: '📕', tip: 'اقرأ الفصل ثم أغلق الكتاب واكتب ملخص 5 أسطر من ذاكرتك.' },
    { id: 'channel', name: 'قناة', icon: '📺', tip: 'اختر قائمة تشغيل واحدة لمادتك والتزم بها — التنقل يشتت.' },
    { id: 'other', name: 'أخرى', icon: '🔗', tip: 'أضف ملاحظة: لماذا حفظت هذا الرابط؟ وما الذي ستستخرجه منه؟' },
  ];
  const normUrl = (u: string) => /^https?:\/\//i.test(u.trim()) ? u.trim() : `https://${u.trim()}`;
  const add = () => {
    if (!title.trim() || !url.trim()) return;
    set(p => ({
      ...p,
      sources: [...(p.sources ?? []), {
        id: uid('src'), title: title.trim(), url: normUrl(url), kind,
        materialId: mat || (p.materials[0]?.id ?? 'm1'), notes: notes.trim(),
        date: todayISO(), favorite: false,
      }],
    }));
    setTitle(''); setUrl(''); setNotes('');
  };
  const toLesson = (srcId: string) => {
    if (importText.trim().length < 20) return;
    const src = s.sources.find(x => x.id === srcId); if (!src) return;
    const lid = uid('l');
    const lm = { id: lid, title: src.title.slice(0, 45), sourceRef: `${src.title} — ${src.url}` };
    const mat = s.materials.find(m => m.id === src.materialId);
    const ingest = runIngest(importText, lm, mat?.name ?? '', s.exams.flatMap(e => e.analysis.topics));
    const unitId = mat?.units[0]?.id ?? '';
    const nl: Lesson = {
      id: lid, unitId, title: src.title.slice(0, 45), sourceText: importText,
      sourceRef: `${src.title} — ${src.url}`, sections: ingest.sections, elements: ingest.elements, concepts: ingest.concepts, summary: ingest.summary,
      mindmap: buildMindmap(src.title.slice(0, 30), ingest.concepts),
      mastery: ingest.concepts.length ? Math.round(ingest.concepts.reduce((x, c) => x + c.mastery, 0) / ingest.concepts.length) : 20,
    };
    set(p => ({
      ...p,
      materials: p.materials.map(m => m.id === src.materialId
        ? { ...m, units: m.units.map((u, j) => j === 0 ? { ...u, lessons: [...u.lessons, nl] } : u) } : m),
      flashcards: [...p.flashcards, ...ingest.cards],
      recallBank: [...p.recallBank, ...ingest.questions],
    }));
    setImportId(null); setImportText(''); addXP(set, 30);
  };
  const list = s.sources ?? [];
  return (
    <div>
      <h1>🔗 المصادر التعليمية</h1>
      <div className="small mut mb">مكتبة روابطك: فيديوهات، مقالات، PDFs، كتب وقنوات — مرتبة حسب المادة، وتتحول لدرس بضغطة.</div>
      <Glass level={2}>
        <h2>➕ إضافة مصدر</h2>
        <input placeholder="عنوان المصدر… مثال: شرح الدوال — قناة…" value={title} onChange={e => setTitle(e.target.value)} />
        <div className="mt"><input placeholder="الرابط… https://…" value={url} onChange={e => setUrl(e.target.value)} /></div>
        <div className="wrap mt">{KINDS.map(k => <Chip key={k.id} on={kind === k.id} onClick={() => setKind(k.id)}>{k.icon} {k.name}</Chip>)}</div>
        <div className="row mt">
          <div style={{ flex: 1 }}><label className="lbl">المادة</label>
            <select value={mat} onChange={e => setMat(e.target.value)}>
              {s.materials.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select></div>
          <div style={{ flex: 2 }}><label className="lbl">ملاحظة (اختياري)</label>
            <input placeholder="لماذا حفظت هذا الرابط؟" value={notes} onChange={e => setNotes(e.target.value)} /></div>
        </div>
        <div className="small mut mt">💡 {KINDS.find(k => k.id === kind)?.tip}</div>
        <div className="mt"><Btn kind="pri" sm disabled={!title.trim() || !url.trim()} onClick={add}>حفظ المصدر 🔗</Btn></div>
      </Glass>
      {!list.length && <div className="mt"><EmptyContent what="مصادر تعليمية" hint="احفظ روابط شروح اليوتيوب والمقالات والملفات هنا بدل ضياعها — ثم حوّلها لدروس." /></div>}
      {s.materials.map(m => {
        const items = list.filter(x => x.materialId === m.id);
        if (!items.length) return null;
        return (
          <Glass key={m.id} className="mt">
            <div className="between"><div className="row"><span className="dot" style={{ background: m.color }} /><b>{m.name}</b></div>
              <span className="small mut">{items.length}</span></div>
            <div className="mt" style={{ display: 'grid', gap: 8 }}>
              {items.map(x => (
                <div key={x.id}>
                  <div className="task">
                    <span style={{ fontSize: 18 }}>{KINDS.find(k => k.id === x.kind)?.icon}</span>
                    <div style={{ flex: 1 }}><div className="small" style={{ fontWeight: 600 }}>{x.title}</div>
                      <div className="tiny mut">{x.url.slice(0, 48)}{x.url.length > 48 ? '…' : ''}{x.notes ? ` • 📝 ${x.notes}` : ''}</div></div>
                    <button className="btn sm ghost" title="مفضل" onClick={() => set(p => ({ ...p, sources: p.sources.map(y => y.id === x.id ? { ...y, favorite: !y.favorite } : y) }))}>{x.favorite ? '⭐' : '☆'}</button>
                    <a className="btn sm" href={x.url} target="_blank" rel="noreferrer" style={{ textDecoration: 'none' }}>فتح ↗</a>
                    <button className="btn sm ghost" title="حذف" onClick={() => set(p => ({ ...p, sources: p.sources.filter(y => y.id !== x.id) }))}>🗑️</button>
                  </div>
                  <div className="mt" style={{ paddingInlineStart: 8 }}>
                    {importId === x.id ? (
                      <Glass level={2}>
                        <div className="small" style={{ fontWeight: 600 }}>📥 الصق نص المصدر ليتحول لدرس (مفاهيم + بطاقات + أسئلة)</div>
                        <div className="mt"><textarea placeholder="الصق هنا خلاصة الفيديو أو نص المقال…" value={importText} onChange={e => setImportText(e.target.value)} /></div>
                        <div className="mt wrap"><Btn kind="pri" sm disabled={importText.trim().length < 20} onClick={() => toLesson(x.id)}>تحويل لدرس ✨</Btn>
                          <Btn sm onClick={() => { setImportId(null); setImportText(''); }}>إلغاء</Btn></div>
                      </Glass>
                    ) : (
                      <Btn sm onClick={() => setImportId(x.id)}>📥 تحويل لدرس</Btn>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </Glass>
        );
      })}
    </div>
  );
}

export function Heatmap() {
  const { s } = useStore();
  const concepts = s.materials.flatMap(m => m.units.flatMap(u => u.lessons.flatMap(l => l.concepts.map(c => ({ ...c, mat: m.name })))));
  const pending = s.materials.flatMap(m => m.units.flatMap(u => u.lessons
    .filter(l => !l.concepts.length)
    .map(l => ({ id: l.id, title: l.title, mat: m.name })),
  ));
  return (
    <Glass className="mt"><h2>🗺️ خريطة الإتقان الحرارية</h2>
      <div className="wrap tiny mut mb"><span>🟢 متقن</span><span>🟡 يحتاج مراجعة</span><span>🟠 ضعيف</span><span>🔴 خطر</span><span>⏳ بانتظار سطر</span></div>
      <div className="heat">
        {concepts.slice(0, 14).map(c => {
          const b = bandOf(c.mastery);
          return <div key={c.id} title={`${c.title} — ${c.mastery}%`} style={{ background: bandColor(b) + '33', borderColor: bandColor(b), color: bandColor(b), fontWeight: 700 }}>{c.mastery}</div>;
        })}
        {pending.slice(0, 14 - Math.min(14, concepts.length)).map(l => (
          <div key={l.id} title={`«${l.title}» (${l.mat}) — درس مضاف بانتظار سطر واحد ليكتمل تحليله`} style={{ borderColor: '#94a3b8', color: '#94a3b8', fontWeight: 700 }}>⏳</div>
        ))}
        {!concepts.length && !pending.length && <div className="tiny mut">لا دروس بعد — أضف أول درس من المواد.</div>}
      </div>
      <div className="tiny mut mt">اللون = الأخطاء + نتائج الاختبارات + التكرار + الثقة + المراجعات.</div>
    </Glass>
  );
}

export function ErrorBank() {
  const { s, set } = useStore();
  const [open, setOpen] = useState<string | null>(null);
  const e = s.errors.find(x => x.id === open);
  return (
    <Glass className="mt"><h2>🗃️ بنك الأخطاء ({s.errors.filter(x => !x.resolved).length} مفتوحة)</h2>
      <div style={{ display: 'grid', gap: 8 }}>
        {s.errors.map(x => (
          <div key={x.id} className="task" style={{ cursor: 'pointer' }} onClick={() => setOpen(x.id)}>
            <span className="dot" style={{ background: x.resolved ? '#34d399' : '#f87171' }} />
            <div style={{ flex: 1 }}><div className="small" style={{ fontWeight: 600 }}>{x.question.slice(0, 60)}…</div>
              <div className="tiny mut">تكرر {x.count}x • {x.reason.slice(0, 50)}</div></div>
            <Chip>{x.resolved ? 'عولج ✓' : 'مفتوح'}</Chip></div>
        ))}
      </div>
      {e && <Sheet title="تفاصيل الخطأ" onClose={() => setOpen(null)}>
        <div className="small"><b>السؤال:</b> {e.question}</div>
        <div className="small mt"><b>إجابتك:</b> {e.userAnswer}</div>
        <div className="small mt"><b>الصحيحة:</b> {e.correctAnswer}</div>
        <div className="small mt"><b>السبب الجذري:</b> {e.reason} • تكرر {e.count} مرات</div>
        <div className="mt wrap"><Btn kind="pri" sm onClick={() => { set(p => ({ ...p, errors: p.errors.map(x => x.id === e.id ? { ...x, resolved: true, lastReview: todayISO() } : x) })); setOpen(null); addXP(set, 10); }}>تمت المعالجة ✓</Btn>
          <Btn sm onClick={() => set(p => ({ ...p, errors: p.errors.map(x => x.id === e.id ? { ...x, count: x.count + 1, lastReview: addDays(todayISO(), 2) } : x) }))}>جدولة مراجعة بعد يومين <Shuffle size={12} /></Btn></div>
      </Sheet>}
    </Glass>
  );
}
