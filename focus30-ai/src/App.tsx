import React, { useState } from 'react';
import { Home as HomeIcon, CalendarDays, BookOpen, Sparkles, BarChart3, Languages, Moon, Sun } from 'lucide-react';
import { Store, useStore } from './core/store';
import { str } from './core/i18n';
import { Home, Today, WeeklySchedule, Plan30, Simulator, NightMode, City, Countdown } from './features/home';
import { Materials, Recall, Cards, Tests, Archive, Sources } from './features/study';
import { Tutor, Coach, Examples, Stories, Predictor, Weakness, AIAssistant } from './features/ai';
import { Stats } from './features/stats';

type Route =
  | 'home' | 'today' | 'study' | 'ai' | 'stats'
  | 'study-materials' | 'study-schedule' | 'study-plan' | 'study-recall'
  | 'study-cards' | 'study-tests' | 'study-archive' | 'study-sources'
  | 'ai-tutor' | 'ai-coach' | 'ai-examples' | 'ai-stories' | 'ai-predictor' | 'ai-weak' | 'ai-home'
  | 'stats-city' | 'sim';

const STUDY_TABS: { id: Route; ar: string; en: string }[] = [
  { id: 'study-materials', ar: 'المواد', en: 'Subjects' }, { id: 'study-schedule', ar: 'الأسبوعي', en: 'Weekly' },
  { id: 'study-plan', ar: 'الخطة', en: 'Plan' }, { id: 'study-recall', ar: 'تذكّر نشط', en: 'Recall' },
  { id: 'study-cards', ar: 'البطاقات', en: 'Cards' }, { id: 'study-tests', ar: 'الاختبارات', en: 'Tests' },
  { id: 'study-archive', ar: 'الأرشيف', en: 'Archive' }, { id: 'study-sources', ar: 'المصادر', en: 'Sources' },
];
const AI_TABS: { id: Route; ar: string; en: string }[] = [
  { id: 'ai-tutor', ar: 'المعلّم', en: 'Tutor' }, { id: 'ai-coach', ar: 'المدرّب', en: 'Coach' },
  { id: 'ai-examples', ar: 'أمثلة', en: 'Examples' }, { id: 'ai-stories', ar: 'قصص', en: 'Stories' },
  { id: 'ai-predictor', ar: 'المتنبئ', en: 'Predictor' }, { id: 'ai-weak', ar: 'الضعف', en: 'Weakness' },
  { id: 'ai-home', ar: 'المساعد', en: 'Assistant' },
];

function Shell() {
  const { s, set } = useStore();
  const [route, setRoute] = useState<Route>('home');
  const t = str[s.lang];
  const top: { id: Route; icon: React.ReactNode; label: string }[] = [
    { id: 'home', icon: <HomeIcon size={20} />, label: t.home },
    { id: 'today', icon: <CalendarDays size={20} />, label: t.today },
    { id: 'study', icon: <BookOpen size={20} />, label: t.study },
    { id: 'ai', icon: <Sparkles size={20} />, label: t.ai },
    { id: 'stats', icon: <BarChart3 size={20} />, label: t.stats },
  ];
  const go = (r: string) => { setRoute(r as Route); window.scrollTo({ top: 0 }); };
  const main: Route = route === 'study' ? 'study-materials' : route === 'ai' ? 'ai-tutor' : route;

  return (
    <div dir={s.lang === 'ar' ? 'rtl' : 'ltr'}>
      <div className="blobs"><i /><i /></div>
      <div className="app">
        <div className="row mb" style={{ justifyContent: 'flex-end', gap: 8 }}>
          <button className="chip" onClick={() => set(p => ({ ...p, lang: p.lang === 'ar' ? 'en' : 'ar' }))}>
            <Languages size={13} /> {s.lang === 'ar' ? 'EN' : 'عربي'}</button>
          <button className="chip" onClick={() => set(p => ({ ...p, nightMode: !p.nightMode }))}>
            {s.nightMode ? <Sun size={13} /> : <Moon size={13} />} {t.nightMode}</button>
        </div>

        <NightMode />
        {main === 'home' && <Home go={go} />}
        {main === 'today' && <Today />}

        {(main === 'study-materials' || route === 'study') && <><SubTabs tabs={STUDY_TABS} cur="study-materials" go={go} lang={s.lang} /><Materials go={go} /></>}
        {main === 'study-schedule' && <><SubTabs tabs={STUDY_TABS} cur={main} go={go} lang={s.lang} /><WeeklySchedule /></>}
        {main === 'study-plan' && <><SubTabs tabs={STUDY_TABS} cur={main} go={go} lang={s.lang} /><Plan30 /><Countdown /></>}
        {main === 'study-recall' && <><SubTabs tabs={STUDY_TABS} cur={main} go={go} lang={s.lang} /><Recall /></>}
        {main === 'study-cards' && <><SubTabs tabs={STUDY_TABS} cur={main} go={go} lang={s.lang} /><Cards /></>}
        {main === 'study-tests' && <><SubTabs tabs={STUDY_TABS} cur={main} go={go} lang={s.lang} /><Tests /><Simulator /></>}
        {main === 'study-archive' && <><SubTabs tabs={STUDY_TABS} cur={main} go={go} lang={s.lang} /><Archive /></>}
        {main === 'study-sources' && <><SubTabs tabs={STUDY_TABS} cur={main} go={go} lang={s.lang} /><Sources /></>}

        {main === 'ai-tutor' && <><SubTabs tabs={AI_TABS} cur={main} go={go} lang={s.lang} /><Tutor /></>}
        {main === 'ai-coach' && <><SubTabs tabs={AI_TABS} cur={main} go={go} lang={s.lang} /><Coach /></>}
        {main === 'ai-examples' && <><SubTabs tabs={AI_TABS} cur={main} go={go} lang={s.lang} /><Examples /></>}
        {main === 'ai-stories' && <><SubTabs tabs={AI_TABS} cur={main} go={go} lang={s.lang} /><Stories /></>}
        {main === 'ai-predictor' && <><SubTabs tabs={AI_TABS} cur={main} go={go} lang={s.lang} /><Predictor /></>}
        {main === 'ai-weak' && <><SubTabs tabs={AI_TABS} cur={main} go={go} lang={s.lang} /><Weakness /></>}
        {main === 'ai-home' && <><SubTabs tabs={AI_TABS} cur={main} go={go} lang={s.lang} /><AIAssistant /></>}

        {main === 'stats' && <Stats />}
        {main === 'stats-city' && <City />}
        {main === 'sim' && <Simulator />}
      </div>
      <nav className="nav" aria-label="main">
        {top.map(b => (
          <button key={b.id} className={(route === b.id || route.startsWith(b.id + '-')) ? 'on' : ''} onClick={() => go(b.id)}>
            {b.icon}<span>{b.label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}

function SubTabs({ tabs, cur, go, lang }: { tabs: { id: Route; ar: string; en: string }[]; cur: string; go: (r: string) => void; lang: 'ar' | 'en' }) {
  return (
    <div className="tabs mb">
      {tabs.map(t => <button key={t.id} className={`chip tab ${cur === t.id ? 'on' : ''}`} onClick={() => go(t.id)}>{lang === 'ar' ? t.ar : t.en}</button>)}
    </div>
  );
}

export default function App() {
  return <Store><Shell /></Store>;
}
