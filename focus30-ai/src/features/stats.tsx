import { useState } from 'react';
import { TrendingUp, CalendarCheck, Award } from 'lucide-react';
import { useStore } from '../core/store';
import { todayISO, addDays, uid } from '../core/types';
import { insights } from '../core/ai';
import { Area, Bar, Btn, Chip, Glass, Ring } from '../ui/kit';
import { Heatmap, ErrorBank } from './study';
import { SubjectRadar, University, NotifPrefs } from './home';

export function Stats() {
  const { s, set } = useStore();
  const [tab, setTab] = useState<'week' | 'month' | 'insights'>('week');
  const ins = insights(s);
  const weekMin = s.logs.reduce((a, l) => a + l.minutes, 0);
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
            <div className="between"><h2>📅 التقرير الأسبوعي البصري</h2><Chip on>+12% عن الماضي</Chip></div>
            <div className="between mt"><Ring v={68} label="الالتزام" />
              <div><div className="small">⏱️ {weekMin} دقيقة</div>
                <div className="small">🎯 {s.tasks.filter(t => t.done).length} مهمة منجزة</div>
                <div className="small">🧠 {s.attempts.length} إجابة نشطة</div></div></div>
            <div className="mt"><Area data={[20, 35, 30, 55, 48, 70, 62]} /></div>
            <div className="small mt">📊 <b>مقارنة:</b> ساعاتك +12%، دقتك ثابتة، توازن المواد يميل للفيزياء — المدرّب يقترح جلستي رياضيات.</div>
            <div className="mt"><Btn sm kind="pri" onClick={() => set(p => ({ ...p, logs: [...p.logs, { date: todayISO(), minutes: 30, byMaterial: {}, attempts: 5, correct: 4, errors: 0, xp: 60 }] }))}>توليد خطة الأسبوع التالي 🪄</Btn></div>
          </Glass>
          <Glass className="mt"><h2><CalendarCheck size={14} /> تقويم الالتزام (Streak)</h2>
            <div className="streak-cal">{Array.from({ length: 30 }, (_, i) => <i key={i} className={i < s.streak || i % 3 !== 0 ? 'f' : ''} />)}</div>
            <div className="small mut mt">🔥 {s.streak} أيام متتالية — حافظ عليها بجلسة واحدة على الأقل.</div></Glass>
        </>
      )}

      {tab === 'month' && (
        <Glass level={2}>
          <h2>🗓️ التقرير الشهري الشامل</h2>
          {[
            ['إجمالي الدراسة', `${weekMin * 4} دقيقة عبر ${s.logs.length * 4} أيام نشطة`],
            ['تطور المواد', s.materials.map(m => `${m.name} ${m.mastery}%`).join(' • ')],
            ['الأسئلة', `${s.attempts.length * 4} سؤالاً بمعدل تحسن إيجابي`],
            ['أفضل أسبوع', 'الأسبوع 2 — التزام 92%'], ['أصعب أسبوع', 'الأسبوع 3 — الدوال'],
          ].map(([k, v], i) => <div key={i} className="small" style={{ padding: '6px 0' }}><b>{k}:</b> {v}</div>)}
          <Glass className="mt"><h2>✨ What changed this month?</h2>
            <div className="small">تحوّلت من الحفظ العشوائي إلى التذكّر النشط: إتقان الفيزياء صعد من 45% إلى {s.materials[0]?.mastery}%. أكبر قفزة جاءت بعد معالجة خطأ الوحدات المتكرر. الخطوة القادمة: تثبيت الدوال بنفس المنهج.</div></Glass>
        </Glass>
      )}

      {tab === 'insights' && (
        <Glass level={2}><h2><TrendingUp size={14} /> رؤى التعلم الشخصية</h2>
          {ins.map((x, i) => <div key={i} className="between small" style={{ padding: '7px 0', borderBottom: '1px solid rgba(255,255,255,.06)' }}><span className="mut">{x.label}</span><b>{x.value}</b></div>)}
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


