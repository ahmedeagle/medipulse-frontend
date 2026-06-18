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
  { label: 'مخزون منخفض 📦',      trigger: 'ما المنتجات التي نفد مخزونها أو يوشك على النفاد؟' },
  { label: 'ماذا أطلب؟ 🛒',       trigger: 'ماذا يجب أن أطلب هذا الأسبوع؟' },
  { label: 'انتهاء صلاحية ⚠️',    trigger: 'ما المنتجات التي ستنتهي صلاحيتها خلال 90 يوماً؟' },
  { label: 'بضاعة راكدة 🛑',      trigger: 'ما المنتجات التي لم تتحرك منذ فترة طويلة؟' },
  { label: 'فرص P2P 💡',          trigger: 'ما فرص الشراء المتاحة عبر P2P؟' },
  { label: 'طلبات P2P عالقة 🔄',  trigger: 'في طلبات P2P متأخرة أو عالقة تحتاج متابعة؟' },
  { label: 'فروق الكاشير 💰',     trigger: 'في فروق نقدية أو مشكلات في شفتات الكاشير الأخيرة؟' },
  { label: 'ملخص المخزون 📊',     trigger: 'أعطني ملخصاً عن حالة المخزون الآن' },
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
