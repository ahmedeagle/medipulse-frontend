import { useEffect } from 'react'

/**
 * Sets `document.title` to a section-aware value (e.g. "المخزون · Bnoov").
 * Pass `null`/`undefined` to fall back to the brand-only title.
 *
 * The previous title is restored when the component unmounts so deep-link
 * scenarios (modals, drawers) don't leak a stale title back to the page.
 */
export const BRAND = 'Bnoov'

export function usePageTitle(section?: string | null) {
  useEffect(() => {
    const previous = document.title
    document.title = section ? `${section} · ${BRAND}` : BRAND
    return () => { document.title = previous }
  }, [section])
}
