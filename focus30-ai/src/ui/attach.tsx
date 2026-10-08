import { useRef, useState } from 'react';
import { Camera, FileText, Image, Mic, Presentation, Video, X } from 'lucide-react';
import { Sheet } from './kit';

export interface AttFile { name: string; size: string; preview?: string }
export const fmtSize = (b: number) =>
  b > 1048576 ? `${(b / 1048576).toFixed(1)}MB` : `${Math.max(1, Math.round(b / 1024))}KB`;

/** قراءة الملفات: النصوص تُستخرج، الصور تُعاين — كل ذلك داخل تصميم التطبيق */
export async function collectFiles(fl: FileList, appendText: (t: string) => void): Promise<AttFile[]> {
  const out: AttFile[] = [];
  for (const f of Array.from(fl)) {
    if (f.type.startsWith('text/') || /\.(txt|md)$/i.test(f.name)) {
      try { const txt = await f.text(); if (txt.trim()) appendText(txt); } catch { /* ignore */ }
    }
    let preview: string | undefined;
    if (f.type.startsWith('image/')) {
      preview = await new Promise<string | undefined>(res => {
        const r = new FileReader();
        r.onload = () => res(String(r.result ?? ''));
        r.onerror = () => res(undefined);
        r.readAsDataURL(f);
      });
    }
    out.push({ name: f.name, size: fmtSize(f.size), preview });
  }
  return out;
}

export interface AttachOption { icon: React.ReactNode; label: string; accept: string; capture: boolean; type: string }

/** نافذة اختيار المصدر — بنفس هوية التطبيق الزجاجية (قبل منتقي النظام) */
export function AttachSheet({ onClose, onPick }: { onClose: () => void; onPick: (o: AttachOption) => void }) {
  const opts: AttachOption[] = [
    { icon: <Camera size={18} />, label: 'تصوير بالكاميرا', accept: 'image/*', capture: true, type: 'صورة كتاب' },
    { icon: <Image size={18} />, label: 'صورة من المعرض', accept: 'image/*', capture: false, type: 'صورة كتاب' },
    { icon: <Presentation size={18} />, label: 'صورة سبورة / لوح', accept: 'image/*', capture: true, type: 'سبورة' },
    { icon: <FileText size={18} />, label: 'ملف PDF / نصي', accept: '.pdf,.txt,.md', capture: false, type: 'PDF' },
    { icon: <Video size={18} />, label: 'فيديو', accept: 'video/*', capture: false, type: 'فيديو' },
    { icon: <Mic size={18} />, label: 'تسجيل صوتي', accept: 'audio/*', capture: false, type: 'ملاحظة شخصية' },
  ];
  return (
    <Sheet title="📎 من أين نأخذ المحتوى؟" onClose={onClose}>
      <div style={{ display: 'grid', gap: 8 }}>
        {opts.map(o => (
          <button key={o.label} className="task" style={{ cursor: 'pointer', fontFamily: 'inherit', color: 'inherit', textAlign: 'start', width: '100%' }}
            onClick={() => { onPick(o); onClose(); }}>
            <span style={{ color: '#22d3ee' }}>{o.icon}</span>
            <span className="small" style={{ fontWeight: 600, flex: 1 }}>{o.label}</span>
            <span className="tiny mut">‹</span>
          </button>
        ))}
      </div>
      <div className="tiny mut mt">اختيارك يفتح منتقي جهازك — أما كل شيء آخر فبهوية Focus30.</div>
    </Sheet>
  );
}

/** hook منتقي ملفات مخفي */
export function useFilePicker(onFiles: (fl: FileList | null) => void) {
  const ref = useRef<HTMLInputElement>(null);
  const [cfg, setCfg] = useState({ accept: 'image/*', capture: false });
  const open = (accept: string, capture = false) => {
    setCfg({ accept, capture });
    setTimeout(() => ref.current?.click(), 30);
  };
  const el = (
    <input ref={ref} type="file" multiple accept={cfg.accept} {...(cfg.capture ? { capture: 'environment' as const } : {})}
      style={{ display: 'none' }} onChange={e => { onFiles(e.target.files); e.target.value = ''; }} />
  );
  return { open, el };
}

export function AttList({ files, onRemove }: { files: AttFile[]; onRemove: (i: number) => void }) {
  if (!files.length) return null;
  return (
    <div className="mb" style={{ display: 'grid', gap: 6 }}>
      {files.map((f, i) => (
        <div key={i} className="task">
          {f.preview
            ? <img src={f.preview} alt="" style={{ width: 44, height: 44, borderRadius: 10, objectFit: 'cover' }} />
            : <FileText size={16} color="#22d3ee" />}
          <div style={{ flex: 1 }}><div className="small" style={{ fontWeight: 600 }}>{f.name}</div>
            <div className="tiny mut">{f.size} ✓ مرفق</div></div>
          <button className="btn sm ghost" aria-label="حذف المرفق" onClick={() => onRemove(i)}><X size={13} /></button>
        </div>
      ))}
    </div>
  );
}
