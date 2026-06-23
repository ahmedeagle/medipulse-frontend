import { useState, useMemo, useEffect, useRef } from 'react'
import type { ColDef } from '../components/reports/ColPicker'

function loadFromStorage(storageKey: string, defaultKeys: string[], defaultVisible: Set<string>) {
  let visible: Set<string> = new Set(defaultVisible)
  let order: string[] = defaultKeys

  try {
    const sv = localStorage.getItem(`${storageKey}.v`)
    if (sv) {
      const parsed = JSON.parse(sv) as string[]
      visible = new Set(parsed.filter(k => defaultKeys.includes(k)))
      if (visible.size === 0) visible = new Set(defaultVisible)
    }
  } catch {}

  try {
    const so = localStorage.getItem(`${storageKey}.o`)
    if (so) {
      const saved = JSON.parse(so) as string[]
      const extras = defaultKeys.filter(k => !saved.includes(k))
      order = [...saved.filter(k => defaultKeys.includes(k)), ...extras]
    }
  } catch {}

  return { visible, order }
}

export function useColState(allCols: ColDef[], storageKey: string) {
  const defaultKeys    = allCols.map(c => c.key)
  const defaultVisible = new Set(defaultKeys)

  const [visible, setVisible] = useState<Set<string>>(() =>
    loadFromStorage(storageKey, defaultKeys, defaultVisible).visible
  )

  const [order, setOrderState] = useState<string[]>(() =>
    loadFromStorage(storageKey, defaultKeys, defaultVisible).order
  )

  // Re-initialize when storageKey changes (e.g., granularity switch)
  const prevKey = useRef(storageKey)
  useEffect(() => {
    if (prevKey.current === storageKey) return
    prevKey.current = storageKey
    const { visible: v, order: o } = loadFromStorage(storageKey, defaultKeys, defaultVisible)
    setVisible(v)
    setOrderState(o)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey])

  const displayCols = useMemo(
    () =>
      order
        .filter(k => visible.has(k))
        .map(k => allCols.find(c => c.key === k))
        .filter((c): c is ColDef => Boolean(c)),
    [order, visible, allCols],
  )

  function toggleCol(key: string) {
    setVisible(prev => {
      const next = new Set(prev)
      if (next.has(key)) {
        if (next.size <= 2) return prev
        next.delete(key)
      } else {
        next.add(key)
      }
      try { localStorage.setItem(`${storageKey}.v`, JSON.stringify([...next])) } catch {}
      return next
    })
  }

  function setOrder(newOrder: string[]) {
    setOrderState(newOrder)
    try { localStorage.setItem(`${storageKey}.o`, JSON.stringify(newOrder)) } catch {}
  }

  function reset() {
    setVisible(new Set(defaultVisible))
    setOrderState(defaultKeys)
    try {
      localStorage.removeItem(`${storageKey}.v`)
      localStorage.removeItem(`${storageKey}.o`)
    } catch {}
  }

  return { visible, order, displayCols, toggleCol, setOrder, reset }
}
