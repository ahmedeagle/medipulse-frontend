import { create } from 'zustand'

// ─────────────────────────────────────────────────────────────────────────────
// Global cart-UI state — controls the two procurement cart drawers from
// anywhere in the app (header cart icon, catalog buttons, deep links).
//
// The carts themselves are persisted:
//   • Smart plan  → server-side (ProcurementDraft rows, survives 48h).
//   • Manual cart → localStorage (zustand persist).
//
// Previously the drawers were mounted only inside CatalogPage, so once the
// pharmacist navigated away there was no way to reopen a saved cart — items
// looked "lost". Mounting the drawers globally + a persistent header icon
// makes the saved carts reachable from every page.
// ─────────────────────────────────────────────────────────────────────────────

interface CartUiState {
  smartOpen: boolean
  manualOpen: boolean
  openSmart: () => void
  openManual: () => void
  closeSmart: () => void
  closeManual: () => void
}

export const useCartUi = create<CartUiState>((set) => ({
  smartOpen: false,
  manualOpen: false,
  openSmart: () => set({ smartOpen: true, manualOpen: false }),
  openManual: () => set({ manualOpen: true, smartOpen: false }),
  closeSmart: () => set({ smartOpen: false }),
  closeManual: () => set({ manualOpen: false }),
}))
