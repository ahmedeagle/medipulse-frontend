import clsx from 'clsx'

type BadgeVariant = string

interface BadgeProps {
  status: BadgeVariant
  label?: string
  className?: string
}

const variantMap: Record<string, string> = {
  // ── Original statuses ────────────────────────────────────────────────────
  pending:   'bg-yellow-100 text-yellow-800 border border-yellow-200',
  accepted:  'bg-blue-100 text-blue-800 border border-blue-200',
  shipped:   'bg-purple-100 text-purple-800 border border-purple-200',
  delivered: 'bg-green-100 text-green-800 border border-green-200',
  cancelled: 'bg-red-100 text-red-800 border border-red-200',

  // ── New enterprise order statuses ─────────────────────────────────────────
  draft:               'bg-gray-100 text-gray-500 border border-gray-200',
  pending_approval:    'bg-amber-100 text-amber-800 border border-amber-200',
  submitted:           'bg-yellow-100 text-yellow-800 border border-yellow-200',
  counter_offer:       'bg-orange-100 text-orange-700 border border-orange-200',
  back_ordered:        'bg-orange-100 text-orange-800 border border-orange-200',
  failed_delivery:     'bg-red-100 text-red-700 border border-red-200',
  on_hold:             'bg-slate-100 text-slate-700 border border-slate-200',
  received_pending_qc: 'bg-sky-100 text-sky-800 border border-sky-200',
  partially_delivered: 'bg-teal-100 text-teal-800 border border-teal-200',
  disputed:            'bg-rose-100 text-rose-800 border border-rose-200',
  return_requested:    'bg-pink-100 text-pink-800 border border-pink-200',
  return_approved:     'bg-violet-100 text-violet-800 border border-violet-200',
  return_in_transit:   'bg-purple-100 text-purple-700 border border-purple-200',
  return_received:     'bg-indigo-100 text-indigo-800 border border-indigo-200',
  credit_issued:       'bg-green-100 text-green-700 border border-green-200',

  // ── Inventory / stock ─────────────────────────────────────────────────────
  low:    'bg-red-100 text-red-800 border border-red-200',
  normal: 'bg-green-100 text-green-800 border border-green-200',

  // ── Tenant types ──────────────────────────────────────────────────────────
  pharmacy: 'bg-blue-100 text-blue-800 border border-blue-200',
  supplier: 'bg-indigo-100 text-indigo-800 border border-indigo-200',

  // ── Recommendation types ──────────────────────────────────────────────────
  reorder:           'bg-orange-100 text-orange-800 border border-orange-200',
  price_comparison:  'bg-cyan-100 text-cyan-800 border border-cyan-200',
  alternative:       'bg-violet-100 text-violet-800 border border-violet-200',
  dead_stock_alert:  'bg-gray-100 text-gray-600 border border-gray-300',
  consumption_spike: 'bg-orange-100 text-orange-700 border border-orange-200',
  forecast_alert:    'bg-purple-100 text-purple-700 border border-purple-200',
  reorder_schedule:  'bg-blue-100 text-blue-700 border border-blue-200',
  liquidation:       'bg-amber-100 text-amber-700 border border-amber-200',

  // ── Recall / batch ────────────────────────────────────────────────────────
  active:       'bg-green-100 text-green-700 border border-green-200',
  quarantined:  'bg-orange-100 text-orange-700 border border-orange-200',
  recalled:     'bg-red-100 text-red-700 border border-red-200',
  expired:      'bg-gray-100 text-gray-600 border border-gray-300',
  urgent:       'bg-red-100 text-red-800 border border-red-200',
  voluntary:    'bg-yellow-100 text-yellow-700 border border-yellow-200',
}

const labelMap: Record<string, string> = {
  pending:             'Pending',
  accepted:            'Accepted',
  shipped:             'Shipped',
  delivered:           'Delivered',
  cancelled:           'Cancelled',
  draft:               'Draft',
  pending_approval:    'Pending Approval',
  submitted:           'Submitted',
  counter_offer:       'Counter Offer',
  back_ordered:        'Back Ordered',
  failed_delivery:     'Failed Delivery',
  on_hold:             'On Hold',
  received_pending_qc: 'Pending QC',
  partially_delivered: 'Partial',
  disputed:            'Disputed',
  return_requested:    'Return Requested',
  return_approved:     'Return Approved',
  return_in_transit:   'Return In Transit',
  return_received:     'Return Received',
  credit_issued:       'Credit Issued',
  low:                 'Low Stock',
  normal:              'Normal',
  pharmacy:            'Pharmacy',
  supplier:            'Supplier',
}

export function Badge({ status, label, className }: BadgeProps) {
  const classes = variantMap[status] || 'bg-gray-100 text-gray-800 border border-gray-200'
  const displayLabel = label ?? (labelMap[status] || status.replace(/_/g, ' '))

  return (
    <span className={clsx('inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium capitalize', classes, className)}>
      {displayLabel}
    </span>
  )
}
