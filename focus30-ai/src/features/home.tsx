import React, { useMemo, useState } from 'react';
import { BookOpen, Brain, ChevronLeft, Clock, Flame, Moon, Plus, Sparkles, Target, Timer, Trophy, Bell, Building2, Flag } from 'lucide-react';
import { useStore, addXP } from '../core/store';
import type { Task } from '../core/types';
import { addDays, todayISO, uid } from '../core/types';
import { build30Day, coachAdvices, decisionQueue, forgettingQueue, masteryAfter, smartSearch, uniScenarios, similarity as simOf, gradeOf } from '../core/ai';
import { Area, Bar, Btn, Chip, Glass, MasteryDot, Modal, Radar, Ring, Sheet } from '../ui/kit';
import { AttachSheet, AttList, collectFiles, useFilePicker, type AttFile } from '../ui/attach';
import { str } from '../core/i18n';

const DAYS = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];

export function Home({ go }: { go: (t: string) => void }) {
  const { s, set } = useStore();
  const t = str[s.lang];
  const todayTasks = s.tasks.filter(x => x.date === todayISO());
  const doneT = todayTasks.filter(x => x.done).length;
  const due = forgettingQueue(s);
  const adv = coachAdvices(s)[0];
  const planDone = s.plan.filter(p => p.done).length;
  const weak = useMemo(() => {
    let worst = { m: 100, name: '' };
    for (const m of s.materials) if (m.mastery < worst.m) worst = { m: m.mastery, name: m.name };
    return worst;
  }, [s.materials]);
  const [reviewFor, setReviewFor] = useState<string | null>(null);
  const lessonsCount = s.materials.reduce((a, m) => a + m.units.reduce((b, u) => b + u.lessons.length, 0), 0);

  return (
    <div>
      <div className="topbar">
        <div className="brand">
          <div className="logo">F</div>
          <div><div style={{ fontWeight: 700 }}>Focus30 AI</div>
            <div className="tiny mut">{t.greeting_m} 👋 • {t.focus}</div></div>
        </div>
        <div className="xp">
          <Chip><Flame size={13} color="#fb923c" /> {s.streak}</Chip>
          <Chip><Sparkles size={13} color="#22d3ee" /> Lv{s.level}</Chip>
        </div>
      </div>

      {/* smart search */}
      <SearchBar />

      <DecisionCenter go={go} />

      {lessonsCount === 0 && (
        <Glass level={3} className="mb glow-purple pop">
          <h2>👋 أهلاً بك في Focus30 AI</h2>
          <div className="small">التطبيق فارغ عمداً — لا أسئلة ولا مهام جاهزة. ابدأ بإدخال أول درس حقيقي:</div>
          <div className="small mt" style={{ display: 'grid', gap: 4 }}>
            <div>📸 1. صوّر صفحة من كتابك أو ملاحظاتك</div>
            <div>✨ 2. سيحللها AI إلى مفاهيم وبطاقات وأسئلة</div>
            <div>🧠 3. ابدأ التذكّر النشط من محتواك أنت</div>
          </div>
          <div className="mt"><Btn kind="pri" onClick={() => go('study-materials')}><Plus size={14} /> إضافة أول درس</Btn></div>
        </Glass>
      )}

      {/* forgetting alert → opens a real Review Card from the same concept */}
      {s.notifPrefs.forgetting && due[0] && (
        <Glass level={2} className="mb glow-cyan">
          <div className="between">
            <div className="row"><Brain size={18} color="#22d3ee" />
              <div><div style={{ fontWeight: 700 }}>🧠 حان وقت مراجعة هذا المفهوم</div>
                <div className="small mut">{due[0].concept.title.slice(0, 60)} • {due[0].why}</div></div></div>
            <Btn sm kind="pri" onClick={() => setReviewFor(due[0].concept.id)}>راجع الآن</Btn>
          </div>
        </Glass>
      )}
      {reviewFor && <ReviewCard conceptId={reviewFor} onClose={() => setReviewFor(null)} />}

      <div className="grid2">
        <Glass>
          <div className="between"><h2>{t.tasksToday}</h2><span className="small mut">{doneT}/{todayTasks.length}</span></div>
          <Bar v={todayTasks.length ? (doneT / todayTasks.length) * 100 : 0} />
          <div className="mt" style={{ display: 'grid', gap: 8 }}>
            {todayTasks.slice(0, 3).map(x => <TaskRow key={x.id} task={x} />)}
            {!todayTasks.length && <div className="small mut">لا مهام اليوم — أضف واحدة من تبويب اليوم.</div>}
          </div>
          <div className="mt"><Btn sm onClick={() => go('today')}>عرض اليوم <ChevronLeft size={13} /></Btn></div>
        </Glass>
        <Glass>
          <h2>{t.reviewsDue} ({due.length})</h2>
          <div style={{ display: 'grid', gap: 8 }}>
            {due.slice(0, 3).map((d, i) => (
              <div key={i} className="row"><MasteryDot m={d.concept.mastery} />
                <div><div className="small" style={{ fontWeight: 600 }}>{d.concept.title.slice(0, 42)}</div>
                  <div className="tiny mut">{d.material} • خطر النسيان {Math.round(d.concept.forgetRisk * 100)}%</div></div></div>
            ))}
          </div>
          <div className="mt"><Btn sm onClick={() => go('study-cards')}>{t.dueCards}</Btn></div>
        </Glass>
      </div>

      <Glass level={2} className="mt">
        <div className="between"><h2>💡 {t.coach} يقترح</h2><Chip>AI</Chip></div>
        {adv ? <><div style={{ fontWeight: 600 }}>{adv.title}</div>
          <div className="small mut" style={{ margin: '6px 0' }}>{adv.reason}</div>
          <div className="small">👉 {adv.action}</div></> : <div className="small mut">لا توصيات.</div>}
        <div className="mt wrap"><Btn sm kind="pri" onClick={() => go('ai-coach')}>{t.openCoach}</Btn>
          <Btn sm onClick={() => set(p => ({ ...p, nightMode: !p.nightMode }))}><Moon size={13} /> {t.nightMode}</Btn></div>
      </Glass>

      <div className="grid2 mt">
        <Glass><div className="between"><h2>{t.plan30}</h2><span className="small mut">{planDone}/30</span></div>
          <Bar v={(planDone / 30) * 100} />
          <div className="small mut mt">{s.planGoal}</div>
          <div className="mt"><Btn sm onClick={() => go('study-plan')}>فتح الخطة</Btn></div></Glass>
        <Glass><h2>🎯 {t.upcomingExam}</h2>
          <Countdown />
          <div className="mt"><Btn sm onClick={() => go('study-tests')}>محاكي ضغط الوقت</Btn></div></Glass>
      </div>

      <Glass className="mt">
        <div className="between"><h2>⚖️ {t.weakness}: {weak.name} ({weak.m}%)</h2></div>
        <SubjectRadar mini />
      </Glass>

      <Glass className="mt">
        <h2>⚡ {t.quickActions}</h2>
        <div className="wrap">
          <Btn sm kind="pri" onClick={() => go('study-recall')}><Brain size={13} /> {t.startRecall}</Btn>
          <Btn sm onClick={() => go('study-cards')}>🃏 {t.dueCards}</Btn>
          <Btn sm onClick={() => go('ai-tutor')}><BookOpen size={13} /> {t.tutor}</Btn>
          <Btn sm onClick={() => go('stats-city')}><Building2 size={13} /> مدينتي</Btn>
        </div>
      </Glass>

      <div className="tiny mut mt" style={{ textAlign: 'center' }}>🔒 {t.trust}</div>
    </div>
  );
}

/** 7+28+34. DECISION CENTER + STUDY QUEUE + bundled notifications entry */
export function DecisionCenter({ go }: { go: (t: string) => void }) {
  const { s } = useStore();
  const items = decisionQueue(s);
  const now = items.filter(x => x.when === 'now');
  const next = items.filter(x => x.when === 'next');
  const later = items.filter(x => x.when === 'later');
  const col = (title: string, list: typeof items, icon: string) => (
    <div className="qcol">
      <div className="small" style={{ fontWeight: 700, marginBottom: 6 }}>{icon} {title}</div>
      <div style={{ display: 'grid', gap: 6 }}>
        {list.map((q, i) => (
          <button key={i} className="task" style={{ cursor: 'pointer', fontFamily: 'inherit', color: 'inherit', textAlign: 'start' }} onClick={() => go(q.go)}>
            <div style={{ flex: 1 }}><div className="small" style={{ fontWeight: 600 }}>{q.title}</div>
              <div className="tiny mut">{q.reason}{q.detail ? ` • ${q.detail}` : ''}</div></div>
          </button>
        ))}
        {!list.length && <div className="tiny mut">—</div>}
      </div>
    </div>
  );
  return (
    <Glass level={2} className="mb glow-cyan">
      <div className="between"><h2>🧭 ماذا أدرس الآن؟</h2><Chip on>قرار حي</Chip></div>
      <div className="qcols">
        {col('الآن', now, '🔴')}{col('التالي', next, '🟡')}{col('لاحقاً', later, '🟢')}
      </div>
    </Glass>
  );
}

/** 11. REVIEW CARD — النسيان يفتح بطاقة/سؤالاً من نفس المفهوم لا تنبيهاً عاماً */
export function ReviewCard({ conceptId, onClose }: { conceptId: string; onClose: () => void }) {
  const { s, set } = useStore();
  const [ans, setAns] = useState('');
  const [done, setDone] = useState(false);
  const [t0] = useState(Date.now());
  const found = s.materials.flatMap(m => m.units.flatMap(u => u.lessons.flatMap(l => l.concepts.map(c => ({ ...c, lesson: l.title, mat: m.name }))))).find(c => c.id === conceptId);
  if (!found) return null;
  const q = s.recallBank.find(x => x.conceptId === conceptId) ?? s.flashcards.find(x => x.conceptId === conceptId);
  const finish = () => {
    const timeMs = Date.now() - t0;
    const v = ans.trim() ? simOf(ans, found.detail) : 0;
    const g = gradeOf(v);
    const patch = masteryAfter(found, g === 'correct', 3, timeMs, g);
    set(p => ({
      ...p,
      attempts: [...p.attempts, { id: uid('a'), date: todayISO(), conceptId, kind: 'review-card', correct: g === 'correct', grade: g, timeMs, confidence: 3 as const }],
      materials: p.materials.map(m => ({
        ...m, units: m.units.map(u => ({ ...u, lessons: u.lessons.map(l => ({ ...l, concepts: l.concepts.map(c => c.id === conceptId ? { ...c, ...patch } : c) })) })),
      })),
    }));
    if (g === 'correct') addXP(set, 10);
    setDone(true);
  };
  return (
    <Sheet title={`🧠 بطاقة مراجعة: ${found.title.slice(0, 45)}`} onClose={onClose}>
      <div className="tiny mut">📚 {found.mat} / {found.lesson} • خطر النسيان {Math.round(found.forgetRisk * 100)}% • قوة الاسترجاع {found.recallStrength}%</div>
      {!done ? <>
        <Glass className="mt"><div className="small" style={{ fontWeight: 700 }}>{q ? ('prompt' in q ? (q as { prompt: string }).prompt : (q as { front: string }).front) : `اشرح: ${found.title}`}</div></Glass>
        <div className="mt"><textarea placeholder="أجب من ذاكرتك…" value={ans} onChange={e => setAns(e.target.value)} /></div>
        <div className="mt wrap"><Btn kind="pri" sm disabled={ans.trim().length < 2} onClick={finish}>قيّم 🔍</Btn></div>
      </> : <>
        <Glass className="mt"><div className="small">{found.detail}</div>
          <div className="small mut mt">حُدثت قوة الاسترجاع والمراجعة القادمة من هذه البطاقة.</div></Glass>
        <div className="mt"><Btn kind="pri" sm onClick={onClose}>تم ✓</Btn></div>
      </>}
    </Sheet>
  );
}

/** 34. SMART NOTIFICATION CENTER — مجمّعة لا عشرات التنبيهات */
export function NotifBell() {
  const { s } = useStore();
  const [open, setOpen] = useState(false);
  const [review, setReview] = useState<string | null>(null);
  const due = s.notifPrefs.forgetting ? forgettingQueue(s) : [];
  const adv = s.notifPrefs.coach ? coachAdvices(s).slice(0, 2) : [];
  const count = (due.length ? 1 : 0) + adv.length;
  return (
    <span className="row">
      <button className="chip" onClick={() => setOpen(true)} aria-label="الإشعارات">🔔 {count > 0 ? count : 'لا جديد'}</button>
      {open && (
        <Sheet title="🔔 مركز الإشعارات الذكي" onClose={() => setOpen(false)}>
          {due.length > 0 && (
            <Glass level={2} className="mb"><h3>🧠 لديك {due.length} مراجعات مهمة (مجمّعة)</h3>
              {due.slice(0, 5).map((f, i) => (
                <div key={i} className="task mt"><div style={{ flex: 1 }}><div className="small" style={{ fontWeight: 600 }}>{f.concept.title.slice(0, 45)}</div>
                  <div className="tiny mut">{f.why}</div></div>
                  <Btn sm kind="pri" onClick={() => setReview(f.concept.id)}>راجع الآن</Btn></div>
              ))}
            </Glass>
          )}
          {adv.map((a, i) => <Glass key={i} className="mb"><b className="small">{a.title}</b><div className="tiny mut">{a.reason}</div></Glass>)}
          {!due.length && !adv.length && <div className="small mut">كل شيء هادئ — لا مراجعات مستحقة ولا تنبيهات.</div>}
          <NotifPrefsInline />
        </Sheet>
      )}
      {review && <ReviewCard conceptId={review} onClose={() => setReview(null)} />}
    </span>
  );
}

function NotifPrefsInline() {
  const { s, set } = useStore();
  return (
    <div className="wrap mt">
      {(['forgetting', 'daily', 'coach'] as const).map(k => (
        <Chip key={k} on={s.notifPrefs[k]} onClick={() => set(p => ({ ...p, notifPrefs: { ...p.notifPrefs, [k]: !p.notifPrefs[k] } }))}>
          {k === 'forgetting' ? '🧠 النسيان' : k === 'daily' ? '📅 اليومي' : '💡 المدرّب'}
        </Chip>
      ))}
    </div>
  );
}

export function SearchBar() {  const { s } = useStore(); const t = str[s.lang];
  const [q, setQ] = useState('');
  const [res, setRes] = useState<{ section: string; text: string }[] | null>(null);
  return (
    <div className="mb">
      <input placeholder={t.searchPh} value={q} onChange={e => {
        setQ(e.target.value);
        if (e.target.value.length > 2) setRes(smartSearch(s, e.target.value));
        else setRes(null);
      }} />
      {res && (
        <Glass level={2} className="mt">
          {res.map((r, i) => <div key={i} className="small" style={{ padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,.06)' }}><span className="chip" style={{ marginInlineEnd: 6 }}>{r.section}</span>{r.text}</div>)}
        </Glass>
      )}
    </div>
  );
}

export function TaskRow({ task }: { task: Task }) {
  const { s, set } = useStore();
  const m = s.materials.find(x => x.id === task.materialId);
  return (
    <div className={`task ${task.done ? 'done' : ''}`}>
      <button className={`check ${task.done ? 'on' : ''}`} aria-label="إتمام"
        onClick={() => {
          set(p => ({ ...p, tasks: p.tasks.map(x => x.id === task.id ? { ...x, done: !x.done } : x) }));
          if (!task.done) addXP(set, 15);
        }}>✓</button>
      <div style={{ flex: 1 }}><div className="tt small" style={{ fontWeight: 600 }}>{task.title}</div>
        <div className="tiny mut">{m?.name} • {task.mins} د • {task.kind}</div></div>
      <MasteryDot m={m?.mastery ?? 50} />
      <button className="btn sm ghost" aria-label="حذف المهمة" title="حذف"
        onClick={() => set(p => ({ ...p, tasks: p.tasks.filter(x => x.id !== task.id) }))}>🗑️</button>
    </div>
  );
}

export function Countdown() {
  const { s, set } = useStore();
  const stamp = new Date(s.examDate).getTime();
  const days = Number.isFinite(stamp) ? Math.max(0, Math.ceil((stamp - Date.now()) / 864e5)) : null;
  const units = s.materials.flatMap(m => m.units.map(u => ({ m: m.name, t: u.title, v: u.mastery })));
  return (
    <div>
      <div className="between"><span className="small mut">📅 {s.examDate || '—'}</span>{days === null
        ? <Chip>⚠️ حدد تاريخ الامتحان بالأسفل</Chip>
        : <Chip on={false}><Flag size={12} /> بعد {days} يوم</Chip>}</div>
      <div className="mt" style={{ display: 'grid', gap: 8 }}>
        {units.map((u, i) => (
          <div key={i}><div className="between small"><span>{u.t}</span><span className="mut">{u.v}%</span></div>
            <Bar v={u.v} /></div>
        ))}
      </div>
      <div className="mt wrap">
        <input type="date" value={s.examDate} onChange={e => set(p => ({ ...p, examDate: e.target.value }))} style={{ maxWidth: 170 }} />
      </div>
      {s.milestones.map(m => (
        <div key={m.id} className="mt"><div className="between small"><span>🏁 {m.title}</span><span className="mut">{m.progress}%</span></div><Bar v={m.progress} /></div>
      ))}
    </div>
  );
}

export function Today() {
  const { s, set } = useStore();
  const [title, setTitle] = useState('');
  const [dismissed, setDismissed] = useState<string[]>([]);
  const t = todayISO();
  const list = s.tasks.filter(x => x.date === t);
  const add = () => {
    if (!title.trim()) return;
    set(p => ({ ...p, tasks: [...p.tasks, { id: uid('t'), title, materialId: p.materials[0]?.id ?? 'm1', date: t, mins: 25, kind: 'custom', done: false, priority: 2 }] }));
    setTitle('');
  };
  // مهام مقترحة ذكياً من طابور النسيان — ليست مفروضة: أضفها أو تجاهلها
  const suggestions = forgettingQueue(s)
    .filter(f => !list.some(x => x.lessonId && s.materials.flatMap(m => m.units.flatMap(u => u.lessons)).find(l => l.id === x.lessonId)?.concepts.some(c => c.id === f.concept.id)))
    .filter(f => !dismissed.includes(f.concept.id))
    .slice(0, 3);
  const addSuggestion = (conceptId: string, label: string, matId: string) => {
    const lesson = s.materials.flatMap(m => m.units.flatMap(u => u.lessons)).find(l => l.concepts.some(c => c.id === conceptId));
    set(p => ({
      ...p,
      tasks: [...p.tasks, { id: uid('t'), title: `مراجعة: ${label.slice(0, 45)}`, materialId: matId, lessonId: lesson?.id, date: t, mins: 15, kind: 'review', done: false, priority: 1 }],
    }));
  };
  // smart planner: free slots from schedule
  const busyToday = s.schedule.filter(b => b.day === new Date().getDay() && b.type !== 'free');
  return (
    <div>
      <h1>📅 اليوم</h1>
      <div className="small mut mb">{new Date().toLocaleDateString('ar', { weekday: 'long', day: 'numeric', month: 'long' })} • ركّز 30 دقيقة × جلسات</div>
      <Glass level={2}>
        <h2>➕ مهمة جديدة</h2>
        <div className="row"><input placeholder="مثال: مراجعة قوانين نيوتن (25 د)" value={title} onChange={e => setTitle(e.target.value)} />
          <Btn kind="pri" onClick={add}><Plus size={15} /></Btn></div>
      </Glass>
      <Glass className="mt">
        <div className="between"><h2>مهام اليوم ({list.filter(x => x.done).length}/{list.length})</h2>
          {list.some(x => x.done) && <Btn sm onClick={() => set(p => ({ ...p, tasks: p.tasks.filter(x => !(x.date === t && x.done)) }))}>🧹 مسح المنجزة</Btn>}</div>
        <div style={{ display: 'grid', gap: 8 }}>{list.map(x => <TaskRow key={x.id} task={x} />)}
          {!list.length && <div className="small mut">لا مهام اليوم — أضف واحدة يدوياً أو اقبل اقتراحاً ذكياً بالأسفل.</div>}</div>
      </Glass>
      {suggestions.length > 0 && (
        <Glass level={2} className="mt glow-cyan">
          <h2>✨ مقترحات ذكية (اختيارية — تجاهل ما لا يناسبك)</h2>
          <div style={{ display: 'grid', gap: 8 }}>
            {suggestions.map(f => (
              <div key={f.concept.id} className="task">
                <Brain size={15} color="#22d3ee" />
                <div style={{ flex: 1 }}><div className="small" style={{ fontWeight: 600 }}>{f.concept.title.slice(0, 50)}</div>
                  <div className="tiny mut">{f.material} • {f.why} • 15 د</div></div>
                <Btn sm kind="pri" onClick={() => addSuggestion(f.concept.id, f.concept.title, (s.materials.find(m => m.name === f.material)?.id ?? s.materials[0]?.id ?? 'm1'))}>+ أضف</Btn>
                <button className="btn sm ghost" onClick={() => setDismissed([...dismissed, f.concept.id])}>تجاهل</button>
              </div>
            ))}
          </div>
        </Glass>
      )}
      <Glass className="mt">
        <h2>🕒 الوقت المتاح اليوم (من الأسبوعي)</h2>
        {busyToday.length ? busyToday.map(b => (
          <div key={b.id} className="small between" style={{ padding: '6px 0' }}>
            <span>🚫 {b.label} ({b.start}–{b.end})</span><Chip>{b.type}</Chip></div>
        )) : <div className="small mut">لا التزامات مسجلة — يوم مفتوح للدراسة العميقة.</div>}
        <div className="small mut mt">المخطط الذكي لا يضع مهاماً أثناء المدرسة/الحصص/المواعيد تلقائياً.</div>
      </Glass>
      <DailyReport />
    </div>
  );
}

export function DailyReport() {
  const { s, set } = useStore();
  const log = s.logs.find(l => l.date === todayISO());
  const errs = s.errors.filter(e => !e.resolved).length;
  const top3 = decisionQueue(s).slice(0, 3);
  const makeTask = (title: string, matName?: string) => {
    const matId = (matName && s.materials.find(m => m.name === matName)?.id) ?? s.materials[0]?.id ?? 'm1';
    set(p => ({ ...p, tasks: [...p.tasks, { id: uid('t'), title, materialId: matId, date: addDays(todayISO(), 1), mins: 20, kind: 'review', done: false, priority: 1 }] }));
  };
  return (
    <Glass level={2} className="mt glow-purple">
      <h2>📊 التقرير اليومي</h2>
      <div className="grid2">
        <div><div className="tiny mut">مدة الدراسة</div><div style={{ fontWeight: 700 }}>{log?.minutes ?? 0} دقيقة</div></div>
        <div><div className="tiny mut">الدقة</div><div style={{ fontWeight: 700 }}>{log ? Math.round(100 * log.correct / Math.max(1, log.attempts)) : 0}% ({log?.correct ?? 0}/{log?.attempts ?? 0})</div></div>
      </div>
      <div className="mt small" style={{ display: 'grid', gap: 4 }}>
        <div>🏆 <b>أهم إنجاز اليوم:</b> {s.tasks.find(t => t.done)?.title ?? 'لم يُنجز بعد — ابدأ بمهمة واحدة صغيرة'}</div>
        <div>⚠️ <b>أكبر نقطة ضعف:</b> {s.errors[0]?.reason ?? 'لا أخطاء مسجلة اليوم'}</div>
      </div>
      <Glass className="mt"><h3>🎯 أولويات الغد (Top 3) — تتحول لمهام بضغطة</h3>
        {top3.map((q, i) => (
          <div key={i} className="task mt"><span className="chip">{i + 1}</span>
            <div style={{ flex: 1 }}><div className="small" style={{ fontWeight: 600 }}>{q.title}</div>
              <div className="tiny mut">{q.reason}</div></div>
            <Btn sm kind="pri" onClick={() => makeTask(q.title)}>+ مهمة</Btn></div>
        ))}
      </Glass>
      <div className="tiny mut mt">{errs} أخطاء مفتوحة • المراجعات القادمة تُحسب من FSRS لكل مفهوم.</div>
    </Glass>
  );
}

export function WeeklySchedule() {
  const { s, set } = useStore();
  const [confirm, setConfirm] = useState<string | null>(null);
  const [ocrText, setOcrText] = useState('');
  const [attachOpen, setAttachOpen] = useState(false);
  const [shots, setShots] = useState<AttFile[]>([]);
  const [preview, setPreview] = useState<{ day: number; start: string; end: string; label: string; type: 'school' | 'exam' | 'busy' }[]>([]);
  const [ocrBusy, setOcrBusy] = useState(false);
  const [ocrMsg, setOcrMsg] = useState<string | null>(null);
  const picker = useFilePicker(fl => {
    if (!fl) return;
    collectFiles(fl, t => setOcrText(prev => (prev ? prev + '\n' : '') + t)).then(fs => setShots(prev => [...prev, ...fs]));
  });
  // simulated OCR import
  const parsePreview = () => {
    if (ocrText.trim().length < 12) { setConfirm('النص قصير أو غير واضح. هل تقصد: الأحد 8-14 مدرسة؟ اضغط تأكيد لإضافة كتلة افتراضية، أو عدّل النص.'); return; }
    const days = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
    const found = days.map((d, i) => ({ d, i })).filter(x => ocrText.includes(x.d));
    const timeRe = /(\d{1,2})(?::(\d{2}))?\s*[-–—إلى]\s*(\d{1,2})(?::(\d{2}))?/g;
    const times = [...ocrText.matchAll(timeRe)].map(m => ({
      start: `${m[1].padStart(2, '0')}:${m[2] ?? '00'}`, end: `${m[3].padStart(2, '0')}:${m[4] ?? '00'}`,
    }));
    const rows = (found.length ? found : [{ d: 'الأحد', i: 0 }]).map((f, k) => ({
      day: f.i, start: times[k]?.start ?? '08:00', end: times[k]?.end ?? '14:00',
      label: /اختبار|امتحان/.test(ocrText) ? 'اختبار' : /مدرسة/.test(ocrText) ? 'المدرسة' : f.d,
      type: (/اختبار|امتحان/.test(ocrText) ? 'exam' : 'school') as 'school' | 'exam' | 'busy',
    }));
    setPreview(rows);
  };
  const savePreview = () => {
    set(p => ({ ...p, schedule: [...p.schedule, ...preview.map(r => ({ id: uid('s'), day: r.day as 0 | 1 | 2 | 3 | 4 | 5 | 6, start: r.start, end: r.end, label: r.label, type: r.type }))] }));
    setPreview([]); setOcrText(''); setShots([]); addXP(set, 20);
  };
  const runSchedOcr = async () => {
    const imgs = shots.filter(f => f.preview);
    if (!imgs.length || ocrBusy) return;
    setOcrBusy(true); setOcrMsg(null);
    try {
      const mod = await import('../core/ocr');
      const parts: string[] = [];
      for (const im of imgs) {
        const r = await mod.ocrImage(im.preview!);
        if ('text' in r) parts.push(r.text);
      }
      if (parts.length) { setOcrText(prev => (prev ? prev + '\n' : '') + parts.join('\n')); setOcrMsg(`✅ استُخرج النص من ${parts.length} صور — راجعه ثم اعرض المعاينة.`); }
      else setOcrMsg('⚠️ تعذر قراءة الصورة — اكتب الجدول يدوياً.');
    } catch { setOcrMsg('⚠️ تعذّر التشغيل — اكتب الجدول يدوياً.'); }
    setOcrBusy(false);
  };
  return (
    <div>
      <h1>🗓️ البرنامج الأسبوعي</h1>
      <div className="small mut mb">صوّر جدول المدرسة أو الصقه نصاً — AI Vision + OCR يستخرج الأيام والساعات والحصص.</div>
      <Glass level={2}>
        <h2>📸 استيراد جدول (صورة / PDF / خط يد)</h2>
        {picker.el}
        <div className="wrap mb">
          <Btn sm kind="pri" onClick={() => setAttachOpen(true)}>📎 إرفاق صورة الجدول</Btn>
          <Btn sm onClick={() => setOcrText('الأحد 8-14 مدرسة، الاثنين 8-14 مدرسة، الثلاثاء 8-14 مدرسة، الأربعاء 10-11:30 اختبار فيزياء')}>📝 لصق مثال</Btn>
        </div>
        {attachOpen && <AttachSheet onClose={() => setAttachOpen(false)} onPick={o => picker.open(o.accept, o.capture)} />}
        <AttList files={shots} onRemove={i => setShots(shots.filter((_, j) => j !== i))} />
        {!!shots.length && <div className="tiny mut mb">🖼️ الصور مرفقة للمرجع — استخرج نصها بالزر أو انسخ الأيام والساعات إلى النص ليستخرجها AI (لا قراءة تلقائية للصور).</div>}
        <div className="wrap mb">
          <Btn sm disabled={ocrBusy || !shots.some(f => f.preview)} onClick={runSchedOcr}>🔍 {ocrBusy ? 'استخراج…' : 'استخراج النص من الصور'}</Btn>
          {ocrMsg && <span className="tiny">{ocrMsg}</span>}
        </div>
        <textarea placeholder="الصق هنا النص المستخرج من الصورة… مثال: الأحد 8-14 مدرسة، الاثنين فيزياء 10-11…" value={ocrText} onChange={e => setOcrText(e.target.value)} />
        <div className="mt row"><Btn kind="pri" sm onClick={parsePreview}>👁️ عرض المعاينة قبل الحفظ</Btn>
          <span className="tiny mut">عند الغموض نطلب التأكيد ولا نختلق.</span></div>
        {!!preview.length && (
          <Glass level={2} className="mt"><h3>👁️ المعاينة — عدّل قبل الحفظ</h3>
            {preview.map((r, k) => (
              <div key={k} className="row mt">
                <span className="chip">{DAYS[r.day]}</span>
                <input style={{ maxWidth: 70 }} value={r.start} onChange={e => setPreview(preview.map((x, j) => j === k ? { ...x, start: e.target.value } : x))} />
                <span className="mut">–</span>
                <input style={{ maxWidth: 70 }} value={r.end} onChange={e => setPreview(preview.map((x, j) => j === k ? { ...x, end: e.target.value } : x))} />
                <input style={{ flex: 1 }} value={r.label} onChange={e => setPreview(preview.map((x, j) => j === k ? { ...x, label: e.target.value } : x))} />
                <button className="btn sm ghost" onClick={() => setPreview(preview.filter((_, j) => j !== k))}>✕</button>
              </div>
            ))}
            <div className="mt wrap"><Btn kind="pri" sm onClick={savePreview}>حفظ الجدول ✓ ({preview.length})</Btn>
              <Btn sm onClick={() => setPreview([])}>إلغاء</Btn></div>
          </Glass>
        )}
      </Glass>
      {confirm && <Modal onClose={() => setConfirm(null)}>
        <h2>⚠️ جزء غير واضح</h2><div className="small">{confirm}</div>
        <div className="mt row"><Btn kind="pri" sm onClick={() => {
          set(p => ({ ...p, schedule: [...p.schedule, { id: uid('s'), day: 0, start: '08:00', end: '14:00', label: 'المدرسة (مؤكد يدوياً)', type: 'school' }] })); setConfirm(null);
        }}>تأكيد</Btn><Btn sm onClick={() => setConfirm(null)}>إلغاء</Btn></div></Modal>}
      <div className="mt" style={{ display: 'grid', gap: 10 }}>
        {DAYS.map((d, i) => (
          <Glass key={i}><h3>{d}</h3>
            {s.schedule.filter(b => b.day === i).map(b => (
              <div key={b.id} className="between small" style={{ padding: '5px 0' }}>
                <span>{b.label} • {b.start}–{b.end}</span>
                <span className="row"><Chip>{b.type}</Chip>
                  <button className="btn sm ghost" onClick={() => set(p => ({ ...p, schedule: p.schedule.filter(x => x.id !== b.id) }))}>✕</button></span></div>
            ))}
            {s.schedule.filter(b => b.day === i).length === 0 && <div className="tiny mut">فارغ — وقت حر متاح للدراسة.</div>}
          </Glass>
        ))}
      </div>
    </div>
  );
}

export function Plan30() {
  const { s, set } = useStore();
  const [goal, setGoal] = useState(s.planGoal);
  const done = s.plan.filter(p => p.done).length;
  const redistribute = () => {
    // adaptive: move undone past tasks forward, never mark failed
    const t = todayISO();
    set(p => {
      const plan = p.plan.map(d => ({ ...d }));
      const overdue = plan.filter(d => d.date < t && !d.done);
      const upcoming = plan.filter(d => d.date >= t && !d.done);
      overdue.forEach((o, i) => { o.done = false; o.date = upcoming[i]?.date ?? addDays(t, i); o.note += ' (أُعيد توزيعه تلقائياً — لا بأس بالتأخر)'; });
      return { ...p, plan, planGoal: goal };
    });
  };
  return (
    <div>
      <h1>🗺️ خطة 30 يوماً (تكيّفية)</h1>
      <div className="small mut mb">ديناميكية: تعتمد على هدفك ووقتك ومستواك — والتأخر يُعاد توزيعه ولا يُعتبر فشلاً.</div>
      <Glass level={2}>
        <div className="between"><Ring v={(done / 30) * 100} label={`${done}/30 يوم`} /><div>
          <label className="lbl">الهدف</label>
          <input value={goal} onChange={e => setGoal(e.target.value)} /></div></div>
        <div className="mt wrap"><Btn kind="pri" sm onClick={() => {
          const titles = s.tasks.map(t => t.title);
          const fresh = build30Day(goal || 'التفوق', titles, todayISO());
          set(p => ({ ...p, planGoal: goal, plan: fresh.map((f, i) => ({ day: i + 1, date: f.date, taskIds: [], note: f.note, done: false })) }));
        }}>إعادة بناء الخطة</Btn>
          <Btn sm onClick={redistribute}>🔄 إعادة توزيع المتأخر</Btn></div>
      </Glass>
      <div className="mt" style={{ display: 'grid', gap: 8 }}>
        {s.plan.slice(0, 14).map(d => (
          <div key={d.day} className={`task ${d.done ? 'done' : ''}`}>
            <button className={`check ${d.done ? 'on' : ''}`} onClick={() => set(p => ({ ...p, plan: p.plan.map(x => x.day === d.day ? { ...x, done: !x.done } : x) }))}>✓</button>
            <div style={{ flex: 1 }}><div className="small" style={{ fontWeight: 600 }}>يوم {d.day} • {d.date}</div>
              <div className="tiny mut">{d.note}</div></div>
          </div>
        ))}
        <div className="tiny mut" style={{ textAlign: 'center' }}>+ {s.plan.length - 14} يوماً إضافياً في الخطة الكاملة</div>
      </div>
    </div>
  );
}

export function Simulator() {
  const { s, set } = useStore();
  const [cfg, setCfg] = useState({ n: 5, mins: 5 });
  const [run, setRun] = useState(false);
  const [left, setLeft] = useState(0);
  const [qi, setQi] = useState(0);
  const [ans, setAns] = useState('');
  const [qStart, setQStart] = useState(Date.now());
  const [res, setRes] = useState<{ prompt: string; timeMs: number; sim: number; ok: boolean; skipped: boolean; answer: string; mine: string }[]>([]);
  const [order, setOrder] = useState<string[]>([]);
  // اسئلة حقيقية من بنكك — موزعة على المفاهيم
  const startRun = () => {
    const ids = [...s.recallBank].sort(() => Math.random() - 0.5).slice(0, Math.min(cfg.n, s.recallBank.length)).map(q => q.id);
    setOrder(ids); setRes([]); setQi(0); setAns('');
    setLeft(cfg.mins * 60); setQStart(Date.now()); setRun(true);
  };
  React.useEffect(() => {
    if (!run) return;
    if (left <= 0) { finish(true); return; }
    const id = setTimeout(() => setLeft(x => x - 1), 1000);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run, left]);
  const q = s.recallBank.find(x => x.id === order[qi]);
  const answerQ = (skip: boolean) => {
    if (!q) return;
    const timeMs = Date.now() - qStart;
    const sim = skip ? 0 : simOf(ans, q.answer);
    const ok = sim >= 0.35;
    const nr = [...res, { prompt: q.prompt, timeMs, sim, ok, skipped: skip, answer: q.answer, mine: skip ? '(تخطي)' : ans }];
    setRes(nr); setAns('');
    if (qi + 1 >= order.length) { finish(false, nr); }
    else { setQi(qi + 1); setQStart(Date.now()); }
  };
  // العودة لسؤال سابق: تُحذف إجابته المسجلة ويُعاد فتحه
  const goBack = () => {
    if (qi === 0) return;
    setRes(res.slice(0, -1));
    setQi(qi - 1); setAns(''); setQStart(Date.now());
  };
  const finish = (timeout: boolean, list?: typeof res) => {
    const final = list ?? res;
    setRun(false);
    const c = final.filter(r => r.ok).length;
    set(p => ({
      ...p,
      attempts: [...p.attempts, ...final.map((r, i) => {
        const qq = s.recallBank.find(x => x.prompt === r.prompt);
        return { id: `a_${Date.now()}_${i}`, date: todayISO(), conceptId: qq?.conceptId ?? '', kind: 'simulator', correct: r.ok, grade: gradeOf(r.sim), timeMs: r.timeMs, confidence: 3 as const };
      })],
    }));
    addXP(set, c * 12);
    void timeout;
  };
  const mm = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`;
  const cls = left > cfg.mins * 30 ? 'timer-ok' : left > 60 ? 'timer-warn' : 'timer-bad';
  if (!s.recallBank.length) return (
    <Glass className="mt"><h2>⏱️ محاكي ضغط الوقت</h2>
      <div className="small mut">المحاكي يستخدم أسئلتك الحقيقية — أضف درساً أولاً من تبويب المواد.</div></Glass>
  );
  return (
    <div>
      <h1>⏱️ محاكي ضغط الوقت</h1>
      {!run && !res.length && (
        <Glass level={2}>
          <div className="row"><div style={{ flex: 1 }}><label className="lbl">عدد الأسئلة</label>
            <input type="number" value={cfg.n} onChange={e => setCfg({ ...cfg, n: Math.max(1, Math.min(15, +e.target.value || 1)) })} /></div>
            <div style={{ flex: 1 }}><label className="lbl">المدة الكلية (دقائق)</label>
              <input type="number" value={cfg.mins} onChange={e => setCfg({ ...cfg, mins: Math.max(1, +e.target.value || 1) })} /></div></div>
          <div className="mt"><Btn kind="pri" sm onClick={startRun}><Timer size={13} /> بدء المحاكاة الحقيقية</Btn></div>
          <div className="tiny mut mt">أسئلة من بنكك بتوقيت حقيقي لكل سؤال — لا أزمنة وهمية.</div>
        </Glass>
      )}
      {run && q && (
        <Glass level={3} className="glow-cyan">
          <div className="between"><h2 className={cls} style={{ fontSize: 28 }}>{mm}</h2>
            <Chip>سؤال {qi + 1}/{order.length}</Chip></div>
          <Bar v={((qi) / order.length) * 100} />
          <div className="small mt" style={{ fontWeight: 700 }}>{q.prompt}</div>
          <div className="mt"><input placeholder="إجابتك السريعة…" value={ans} onChange={e => setAns(e.target.value)} /></div>
          <div className="mt wrap">
            <Btn kind="pri" sm onClick={() => answerQ(false)}>التالي ✓</Btn>
            <Btn sm onClick={() => answerQ(true)}>تخطي ⏭</Btn>
            <Btn sm disabled={qi === 0} onClick={goBack}>↩ عودة للسابق</Btn>
            <Btn sm onClick={() => { setRun(false); setRes([]); }}>إيقاف ✕</Btn>
          </div>
          <div className="tiny mut mt">متوسطك حتى الآن: {res.length ? Math.round(res.reduce((a, r) => a + r.timeMs, 0) / res.length / 1000) : 0} ث/سؤال</div>
        </Glass>
      )}
      {!run && !!res.length && (
        <Glass level={2} className="mt pop">
          <div className="between"><h2>📈 تحليل المحاكاة: {res.filter(r => r.ok).length}/{res.length}</h2>
            <Btn sm onClick={() => setRes([])}>محاكاة جديدة</Btn></div>
          <Area data={res.map(r => Math.round(r.timeMs / 1000))} />
          {res.map((r, i) => (
            <div key={i} className="task mt"><span className="dot" style={{ background: r.ok ? '#34d399' : '#f87171' }} />
              <div style={{ flex: 1 }}><div className="small" style={{ fontWeight: 600 }}>{r.skipped ? '⏭ متخطى: ' : ''}{r.prompt.slice(0, 55)}…</div>
                <div className="tiny mut">{Math.round(r.timeMs / 1000)} ث • تطابق {Math.round(r.sim * 100)}% • إجابتك: {r.mine.slice(0, 40)}</div>
                {!r.ok && <div className="tiny" style={{ color: '#34d399' }}>✓ {r.answer.slice(0, 70)}…</div>}</div></div>
          ))}
          <div className="small mut mt">{(() => {
            const slow = Math.max(...res.map(r => r.timeMs));
            const avg = res.reduce((a, r) => a + r.timeMs, 0) / res.length;
            if (slow > avg * 2) return `⚠️ سؤال استنزف ${Math.round(slow / 1000)} ث (ضعف المتوسط) — درّب على تخطي السؤال الصعب والعودة له.`;
            if (res.filter(r => r.ok).length / res.length < 0.5) return '⚠️ الدقة تحت الضغط منخفضة — السرعة بلا دقة لا تنفع: اهدأ 5 ثوانٍ قبل كل إجابة.';
            return '✅ إيقاع متوازن تحت الضغط — حافظ عليه في الامتحان الحقيقي.';
          })()}</div>
        </Glass>
      )}
    </div>
  );
}

export function NightMode() {
  const { s, set } = useStore();
  const topErrs = s.errors.filter(e => !e.resolved).slice(0, 3);
  const laws = s.materials.flatMap(m => m.units.flatMap(u => u.lessons.flatMap(l => l.concepts.filter(c => c.kind === 'law' || c.kind === 'definition').map(c => ({ ...c, mat: m.name }))))).slice(0, 4);
  if (!s.nightMode) return null;
  return (
    <Glass level={3} className="mb glow-purple">
      <div className="between"><h2>🌙 وضع ليلة الامتحان (نشط)</h2>
        <Btn sm onClick={() => set(p => ({ ...p, nightMode: false }))}>إنهاء</Btn></div>
      <div className="small mut">واجهة مختصرة: أهم القوانين + الأخطاء المتكررة فقط. لا معلومات جديدة الليلة.</div>
      <div className="mt" style={{ display: 'grid', gap: 8 }}>
        {laws.map(c => <div key={c.id} className="small">📌 <b>{c.title}</b> <span className="mut">({c.mat})</span></div>)}
        {topErrs.map(e => <div key={e.id} className="small">⚠️ {e.question.slice(0, 70)}…</div>)}
      </div>
    </Glass>
  );
}

export function University() {
  const { s, set } = useStore();
  const sc = uniScenarios(s.targetUni.target, s.targetUni.current);
  return (
    <Glass className="mt">
      <h2><Target size={15} /> المعدل الجامعي المستهدف</h2>
      <div className="grid2">
        <div><label className="lbl">الجامعة</label><input value={s.targetUni.uni} onChange={e => set(p => ({ ...p, targetUni: { ...p.targetUni, uni: e.target.value } }))} /></div>
        <div><label className="lbl">التخصص</label><input value={s.targetUni.major} onChange={e => set(p => ({ ...p, targetUni: { ...p.targetUni, major: e.target.value } }))} /></div>
        <div><label className="lbl">المستهدف</label><input type="number" value={s.targetUni.target} onChange={e => set(p => ({ ...p, targetUni: { ...p.targetUni, target: +e.target.value } }))} /></div>
        <div><label className="lbl">الحالي</label><input type="number" value={s.targetUni.current} onChange={e => set(p => ({ ...p, targetUni: { ...p.targetUni, current: +e.target.value } }))} /></div>
      </div>
      <div className="mt" style={{ display: 'grid', gap: 6 }}>
        {sc.map(x => <div key={x.name} className="small">📊 <b>{x.name}:</b> {x.desc}</div>)}
      </div>
      <div className="tiny mut mt">تقديرات تعليمية قابلة للتعديل — ليست ضمان قبول. عند توفر بيانات رسمية حديثة تُعطى الأولوية لها.</div>
    </Glass>
  );
}

export function City() {
  const { s, set } = useStore();
  const icons: Record<string, string> = { lib: '📚', lab: '🧪', uni: '🔬', city: '🌆' };
  const lessonsN = s.materials.reduce((a, m) => a + m.units.reduce((b, u) => b + u.lessons.length, 0), 0);
  const correctN = s.attempts.filter(a => a.correct).length;
  const unitDone = s.materials.some(m => m.units.some(u => u.mastery >= 100 && u.lessons.length > 0));
  React.useEffect(() => {
    set(p => ({
      ...p, city: p.city.map(b => {
        if (b.id === 'lib' && lessonsN >= 3) return { ...b, unlocked: true, level: Math.max(b.level, 1) };
        if (b.id === 'lab' && correctN >= 50) return { ...b, unlocked: true, level: Math.max(b.level, 1) };
        if (b.id === 'uni' && unitDone) return { ...b, unlocked: true, level: Math.max(b.level, 1) };
        if (b.id === 'city' && p.streak >= 30) return { ...b, unlocked: true, level: Math.max(b.level, 1) };
        return b;
      }),
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lessonsN, correctN, unitDone]);
  return (
    <div>
      <h1>🌆 مدينة المعرفة + 🏗️ عالمي</h1>
      <div className="small mut mb">مكافآت هادئة مرتبطة بالتعلم الحقيقي فقط — وليست أهم من الدراسة.</div>
      <div className="city">
        {s.city.map(b => (
          <div key={b.id} className={`bld ${b.unlocked ? '' : 'lock'}`}>
            <div className="big">{icons[b.id] ?? '🏛️'}</div>
            <div style={{ fontWeight: 700 }}>{b.name}</div>
            <div className="tiny mut">مستوى {b.level} • {b.reason}</div>
            {b.unlocked && b.level < 5 && <div className="mt"><Btn sm onClick={() => set(p => ({ ...p, city: p.city.map(x => x.id === b.id ? { ...x, level: x.level + 1 } : x) }))}>ترقية ⬆️</Btn></div>}
          </div>
        ))}
      </div>
      <Glass className="mt"><div className="between"><span><Trophy size={14} /> XP: {s.xp}</span><span><Clock size={14} /> Streak: {s.streak} أيام</span><span>المستوى {s.level}</span></div>
        <div className="mt"><Bar v={(s.xp % 100)} /></div></Glass>
    </div>
  );
}

export function SubjectRadar({ mini }: { mini?: boolean }) {
  const { s } = useStore();
  const axes = s.materials.map(m => ({ label: m.name, v: m.mastery }));
  return (
    <div>
      <Radar axes={axes.length ? axes : [{ label: 'لا مواد', v: 0 }]} />
      {!mini && <div className="small mut" style={{ textAlign: 'center' }}>
        {axes.some(a => a.v < 55) ? `⚠️ خلل: ${axes.sort((a, b) => a.v - b.v)[0]?.label} مهملة — يقترح AI جلستين تعويضيتين.` : '✅ التوازن جيد بين المواد.'}
      </div>}
    </div>
  );
}

export function NotifPrefs() {
  const { s, set } = useStore();
  return (
    <Glass className="mt"><h2><Bell size={14} /> تنبيهات النسيان الذكي</h2>
      <div className="wrap">
        {(['forgetting', 'daily', 'coach'] as const).map(k => (
          <Chip key={k} on={s.notifPrefs[k]} onClick={() => set(p => ({ ...p, notifPrefs: { ...p.notifPrefs, [k]: !p.notifPrefs[k] } }))}>
            {k === 'forgetting' ? '🧠 تنبيه النسيان' : k === 'daily' ? '📅 اليومي' : '💡 المدرّب'}
          </Chip>
        ))}
      </div>
      <div className="tiny mut mt">قابلة للتحكم بالكامل — بطاقة قصيرة بدل تنبيه عام مزعج.</div></Glass>
  );
}
