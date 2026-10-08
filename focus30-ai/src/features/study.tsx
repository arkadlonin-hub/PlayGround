import { useMemo, useState } from 'react';
import { Brain, Camera, Link2, Plus, Shuffle } from 'lucide-react';
import { useStore, addXP } from '../core/store';
import type { Flashcard, Lesson, SourceKind } from '../core/types';
import { addDays, bandColor, bandOf, todayISO, uid } from '../core/types';
import { analyzeContent, analyzeExam, buildMindmap, conceptToCards, detectMaterial, fsrsNext, generateRecall, masteryAfter, qualityPass, similarity } from '../core/ai';
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
  const resetForm = () => {
    setText(''); setLinkUrl(''); setFiles([]); setSrcType('نص'); setMatPick(''); setOpen(false);
  };
  // اقتراح AI للمادة — يُعرض للمستخدم ولا يُعتمد تلقائياً أبداً
  const suggestion = useMemo(
    () => detectMaterial(text, files.map(f => f.name), s.materials.map(m => ({ id: m.id, name: m.name }))),
    [text, files, s.materials],
  );
  const sugName = s.materials.find(m => m.id === suggestion.matId)?.name;
  const [skipNote, setSkipNote] = useState<string | null>(null);
  // حذف درس مع كل ما تولّد منه (بطاقات + أسئلة + مهام مرتبطة)
  const deleteLesson = (lid: string) => {
    const cids = new Set(
      s.materials.flatMap(m => m.units.flatMap(u => u.lessons))
        .find(l => l.id === lid)?.concepts.map(c => c.id) ?? [],
    );
    set(p => ({
      ...p,
      materials: p.materials.map(m => ({ ...m, units: m.units.map(u => ({ ...u, lessons: u.lessons.filter(l => l.id !== lid) })) })),
      flashcards: p.flashcards.filter(f => !cids.has(f.conceptId)),
      recallBank: p.recallBank.filter(q => !cids.has(q.conceptId)),
      tasks: p.tasks.filter(t => t.lessonId !== lid),
    }));
  };

  const addContent = () => {
    if (!text.trim() || !matPick) return;
    const targetMat = s.materials.find(m => m.id === matPick);
    if (!targetMat) return;
    const bits = [srcType];
    if (files.length) bits.push(`ملفات: ${files.map(f => f.name).join('، ')}`);
    if (linkUrl.trim()) bits.push(`رابط: ${linkUrl.trim()}`);
    bits.push(new Date().toLocaleDateString('ar'));
    const ref = bits.join(' — ');
    const body = text.trim() || `محتوى من ${files.length ? files.map(f => f.name).join('، ') : 'رابط'} — أضف النص أو انسخ الخلاصة هنا لاحقاً من تفاصيل الدرس.`;
    const a = analyzeContent(body, uid('l'), ref);
    const lid = uid('l');
    const concepts = a.concepts
      .filter(c => qualityPass(c.detail))
      .map(c => ({ ...c, lessonId: lid }));
    const skipped = a.concepts.length - concepts.length;
    const nl: Lesson = {
      id: lid, unitId: targetMat.units[0]?.id ?? 'u1', title: text.trim().slice(0, 40) || files[0]?.name || linkUrl.trim() || 'درس جديد',
      sourceText: body, sourceRef: ref,
      concepts, summary: a.summary, mindmap: buildMindmap(text.slice(0, 30), concepts),
      mastery: Math.round(concepts.reduce((x, c) => x + c.mastery, 0) / Math.max(1, concepts.length)),
    };
    const cards: Flashcard[] = concepts.flatMap(conceptToCards).slice(0, 6);
    const rq = generateRecall(concepts, 4);
    set(p => ({
      ...p,
      materials: p.materials.map(m => m.id === targetMat.id ? {
        ...m, units: m.units.map((u, j) => j === 0 ? { ...u, lessons: [...u.lessons, nl] } : u),
      } : m),
      flashcards: [...p.flashcards, ...cards], recallBank: [...p.recallBank, ...rq],
    }));
    resetForm(); addXP(set, 30);
    if (skipped > 0) setSkipNote(`🧹 تم تخطي ${skipped} مقاطع ضعيفة الجودة (حروف عشوائية) — لن تُبنى عليها أسئلة.`);
  };

  return (
    <div>
      <div className="between mb"><h1>📚 المواد والدروس</h1>
        <div className="row"><Btn sm onClick={() => setNewMat(true)}><Plus size={14} /> مادة</Btn>
          <Btn kind="pri" sm onClick={() => setOpen(true)}><Plus size={14} /> إضافة محتوى</Btn></div></div>
      <div className="small mut mb">المادة ← الوحدة ← الدرس ← المفاهيم (بدون نظام الفصول). كل عنصر مرتبط بمصدره الأصلي.</div>
      {skipNote && <Glass level={2} className="mb"><div className="between"><span className="small">{skipNote}</span><Btn sm onClick={() => setSkipNote(null)}>✕</Btn></div></Glass>}
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
                    <Brain size={15} color={m.color} />
                    <div style={{ flex: 1 }}><div className="small" style={{ fontWeight: 600 }}>{l.title}</div>
                      <div className="tiny mut">{l.concepts.length} مفاهيم • مصدر: {l.sourceRef}</div></div>
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
          setNm(''); setNewMat(false); addXP(set, 10);
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
        {(srcType === 'سبورة' || files.some(f => f.preview)) && !text.trim() && (
          <Glass level={2} className="mb">
            <div className="small">📋 <b>صورة سبورة/لوح مرفقة بلا نص</b> — للتحليل الدقيق اكتب سطراً واحداً على الأقل مما كُتب على اللوح (أهم قانون/تعريف/فكرة). لا أستطيع قراءة الصور تلقائياً بعد، ولن أخمّن محتواها.</div>
          </Glass>
        )}
        <AttList files={files} onRemove={i => setFiles(files.filter((_, j) => j !== i))} />
        {!!files.length && (
          <div className="tiny mut mb">📝 ملفات النص تُقرأ تلقائياً في مربع النص. لصور الكتب والسبورة: اكتب أو الصق النص بجانب الصورة — لا نختلق قراءة وهمية.</div>
        )}
        <textarea placeholder="الصق النص أو اكتب ملاحظاتك… سيحلله AI إلى: تعاريف، قوانين، مصطلحات، أفكار، أمثلة، علاقات، حفظ/فهم، نقاط امتحانية" value={text} onChange={e => setText(e.target.value)} />
        {!matPick && <div className="tiny mut mt">⚠️ اختر المادة أولاً — لن يُضاف الدرس عشوائياً لأي مادة.</div>}
        <div className="mt row"><Btn kind="pri" disabled={!text.trim() || !matPick} onClick={addContent}>تحليل بالذكاء الاصطناعي ✨</Btn><Btn kind="ghost" onClick={() => setOpen(false)}>إلغاء</Btn></div>
      </Modal>}
      {lesson && <LessonSheet lesson={lesson} onClose={() => setSel(null)} onPack={() => setPack(lesson.id)} onConcept={setConcept} />}
      {pack && <PackSheet lessonId={pack} onClose={() => setPack(null)} go={go} />}
      {concept && <ConceptSheet conceptId={concept} onClose={() => setConcept(null)} go={go} />}
    </div>
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
      <h3 className="mt">🗺️ خريطة ذهنية (م timestلونة تلقائياً)</h3>
      <div className="mind"><MindView node={lesson.mindmap as never} /></div>
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
    setPlanned(true); addXP(set, 15);
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
  const found = s.materials.flatMap(m => m.units.flatMap(u => u.lessons.flatMap(l => l.concepts.map(c => ({ ...c, lesson: l.title, mat: m.name }))))).find(c => c.id === conceptId);
  if (!found) return null;
  const kindName: Record<string, string> = { definition: 'تعريف', law: 'قانون', term: 'مصطلح', idea: 'فكرة', example: 'مثال', relation: 'علاقة', memorize: 'حفظ', understand: 'فهم', exam: 'امتحاني' };
  const cards = s.flashcards.filter(f => f.conceptId === conceptId).length;
  const qs = s.recallBank.filter(q => q.conceptId === conceptId).length;
  const nav = (r: string) => { onClose(); go(r); };
  return (
    <Sheet title={`💡 ${found.title.slice(0, 50)}`} onClose={onClose}>
      <div className="wrap"><Chip on>{kindName[found.kind] ?? found.kind}</Chip><Chip>{found.mat} / {found.lesson}</Chip></div>
      <Glass className="mt"><div className="small">{found.detail}</div></Glass>
      <div className="mt"><div className="between small"><span>الإتقان</span><span>{found.mastery}%</span></div><Bar v={found.mastery} /></div>
      <div className="small mut mt">🃏 {cards} بطاقات • 🧠 {qs} أسئلة • خطر النسيان {Math.round(found.forgetRisk * 100)}% • المراجعة: {found.nextReview}</div>
      <div className="mt wrap">
        <Btn sm kind="pri" onClick={() => nav('study-recall')}>اختبرني به 🧠</Btn>
        <Btn sm onClick={() => nav('study-cards')}>بطاقاته 🃏</Btn>
        <Btn sm onClick={() => nav('ai-tutor')}>اسأل المعلم 🤖</Btn>
      </div>
    </Sheet>
  );
}

export function Recall() {
  const { s, set } = useStore();
  const [i, setI] = useState(0);
  const [order, setOrder] = useState<string[] | null>(null);
  const [tried, setTried] = useState(false);
  const [mine, setMine] = useState('');
  const [sim, setSim] = useState<number | null>(null);
  const [fb, setFb] = useState<'good' | 'bad' | null>(null);
  const [conf, setConf] = useState(3);
  const [t0, setT0] = useState(Date.now());
  const [showHint, setShowHint] = useState(false);
  if (!s.recallBank.length) return (<div><h1>🧠 تذكّر نشط</h1>
    <EmptyContent what="أسئلة تذكّر نشط" hint="أضف أول درس (صورة أو ملف أو نص) لتتولد أسئلتك منه تلقائياً." /></div>);
  const base = s.recallBank.slice(0, 16);
  const qs = order ? order.map(id => base.find(q => q.id === id)!).filter(Boolean) : base;
  const q = qs[i % Math.max(1, qs.length)];
  const kindAr: Record<string, string> = { qa: 'سؤال وجواب', mcq: 'اختيار من متعدد', tf: 'صح/خطأ', fill: 'أكمل الفراغ', why: 'لماذا؟', explain: 'اشرح', compare: 'قارن', apply: 'طبّق', solve: 'حل مسألة', link: 'اربط' };
  if (!q) return <Glass>لا أسئلة بعد — أضف محتوى أولاً.</Glass>;
  const meta = s.materials.flatMap(m => m.units.flatMap(u => u.lessons.flatMap(l => l.concepts.map(c => ({ id: c.id, mastery: c.mastery, lesson: l.title, mat: m.name }))))).find(c => c.id === q.conceptId);
  const concept = meta ? s.materials.flatMap(m => m.units.flatMap(u => u.lessons.flatMap(l => l.concepts))).find(c => c.id === q.conceptId) : undefined;

  const grade = (ok: boolean, autoMsg?: string) => {
    const timeMs = Date.now() - t0;
    setFb(ok ? 'good' : 'bad');
    setTried(true);
    const patch = concept ? masteryAfter(concept, ok, conf, timeMs) : {};
    set(p => ({
      ...p,
      attempts: [...p.attempts, { id: uid('a'), date: todayISO(), conceptId: q.conceptId, kind: q.kind, correct: ok, timeMs, confidence: conf as 1 | 2 | 3 | 4 | 5 }],
      materials: p.materials.map(m => ({
        ...m, units: m.units.map(u => ({
          ...u, lessons: u.lessons.map(l => ({
            ...l, concepts: l.concepts.map(c => c.id === q.conceptId ? { ...c, ...patch } : c),
          })),
        })),
      })),
      errors: ok ? p.errors : [...p.errors, {
        id: uid('e'), date: todayISO(), conceptId: q.conceptId, question: q.prompt,
        userAnswer: mine || '(بدون إجابة)', correctAnswer: q.answer,
        reason: autoMsg ?? 'إجابة ناقصة — راجع التفاصيل ثم أعد المحاولة', count: 1, lastReview: null, resolved: false,
      }],
    }));
    if (ok) addXP(set, 12);
  };
  // تقييم عادل: نحسب التطابق أولاً — الحروف العشوائية تُكشف تلقائياً
  const check = () => {
    const v = similarity(mine, q.answer);
    setSim(v);
    if (v < 0.15) {
      grade(false, 'الإجابة لا تطابق النموذجية إطلاقاً (تطابق 0-15%) — قيّم نفسك بصدق، الغش هنا يضرّك أنت.');
    }
  };
  const next = () => { setI(i + 1); setTried(false); setMine(''); setFb(null); setSim(null); setShowHint(false); setT0(Date.now()); };
  const shuffle = () => {
    const ids = base.map(q => q.id);
    for (let k = ids.length - 1; k > 0; k--) { const j = Math.floor(Math.random() * (k + 1));[ids[k], ids[j]] = [ids[j], ids[k]]; }
    setOrder(ids); next();
  };

  return (
    <div>
      <div className="between mb"><h1>🧠 تذكّر نشط</h1>
        <span className="row"><Chip on>{kindAr[q.kind]} • {i + 1}/{qs.length}</Chip><Btn sm onClick={shuffle}><Shuffle size={13} /> خلط</Btn></span></div>
      <div className="small mut mb">لا تظهر الإجابة قبل محاولتك — اكتب أولاً. التقييم عادل: نحسب تطابق إجابتك مع النموذجية، والحروف العشوائية تُسجَّل خطأً تلقائياً.</div>
      <Glass level={2} className={fb === 'good' ? 'good' : fb === 'bad' ? 'bad' : ''}>
        <div className="between"><span className="small mut">❓ {kindAr[q.kind]}</span>
          {meta && <span className="tiny mut">📚 {meta.mat} • إتقان المفهوم {meta.mastery}%</span>}</div>
        <div style={{ fontSize: 17, fontWeight: 700, margin: '8px 0' }}>{q.prompt}</div>
        {!tried ? <>
          <textarea placeholder="اكتب إجابتك هنا قبل كشف الحل…" value={mine} onChange={e => setMine(e.target.value)} />
          <div className="mt row"><Btn sm onClick={() => setShowHint(!showHint)}>💡 تلميح</Btn>
            {showHint && <span className="tiny mut">{q.hint}</span>}</div>
          <label className="lbl">ثقتك بإجابتك (1-5)</label>
          <div className="wrap">{[1, 2, 3, 4, 5].map(n => <Chip key={n} on={conf === n} onClick={() => setConf(n)}>{n}</Chip>)}</div>
          <div className="mt wrap"><Btn kind="pri" sm disabled={mine.trim().length < 2} onClick={check}>تحقق من إجابتي 🔍</Btn></div>
        </> : <>
          <Glass className="mt"><h3>✅ الإجابة النموذجية</h3><div className="small">{q.answer}</div>
            {sim !== null && sim >= 0.15 && (
              <div className="small mt">{sim >= 0.45
                ? `✅ تطابق قوي (${Math.round(sim * 100)}%) — قيّم: هل تستحق علامة كاملة؟`
                : `🟡 تطابق جزئي (${Math.round(sim * 100)}%) — كن صادقاً: هل الفكرة الجوهرية موجودة؟`}</div>
            )}
            {sim !== null && sim < 0.15 && (
              <div className="small mt">🔍 <b>كشف تلقائي:</b> إجابتك لا تحتوي أي كلمة جوهرية من النموذجية — سُجلت كخطأ لصالح تعلمك، وهذا أصدق من علامة مزيفة.</div>
            )}
            <div className="small mut mt">تم تحديث الإتقان وبنك الأخطاء والمراجعة القادمة تلقائياً.</div></Glass>
          {sim !== null && sim >= 0.15 && (
            <div className="mt wrap"><Btn kind="pri" sm onClick={() => grade(true)}>نعم — أصبت ✓</Btn>
              <Btn sm onClick={() => grade(false)}>لا — أخطأت ✕</Btn></div>
          )}
          <div className="mt wrap"><Btn kind="pri" sm onClick={next}>السؤال التالي <Shuffle size={13} /></Btn>
            <Btn sm onClick={() => { setTried(false); setFb(null); setSim(null); }}>حاول مجدداً</Btn></div>
        </>}
      </Glass>
    </div>
  );
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
  const kindAr: Record<string, string> = { qa: 'سؤال/جواب', cloze: 'املأ الفراغ', image: 'بطاقة صورة', occlusion: 'إخفاء صورة', map: 'خريطة', formula: 'قانون', draw: 'ارسم بنفسك' };
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
        <div onClick={() => setFlip(!flip)} style={{ minHeight: 130, display: 'grid', placeItems: 'center', cursor: 'pointer', padding: 12 }}>
          {!flip ? <div style={{ fontSize: 17, fontWeight: 700, textAlign: 'center' }}>{card.front}<div className="tiny mut mt">اضغط للكشف 👆</div></div>
            : <div className="pop" style={{ textAlign: 'center' }}><div className="small">{card.back}</div>
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
  const b = s.blackouts[0];
  if (!b) return null;
  const words = b.text.split(' ');
  const hideCount = Math.floor(words.length * [0, 0.2, 0.5, 0.8, 1][Math.min(4, b.stage)]);
  const [revealed, setRevealed] = useState<Set<number>>(new Set());
  return (
    <Glass className="mt"><h2>⬛ الحفظ بالتعتيم التدريجي</h2>
      <div className="small mut">«{b.title}» — المرحلة {b.stage + 1}/5 (20% ← 50% ← 80% ← كامل)</div>
      <div className="mt">{words.map((w, i) => {
        const hidden = i < hideCount && !revealed.has(i);
        return <span key={i} className={`mask-word ${hidden ? 'hide' : ''}`} onClick={() => setRevealed(new Set([...revealed, i]))}>{hidden ? '•••' : w}</span>;
      })}</div>
      <div className="mt wrap"><Btn sm kind="pri" onClick={() => set(p => ({ ...p, blackouts: p.blackouts.map(x => x.id === b.id ? { ...x, stage: Math.min(4, x.stage + 1) } : x) }))}>التالي ← إخفاء أكثر</Btn>
        <Btn sm onClick={() => { set(p => ({ ...p, blackouts: p.blackouts.map(x => x.id === b.id ? { ...x, stage: Math.max(0, x.stage - 1) } : x) })); setRevealed(new Set()); }}>↩ خطوة للخلف (عند كثرة الأخطاء)</Btn></div>
    </Glass>
  );
}

export function DiagramMasker() {
  const { s, set } = useStore();
  const d = s.diagrams[0];
  if (!d) return null;
  const [shown, setShown] = useState<Set<number>>(new Set());
  return (
    <Glass className="mt"><h2>🫀 مخفي التسميات التفاعلي</h2>
      <div className="small mut">{d.title} — اضغط المنطقة لإظهار الإجابة</div>
      <div className="mt" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        {d.labels.map((l, i) => (
          <div key={i} onClick={() => shown.has(i) ? setShown(new Set([...shown].filter(x => x !== i))) : setShown(new Set([...shown, i]))}
            style={{ padding: 16, borderRadius: 14, textAlign: 'center', cursor: 'pointer', fontWeight: 700, background: shown.has(i) ? 'rgba(52,211,153,.2)' : 'linear-gradient(135deg,#22d3ee,#a78bfa)', color: shown.has(i) ? '#fff' : '#04121a' }}>
            {shown.has(i) ? l : `؟ ${i + 1}`}</div>
        ))}
      </div>
      <div className="mt"><Btn sm onClick={() => set(p => ({ ...p, diagrams: p.diagrams.map(x => x.id === d.id ? { ...x, masked: !x.masked } : x) }))}>تبديل الإخفاء</Btn></div>
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
  if (!s.diagrams.length) return (
    <Glass className="mt"><h2>🗺️ بطاقات الخرائط المفرّغة</h2>
      <div className="small mut">لا مخططات بعد — أنشئ مخططاً بتسمياته من أداة «أنشئ أداة حفظ» بالأعلى، وستتحول هنا لبطاقات تحديد ذكية تلقائياً.</div>
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
  const [on, setOn] = useState(false);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [results, setResults] = useState<{ id: string; sim: number; ok: boolean }[] | null>(null);
  // عينة متنوعة: سؤال لكل مفهوم بالتناوب — لا تركيز على مفهوم واحد
  const concepts = s.materials.flatMap(m => m.units.flatMap(u => u.lessons.flatMap(l => l.concepts.map(c => ({ ...c, mat: m.name })))));
  const diverse = (() => {
    const byC = new Map<string, typeof s.recallBank>();
    for (const q of s.recallBank) {
      if (!concepts.some(c => c.id === q.conceptId)) continue;
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
        timeMs: perQ, confidence: 3 as const,
      }))],
      errors: [...p.errors, ...diverse.map((q, i) => ({ q, i })).filter(({ i }) => !r[i].ok).map(({ q, i }) => ({
        id: uid('e'), date: todayISO(), conceptId: q.conceptId, question: q.prompt,
        userAnswer: answers[q.id] || '(بدون إجابة)', correctAnswer: q.answer,
        reason: `اختبار: تطابق ${Math.round(r[i].sim * 100)}% فقط`, count: 1, lastReview: null, resolved: false,
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
        <Glass level={2}>
          <div className="row"><div style={{ flex: 1 }}><label className="lbl">عدد الأسئلة</label>
            <input type="number" value={cfg.n} onChange={e => setCfg({ ...cfg, n: Math.max(1, Math.min(20, +e.target.value || 1)) })} /></div>
            <div style={{ flex: 1 }}><label className="lbl">المدة (دقائق)</label>
              <input type="number" value={cfg.mins} onChange={e => setCfg({ ...cfg, mins: +e.target.value })} /></div></div>
          <div className="small mut mt">سيغطي الاختبار {Math.min(cfg.n, concepts.length)} مفاهيم مختلفة من أصل {concepts.length}.</div>
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
                  <div className="tiny mut">تطابق {Math.round(results[i].sim * 100)}% • إجابتك: {(answers[q.id] || '—').slice(0, 50)}</div>
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
  const picker = useFilePicker(fl => {
    if (!fl) return;
    collectFiles(fl, t => setRaw(prev => (prev ? prev + '\n' : '') + t)).then(fs => setShots(prev => [...prev, ...fs]));
  });
  const add = () => {
    if (raw.trim().length < 10) return;
    const a = analyzeExam(raw);
    set(p => ({ ...p, exams: [...p.exams, { id: uid('x'), title: `ورقة ${p.exams.length + 1} — ${new Date().toLocaleDateString('ar')}`, materialId: p.materials[0]?.id ?? 'm1', date: todayISO(), rawText: raw, attachments: shots.map(f => f.name), analysis: a }] }));
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
        {!!shots.length && <div className="tiny mut mb">🖼️ الصور مرفقة ومحفوظة مع الورقة — انسخ نص الأسئلة إلى المربع ليحللها AI (ملفات النص تُقرأ تلقائياً).</div>}
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
    setTitle(''); setUrl(''); setNotes(''); addXP(set, 10);
  };
  const toLesson = (srcId: string) => {
    if (importText.trim().length < 20) return;
    const src = s.sources.find(x => x.id === srcId); if (!src) return;
    const a = analyzeContent(importText, uid('l'), `${src.title} — ${src.url}`);
    const lid = uid('l');
    const concepts = a.concepts.map(c => ({ ...c, lessonId: lid }));
    const unitId = s.materials.find(m => m.id === src.materialId)?.units[0]?.id ?? '';
    const nl: Lesson = {
      id: lid, unitId, title: src.title.slice(0, 45), sourceText: importText,
      sourceRef: `${src.title} — ${src.url}`, concepts, summary: a.summary,
      mindmap: buildMindmap(src.title.slice(0, 30), concepts),
      mastery: Math.round(concepts.reduce((x, c) => x + c.mastery, 0) / Math.max(1, concepts.length)),
    };
    set(p => ({
      ...p,
      materials: p.materials.map(m => m.id === src.materialId
        ? { ...m, units: m.units.map((u, j) => j === 0 ? { ...u, lessons: [...u.lessons, nl] } : u) } : m),
      flashcards: [...p.flashcards, ...concepts.flatMap(conceptToCards).slice(0, 6)],
      recallBank: [...p.recallBank, ...generateRecall(concepts, 4)],
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
  return (
    <Glass className="mt"><h2>🗺️ خريطة الإتقان الحرارية</h2>
      <div className="wrap tiny mut mb"><span>🟢 متقن</span><span>🟡 يحتاج مراجعة</span><span>🟠 ضعيف</span><span>🔴 خطر</span></div>
      <div className="heat">
        {concepts.slice(0, 14).map(c => {
          const b = bandOf(c.mastery);
          return <div key={c.id} title={`${c.title} — ${c.mastery}%`} style={{ background: bandColor(b) + '33', borderColor: bandColor(b), color: bandColor(b), fontWeight: 700 }}>{c.mastery}</div>;
        })}
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
