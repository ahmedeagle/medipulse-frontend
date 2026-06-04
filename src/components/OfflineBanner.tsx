import { useEffect, useState } from 'react'
import { WifiOff, Wifi } from 'lucide-react'

/**
 * Modern, unobtrusive offline indicator.
 *
 * Behaviour:
 *  - When the browser goes offline a glassy red banner slides down from the
 *    top of the viewport with a clear bilingual message.
 *  - When connectivity is restored a green "back online" toast briefly appears
 *    and auto-dismisses after 2.5 seconds.
 *
 * Styling is intentionally Tailwind-only and self-contained — no provider or
 * portal is required. Drop <OfflineBanner /> once at the App root.
 */
export function OfflineBanner() {
  const [online, setOnline] = useState(
    typeof navigator !== 'undefined' ? navigator.onLine : true,
  )
  const [showRestored, setShowRestored] = useState(false)

  useEffect(() => {
    const goOffline = () => { setOnline(false); setShowRestored(false) }
    const goOnline  = () => {
      setOnline(true)
      setShowRestored(true)
      const t = window.setTimeout(() => setShowRestored(false), 2500)
      return () => window.clearTimeout(t)
    }
    window.addEventListener('offline', goOffline)
    window.addEventListener('online',  goOnline)
    return () => {
      window.removeEventListener('offline', goOffline)
      window.removeEventListener('online',  goOnline)
    }
  }, [])

  return (
    <>
      {/* Offline banner */}
      <div
        role="status"
        aria-live="polite"
        className={[
          'fixed top-0 inset-x-0 z-[1000] pointer-events-none',
          'flex justify-center px-4 pt-3 transition-all duration-300 ease-out',
          online ? '-translate-y-full opacity-0' : 'translate-y-0 opacity-100',
        ].join(' ')}
      >
        <div className="pointer-events-auto flex items-center gap-3 rounded-2xl bg-red-600/95 backdrop-blur-md px-4 py-2.5 shadow-lg shadow-red-900/20 ring-1 ring-white/10">
          <span className="relative flex h-2.5 w-2.5">
            <span className="absolute inset-0 animate-ping rounded-full bg-red-300 opacity-75" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-red-200" />
          </span>
          <WifiOff size={16} className="text-white shrink-0" />
          <div className="text-white text-sm leading-tight">
            <p className="font-semibold">لا يوجد اتصال بالإنترنت</p>
            <p className="text-white/80 text-xs">سيتم استئناف العمليات تلقائياً عند عودة الاتصال</p>
          </div>
        </div>
      </div>

      {/* Back-online toast */}
      <div
        role="status"
        aria-live="polite"
        className={[
          'fixed top-0 inset-x-0 z-[1000] pointer-events-none',
          'flex justify-center px-4 pt-3 transition-all duration-300 ease-out',
          showRestored ? 'translate-y-0 opacity-100' : '-translate-y-full opacity-0',
        ].join(' ')}
      >
        <div className="pointer-events-auto flex items-center gap-3 rounded-2xl bg-emerald-600/95 backdrop-blur-md px-4 py-2.5 shadow-lg shadow-emerald-900/20 ring-1 ring-white/10">
          <Wifi size={16} className="text-white shrink-0" />
          <p className="text-white text-sm font-semibold leading-tight">تم استعادة الاتصال</p>
        </div>
      </div>
    </>
  )
}

export default OfflineBanner
