import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { AppState, Material } from './types';
import { addDays, todayISO, uid } from './types';

const KEY = 'focus30-v2';

function seed(): AppState {
  // يبدأ التطبيق فارغاً تماماً: لا دروس ولا أسئلة ولا مهام مقترحة
  // حتى يُدخل الطالب صوره وملفاته بنفسه — لا محتوى وهمي أبداً.
  const mkMat = (id: string, name: string, color: string, icon: string, unit: string): Material => ({
    id, name, color, icon, units: [{ id: uid('u'), materialId: id, title: unit, lessons: [], mastery: 0 }],
    mastery: 0, minutes: 0,
  });
  const materials = [
    mkMat('m_phys', 'الفيزياء', '#22d3ee', 'atom', 'الوحدة 1'),
    mkMat('m_math', 'الرياضيات', '#a78bfa', 'sigma', 'الوحدة 1'),
    mkMat('m_chem', 'الكيمياء', '#34d399', 'flask', 'الوحدة 1'),
  ];
  const t = todayISO();
  const plan = Array.from({ length: 30 }, (_, i) => ({
    day: i + 1, date: addDays(t, i),
    taskIds: [] as string[],
    note: i === 0 ? 'اليوم 1: أضف أول درس بالتصوير أو اللصق' : i < 7 ? 'بناء الأساس' : i < 21 ? 'تعمّق + اختبارات' : 'مراجعة شاملة',
    done: false,
  }));

  return {
    lang: 'ar', materials, flashcards: [], recallBank: [], attempts: [], tasks: [],
    errors: [],
    schedule: [],
    plan, planGoal: 'هدفي للتفوق — أحدده بعد إضافة موادي',
    exams: [],
    city: [
      { id: 'lib', name: 'المكتبة', level: 0, unlocked: false, reason: 'تُفتح بعد إضافة 3 دروس' },
      { id: 'lab', name: 'المختبر', level: 0, unlocked: false, reason: 'يُفتح بعد 50 إجابة صحيحة' },
      { id: 'uni', name: 'مركز الأبحاث', level: 0, unlocked: false, reason: 'يُفتح بإتقان وحدة كاملة' },
      { id: 'city', name: 'المدينة العلمية', level: 0, unlocked: false, reason: 'تُفتح بعد 30 يوم التزام' },
    ],
    milestones: [],
    logs: [],
    xp: 0, streak: 0, level: 1, nightMode: false, examDate: addDays(t, 30),
    targetUni: { uni: '', major: '', target: 95, current: 80 },
    notifPrefs: { forgetting: true, daily: true, coach: true },
    blackouts: [],
    diagrams: [],
    sources: [],
  };
}

const Ctx = createContext<{ s: AppState; set: (f: (p: AppState) => AppState) => void } | null>(null);

export function Store({ children }: { children: React.ReactNode }) {
  const [s, setS] = useState<AppState>(() => {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const p = JSON.parse(raw) as AppState;
        if (!Array.isArray(p.sources)) p.sources = [];
        if (!Array.isArray(p.blackouts)) p.blackouts = [];
        if (!Array.isArray(p.diagrams)) p.diagrams = [];
        if (Array.isArray(p.exams)) p.exams = p.exams.map(x => ({ attachments: [], ...x }));
        // ترحيل الحقول الجديدة للبيانات القديمة (بدون فقدان)
        for (const m of p.materials ?? []) for (const u of m.units ?? []) for (const l of u.lessons ?? []) {
          if (!Array.isArray(l.sections)) l.sections = (l.sourceText ?? '').split(/[\n]+/).map(s => s.trim()).filter(Boolean);
          if (!Array.isArray(l.elements)) l.elements = [];
          for (const [ci, c] of (l.concepts ?? []).entries()) {
            if (c.recallStrength === undefined) c.recallStrength = Math.max(10, (c.mastery ?? 20) - 10);
            if (!Array.isArray(c.prereqs)) c.prereqs = ci > 0 ? [l.concepts[ci - 1].id] : [];
            if (!Array.isArray(c.related)) c.related = [];
            if (c.section === undefined) c.section = ci;
          }
        }
        for (const q of p.recallBank ?? []) {
          if (!q.sourceLessonId) {
            const hit = (p.materials ?? []).flatMap(m => m.units ?? []).flatMap(u => u.lessons ?? [])
              .find(l => (l.concepts ?? []).some(c => c.id === q.conceptId));
            q.sourceLessonId = hit?.id ?? '';
            q.sourceRef = q.sourceRef || hit?.sourceRef || '';
            q.section = q.section ?? 0;
            q.difficulty = q.difficulty ?? 2;
            q.origin = q.origin ?? 'source';
            q.focus = q.focus ?? 'general';
            q.level = q.level ?? 2;
          }
        }
        for (const f of p.flashcards ?? []) {
          if (!f.sourceLessonId) {
            const hit = (p.materials ?? []).flatMap(m => m.units ?? []).flatMap(u => u.lessons ?? [])
              .find(l => (l.concepts ?? []).some(c => c.id === f.conceptId));
            f.sourceLessonId = hit?.id ?? '';
            f.sourceRef = f.sourceRef || hit?.sourceRef || '';
          }
        }
        for (const a of p.attempts ?? []) {
          if (!a.grade) a.grade = a.correct ? 'correct' : 'incorrect';
        }
        return p;
      }
    } catch { /* fresh */ }
    return seed();
  });
  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(s));
    } catch {
      // امتلاء التخزين (صور كبيرة): احفظ كل شيء ما عدا معاينات الصور — المحتوى لا يضيع أبداً
      try {
        const stripped: AppState = {
          ...s,
          materials: s.materials.map(m => ({
            ...m, units: m.units.map(u => ({
              ...u, lessons: u.lessons.map(l => ({
                ...l, attachments: (l.attachments ?? []).map(a => ({ name: a.name })),
              })),
            })),
          })),
        };
        localStorage.setItem(KEY, JSON.stringify(stripped));
      } catch { /* ignore */ }
    }
  }, [s]);
  const set = (f: (p: AppState) => AppState) => setS(p => f(p));
  const v = useMemo(() => ({ s, set }), [s]);
  return <Ctx.Provider value={v}>{children}</Ctx.Provider>;
}

export function useStore() {
  const c = useContext(Ctx); if (!c) throw new Error('store missing');
  return c;
}

export function addXP(set: (f: (p: AppState) => AppState) => void, n: number) {
  set(p => {
    const xp = p.xp + n;
    return { ...p, xp, level: Math.floor(xp / 100) + 1 };
  });
}
