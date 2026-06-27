import client from './client';

// ── Orchestrator types (mirror of backend) ───────────────────────────────────

export interface PlanSplit {
  source: 'p2p' | 'supplier';
  sourceId: string;
  sourceName: string;
  qty: number;
  unitPrice: number;
  reliabilityScore?: number;
  reason: string;
}

export interface ConflictResolution {
  rule: string;
  fired: boolean;
  outcome: string;
}

export interface ExplainabilityRecord {
  triggerEvent: string;
  inputsSnapshot: {
    demandForecastUnits: number;
    currentStockUnits: number;
    financialHealthSummary: { cashRisk: boolean; creditUtilization: number };
    marketAvailabilityRate: number;
    p2pListingsCount: number;
    supplierOptionsCount: number;
    lastAvgUnitPrice: number;
  };
  computedSignals: {
    urgencyScore: number;
    financialRisk: 'low' | 'medium' | 'high';
    marketShortageRisk: boolean;
    priceVolatility: number;
  };
  conflictResolutions: ConflictResolution[];
  rejectedOptions: Array<{ name: string; type: 'supplier' | 'p2p'; rejectedReason: string }>;
  selectedPlanReason: string;
  financialImpact: {
    totalCost: number;
    savedVsHistoricalAvg: number;
    financialWarning: boolean;
    financialWarningReason?: string;
  };
  riskScore: number;
  confidence: number;
}

export interface FinancialStatus {
  creditAvailable: number;
  creditLimit: number;
  utilizationBeforePurchase: number;
  utilizationAfterPurchase: number;
  cashRisk: 'low' | 'medium' | 'high';
  recommendation: 'approve_now' | 'approve_with_caution' | 'delay_recommended';
}

export interface DelayRecommendation {
  recommendedDelayDays: number;
  reasonCode:
    | 'cash_inflow_expected'
    | 'credit_reset_expected'
    | 'low_urgency_high_finrisk'
    | 'price_drop_expected';
  humanReason: string;
  projectedInflow: number;
  daysToCoverCost: number | null;
  confidence: 'low' | 'medium' | 'high';
}

export interface OverpaymentRecommendation {
  overpaymentPct: number;
  thresholdPct: number;
  effectiveUnitPrice: number;
  marketAvgUnitPrice: number;
  bestAlternativeUnitPrice: number | null;
  bestAlternativeIsMarketplace: boolean;
  humanReason: string;
  confidence: 'low' | 'medium' | 'high';
}

export interface OrchestratorResult {
  productId: string;
  productName: string;
  qtyRequired: number;
  splits: PlanSplit[];
  totalCost: number;
  riskScore: number;
  confidence: number;
  insufficientSupply: boolean;
  financialStatus: FinancialStatus;
  /** Optional counter-recommendation — null means "act now". */
  delayRecommendation: DelayRecommendation | null;
  /** Optional overpayment warning — null means "price is fair". */
  overpaymentRecommendation: OverpaymentRecommendation | null;
  explainability: ExplainabilityRecord;
}

export interface CartItem {
  draftId: string;
  productId: string;
  productName?: string;
  source: 'p2p' | 'supplier';
  sourceName: string;
  qty: number;
  unitPrice: number;
  totalCost: number;
  riskScore: number;
  confidence: number;
  stale: boolean;
  freshAt: string | null;
  explainability: ExplainabilityRecord;
  financialStatus?: FinancialStatus;
  delayRecommendation?: DelayRecommendation | null;
  overpaymentRecommendation?: OverpaymentRecommendation | null;
}

export interface CartSummary {
  items: CartItem[];
  totalCost: number;
  hasStaleItems: boolean;
  productCount: number;
}

export interface SimulationConstraints {
  delayDays?: number;
  sourceFilter?: 'p2p_only' | 'supplier_only' | 'all';
  maxBudget?: number;
  excludeSupplierIds?: string[];
}

// ─────────────────────────────────────────────────────────────────────────────

export const procurementApi = {
  // Legacy endpoints
  getQueue: () => client.get('/procurement/queue'),
  getDrafts: () => client.get('/procurement/drafts'),
  approveDraft: (id: string) => client.post(`/procurement/drafts/${id}/approve`),
  rejectDraft: (id: string, reason?: string) =>
    client.delete(`/procurement/drafts/${id}`, { data: { reason } }),

  // Decision Engine
  generatePlan: (productId: string, qty: number, constraints?: SimulationConstraints) =>
    client.post<OrchestratorResult>('/procurement/plan', { productId, qty, constraints }),

  simulate: (productId: string, qty: number, constraints: SimulationConstraints) =>
    client.post<{ baseline: OrchestratorResult; simulated: OrchestratorResult; costDelta: number; riskDelta: number; recommendation: string }>(
      '/procurement/simulate',
      { productId, qty, constraints },
    ),

  // Cart (Procurement Draft Plan)
  addToCart: (productId: string, qty: number) =>
    client.post<OrchestratorResult>('/procurement/cart/add', { productId, qty }),

  getCart: () => client.get<CartSummary>('/procurement/cart'),

  recomputeCart: () =>
    client.post<{ recomputedProducts: number; changes: Array<{ productId: string; oldCost: number; newCost: number; riskDelta: number }> }>(
      '/procurement/cart/recompute',
    ),

  removeCartItem: (draftId: string) =>
    client.delete(`/procurement/cart/${draftId}`),

  /**
   * Inline-edit a cart line. Only qty and/or unitPrice are editable —
   * supplier swaps re-run the orchestrator via addToCart so the
   * explainability record stays consistent.
   */
  updateCartItem: (draftId: string, patch: { qty?: number; unitPrice?: number }) =>
    client.patch<CartItem>(`/procurement/cart/${draftId}`, patch).then(r => r.data),

  checkoutCart: () =>
    client.post<{ supplierOrderIds: string[]; p2pOrderIds: string[]; checkedOutDraftIds: string[] }>(
      '/procurement/cart/checkout',
    ),

  applyPlan: (plan: OrchestratorResult) =>
    client.post<CartSummary>('/procurement/cart/apply-plan', { plan }),

  // ─── Ask Agent (Conversational intake — P3) ─────────────────────────────

  /**
   * Sends raw text the pharmacist typed (or pasted) and gets back parsed
   * lines, the best Product match per line, and a Decision Engine plan
   * for every match. No DB writes happen here — this is a preview.
   */
  askAgent: (text: string) =>
    client.post<AskPreview>('/procurement/ask', { text }).then((r) => r.data),

  /**
   * Adds the items the pharmacist confirmed in the preview to the cart.
   * Returns counts plus a list of any items the cart layer refused.
   */
  applyAskAgent: (items: Array<{ productId: string; qty: number }>) =>
    client
      .post<{ added: number; skipped: Array<{ productId: string; reason: string }> }>(
        '/procurement/ask/apply',
        { items },
      )
      .then((r) => r.data),
};

// ─── Ask Agent types ────────────────────────────────────────────────────────

export interface AskProductMatch {
  productId: string;
  name: string;
  nameAr: string | null;
  genericName: string | null;
  strength: string | null;
  dosageForm: string | null;
  score: number;
  confidence: 'high' | 'medium' | 'low';
}

export interface AskResolvedLine {
  raw: string;
  qty: number;
  query: string;
  match: AskProductMatch | null;
  plan: OrchestratorResult | null;
}

export interface AskPreview {
  items: AskResolvedLine[];
  unparsable: string[];
  totalCost: number;
  highestRisk: number;
}
