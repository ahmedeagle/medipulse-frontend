import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Star, Loader2, CheckCircle2, MessageSquare } from 'lucide-react'
import { p2pReviewsApi } from '../../api/p2p.api'
import type { AxiosError } from 'axios'

interface Props {
  orderId: string
  sellerTenantId: string
  /** When true, render the form. When false (already reviewed), render the static badge. */
  canEdit?: boolean
}

/**
 * Compact review form for completed P2P orders. Inline (not modal) so the
 * pharmacist can leave a rating from the orders list without losing context.
 *
 * Idempotent: if the buyer has already reviewed this order the backend
 * returns 409 — we surface that as a "تم التقييم" badge and fetch the
 * existing rating from the seller aggregate (best-effort).
 *
 * Visual idiom matches FinancialStatusBar / DelayRecommendationCard:
 * `rounded-xl border p-3 text-xs space-y-2` with the amber/yellow palette
 * for "rating" semantics.
 */
export function P2pReviewInline({ orderId, sellerTenantId, canEdit = true }: Props) {
  const qc = useQueryClient()
  const [rating, setRating] = useState<number>(0)
  const [hovered, setHovered] = useState<number>(0)
  const [comment, setComment] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [alreadyReviewed, setAlreadyReviewed] = useState(false)

  // Hint: if seller has many reviews already we can show their current avg.
  // Cheap call (aggregate endpoint is indexed).
  const { data: agg } = useQuery({
    queryKey: ['p2p-seller-agg', sellerTenantId],
    queryFn: () => p2pReviewsApi.getSellerAggregate(sellerTenantId),
    staleTime: 5 * 60_000,
    enabled: !!sellerTenantId,
  })

  const submitM = useMutation({
    mutationFn: () =>
      p2pReviewsApi.create(orderId, {
        rating,
        comment: comment.trim() || undefined,
      }),
    onSuccess: () => {
      setSubmitted(true)
      qc.invalidateQueries({ queryKey: ['p2p-seller-agg', sellerTenantId] })
    },
    onError: (err: AxiosError<{ message?: string }>) => {
      if (err.response?.status === 409) {
        // Already reviewed — that's fine, we just collapse the form.
        setAlreadyReviewed(true)
      }
    },
  })

  if (submitted || alreadyReviewed) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 flex items-center gap-2 text-xs text-amber-800">
        <CheckCircle2 size={13} className="text-amber-600 shrink-0" />
        <span className="font-semibold">تم تسجيل التقييم — شكراً</span>
        {agg && agg.sampleSize > 0 && (
          <span className="text-[10px] text-amber-600 ms-auto">
            متوسط البائع: {agg.avgRating.toFixed(1)} ⭐ ({agg.sampleSize})
          </span>
        )}
      </div>
    )
  }

  if (!canEdit) return null

  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-3 space-y-2.5">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <MessageSquare size={12} className="text-amber-600" />
          <span className="text-[11px] font-semibold text-amber-800">قيّم هذه الصفقة</span>
        </div>
        {agg && agg.sampleSize > 0 && (
          <span className="text-[10px] text-amber-600">
            تقييم البائع: {agg.avgRating.toFixed(1)} ⭐ ({agg.sampleSize})
          </span>
        )}
      </div>

      {/* Star input — RTL-aware: clicking the rightmost star = 1, leftmost = 5
          (the user fills right-to-left in Arabic just like Latin LTR clicks
          left-to-right). We reverse the array. */}
      <div className="flex items-center gap-1" dir="rtl">
        {[1, 2, 3, 4, 5].map((v) => {
          const active = (hovered || rating) >= v
          return (
            <button
              key={v}
              type="button"
              onClick={() => setRating(v)}
              onMouseEnter={() => setHovered(v)}
              onMouseLeave={() => setHovered(0)}
              className="p-0.5 transition-transform hover:scale-110"
              aria-label={`تقييم ${v}`}
            >
              <Star
                size={20}
                className={
                  active
                    ? 'fill-amber-400 text-amber-400'
                    : 'fill-transparent text-amber-300'
                }
              />
            </button>
          )
        })}
        {rating > 0 && (
          <span className="text-[11px] font-semibold text-amber-700 ms-2 tabular-nums">
            {rating}/5
          </span>
        )}
      </div>

      <textarea
        value={comment}
        onChange={(e) => setComment(e.target.value.slice(0, 1000))}
        placeholder="تعليق (اختياري) — مثل: تسليم سريع، تغليف ممتاز…"
        className="w-full text-[11px] bg-white border border-amber-200 rounded-lg p-2 focus:outline-none focus:ring-2 focus:ring-amber-300 resize-none"
        rows={2}
        dir="rtl"
      />

      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] text-amber-600">{comment.length}/1000</span>
        <button
          type="button"
          onClick={() => submitM.mutate()}
          disabled={!rating || submitM.isPending}
          className="px-3 py-1.5 bg-amber-500 text-white text-[11px] font-semibold rounded-lg hover:bg-amber-600 disabled:opacity-40 transition-colors flex items-center gap-1.5"
        >
          {submitM.isPending ? (
            <>
              <Loader2 size={11} className="animate-spin" />
              جارٍ الإرسال…
            </>
          ) : (
            'إرسال التقييم'
          )}
        </button>
      </div>

      {submitM.isError && !alreadyReviewed && (
        <p className="text-[10px] text-red-600">
          تعذّر إرسال التقييم — حاول مرة أخرى
        </p>
      )}
    </div>
  )
}

/**
 * Inline aggregate badge for marketplace listings / seller cards.
 * Renders a compact stars + count display, or a "seller is new" tag if
 * there are not enough reviews yet.
 */
export function SellerRatingBadge({
  sellerTenantId,
  size = 'md',
}: {
  sellerTenantId: string
  size?: 'sm' | 'md'
}) {
  const { data: agg } = useQuery({
    queryKey: ['p2p-seller-agg', sellerTenantId],
    queryFn: () => p2pReviewsApi.getSellerAggregate(sellerTenantId),
    staleTime: 5 * 60_000,
    enabled: !!sellerTenantId,
  })

  if (!agg || agg.sampleSize === 0) {
    return (
      <span className="inline-flex items-center gap-0.5 text-[10px] text-gray-400 font-medium">
        <Star size={size === 'sm' ? 9 : 11} className="opacity-50" />
        بائع جديد
      </span>
    )
  }

  const star = size === 'sm' ? 10 : 12
  return (
    <span className="inline-flex items-center gap-0.5 text-[11px] text-amber-600 font-semibold tabular-nums">
      <Star size={star} className="fill-amber-400 text-amber-400" />
      {agg.avgRating.toFixed(1)}
      <span className="text-amber-500/70 font-normal">({agg.sampleSize})</span>
    </span>
  )
}
