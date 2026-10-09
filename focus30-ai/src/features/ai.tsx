import { useState } from 'react';
import { Brain, GraduationCap, Lightbulb, Send, Sparkles, Map as MapIcon, Telescope, Cpu } from 'lucide-react';
import { useStore, addXP } from '../core/store';
import { coachAdvices, forgettingQueue, predictQuestions, similarity, gradeOf, weaknessMap } from '../core/ai';
import { buildBrainContext } from '../core/brain';
import { PROVIDERS, clearRemoteCfg, getProviderId, getRemoteCfg, remoteExplain, setProviderId, setRemoteCfg } from '../core/providers';
import { runSelfTests, type SelfTest } from '../core/selftest';
import { Btn, Chip, Glass, Sheet } from '../ui/kit';
import { AutoMath } from '../ui/math';
import { EmptyContent } from './study';

export type TutorLevel = 1 | 2 | 3;
export type TutorAct = 'explain' | 'teach' | 'ask' | 'hint' | 'check' | 'mistake' | 'practice' | 'exam';

export function Tutor({ go }: { go?: (t: string) => void }) {
  const { s, set } = useStore();
  void set;
  const [level, setLevel] = useState<TutorLevel>(2);
  const [act, setAct] = useState<TutorAct>('explain');
  const [q, setQ] = useState('');
  const [chat, setChat] = useState<{ me: string; ai: string; src: string; grounded: boolean }[]>([]);
  const [checkAns, setCheckAns] = useState('');
  const [verdict, setVerdict] = useState<string | null>(null);
  const [remoteBusy, setRemoteBusy] = useState(false);
  const [remoteOut, setRemoteOut] = useState<string | null>(null);
  const [remoteErr, setRemoteErr] = useState<string | null>(null);
  const providerId = getProviderId();
  const concepts = s.materials.flatMap(m => m.units.flatMap(u => u.lessons.flatMap(l => l.concepts.map(c => ({ ...c, lesson: l.title, mat: m.name, ref: l.sourceRef })))));
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
  const ACTS: { id: TutorAct; n: string; icon: string }[] = [
    { id: 'explain', n: 'اشرح', icon: '💡' }, { id: 'teach', n: 'درّسني', icon: '👨‍🏫' },
    { id: 'ask', n: 'اسألني', icon: '❓' }, { id: 'hint', n: 'تلميح', icon: '🔦' },
    { id: 'check', n: 'صحح إجابتي', icon: '✅' }, { id: 'mistake', n: 'أين خطئي؟', icon: '🔍' },
    { id: 'practice', n: 'درّبني', icon: '🎯' }, { id: 'exam', n: 'اختبرني', icon: '⏱️' },
  ];
  const answer = (query: string, a: TutorAct, lvl: TutorLevel) => {
    const rel = relatedOf(query);
    const open = s.errors.filter(e => !e.resolved);
    const myErr = rel ? open.find(e => e.conceptId === rel.id) : undefined;
    const head = lvl === 1
      ? `📖 شرح مباشر:`
      : lvl === 2
        ? `👤 شرح تكيفي (إتقانك ${rel ? `${rel.mastery}% في هذا المفهوم` : `${avg}% عاماً`}${myErr ? ` • خطؤك المسجل: ${myErr.reason}` : ''}):`
        : `❓ سقراطي — لن أجيب مباشرة:`;
    let body = '';
    let grounded = !!rel;
    if (a === 'check') {
      const v = checkAns.trim() ? similarity(checkAns, rel?.detail ?? '') : 0;
      const g = gradeOf(v);
      setVerdict(rel
        ? (g === 'correct' ? `✅ صحيح (${Math.round(v * 100)}%) — مطابق لمصدرك.` : g === 'partial' ? `🟡 صحيح جزئياً (${Math.round(v * 100)}%) — قارن إجابتك بالنص: «${rel.detail.slice(0, 120)}…»` : `❌ غير صحيح (${Math.round(v * 100)}%) — النموذجية من مصدرك: «${rel.detail.slice(0, 140)}…»`)
        : '🔎 سؤالك خارج مصادرك — أضف الدرس لأصحح من مصدرك بدقة.');
      return;
    }
    if (a === 'mistake') {
      body = myErr ? `🔍 خطؤك في «${rel?.title}»: أجبت «${myErr.userAnswer}» والصحيح «${myErr.correctAnswer}». السبب الجذري: ${myErr.reason}. تكرر ${myErr.count} مرات — عالجه من بنك الأخطاء.`
        : rel ? `✅ لا أخطاء مسجلة على «${rel.title}» — استمر، والمراجعة المجدولة تحميك.`
        : open.length ? `🔍 لديك ${open.length} أخطاء مفتوحة، أولها: «${open[0].question.slice(0, 60)}…» — السبب: ${open[0].reason}` : '✅ لا أخطاء مفتوحة — ممتاز.';
    } else if (a === 'ask') {
      body = rel ? `❓ سؤالي لك (أجب قبل أن أكمل): ما الفرق الجوهري بين «${rel.title}» وما يشبهه؟ اكتب سطرين.` : '❓ أخبرني أولاً: ما الذي تعرفه عن الموضوع؟ سطر واحد يكفي.';
    } else if (a === 'hint') {
      body = rel ? `🔦 تلميح (لا الحل): ركّز على هذه الكلمات من مصدرك: ${rel.detail.split(/\s+/).slice(0, 5).join(' ')}… — حاول خطوة واحدة.` : '🔦 حدد المفهوم أولاً من دروسك وسألمّح لك منه.';
    } else if (a === 'practice' || a === 'exam') {
      body = rel ? `🎯 حوّلت «${rel.title}» لجلسة: ${a === 'exam' ? 'مؤقت + ضغط' : 'بلا ضغط'}. اضغط الزر بالأسفل للبدء — الأسئلة من مصدرك.` : '🎯 اختر مفهوماً من دروسك أولاً.';
    } else if (!rel) {
      grounded = false;
      body = `🔎 «${query}» خارج مصادرك المدخلة — إجابتي معرفة عامة [External Knowledge] وليست من مصدرك. أضف الدرس لتصبح إجاباتي من مصدرك بدقة.\n\n${lvl === 3 ? 'سؤال سقراطي: ما الذي يجعلك تظن أن إجابتي صحيحة؟ تحقق من مصدرك.' : 'الفكرة العامة: ابحث عن التعريف والقانون والمثال — ثم أضف الدرس وسأشرحه من مصدرك.'}`;
    } else if (lvl === 3) {
      body = `${head}\nمن مصدرك «${rel.lesson}»: «${rel.detail}»\n\n❓ قبل أن أشرح: ما الذي فهمته أنت من هذه الفقرة؟ اكتب سطراً، وسأبني عليه.`;
    } else if (a === 'teach') {
      body = `${head}\n① الفكرة بكلمات بسيطة: ${rel.detail}\n② طريقة إتقان هذا النوع: ${rel.kind === 'law' ? 'اكتب المعطى والمطلوب والوحدات قبل التعويض' : rel.kind === 'definition' ? 'احفظ الصياغة ثم افهم كل كلمة' : 'أعد الصياغة بكلماتك'}\n③ الفخ الأشهر: ${myErr ? myErr.reason : 'الخلط مع مفهوم قريب — قارن دائماً'}`;
    } else {
      body = `${head}\n${rel.detail}\n\n💡 مثال يقربها: ${rel.kind === 'example' ? rel.detail.slice(0, 100) : 'طبّقها على موقف من يومك وستثبت'}`;
    }
    const src = rel ? `Source Used: ${rel.mat} / ${rel.lesson} — الفقرة ${rel.section + 1} • إتقانك ${rel.mastery}% • استرجاعك ${rel.recallStrength}%` : 'بدون مصدر — معرفة عامة';
    setChat([...chat, { me: query || ACTS.find(x => x.id === a)!.n, ai: body, src, grounded }]);
  };
  const send = () => {
    const query = q.trim();
    if (act === 'check') { answer(query || 'تصحيح إجابتي', 'check', level); return; }
    if (!query && (act === 'practice' || act === 'exam')) { go?.(act === 'exam' ? 'study-tests' : 'study-recall'); return; }
    if (!query) return;
    answer(query, act, level);
    setQ(''); setRemoteOut(null); setRemoteErr(null);
  };
  const askRemote = async () => {
    const lastQ = q.trim() || chat[chat.length - 1]?.me || '';
    if (!lastQ || remoteBusy) return;
    setRemoteBusy(true); setRemoteOut(null); setRemoteErr(null);
    const rel = relatedOf(lastQ);
    const r = await remoteExplain(lastQ, rel?.detail ?? '', buildBrainContext(s));
    if ('error' in r) setRemoteErr(r.error);
    else setRemoteOut(r.text);
    setRemoteBusy(false);
  };
  return (
    <div>
      <div className="between mb"><h1>🤖 المعلّم الذكي</h1><Chip on>{concepts.length ? `يعرف ${concepts.length} مفهوماً من مصادرك` : 'بانتظار مصادرك'}</Chip></div>
      <div className="small mut mb">يجيب أولاً من مصدرك، ويعرض المصدر المستخدم دائماً. خارج المصدر = [External Knowledge] معلن.</div>
      <label className="lbl">المستوى</label>
      <div className="wrap mb">
        <Chip on={level === 1} onClick={() => setLevel(1)}>1️⃣ شرح مباشر</Chip>
        <Chip on={level === 2} onClick={() => setLevel(2)}>2️⃣ تكيفي (أخطاؤك)</Chip>
        <Chip on={level === 3} onClick={() => setLevel(3)}>3️⃣ سقراطي</Chip>
      </div>
      <div className="tabs">{ACTS.map(m => <button key={m.id} className={`chip tab ${act === m.id ? 'on' : ''}`} onClick={() => { setAct(m.id); setVerdict(null); }}>{m.icon} {m.n}</button>)}</div>
      {act === 'check' && (
        <Glass level={2} className="mb"><label className="lbl">الصق إجابتك لأصححها من مصدرك</label>
          <textarea placeholder="إجابتك هنا…" value={checkAns} onChange={e => setCheckAns(e.target.value)} />
          {verdict && <div className="small mt pop">{verdict}</div>}</Glass>
      )}
      {!chat.length && (
        <Glass level={2} className="mb"><div className="small">اسأل عن أي درس مرفوع — سأطابقه مع مصدرك وأعرض <b>Source Used</b>. جرّب وضع «أين خطئي؟» أو «اسألني».</div></Glass>
      )}
      <div style={{ display: 'grid', gap: 10 }}>
        {chat.map((c, i) => (
          <div key={i}>
            <div className="row" style={{ justifyContent: 'flex-end' }}><div className="glass pad" style={{ maxWidth: '85%', background: 'linear-gradient(135deg,rgba(34,211,238,.18),rgba(167,139,250,.18))' }}><div className="small">{c.me}</div></div></div>
            <div className="row mt" style={{ alignItems: 'flex-start' }}><GraduationCap size={16} color="#a78bfa" />
              <div style={{ flex: 1 }}><Glass>
                <div className="small" style={{ whiteSpace: 'pre-line' }}><AutoMath text={c.ai} /></div>
                <div className="tiny mt" style={{ color: c.grounded ? '#34d399' : '#fbbf24' }}>📚 {c.src}</div>
              </Glass></div></div>
          </div>
        ))}
      </div>
      <div className="row mt"><input placeholder="اسأل عن درس مرفوع… (يطابق مصادرك تلقائياً)" value={q} onChange={e => setQ(e.target.value)} onKeyDown={e => e.key === 'Enter' && send()} />
        <Btn kind="pri" onClick={send}><Send size={14} /></Btn></div>
      <div className="mt wrap">
        <Chip on={providerId === 'local'}>🧠 المحرك: {providerId === 'local' ? 'محلي مجاني' : 'خارجي (اختياري)'}</Chip>
        {providerId !== 'local' && <Btn sm disabled={remoteBusy} onClick={askRemote}>✨ {remoteBusy ? 'يتصل بالمزود…' : 'صياغة خارجية محسّنة'}</Btn>}
      </div>
      {remoteErr && <Glass className="mt"><div className="small">⚠️ {remoteErr}</div></Glass>}
      {remoteOut && <Glass level={2} className="mt pop"><h3>✨ صياغة خارجية [External Knowledge]</h3>
        <div className="small" style={{ whiteSpace: 'pre-line' }}><AutoMath text={remoteOut} /></div>
        <div className="tiny mut mt">من مزودك الخارجي — تحقق منها مقابل مصدرك قبل الاعتماد.</div></Glass>}
      <div className="tiny mut mt">🔒 خارج المصدر يُوسم [External Knowledge] — لا يُقدَّم كحقيقة من مصدرك أبداً.</div>
    </div>
  );
}

export function Coach() {
  const { s, set } = useStore();
  const [showErrors, setShowErrors] = useState(false);
  const [rejected, setRejected] = useState<string[]>([]);
  const adv = coachAdvices(s).filter(a => !rejected.includes(a.title));
  const runAct = (act: 'night' | 'review3') => {
    if (act === 'night') { set(p => ({ ...p, nightMode: true })); return; }
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
            <button className="btn sm ghost" onClick={() => setRejected([...rejected, a.title])}>رفض التوصية ✕</button>
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
      <ProviderSettings />
      <div className="grid2 mt">
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

/** محرك AI: اختيار النموذج (محلي مجاني افتراضياً) + مفاتيحك + فحص الجودة — بلا اشتراك إجباري */
export function ProviderSettings() {
  const [sel, setSel] = useState(getProviderId());
  const [cfg, setCfg] = useState(getRemoteCfg());
  const [saved, setSaved] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testMsg, setTestMsg] = useState<string | null>(null);
  const [tests, setTests] = useState<SelfTest[] | null>(null);
  const [running, setRunning] = useState(false);
  const def = PROVIDERS.find(p => p.id === sel) ?? PROVIDERS[0];
  return (
    <Glass level={2} className="glow-cyan">
      <div className="between"><h2><Cpu size={14} /> محرك AI المركزي</h2><Chip on={sel === 'local'}>{sel === 'local' ? 'محلي مجاني' : 'خارجي'}</Chip></div>
      <div className="small mut">العقل المركزي يعمل فوق كل الأنظمة. الافتراضي محلي ومجاني وغير محدود — الخارجي اختياري بمفاتيحك أنت.</div>
      <label className="lbl">النموذج النشط (يُبدَّل بضغطة)</label>
      <div className="wrap">{PROVIDERS.map(p => <Chip key={p.id} on={sel === p.id} onClick={() => { setSel(p.id); setProviderId(p.id); setSaved(false); }}>{p.label}</Chip>)}</div>
      <div className="small mt"><b>حدوده المعلنة:</b> <span className="mut">{def.limits}</span></div>
      {sel !== 'local' && (
        <div className="mt">
          <label className="lbl">baseURL (واجهة OpenAI-compatible لمزودك المجاني/الخاص)</label>
          <input placeholder="https://api.example.com/v1" value={cfg.baseURL} onChange={e => setCfg({ ...cfg, baseURL: e.target.value })} dir="ltr" />
          <label className="lbl">المفتاح (يُحفظ في جهازك فقط)</label>
          <input type="password" placeholder="sk-…" value={cfg.apiKey} onChange={e => setCfg({ ...cfg, apiKey: e.target.value })} dir="ltr" />
          <label className="lbl">اسم النموذج</label>
          <input placeholder="مثال: gpt-4o-mini" value={cfg.model} onChange={e => setCfg({ ...cfg, model: e.target.value })} dir="ltr" />
          <div className="mt wrap">
            <Btn sm kind="pri" onClick={() => { setRemoteCfg(cfg); setSaved(true); setTestMsg(null); }}>حفظ في جهازي ✓</Btn>
            <Btn sm onClick={() => { clearRemoteCfg(); setCfg({ baseURL: '', apiKey: '', model: '' }); setSaved(false); }}>مسح المفاتيح</Btn>
            <Btn sm disabled={testing} onClick={() => void (async () => {
              setTesting(true); setTestMsg('اختبار الاتصال…');
              const r = await remoteExplain('قل: تم', '', { avgMastery: 0, weakMat: '', weakMastery: 0, dueCount: 0, openErrors: 0, daysLeft: null, planGoal: '', recentAccuracy: -1, recentCount: 0, streak: 0, conceptsCount: 0, lessonsCount: 0 });
              setTestMsg('error' in r ? `⚠️ ${r.error}` : `✅ متصل — رد المزود: ${r.text.slice(0, 80)}`);
              setTesting(false);
            })()}>{testing ? 'يختبر…' : 'اختبار الاتصال'}</Btn>
          </div>
          {saved && <div className="tiny mt" style={{ color: '#34d399' }}>✓ محفوظ محلياً — لن يعمل إلا ضمن حصص مزودك.</div>}
          {testMsg && <div className="small mt">{testMsg}</div>}
        </div>
      )}
      <div className="mt wrap"><Btn sm kind="pri" disabled={running} onClick={() => { setRunning(true); setTimeout(() => { setTests(runSelfTests()); setRunning(false); }, 30); }}>{running ? 'يفحص…' : '🧪 تشغيل فحص الجودة'}</Btn></div>
      {tests && (
        <div className="mt" style={{ display: 'grid', gap: 6 }}>
          {tests.map((t, i) => (
            <div key={i} className="task"><span>{t.passed ? '✅' : '❌'}</span>
              <div style={{ flex: 1 }}><div className="small" style={{ fontWeight: 600 }}>{t.name}</div>
                <div className="tiny mut">{t.detail}</div></div></div>
          ))}
          <div className="tiny mut">الفشل هنا يعني خللاً حقيقياً — أصلحه قبل اعتبار الميزة مكتملة.</div>
        </div>
      )}
    </Glass>
  );
}
