import { useState } from 'react';
import { TrendingUp, CalendarCheck, Award } from 'lucide-react';
import { useStore } from '../core/store';
import { todayISO, addDays, uid } from '../core/types';
import { decisionQueue, efficiency, insights } from '../core/ai';
import { Area, Bar, Btn, Chip, Glass, Ring } from '../ui/kit';
import { Heatmap, ErrorBank } from './study';
import { SubjectRadar, University, NotifPrefs } from './home';

export function Stats() {
  const { s, set } = useStore();
  const [tab, setTab] = useState<'week' | 'month' | 'insights'>('week');
  const ins = insights(s);
  const eff = efficiency(s);
  const dayKey = (d: Date) => d.toISOString().slice(0, 10);
  const ago = (n: number) => { const d = new Date(); d.setDate(d.getDate() - n); return dayKey(d); };
  const last7 = Array.from({ length: 7 }, (_, i) => ago(6 - i));
  const prev7 = Array.from({ length: 7 }, (_, i) => ago(13 - i));
  const minOf = (ds: string[]) => s.logs.filter(l => ds.includes(l.date)).reduce((a, l) => a + l.minutes, 0);
  const attOf = (ds: string[]) => s.attempts.filter(a => ds.includes(a.date));
  const weekMin = minOf(last7);
  const prevMin = minOf(prev7);
  const wAtt = attOf(last7);
  const pAtt = attOf(prev7);
  const wAcc = wAtt.length ? Math.round(100 * wAtt.filter(a => a.correct).length / wAtt.length) : 0;
  const pAcc = pAtt.length ? Math.round(100 * pAtt.filter(a => a.correct).length / pAtt.length) : 0;
  const weekTasks = s.tasks.filter(x => last7.includes(x.date));
  const adher = weekTasks.length ? Math.round(100 * weekTasks.filter(x => x.done).length / weekTasks.length) : 0;
  const minSeries = last7.map(d => minOf([d]));
  const cmpMin = prevMin ? `${weekMin >= prevMin ? '+' : ''}${Math.round(100 * (weekMin - prevMin) / prevMin)}% عن الأسبوع الماضي` : 'لا بيانات سابقة للمقارنة';
  const activeDays = new Set([...s.logs.map(l => l.date), ...s.attempts.map(a => a.date)]);
  const monthAtt = attOf(Array.from({ length: 30 }, (_, i) => ago(i)));
  const matAcc = s.materials.map(m => {
    const cids = new Set(m.units.flatMap(u => u.lessons.flatMap(l => l.concepts.map(c => c.id))));
    const at = monthAtt.filter(a => cids.has(a.conceptId));
    return { m, n: at.length, acc: at.length ? Math.round(100 * at.filter(a => a.correct).length / at.length) : -1 };
  });
  const withData = matAcc.filter(x => x.n > 0);
  const best = withData.sort((a, b) => b.acc - a.acc)[0];
  const worst = [...withData].sort((a, b) => a.acc - b.acc)[0];
  const openErr = s.errors.filter(e => !e.resolved).length;
  const resErr = s.errors.filter(e => e.resolved).length;
  const applyRec = (title: string) => {
    set(p => ({ ...p, tasks: [...p.tasks, { id: uid('t'), title, materialId: p.materials[0]?.id ?? 'm1', date: addDays(todayISO(), 1), mins: 20, kind: 'review', done: false, priority: 1 }] }));
  };
  const nextWeekPlan = () => {
    const recs = decisionQueue(s).slice(0, 4);
    set(p => ({ ...p, tasks: [...p.tasks, ...recs.map((r, i) => ({ id: uid('t'), title: r.title, materialId: p.materials[0]?.id ?? 'm1', date: addDays(todayISO(), i + 1), mins: 20, kind: 'review' as const, done: false, priority: 2 as const }))] }));
  };
  return (
    <div>
      <h1>📊 الإحصائيات والتقارير</h1>
      <div className="tabs">
        <button className={`chip tab ${tab === 'week' ? 'on' : ''}`} onClick={() => setTab('week')}>الأسبوعي</button>
        <button className={`chip tab ${tab === 'month' ? 'on' : ''}`} onClick={() => setTab('month')}>الشهري</button>
        <button className={`chip tab ${tab === 'insights' ? 'on' : ''}`} onClick={() => setTab('insights')}>رؤى التعلم</button>
      </div>

      {tab === 'week' && (
        <>
          <Glass level={2} className="glow-cyan">
            <div className="between"><h2>📅 التقرير الأسبوعي (بياناتك الفعلية)</h2><Chip on={!prevMin}>{cmpMin}</Chip></div>
            {!wAtt.length && !weekMin ? (
              <div className="small mut mt">لا نشاط مسجل هذا الأسبوع بعد — كل الأرقام هنا من بياناتك الحقيقية فقط، ولا نختلق إحصائيات. ابدأ جلسة تذكر واحدة.</div>
            ) : (<>
              <div className="between mt"><Ring v={adher} label="الالتزام بالمهام" />
                <div><div className="small">⏱️ {weekMin} دقيقة ({prevMin} الأسبوع الماضي)</div>
                  <div className="small">🎯 دقة الإجابات {wAcc}% {pAtt.length ? `(كانت ${pAcc}%)` : ''}</div>
                  <div className="small">🧠 {wAtt.length} إجابات نشطة • ⚠️ {openErr} أخطاء مفتوحة</div></div></div>
              <div className="mt"><Area data={minSeries} /></div>
              <div className="tiny mut">دقائق الدراسة اليومية — آخر 7 أيام (من سجلاتك).</div>
            </>)}
            <Glass className="mt"><h3>📋 توصيات الأسبوع التالي → مهام حقيقية</h3>
              {decisionQueue(s).slice(0, 3).map((r, i) => (
                <div key={i} className="task mt"><span className="chip">{i + 1}</span>
                  <div style={{ flex: 1 }}><div className="small" style={{ fontWeight: 600 }}>{r.title}</div>
                    <div className="tiny mut">{r.reason}</div></div>
                  <Btn sm kind="pri" onClick={() => applyRec(r.title)}>+ مهمة</Btn></div>
              ))}
              <div className="mt"><Btn sm kind="pri" onClick={nextWeekPlan}>🪄 بناء خطة الأسبوع من التوصيات</Btn></div>
            </Glass>
          </Glass>
          <Glass className="mt"><h2><CalendarCheck size={14} /> أيام النشاط الحقيقية (30 يوم)</h2>
            <div className="streak-cal">{Array.from({ length: 30 }, (_, i) => <i key={i} className={activeDays.has(ago(29 - i)) ? 'f' : ''} />)}</div>
            <div className="small mut mt">🔥 الأيام المضيئة = أيام سجلت فيها دراسة أو إجابات فعلاً (لا تقديرات).</div></Glass>
        </>
      )}

      {tab === 'month' && (
        <Glass level={2}>
          <h2>🗓️ التقرير الشهري (من نشاطك)</h2>
          {!monthAtt.length ? (
            <div className="small mut">لا بيانات كافية بعد — أجب عن أسئلة وسجّل دراسة لتظهر تحليلاتك الحقيقية هنا.</div>
          ) : (<>
            {[
              ['إجمالي الدراسة (30 يوم)', `${minOf(Array.from({ length: 30 }, (_, i) => ago(i)))} دقيقة`],
              ['إجمالي الأسئلة', `${monthAtt.length} سؤالاً بدقة ${Math.round(100 * monthAtt.filter(a => a.correct).length / monthAtt.length)}%`],
              ['الأخطاء', `${openErr} مفتوحة • ${resErr} عُولجت`],
              ['أفضل مادة (بالدقة)', best ? `${best.m.name} — ${best.acc}% من ${best.n} إجابات` : '—'],
              ['أصعب مادة (بالدقة)', worst && worst !== best ? `${worst.m.name} — ${worst.acc}%` : '—'],
              ['كفاءة التعلم', `${eff.score}/100 — ${eff.label}`],
            ].map(([k, v], i) => <div key={i} className="small" style={{ padding: '6px 0' }}><b>{k}:</b> {v}</div>)}
            <Glass className="mt"><h2>✨ تحليل الشهر</h2>
              <div className="small">{worst && worst.acc >= 0 ? `أكبر فرصة للتحسن في ${worst.m.name} (دقة ${worst.acc}%) — راجع مفاهيمها الأضعف أولاً ثم أعد الاختبار.` : 'واصل البناء — المزيد من الإجابات يعني تحليلاً أدق.'} {resErr > 0 ? ` عالجت ${resErr} أخطاء هذا الشهر — هذا هو التقدم الحقيقي.` : ''}</div>
              {worst && worst.acc >= 0 && <div className="mt"><Btn sm kind="pri" onClick={() => applyRec(`تثبيت ${worst.m.name}: مراجعة المفاهيم الأضعف`)}>تحويل لمهام ⚡</Btn></div>}</Glass>
          </>)}
        </Glass>
      )}

      {tab === 'insights' && (
        <Glass level={2}><h2><TrendingUp size={14} /> رؤى التعلم الشخصية</h2>
          {ins.map((x, i) => <div key={i} className="between small" style={{ padding: '7px 0', borderBottom: '1px solid rgba(255,255,255,.06)' }}><span className="mut">{x.label}</span><b>{x.value}</b></div>)}
          <div className="mt"><div className="between small"><span className="mut">كفاءة التعلم</span><b>{eff.score}/100</b></div>
            <div className="tiny mut">{eff.label} — تُحسب من وقتك وأسئلتك ودقتك وأخطائك المعالجة، لا من الساعات وحدها.</div></div>
          <div className="mt"><SubjectRadar /></div>
        </Glass>
      )}

      <Heatmap />
      <ErrorBank />
      <Glass className="mt"><h2><Award size={14} /> المعالم المخصصة</h2>
        {s.milestones.map(m => <div key={m.id} className="mt"><div className="between small"><span>🏁 {m.title}</span><span className="mut">{m.progress}% • {m.targetDate}</span></div><Bar v={m.progress} /></div>)}
        <div className="mt"><Btn sm onClick={() => set(p => ({ ...p, milestones: [...p.milestones, { id: uid('ms'), title: 'معلم جديد', targetDate: addDays(todayISO(), 7), progress: 10, custom: true }] }))}>+ معلم مخصص</Btn></div>
      </Glass>
      <University />
      <NotifPrefs />
    </div>
  );
}


