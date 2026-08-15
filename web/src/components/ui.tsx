import { ReactNode, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { IconX } from './icons';

export const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');

export function Avatar({
  name, color, size = 38, variant = 'solid', src = null,
}: {
  name: string;
  color: string;
  size?: number;
  variant?: 'solid' | 'ring' | 'outline';
  src?: string | null;
}) {
  return (
    <span
      className={`avatar ${variant === 'ring' ? 'ring' : ''} ${variant === 'outline' ? 'outline' : ''}`}
      style={{ ['--c' as string]: color, width: size, height: size, fontSize: size * 0.36 }}
    >
      {src
        ? <img className="avatar-img" src={src} alt="" />
        : initials(name)}
    </span>
  );
}

export function Spinner() {
  return <div className="spinner" aria-label="Loading" />;
}

export function Empty({ glyph = '⛳', title, hint }: { glyph?: string; title: string; hint?: string }) {
  return (
    <div className="empty">
      <div className="glyph">{glyph}</div>
      <strong>{title}</strong>
      {hint && <span className="small">{hint}</span>}
    </div>
  );
}

export function Sheet({
  open, onClose, title, children,
}: { open: boolean; onClose: () => void; title?: string; children: ReactNode }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  if (!open) return null;

  // Rendered through a portal on purpose. The screens animate in with a
  // transform, and an element with a transform animation becomes the
  // containing block for its fixed-position descendants — which would size
  // this scrim to the whole scrolling page and park the sheet below the fold.
  // Mounting on document.body keeps it anchored to the viewport regardless.
  return createPortal(
    <div className="scrim" onClick={onClose} role="dialog" aria-modal="true" aria-label={title}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="grab" />
        {title && (
          <div className="row between" style={{ marginBottom: 16 }}>
            <h2 style={{ fontSize: 20 }}>{title}</h2>
            <button className="icon-btn" onClick={onClose} aria-label="Close"><IconX /></button>
          </div>
        )}
        {children}
      </div>
    </div>,
    document.body,
  );
}

export function StatTile({ value, label, accent }: { value: ReactNode; label: string; accent?: string }) {
  return (
    <div className="stat-tile">
      <div className="v num" style={accent ? { color: accent } : undefined}>{value}</div>
      <div className="k">{label}</div>
    </div>
  );
}

/** Golf scorecard notation: circles for under par, squares for over. */
export function ScoreMark({ strokes, label }: { strokes: number | null; label: string | null }) {
  // 'blank', not 'empty' — .empty is the page-level empty state and its padding
  // would stretch every scorecard row that has an unplayed hole in it.
  if (strokes == null) return <span className="mark blank">–</span>;
  return <span className={`mark ${label ?? ''} num`}>{strokes}</span>;
}

export const relativeTime = (iso: string) => {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
};

export const toPar = (value: number) => (value === 0 ? 'E' : value > 0 ? `+${value}` : `${value}`);

/** Rands from cents. R1 350, thin-spaced thousands, cents only when they exist. */
export const rands = (cents: number) => {
  const value = (cents || 0) / 100;
  const whole = Number.isInteger(value);
  return `R${value.toLocaleString('en-ZA', {
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: 2,
  }).replace(/,/g, ' ')}`;
};

/** 'Sat 22 Aug' — how a tee time reads on a booking. */
export const shortDate = (date: string) =>
  new Date(`${date}T12:00:00`).toLocaleDateString('en-ZA', {
    weekday: 'short', day: 'numeric', month: 'short',
  });

export const dayLabel = (date: string) => {
  const todayISO = new Date().toLocaleDateString('en-CA');
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  if (date === todayISO) return 'Today';
  if (date === tomorrow.toLocaleDateString('en-CA')) return 'Tomorrow';
  return shortDate(date);
};

export const ordinal = (n: number) => {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
};
