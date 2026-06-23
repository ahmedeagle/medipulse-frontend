import { Mic, MicOff } from 'lucide-react'
import { useVoiceSearch } from '../../hooks/useVoiceSearch'

interface Props {
  onResult: (text: string) => void
  className?: string
}

export function VoiceMicButton({ onResult, className = '' }: Props) {
  const { listening, supported, start } = useVoiceSearch(onResult)

  if (!supported) return null

  return (
    <button
      type="button"
      onClick={start}
      title={listening ? 'جاري الاستماع…' : 'بحث صوتي'}
      className={`transition-colors ${listening ? 'text-red-500 animate-pulse' : 'text-gray-400 hover:text-violet-600'} ${className}`}
    >
      {listening ? <MicOff size={14} /> : <Mic size={14} />}
    </button>
  )
}

