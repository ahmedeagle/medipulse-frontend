import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'

// Arabic-Indic → Western digits
function arabicNumerals(s: string): string {
  return s.replace(/[٠-٩]/g, d => String(d.charCodeAt(0) - 0x0660))
}

// Strip noise from a voice transcript before searching.
// Dose numbers are dropped so we get all brand variants, not zero results.
// Examples:
//   "بنادول ال 500 ملغ"            → "بنادول"   (all Panadol strengths returned)
//   "بنادول اكسترا ال 500 جرام"   → "بنادول اكسترا"
//   "خمسمائة مل أموكسيسيلين"      → "أموكسيسيلين"
//   "Panadol extra five hundred"   → "Panadol extra"
function normalizeTranscript(raw: string, lang: string): string {
  let s = arabicNumerals(raw.trim())

  if (lang === 'ar') {
    // Remove definite article preceding a digit: "ال 500" → "500", "ال500" → "500"
    s = s.replace(/\bال\s*(?=\d)/g, '')

    // Remove filler unit words that follow numbers (ملغ/ملغم are common STT variants of mg)
    s = s.replace(/\b(\d+)\s*(جرام|جم|غرام|ملجم|مجم|ملغم|ملغ|ملليجرام|ملليلتر|مل|لتر|كجم|كيلوجرام|mg|ml|g|kg)\b/gi, '$1')

    // Remove standalone Arabic measurement / dosage-form noise words
    const AR_NOISE = [
      'أقراص', 'قرص', 'كبسولات', 'كبسولة', 'أمبولات', 'أمبولة',
      'شراب', 'محلول', 'مسحوق', 'قطرات', 'قطرة', 'حقن', 'حقنة',
      'كيس', 'أكياس', 'تحاميل', 'لصقة', 'مرهم', 'كريم', 'جل',
      'بالكيلو', 'باليوم', 'يومياً', 'مرة', 'مرتين',
    ]
    const noiseRe = new RegExp(`\\b(${AR_NOISE.join('|')})\\b`, 'g')
    s = s.replace(noiseRe, '')

    // Remove spelled-out number words (rough cover for common cases)
    const AR_NUMS = [
      'صفر','واحد','اثنين','اثنان','ثلاثة','أربعة','خمسة','ستة','سبعة','ثمانية','تسعة',
      'عشرة','عشرين','ثلاثين','أربعين','خمسين','مئة','مائة','مئتين','خمسمائة','ألف',
    ]
    const numWordsRe = new RegExp(`\\b(${AR_NUMS.join('|')})\\b`, 'g')
    s = s.replace(numWordsRe, '')
  } else {
    // English noise: unit words after numbers
    s = s.replace(/\b(\d+)\s*(mg|ml|g|kg|grams?|milligrams?|liters?|litres?|milliliters?)\b/gi, '$1')

    // English spelled-out numbers → digits (common small set)
    const EN_NUMS: [RegExp, string][] = [
      [/\bone\b/gi,'1'],[/\btwo\b/gi,'2'],[/\bthree\b/gi,'3'],
      [/\bfour\b/gi,'4'],[/\bfive\b/gi,'5'],[/\bsix\b/gi,'6'],
      [/\bseven\b/gi,'7'],[/\beight\b/gi,'8'],[/\bnine\b/gi,'9'],
      [/\bten\b/gi,'10'],[/\bfifty\b/gi,'50'],[/\bhundred\b/gi,'100'],
      [/\bfive hundred\b/gi,'500'],[/\bfour hundred\b/gi,'400'],
    ]
    for (const [re, digit] of EN_NUMS) s = s.replace(re, digit)
  }

  // Strip standalone dose numbers so "بنادول 500" → "بنادول" and voice search returns
  // ALL brand variants (different doses, forms) instead of nothing.
  // A bare digit that was a unit amount is now meaningless without its unit.
  s = s.replace(/\b\d+\b/g, '')

  // Collapse extra whitespace
  return s.replace(/\s{2,}/g, ' ').trim()
}

export function useVoiceSearch(onResult: (text: string) => void) {
  const [listening, setListening] = useState(false)
  const [supported, setSupported] = useState(false)
  const { i18n } = useTranslation()

  useEffect(() => {
    setSupported('SpeechRecognition' in window || 'webkitSpeechRecognition' in window)
  }, [])

  const start = () => {
    const SR =
      (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition
    if (!SR) return

    const rec = new SR()
    rec.lang = i18n.language === 'ar' ? 'ar-EG' : 'en-US'
    rec.interimResults = false
    rec.maxAlternatives = 1
    rec.continuous = false

    rec.onstart = () => setListening(true)
    rec.onend   = () => setListening(false)
    rec.onerror = () => setListening(false)
    rec.onresult = (e: any) => {
      const raw: string = e.results[0][0].transcript
      onResult(normalizeTranscript(raw, i18n.language))
    }

    rec.start()
  }

  return { listening, supported, start }
}
