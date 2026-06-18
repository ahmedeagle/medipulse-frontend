import { useState } from 'react'
import clsx from 'clsx'
import { Shield, CheckSquare, Square, X } from 'lucide-react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { p2pSellerApi } from '../../api/p2p.api'

interface LegalDeclarationModalProps {
  isOpen: boolean
  onConfirmed: () => void
  onCancelled: () => void
}

export function LegalDeclarationModal({ isOpen, onConfirmed, onCancelled }: LegalDeclarationModalProps) {
  const { i18n } = useTranslation()
  const isRTL = i18n.language.startsWith('ar')
  const qc = useQueryClient()
  const [checked, setChecked] = useState(false)

  const ackMutation = useMutation({
    mutationFn: p2pSellerApi.legalAck,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['p2p-seller-profile'] })
      onConfirmed()
    },
  })

  if (!isOpen) return null

  function handleCancel() {
    setChecked(false)
    onCancelled()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={handleCancel} />
      <div className={clsx('relative w-full max-w-lg bg-white rounded-2xl shadow-2xl overflow-hidden', isRTL && 'font-arabic')}>

        {/* Header */}
        <div className="bg-gradient-to-r from-emerald-600 to-teal-600 px-6 py-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center shrink-0">
              <Shield size={20} className="text-white" />
            </div>
            <div className="flex-1">
              <h2 className="text-white font-bold text-lg">
                {isRTL ? 'إقرار قانوني وتنظيمي' : 'Legal & Regulatory Declaration'}
              </h2>
              <p className="text-emerald-100 text-xs mt-0.5">
                {isRTL ? 'مطلوب قبل نشر أي منتج في سوق التبادل' : 'Required before listing on the exchange'}
              </p>
            </div>
            <button
              onClick={handleCancel}
              className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white/80 hover:text-white transition-colors shrink-0"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-4">
          <div className="text-sm text-gray-700 leading-relaxed space-y-3">
            {isRTL ? (
              <>
                <p>بموجب هذا الإقرار، أؤكد أنني أمتثل للتشريعات والأنظمة المعمول بها في مجال تداول الأدوية والمستلزمات الطبية، وتحديداً:</p>
                <ul className="space-y-1.5 ps-4 list-disc text-gray-600">
                  <li>جميع المنتجات المعروضة مرخصة من الجهات التنظيمية المختصة</li>
                  <li>الكميات المعروضة متوفرة فعلياً في مخزون الصيدلية</li>
                  <li>أسعار البيع لا تنتهك أي حدود سعرية رسمية</li>
                  <li>لن يتم الإفصاح عن أي معلومات سرية للمرضى</li>
                  <li>أتحمل المسؤولية الكاملة عن صحة المعلومات المقدمة</li>
                </ul>
                <p className="text-xs text-gray-500 bg-gray-50 rounded-lg p-3 border border-gray-200">
                  يُجدَّد هذا الإقرار كل <strong>90 يوماً</strong>. المخالفة قد تؤدي إلى إيقاف الحساب.
                </p>
              </>
            ) : (
              <>
                <p>By this declaration, I confirm compliance with applicable laws governing pharmaceutical trading:</p>
                <ul className="space-y-1.5 ps-4 list-disc text-gray-600">
                  <li>All listed products are licensed by regulatory authorities</li>
                  <li>Listed quantities are physically available in my pharmacy</li>
                  <li>Prices do not violate any official price ceilings</li>
                  <li>No confidential patient information will be disclosed</li>
                  <li>I accept full responsibility for accuracy of all submitted information</li>
                </ul>
                <p className="text-xs text-gray-500 bg-gray-50 rounded-lg p-3 border border-gray-200">
                  This declaration renews every <strong>90 days</strong>. Violations may result in account suspension.
                </p>
              </>
            )}
          </div>

          {/* Checkbox */}
          <button
            type="button"
            onClick={() => setChecked(v => !v)}
            className={clsx(
              'w-full flex items-start gap-3 p-3 rounded-xl border-2 transition-all text-sm font-medium',
              checked
                ? 'border-emerald-500 bg-emerald-50 text-emerald-700'
                : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300',
            )}
          >
            {checked
              ? <CheckSquare size={18} className="text-emerald-500 shrink-0 mt-0.5" />
              : <Square size={18} className="text-gray-400 shrink-0 mt-0.5" />}
            <span className="text-start">
              {isRTL
                ? 'أقر بأنني قرأت وفهمت وأوافق على جميع البنود المذكورة أعلاه'
                : 'I have read, understood, and agree to all terms stated above'}
            </span>
          </button>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-gray-50 border-t flex gap-3">
          <button
            onClick={handleCancel}
            className="px-5 py-2.5 rounded-xl font-semibold text-sm border border-gray-200 text-gray-600 hover:bg-gray-100 transition-colors"
          >
            {isRTL ? 'إلغاء' : 'Cancel'}
          </button>
          <button
            onClick={() => ackMutation.mutate()}
            disabled={!checked || ackMutation.isPending}
            className={clsx(
              'flex-1 py-2.5 rounded-xl font-semibold text-sm transition-all',
              checked && !ackMutation.isPending
                ? 'bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm'
                : 'bg-gray-200 text-gray-400 cursor-not-allowed',
            )}
          >
            {ackMutation.isPending
              ? (isRTL ? 'جاري الحفظ...' : 'Saving...')
              : (isRTL ? 'تأكيد والمتابعة' : 'Confirm & Continue')}
          </button>
        </div>
      </div>
    </div>
  )
}
