import { useState, useRef, useEffect } from 'react'
import { Download, FileSpreadsheet, FileText, Printer, ChevronDown } from 'lucide-react'
import { useReportExport } from '../hooks/useReportExport'

interface Props {
  rows: Record<string, unknown>[]
  filename: string
  disabled?: boolean
}

export function ExportButton({ rows, filename, disabled }: Props) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const { exportToExcel, exportToCsv, exportToPdf } = useReportExport()

  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  const handle = (fn: () => void) => { fn(); setOpen(false) }

  return (
    <div ref={ref} className="relative">
      <button
        disabled={disabled}
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-white border border-gray-200 rounded-xl hover:bg-gray-50 disabled:opacity-40 transition-colors"
      >
        <Download size={14} />
        ØªØµØ¯ÙŠØ±
        <ChevronDown size={13} className={open ? 'rotate-180 transition-transform' : 'transition-transform'} />
      </button>

      {open && (
        <div className="absolute end-0 top-full mt-1 w-44 bg-white rounded-xl shadow-lg border border-gray-100 py-1 z-20">
          <button
            onClick={() => handle(() => exportToExcel(rows, filename))}
            className="flex items-center gap-2.5 w-full px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50"
          >
            <FileSpreadsheet size={14} className="text-emerald-600" />
            Excel (.xlsx)
          </button>
          <button
            onClick={() => handle(() => exportToCsv(rows, filename))}
            className="flex items-center gap-2.5 w-full px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50"
          >
            <FileText size={14} className="text-blue-600" />
            CSV
          </button>
          <button
            onClick={() => handle(exportToPdf)}
            className="flex items-center gap-2.5 w-full px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50"
          >
            <Printer size={14} className="text-gray-600" />
            Ø·Ø¨Ø§Ø¹Ø© / PDF
          </button>
        </div>
      )}
    </div>
  )
}
