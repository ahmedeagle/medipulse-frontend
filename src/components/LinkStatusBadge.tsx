import { Link2, Link2Off, Sparkles, Clock } from 'lucide-react';

type LinkStatus = 'linked' | 'unlinked' | 'suggested' | 'pending' | undefined | null;

const STYLES: Record<Exclude<LinkStatus, undefined | null>, { label: string; cls: string; icon: any }> = {
  linked:    { label: 'مربوط',         cls: 'bg-teal-50 text-teal-700 border-teal-200',     icon: Link2 },
  unlinked:  { label: 'غير مربوط',     cls: 'bg-gray-50 text-gray-600 border-gray-200',     icon: Link2Off },
  suggested: { label: 'مقترح للمراجعة', cls: 'bg-amber-50 text-amber-700 border-amber-200',  icon: Sparkles },
  pending:   { label: 'قيد المراجعة',  cls: 'bg-blue-50 text-blue-700 border-blue-200',     icon: Clock },
};

export function LinkStatusBadge({
  status, score,
}: {
  status: LinkStatus;
  score?: number | null;
}) {
  const s = STYLES[(status || 'unlinked') as Exclude<LinkStatus, undefined | null>];
  const Icon = s.icon;
  return (
    <span
      title={score != null ? `الثقة: ${Number(score).toFixed(0)}%` : undefined}
      className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-lg border ${s.cls}`}>
      <Icon size={11} />
      {s.label}
      {score != null && status === 'linked' && Number(score) < 95 && (
        <span className="text-[10px] opacity-70">· {Number(score).toFixed(0)}%</span>
      )}
    </span>
  );
}
