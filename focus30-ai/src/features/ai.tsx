import { useState } from 'react';
import { Brain, GraduationCap, Lightbulb, Send, Sparkles, Map as MapIcon, Telescope } from 'lucide-react';
import { useStore, addXP } from '../core/store';
import type { TutorMode } from '../core/ai';
import { coachAdvices, forgettingQueue, predictQuestions, tutorReply, weaknessMap } from '../core/ai';
import { Btn, Chip, Glass, Sheet } from '../ui/kit';
import { EmptyContent } from './study';

const MODES: { id: TutorMode; name: string; icon: string }[] = [
  { id: 'teacher', name: ' المعلّم', icon: '👨‍🏫' }, { id: 'explainer', name: 'المبسّط', icon: '💡' },
  { id: 'socratic', name: 'سقراطي', icon: '❓' }, { id: 'trainer', name: 'مدرّب امتحان', icon: '🎯' },
  { id: 'solver', name: 'حل المسائل', icon: '🧮' }, { id: 'reviser', name: 'مساعد المراجعة', icon: '🔁' },
];

export function Tutor() {
  const { s, set } = useStore();
  const [mode, setMode] = useState<TutorMode>('teacher');
  const [q, setQ] = useState('');
  const [chat, setChat] = useState<{ me: string; ai: string[]; src: string }[]>([]);
  const [hintLvl, setHintLvl] = useState(0);
  const concepts = s.materials.flatMap(m => m.units.flatMap(u => u.lessons.flatMap(l => l.concepts.map(c => ({ ...c, lesson: l.title })))));
  const avg = concepts.length ? Math.round(concepts.reduce((a, c) => a + c.mastery, 0) / concepts.length) : 0;
  const relatedOf = (query: string) => {
    const words = query.split(/\s+/).filter(w => w.length > 2);
    let best: (typeof concepts)[number] | null = null; let score = 0;
    for (const c of concepts) {
      const sc = words.filter(w => c.title.includes(w) || c.detail.includes(w)).length;
      if (sc > score) { score = sc; best = c; }
    }
    return score > 0 ? best : null;
  };
  const send = (text?: string) => {
    const query = (text ?? q).trim();
    if (!query) return;
    const rel = relatedOf(query);
    const mistake = rel ? s.errors.find(e => e.conceptId === rel.id && !e.resolved)?.reason : undefined;
    const ai = tutorReply(mode, query, {
      lesson: rel?.lesson ?? s.materials[0]?.units[0]?.lessons[0]?.title,
      errors: s.errors.filter(e => !e.resolved).length, mastery: avg,
      related: rel, mistake,
    });
    setChat([...chat, { me: query, ai, src: rel ? `مصدرك: ${rel.lesson} • إتقان المفهوم ${rel.mastery}%` : 'معرفة عامة — أضف الدرس لدقة أعلى' }]);
    setQ(''); setHintLvl(0); addXP(set, 2);
  };
  const QUICK = ['اشرح لي: ', 'اختبرني في: ', 'أعطني مثالاً واقعياً عن: ', 'ما خطئي الشائع في: '];
  return (
    <div>
      <div className="between mb"><h1>🤖 المعلّم الذكي</h1><Chip on>{concepts.length ? `يعرف ${concepts.length} مفهوماً من دروسك` : 'بانتظار دروسك'}</Chip></div>
      <div className="tabs">{MODES.map(m => <button key={m.id} className={`chip tab ${mode === m.id ? 'on' : ''}`} onClick={() => setMode(m.id)}>{m.icon} {m.name}</button>)}</div>
      {!chat.length && (
        <Glass level={2} className="mb"><div className="small">👨‍🏫 أنا معلّمك الخاص — أجيب من <b>دروسك أنت</b> عند تطابق السؤال، وأحذّرك من <b>أخطائك المسجلة</b>، وأتكيف مع مستواك ({avg}%). جرّب:</div>
          <div className="wrap mt">{QUICK.map(x => <Chip key={x} onClick={() => setQ(x)}>{x}</Chip>)}</div></Glass>
      )}
      <div style={{ display: 'grid', gap: 10 }}>
        {chat.map((c, i) => (
          <div key={i}>
            <div className="row" style={{ justifyContent: 'flex-end' }}><div className="glass pad" style={{ maxWidth: '85%', background: 'linear-gradient(135deg,rgba(34,211,238,.18),rgba(167,139,250,.18))' }}><div className="small">{c.me}</div></div></div>
            <div className="row mt" style={{ alignItems: 'flex-start' }}><GraduationCap size={16} color="#a78bfa" />
              <div style={{ flex: 1 }}><Glass><div className="small" style={{ whiteSpace: 'pre-line' }}>{c.ai[Math.min(hintLvl, c.ai.length - 1)] ?? c.ai[0]}</div>
                <div className="tiny mut mt">📚 {c.src}</div></Glass>
                {i === chat.length - 1 && c.ai.length > 1 && (
                  <div className="wrap mt"><Btn sm onClick={() => setHintLvl(h => Math.min(h + 1, 3))}>المستوى التالي: {['تلميح 💡', 'خطوة أولى 👣', 'شرح 📖', 'حل كامل ✅'][Math.min(hintLvl + 1, 3)]}</Btn></div>)}
              </div></div>
          </div>
        ))}
      </div>
      <div className="row mt"><input placeholder="اسأل المعلم… (يطابق سؤالك مع دروسك تلقائياً)" value={q} onChange={e => setQ(e.target.value)} onKeyDown={e => e.key === 'Enter' && send()} />
        <Btn kind="pri" onClick={() => send()}><Send size={14} /></Btn></div>
      <div className="tiny mut mt">🔒 الثقة: المعلّم يوضح مصدر كل إجابة (مادتك أم معرفة عامة) ولا يقدّم غير المؤكد كحقيقة.</div>
    </div>
  );
}

export function Coach() {
  const { s, set } = useStore();
  const [showErrors, setShowErrors] = useState(false);
  const adv = coachAdvices(s);
  const runAct = (act: 'night' | 'review3') => {
    if (act === 'night') { set(p => ({ ...p, nightMode: true })); addXP(set, 5); return; }
    const top = forgettingQueue(s).slice(0, 3);
    const t = new Date().toISOString().slice(0, 10);
    set(p => ({
      ...p,
      tasks: [...p.tasks, ...top.map(f => ({
        id: `t_${Math.random().toString(36).slice(2, 9)}`,
        title: `مراجعة مركزة: ${f.concept.title.slice(0, 45)}`,
        materialId: p.materials.find(m => m.name === f.material)?.id ?? p.materials[0]?.id ?? 'm1',
        date: t, mins: 15, kind: 'review' as const, done: false, priority: 1 as const,
      }))],
    }));
    addXP(set, 10);
  };
  return (
    <div>
      <h1>🧭 المدرّب الاستراتيجي</h1>
      <div className="small mut mb">يحلل: الدراسة + الأخطاء + الوقت + الإتقان + الخطة + المراجعات + الالتزام + الامتحانات — ثم يشرح سبب كل توصية، وينفّذها بضغطة.</div>
      {adv.map((a, i) => (
        <Glass key={i} level={i === 0 ? 2 : 1} className="mb">
          <div className="between"><b>{a.title}</b><Chip on={a.priority === 1}>{a.priority === 1 ? 'عاجل' : a.priority === 2 ? 'مهم' : 'اختياري'}</Chip></div>
          <div className="small mut mt">لماذا؟ {a.reason}</div>
          <div className="small mt">👉 {a.action}</div>
          <div className="mt wrap">
            {a.act && <Btn sm kind="pri" onClick={() => runAct(a.act!)}>{a.act === 'night' ? '🌙 تفعيل وضع الليلة' : '⚡ إنشاء 3 مهام مراجعة'}</Btn>}
            <Btn sm onClick={() => setShowErrors(!showErrors)}>🗃️ بنك الأخطاء</Btn>
          </div>
        </Glass>
      ))}
      {showErrors && <ErrorsInline onClose={() => setShowErrors(false)} />}
      <Glass><h2>مثال قرار حقيقي</h2>
        <div className="small">«أقترح نقل مراجعة الكيمياء إلى الغد لأن لديك امتحان فيزياء أقرب، بينما إتقان الكيمياء حالياً 87%.» — القرارات دائماً مبررة بالأرقام.</div></Glass>
    </div>
  );
}

function ErrorsInline({ onClose }: { onClose: () => void }) {
  const { s, set } = useStore();
  const open = s.errors.filter(e => !e.resolved);
  return (
    <Glass level={2} className="mb pop">
      <div className="between"><h2>🗃️ أخطاؤك المفتوحة ({open.length})</h2><Btn sm onClick={onClose}>إغلاق</Btn></div>
      {!open.length && <div className="small mut">لا أخطاء مفتوحة — ممتاز.</div>}
      {open.map(e => (
        <div key={e.id} className="task mt"><span className="dot" style={{ background: '#f87171' }} />
          <div style={{ flex: 1 }}><div className="small" style={{ fontWeight: 600 }}>{e.question.slice(0, 70)}…</div>
            <div className="tiny mut">السبب: {e.reason} • تكرر {e.count}x</div></div>
          <Btn sm kind="pri" onClick={() => { set(p => ({ ...p, errors: p.errors.map(x => x.id === e.id ? { ...x, resolved: true } : x) })); addXP(set, 10); }}>عولج ✓</Btn></div>
      ))}
    </Glass>
  );
}

const WORLD_EX: Record<string, { label: string; ex: (c: string) => string }[]> = {
  phys: [
    { label: '🚗 سيارة', ex: c => `تخيّل «${c}» كدواسة سيارة: كلما ضغطت أكثر (القوة) زاد التغير (التسارع) — والفرامل هي التسارع السالب.` },
    { label: '⚽ رياضة', ex: c => `«${c}» في ركلة حرة: مسار الكرة يشرح الفكرة دون معادلات أولاً، ثم نضيف الأرقام.` },
  ],
  econ: [{ label: '🛒 السوق', ex: c => `«${c}» مثل سوق الخضار: العرض والطلب يحركان السعر كما تحرك القوةُ الحركةَ.` }],
  chem: [{ label: '🍳 المطبخ', ex: c => `«${c}» يحدث في مطبخك: غليان الماء وتفاعل الخل مع الصودا نسخة منزلية من نفس المبدأ.` }],
  bio: [{ label: '🌳 الطبيعة', ex: c => `«${c}» تراه في جسمك وطبيعتك: القلب مضخة، والرئة تبادل غازات — نفس فكرة الدرس.` }],
};

export function Examples() {
  const { s } = useStore();
  const concepts = s.materials.flatMap(m => m.units.flatMap(u => u.lessons.flatMap(l => l.concepts)));
  const [ci, setCi] = useState(0);
  const [dom, setDom] = useState<keyof typeof WORLD_EX>('phys');
  const c = concepts[ci % Math.max(1, concepts.length)];
  if (!c) return (<div><h1>🌍 مولّد الأمثلة الواقعية</h1>
    <EmptyContent what="أمثلة واقعية" hint="اختر أي مفهوم من دروسك وسنحوّله لمثال من حياتك اليومية." /></div>);
  return (
    <div><h1>🌍 مولّد الأمثلة الواقعية</h1>
      <Glass level={2}><div className="small mut">المفهوم</div><b>{c.title}</b>
        <div className="wrap mt">{(Object.keys(WORLD_EX) as (keyof typeof WORLD_EX)[]).map(k => <Chip key={k} on={dom === k} onClick={() => setDom(k)}>{k === 'phys' ? 'فيزياء 🚗' : k === 'econ' ? 'اقتصاد 🛒' : k === 'chem' ? 'كيمياء 🍳' : 'أحياء 🌳'}</Chip>)}</div>
        {WORLD_EX[dom].map((w, i) => <Glass key={i} className="mt"><h3>{w.label}</h3><div className="small">{w.ex(c.title)}</div></Glass>)}
        <div className="mt"><Btn sm onClick={() => setCi(ci + 1)}>مفهوم آخر 🎲</Btn></div></Glass></div>
  );
}

export function Stories() {
  const { s } = useStore();
  const concepts = s.materials.flatMap(m => m.units.flatMap(u => u.lessons.flatMap(l => l.concepts)));
  const c = concepts[0];
  const [show, setShow] = useState(false);
  if (!c) return (<div><h1>📖 المفهوم إلى قصة</h1>
    <EmptyContent what="قصص المفاهيم" hint="القصص تُبنى من مفاهيم دروسك الحقيقية — أضف درساً أولاً." /></div>);
  return (
    <div><h1>📖 المفهوم إلى قصة</h1>
      <Glass level={2}><b>«رحلة {c.title.slice(0, 30)}»</b>
        <div className="small mt">في مملكة الحركة، عاش <b>البطل (الجسم)</b> خاملاً… حتى جاء <b>الساحر (القوة)</b> فمنحه <b>التسارع</b>، وانطلق في <b>رحلة (المسافة)</b> عبر <b>الزمن</b>… ووصل <b>النتيجة (السرعة النهائية)</b>.</div>
        {!show ? <div className="mt"><Btn sm kind="pri" onClick={() => setShow(true)}>كشف الحقائق vs الخيال 🔍</Btn></div>
          : <Glass className="mt pop"><div className="small">✅ <b>حقائق أصلية:</b> التعريف والقانون والعلاقة بين القوة والتسارع.</div>
            <div className="small mt">🎭 <b>عناصر قصصية للتذكر فقط:</b> المملكة والساحر والرحلة — ليست معلومات امتحانية.</div>
            <div className="tiny mut mt">الفصل بينهما يمنع تحوّل القصة إلى معلومات خاطئة.</div></Glass>}
      </Glass></div>
  );
}

export function Predictor() {
  const { s } = useStore();
  const lesson = s.materials.flatMap(m => m.units.flatMap(u => u.lessons))[0];
  const [res, setRes] = useState<{ q: string; confidence: 'high' | 'mid' | 'low'; why: string }[] | null>(null);
  const confAr = { high: ['مرتفع 🟢', '#34d399'], mid: ['متوسط 🟡', '#fbbf24'], low: ['منخفض ⚪', '#94a3b8'] } as const;
  return (
    <div><h1>🔮 متنبئ الأسئلة</h1>
      <div className="small mut mb">يحلل: محتوى الدرس + أرشيفك + المفاهيم المهمة + الأنماط — ثم يعرض أسئلة مرجحة بمستوى ثقة.</div>
      {!lesson ? <EmptyContent what="توقعات" hint="المتنبئ يحتاج درساً ممسوحاً + ورقة امتحان سابقة في الأرشيف." /> : <>
      <Btn kind="pri" sm onClick={() => { if (lesson) setRes(predictQuestions(lesson, s.exams.flatMap(e => e.analysis.topics))); }}><Telescope size={13} /> حلل الدرس وتوقّع</Btn>
      {res?.map((r, i) => (
        <Glass key={i} className="mt"><div className="between"><b className="small">{r.q}</b>
          <span className="chip" style={{ borderColor: confAr[r.confidence][1] }}>{confAr[r.confidence][0]}</span></div>
          <div className="tiny mut mt">لماذا؟ {r.why}</div></Glass>
      ))}
      <div className="tiny mut mt">⚠️ توقعات تدريبية وليست ضماناً — لا ندّعي معرفة سؤال الامتحان الفعلي.</div>
      </>}
    </div>
  );
}

export function Weakness() {
  const { s } = useStore();
  const concepts = s.materials.flatMap(m => m.units.flatMap(u => u.lessons.flatMap(l => l.concepts)));
  const [map, setMap] = useState<{ root: string; chain: string[]; fix: string }[] | null>(null);
  return (
    <div><h1>🕳️ خريطة اكتشاف الضعف</h1>
      <div className="small mut mb">الخطأ المتكرر في مفهوم يُربط بالمفاهيم السابقة لكشف المشكلة الجذرية.</div>
      <Btn kind="pri" sm onClick={() => setMap(weaknessMap(s.errors, concepts))}><MapIcon size={13} /> اكتشاف الجذور</Btn>
      {map?.length ? map.map((w, i) => (
        <Glass key={i} level={2} className="mt glow-purple"><b>🎯 المشكلة الأساسية قد تكون هنا: {w.root}</b>
          <div className="mt small">{w.chain.map((c, j) => <div key={j}>{'↓ '.repeat(0)}{j > 0 ? '↓ ' : '• '}{c}</div>)}</div>
          <div className="small mt">🛠️ {w.fix}</div></Glass>
      )) : map && <Glass className="mt small">لا ضعف متكرر — ممتاز! استمر.</Glass>}
    </div>
  );
}

export function AIAssistant() {
  const { s } = useStore();
  const [open, setOpen] = useState(false);
  return (
    <div><h1>✨ مساعد الدراسة + AI Home</h1>
      <div className="grid2">
        {[
          ['🤖 المعلّم', 'شرح وتدريب سقراطي', 'ai-tutor'], ['🧭 المدرّب', 'قرارات استراتيجية مبررة', 'ai-coach'],
          ['🌍 أمثلة واقعية', 'من السيارة والسوق والمطبخ', 'ai-examples'], ['📖 قصص', 'تذكر دون تحريف', 'ai-stories'],
          ['🔮 المتنبئ', 'أسئلة مرجحة بثقة', 'ai-predictor'], ['🕳️ الضعف', 'الجذر لا العرض', 'ai-weak'],
        ].map(([t, d]) => (
          <Glass key={t}><b className="small">{t}</b><div className="tiny mut">{d}</div></Glass>
        ))}
      </div>
      <Glass level={2} className="mt"><div className="between"><div><b><Sparkles size={13} /> ذاكرة AI عنك</b>
        <div className="tiny mut">مستواك ~{Math.round(s.materials.reduce((a, m) => a + m.mastery, 0) / Math.max(1, s.materials.length))}% • أخطاؤك {s.errors.length} • هدفك: {s.planGoal.slice(0, 50)}</div></div>
        <Btn sm onClick={() => setOpen(true)}>عرض</Btn></div></Glass>
      {open && <Sheet title="🧠 ماذا يتذكر عنك AI؟" onClose={() => setOpen(false)}>
        {[`المواد: ${s.materials.map(m => `${m.name} (${m.mastery}%)`).join('، ')}`, `الأخطاء المفتوحة: ${s.errors.filter(e => !e.resolved).length}`, `الهدف: ${s.planGoal}`, `الامتحان: ${s.examDate}`, `الجامعة: ${s.targetUni.uni} — ${s.targetUni.major}`].map((x, i) => <div key={i} className="small" style={{ padding: '6px 0' }}>• {x}</div>)}
        <div className="tiny mut mt">تُستخدم هذه البيانات لتخصيص كل إجابة وتوصية.</div>
      </Sheet>}
      <Glass className="mt"><h2><Lightbulb size={14} /> قدرات الدمج</h2>
        <div className="small">مدرّس + مدرّب + مخطط + مكتبة + مراجعة + محلل + مساحة دراسة — في مكان واحد يعرف: ماذا درست؟ ماذا فهمت؟ ماذا نسيت؟ لماذا أخطأت؟ وماذا تراجع غداً؟</div></Glass>
    </div>
  );
}

export function BrainIcon() { return <Brain size={14} />; }
