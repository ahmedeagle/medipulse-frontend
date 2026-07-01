import { create } from 'zustand'
import { persist } from 'zustand/middleware'

// ─────────────────────────────────────────────────────────────────────────────
// Manual purchase cart — distinct from the AI "smart plan" (procurement cart).
//
//   • Smart plan  → procurementApi.addToCart → orchestrator picks the best
//                   source across ALL suppliers + P2P. The pharmacist delegates
//                   the sourcing decision to the Decision Engine.
//   • Manual cart → the pharmacist deliberately buys a specific product from a
//                   specific distributor (trust, payment terms, relationship).
//                   Grouped by supplier so checkout creates one order per store
//                   (Aumet-style multi-store cart).
//
// Persisted to localStorage so the cart survives refreshes.
// ─────────────────────────────────────────────────────────────────────────────

export interface ManualCartLine {
  productId: string
  productName: string
  unitPrice: number
  currency: string
  qty: number
  maxStock: number
  imageUrl?: string | null
}

export interface ManualCartGroup {
  supplierTenantId: string
  supplierName: string
  items: ManualCartLine[]
}

interface ManualCartState {
  groups: Record<string, ManualCartGroup>
  addItem: (
    supplier: { supplierTenantId: string; supplierName: string },
    line: ManualCartLine,
  ) => void
  setQty: (supplierTenantId: string, productId: string, qty: number) => void
  removeItem: (supplierTenantId: string, productId: string) => void
  clearSupplier: (supplierTenantId: string) => void
  clearAll: () => void
}

export const useManualCart = create<ManualCartState>()(
  persist(
    (set) => ({
      groups: {},

      addItem: (supplier, line) =>
        set((state) => {
          const existing = state.groups[supplier.supplierTenantId]
          const items = existing ? [...existing.items] : []
          const idx = items.findIndex((i) => i.productId === line.productId)
          if (idx >= 0) {
            const merged = Math.min(items[idx].qty + line.qty, line.maxStock || Infinity)
            items[idx] = { ...items[idx], qty: merged, unitPrice: line.unitPrice }
          } else {
            items.push(line)
          }
          return {
            groups: {
              ...state.groups,
              [supplier.supplierTenantId]: {
                supplierTenantId: supplier.supplierTenantId,
                supplierName: supplier.supplierName,
                items,
              },
            },
          }
        }),

      setQty: (supplierTenantId, productId, qty) =>
        set((state) => {
          const group = state.groups[supplierTenantId]
          if (!group) return state
          const items = group.items.map((i) =>
            i.productId === productId ? { ...i, qty: Math.max(1, qty) } : i,
          )
          return { groups: { ...state.groups, [supplierTenantId]: { ...group, items } } }
        }),

      removeItem: (supplierTenantId, productId) =>
        set((state) => {
          const group = state.groups[supplierTenantId]
          if (!group) return state
          const items = group.items.filter((i) => i.productId !== productId)
          const groups = { ...state.groups }
          if (items.length === 0) delete groups[supplierTenantId]
          else groups[supplierTenantId] = { ...group, items }
          return { groups }
        }),

      clearSupplier: (supplierTenantId) =>
        set((state) => {
          const groups = { ...state.groups }
          delete groups[supplierTenantId]
          return { groups }
        }),

      clearAll: () => set({ groups: {} }),
    }),
    { name: 'bnoov-manual-cart' },
  ),
)

// ─── Selectors / helpers ──────────────────────────────────────────────────────

export function manualCartItemCount(groups: Record<string, ManualCartGroup>): number {
  return Object.values(groups).reduce((sum, g) => sum + g.items.length, 0)
}

export function manualCartTotal(groups: Record<string, ManualCartGroup>): number {
  return Object.values(groups).reduce(
    (sum, g) => sum + g.items.reduce((s, i) => s + i.unitPrice * i.qty, 0),
    0,
  )
}

export function groupSubtotal(group: ManualCartGroup): number {
  return group.items.reduce((s, i) => s + i.unitPrice * i.qty, 0)
}
