import { useState, useRef, useEffect } from 'react'
import { X, Check, GripVertical } from 'lucide-react'

export type ColDef = { key: string; label: string; group?: string }

export interface ColPickerProps {
  allCols:   ColDef[]
  visible:   Set<string>
  order:     string[]
  onToggle:  (key: string) => void
  onReorder: (newOrder: string[]) => void
  onReset:   () => void
  onClose:   () => void
  checkboxBg?: string   // tailwind bg class, e.g. 'bg-violet-600'. defaults to 'bg-violet-600'
}

export function ColPicker({
  allCols, visible, order, onToggle, onReorder, onReset, onClose,
  checkboxBg = 'bg-violet-600',
}: ColPickerProps) {
  const ref      = useRef<HTMLDivElement>(null)
  const [dragFrom, setDragFrom] = useState<number | null>(null)
  const [dragOver, setDragOver] = useState<number | null>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [onClose])

  // Build ordered list from order array (skip unknown keys)
  const orderedCols = order
    .map(k => allCols.find(c => c.key === k))
    .filter((c): c is ColDef => Boolean(c))

  function handleDragOver(e: React.DragEvent, i: number) {
    e.preventDefault()
    if (dragFrom !== null && dragOver !== i) setDragOver(i)
  }
  function handleDrop(i: number) {
    if (dragFrom === null || dragFrom === i) { reset(); return }
    const newOrder = [...order]
    const [removed] = newOrder.splice(dragFrom, 1)
    newOrder.splice(i, 0, removed)
    onReorder(newOrder)
    reset()
  }
  function reset() { setDragFrom(null); setDragOver(null) }

  return (
    <div
      ref={ref}
      className="absolute left-0 top-full mt-2 z-50 bg-white rounded-2xl border border-gray-200 shadow-xl w-72 py-3"
      style={{ maxHeight: 480, overflowY: 'auto' }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 pb-2 border-b border-gray-100 sticky top-0 bg-white z-10">
        <span className="text-sm font-semibold text-gray-800">الأعمدة والترتيب</span>
        <div className="flex items-center gap-2">
          <button onClick={onReset} className="text-xs text-violet-600 hover:text-violet-700 font-medium">
            إعادة تعيين
          </button>
          <button onClick={onClose}>
            <X size={14} className="text-gray-400 hover:text-gray-600" />
          </button>
        </div>
      </div>
      <p className="text-xs text-gray-400 px-4 py-2">اسحب ↕ لتغيير الترتيب — ✓ لإظهار أو إخفاء</p>

      {/* Draggable rows */}
      <div className="px-3">
        {orderedCols.map((col, i) => (
          <div
            key={col.key}
            draggable
            onDragStart={() => setDragFrom(i)}
            onDragOver={e => handleDragOver(e, i)}
            onDrop={() => handleDrop(i)}
            onDragEnd={reset}
            className={`flex items-center gap-2 py-1.5 px-1 rounded-lg transition-all cursor-default select-none ${
              dragOver === i && dragFrom !== i
                ? 'bg-violet-50 border-t-2 border-violet-400'
                : dragFrom === i
                ? 'opacity-40 bg-gray-50'
                : 'hover:bg-gray-50'
            }`}
          >
            <GripVertical size={14} className="text-gray-300 cursor-grab shrink-0" />
            <button
              onClick={() => onToggle(col.key)}
              className="shrink-0"
              type="button"
            >
              <div className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${
                visible.has(col.key) ? `${checkboxBg} border-transparent` : 'border-gray-300 bg-white'
              }`}>
                {visible.has(col.key) && (
                  <Check size={10} className="text-white" strokeWidth={3} />
                )}
              </div>
            </button>
            <span className={`text-sm flex-1 min-w-0 ${
              visible.has(col.key) ? 'text-gray-700' : 'text-gray-400 line-through'
            }`}>
              {col.label}
            </span>
            {col.group && (
              <span className="text-[10px] text-gray-400 bg-gray-50 px-1 rounded shrink-0">
                {col.group}
              </span>
            )}
          </div>
        ))}
      </div>

      <div className="px-4 pt-2 mt-1 border-t border-gray-100">
        <p className="text-xs text-gray-400">
          {visible.size} مُفعَّل من {allCols.length}
        </p>
      </div>
    </div>
  )
}

