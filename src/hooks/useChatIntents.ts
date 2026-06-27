import { chatApi, ResponseCard } from '../api/chat.api'

export type { ResponseCard }

export interface ActionButton {
  label: string
  route?: string
  actionType?: string
}

export type ChatResult =
  | { type: 'answer'; text: string; items?: string[]; cards?: ResponseCard[]; actions?: ActionButton[] }
  | { type: 'not_configured'; question: string }
  | { type: 'error'; message?: string }

export const QUICK_CHIPS = [
  { emoji: '📦', label: 'مخزون منخفض',     accent: 'border-l-red-400',     trigger: 'ما المنتجات التي نفد مخزونها أو يوشك على النفاد؟' },
  { emoji: '📊', label: 'ملخص المخزون',    accent: 'border-l-sky-400',     trigger: 'أعطني ملخصاً عن حالة المخزون الآن' },
  { emoji: '🛒', label: 'ماذا أطلب؟',      accent: 'border-l-emerald-400', trigger: 'ماذا يجب أن أطلب هذا الأسبوع؟' },
  { emoji: '🎯', label: 'كم أطلب من دواء؟', accent: 'border-l-teal-400',    trigger: 'كم علبة بانادول يجب أن أطلب؟ ومن أرخص مورد؟' },
  { emoji: '📉', label: 'رادار الإيراد',   accent: 'border-l-rose-400',    trigger: 'ما المنتجات التي طلبها عملاء ولم نتمكن من توفيرها؟ وكم بلغ الإيراد الضائع؟' },
  { emoji: '⚠️', label: 'انتهاء صلاحية',  accent: 'border-l-amber-400',   trigger: 'ما المنتجات التي ستنتهي صلاحيتها خلال 90 يوماً؟' },
  { emoji: '🛑', label: 'بضاعة راكدة',    accent: 'border-l-gray-400',    trigger: 'ما المنتجات التي لم تتحرك منذ فترة طويلة؟' },
  { emoji: '💡', label: 'فرص P2P',         accent: 'border-l-violet-400',  trigger: 'ما فرص الشراء المتاحة عبر P2P؟' },
  { emoji: '🔄', label: 'طلبات P2P عالقة', accent: 'border-l-orange-400',  trigger: 'في طلبات P2P متأخرة أو عالقة تحتاج متابعة؟' },
  { emoji: '💰', label: 'فروق الكاشير',    accent: 'border-l-rose-500',    trigger: 'في فروق نقدية أو مشكلات في شفتات الكاشير الأخيرة؟' },
  { emoji: '📋', label: 'طلبات الشراء',    accent: 'border-l-emerald-500', trigger: 'ما حالة طلبات الشراء المعلّقة أو المتأخرة؟' },
]

export function useChatIntents() {
  const resolveIntent = async (question: string): Promise<ChatResult> => {
    try {
      const res = await chatApi.ask(question)

      if (res.type === 'answer') {
        return { type: 'answer', text: res.text ?? '', cards: res.cards, actions: res.actions }
      }
      if (res.type === 'not_configured') {
        return { type: 'not_configured', question: res.question ?? question }
      }
      return { type: 'error', message: res.message }
    } catch {
      return { type: 'error', message: 'تعذّر الاتصال بالخادم. تحقق من الشبكة وحاول مجدداً.' }
    }
  }

  return { resolveIntent }
}
