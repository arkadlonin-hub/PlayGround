import React, { useEffect, useState } from 'react';
import { bandColor, bandOf } from '../core/types';

export const Glass = ({ level = 1, className = '', children, style }: { level?: 1 | 2 | 3; className?: string; children: React.ReactNode; style?: React.CSSProperties }) => (
  <div className={`${level === 3 ? 'glass3' : level === 2 ? 'glass2' : 'glass'} pad ${className}`} style={style}>{children}</div>
);

export const Btn = ({ children, onClick, kind, sm, disabled }: { children: React.ReactNode; onClick?: () => void; kind?: 'pri' | 'ghost'; sm?: boolean; disabled?: boolean }) => (
  <button className={`btn ${kind === 'pri' ? 'pri' : kind === 'ghost' ? 'ghost' : ''} ${sm ? 'sm' : ''}`} onClick={onClick} disabled={disabled}>{children}</button>
);

export const Chip = ({ children, on, onClick }: { children: React.ReactNode; on?: boolean; onClick?: () => void }) => (
  <button className={`chip ${on ? 'on' : ''}`} onClick={onClick} style={{ cursor: onClick ? 'pointer' : 'default', fontFamily: 'inherit' }}>{children}</button>
);

export const Bar = ({ v, color }: { v: number; color?: string }) => (
  <div className="pbar"><i style={{ width: `${Math.min(100, Math.max(0, v))}%`, background: color }} /></div>
);

export const Ring = ({ v, size = 64, label }: { v: number; size?: number; label?: string }) => {
  const r = (size - 10) / 2, c = 2 * Math.PI * r;
  return (
    <div className="row" style={{ gap: 10 }}>
      <svg className="ring" width={size} height={size}>
        <defs><linearGradient id="gg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#22d3ee" /><stop offset="1" stopColor="#a78bfa" />
        </linearGradient></defs>
        <circle className="bgc" cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth="7" />
        <circle className="fgc" cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth="7"
          strokeDasharray={c} strokeDashoffset={c - (c * Math.min(100, v)) / 100} />
      </svg>
      <div><div style={{ fontSize: 20, fontWeight: 700 }}>{Math.round(v)}%</div>
        {label && <div className="small mut">{label}</div>}</div>
    </div>
  );
};

export const MasteryDot = ({ m }: { m: number }) => {
  const b = bandOf(m);
  return <span className="dot" style={{ background: bandColor(b), boxShadow: `0 0 8px ${bandColor(b)}` }} title={`${Math.round(m)}%`} />;
};

function useEscape(onClose: () => void) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);
}

export const Modal = ({ children, onClose }: { children: React.ReactNode; onClose: () => void }) => {
  useEscape(onClose);
  return (
    <div className="overlay" onClick={onClose}>
      <div className="glass3 pad pop modal-box" onClick={e => e.stopPropagation()}>{children}</div>
    </div>
  );
};

export const Sheet = ({ children, onClose, title }: { children: React.ReactNode; onClose: () => void; title?: string }) => {
  useEscape(onClose);
  return (
    <div className="sheet-wrap" onClick={onClose}>
    <div className="sheet" onClick={e => e.stopPropagation()}>
      <div className="grab" />
      {title && <h3 style={{ marginBottom: 10 }}>{title}</h3>}
      {children}
    </div>
  </div>
  );
};

export const Area = ({ data, h = 80 }: { data: number[]; h?: number }) => {
  const w = 300, max = Math.max(...data, 1);
  const pts = data.map((v, i) => `${(i / Math.max(1, data.length - 1)) * w},${h - (v / max) * (h - 8) - 4}`).join(' ');
  return (
    <svg viewBox={`0 0 ${w} ${h}`} style={{ width: '100%', height: h }}>
      <defs><linearGradient id="ag" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#22d3ee" stopOpacity=".5" /><stop offset="1" stopColor="#22d3ee" stopOpacity="0" />
      </linearGradient></defs>
      <polygon points={`0,${h} ${pts} ${w},${h}`} fill="url(#ag)" />
      <polyline points={pts} fill="none" stroke="#22d3ee" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
};

export const Radar = ({ axes }: { axes: { label: string; v: number }[] }) => {
  const cx = 75, cy = 70, R = 52;
  const pt = (i: number, v: number) => {
    const a = (2 * Math.PI * i) / axes.length - Math.PI / 2;
    return `${cx + Math.cos(a) * R * (v / 100)},${cy + Math.sin(a) * R * (v / 100)}`;
  };
  const poly = axes.map((a, i) => pt(i, a.v)).join(' ');
  return (
    <svg viewBox="0 0 150 150" style={{ width: '100%', maxWidth: 260, margin: '0 auto', display: 'block' }}>
      {[25, 50, 75, 100].map(r => (
        <polygon key={r} points={axes.map((_, i) => pt(i, r)).join(' ')} fill="none" stroke="rgba(255,255,255,.12)" />
      ))}
      <polygon points={poly} fill="rgba(34,211,238,.18)" stroke="#22d3ee" strokeWidth="2" />
      {axes.map((a, i) => { const [x, y] = pt(i, 118).split(',').map(Number); return <text key={i} x={x} y={y} fill="#94a3b8" fontSize="8" textAnchor="middle">{a.label}</text>; })}
    </svg>
  );
};

export const MindView = ({ node, depth = 0 }: { node: { label: string; children: { label: string; children: never[] }[] | { label: string; children: { label: string; children: never[] }[] }[] }; depth?: number }) => (
  <div>
    <div className={`mnode ${depth === 0 ? 'root' : ''}`}>{node.label}</div>
    {(node.children as { label: string; children: never[] }[]).length > 0 && (
      <div className="mkids">
        {(node.children as { label: string; children: never[] }[]).map((k, i) => <MindView key={i} node={k as never} depth={depth + 1} />)}
      </div>
    )}
  </div>
);

export function useSheet() {
  const [open, setOpen] = useState<string | null>(null);
  return { open, show: setOpen, hide: () => setOpen(null) };
}

/** اختيار زجاجي بديل عن قائمة النظام السوداء */
export function PickSheet({ label, value, options, onPick, placeholder }: {
  label?: string; value: string; options: { id: string; name: string; color?: string }[];
  onPick: (id: string) => void; placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const cur = options.find(o => o.id === value);
  return (
    <div>
      {label && <label className="lbl">{label}</label>}
      <button className="btn" style={{ width: '100%', justifyContent: 'space-between' }} onClick={() => setOpen(true)}>
        <span className="row">{cur?.color && <span className="dot" style={{ background: cur.color }} />}
          <span>{cur ? cur.name : <span className="mut">{placeholder ?? '— اختر —'}</span>}</span></span>
        <span className="mut">▾</span>
      </button>
      {open && (
        <Sheet title={label ?? 'اختر'} onClose={() => setOpen(false)}>
          <div style={{ display: 'grid', gap: 8 }}>
            {options.map(o => (
              <button key={o.id} className={`task ${value === o.id ? 'glow-cyan' : ''}`}
                style={{ cursor: 'pointer', fontFamily: 'inherit', color: 'inherit', textAlign: 'start', width: '100%' }}
                onClick={() => { onPick(o.id); setOpen(false); }}>
                {o.color ? <span className="dot" style={{ background: o.color }} /> : <span className="dot" style={{ background: '#22d3ee' }} />}
                <span className="small" style={{ fontWeight: 600, flex: 1 }}>{o.name}</span>
                {value === o.id && <span>✓</span>}
              </button>
            ))}
            {!options.length && <div className="small mut">لا خيارات بعد.</div>}
          </div>
        </Sheet>
      )}
    </div>
  );
}
