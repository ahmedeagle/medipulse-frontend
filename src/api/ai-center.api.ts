import client from './client'

// ── types ────────────────────────────────────────────────────────────────────

export type ApprovalStatus =
  | 'pending'
  | 'modified'
  | 'approved'
  | 'rejected'
  | 'executed'
  | 'expired'

export type ApprovalPriority = 'low' | 'medium' | 'high' | 'critical'

export type ConfidenceLabel = 'very_high' | 'high' | 'medium' | 'low'

export type ApprovalSubjectType =
  | 'smart_procurement'
  | 'listing_suggestion'
  | 'expired_quarantine'
  | 'recommendation'
  | 'procurement_draft'
  | 'inventory_item'
  | 'p2p_order_action'
  | 'pos_shift_action'
  | 'expiry_liquidation'
  | 'low_stock'
  | 'dead_stock_clearance'

export interface Approval {
  id:               string
  tenantId:         string
  agentCode:        string
  subjectType:      ApprovalSubjectType | string
  subjectId:        string
  title:            string
  summary:          string
  rationale:        string
  confidence:       number
  confidenceLabel:  ConfidenceLabel
  confidenceReason: string | null
  priority:         ApprovalPriority
  status:           ApprovalStatus
  payload:          Record<string, any>
  originalPayload:  Record<string, any> | null
  createdByAgent:   string
  createdAt:        string
  reviewedByUserId: string | null
  reviewedAt:       string | null
  decisionNote:     string | null
  executedAt:       string | null
  executionResult:  Record<string, any> | null
  expiresAt:        string | null
  updatedAt:        string
}

export interface ApprovalEvent {
  id:           string
  approvalId:   string
  tenantId:     string
  agentCode:    string
  fromStatus:   string | null
  toStatus:     string
  actorUserId:  string | null
  actorType:    'user' | 'agent' | 'system' | 'scheduler'
  note:         string | null
  payloadDiff:  Record<string, { from: any; to: any }> | null
  createdAt:    string
  // Enriched by tenantEvents() for the audit feed
  approvalTitle?:       string | null
  approvalSubjectType?: string | null
  approvalSubjectId?:   string | null
  approvalPriority?:    ApprovalPriority | null
}

export interface ApprovalCounts {
  total: number
  pending: number
  pendingCritical: number
  modified: number
  approved: number
  rejected: number
  executed: number
  expired: number
}

export interface Agent {
  code:          string
  nameEn:        string
  nameAr:        string
  category:      string
  descriptionEn: string
  descriptionAr: string
  skills:        string[]
  permissions:   string[]
  restrictions:  string[]
  outputTypes:   string[]
  phase:         number
  iconKey:       string
  enabled:       boolean
  minConfidence: number
  customised:    boolean
}

/** Full agent definition incl. prompt + schema (PRD §13). */
export interface AgentDefinition extends Agent {
  systemPromptAr:     string | null
  triggerRules:       Record<string, any>
  outputSubjectType:  string | null
  outputSchema:       Record<string, any>
  version:            number
  isCustom:           boolean
  tenantScope:        'global' | 'tenant'
  tenantId:           string | null
  createdByUserId:    string | null
  parentDefinitionId: string | null
  createdAt:          string
  updatedAt:          string
}

export interface DashboardWidget {
  key:            string
  titleAr:        string
  titleEn:        string
  count:          number
  severity:       'info' | 'warning' | 'danger' | 'success'
  iconKey:        string
  deepLink:       string
  emptyMessageAr?: string
}

export interface WorkforceSummary {
  generatedAt:    string
  widgets:        DashboardWidget[]
  expiryRiskEgp:  number
  pendingApprovals: {
    total:    number
    critical: number
    high:     number
    byAgent:  Array<{ agentCode: string; count: number }>
  }
  topApprovals: Array<{
    id:              string
    title:           string
    summary:         string
    priority:        ApprovalPriority
    agentCode:       string
    confidenceLabel: ConfidenceLabel
    createdAt:       string
  }>
}

export interface AiRunStats {
  windowDays:        number
  totalRuns:         number
  success:           number
  failed:            number
  blocked:           number
  avgLatencyMs:      number
  p95LatencyMs:      number
  totalInputTokens:  number
  totalOutputTokens: number
  recommendationsGenerated: number
}

export interface AiRunRow {
  id:                       string
  createdAt:                string
  model:                    string
  promptVersion:            string
  status:                   string
  recommendationsGenerated: number
  latencyMs:                number
  inputTokens:              number
  outputTokens:             number
  outputsBlocked:           number
  errorMessage:             string | null
}

export interface TokenUsageToday {
  inputTokens:  number
  outputTokens: number
  calls:        number
  cap:          number
  remaining:    number
  percent:      number
}

export type AiFeature = 'procurement' | 'chat' | 'migration' | 'whatsapp' | 'generic'

export interface TokenUsageBreakdownRow {
  feature:       AiFeature
  inputTokens:   number
  outputTokens:  number
  calls:         number
  cap:           number
  remaining:     number
  percent:       number
  inputCostUsd:  number
  outputCostUsd: number
  totalCostUsd:  number
}

export const aiCenterApi = {
  workforceSummary: (): Promise<WorkforceSummary> =>
    client.get('/ai-center/workforce/summary').then(r => r.data),

  // Approvals
  listApprovals: (params: {
    status?:      ApprovalStatus
    agentCode?:   string
    subjectType?: string
    priority?:    ApprovalPriority
    limit?:       number
    offset?:      number
  } = {}): Promise<{ data: Approval[]; total: number }> =>
    client.get('/ai-center/approvals', { params }).then(r => r.data),

  approvalCounts: (): Promise<ApprovalCounts> =>
    client.get('/ai-center/approvals/counts').then(r => r.data),

  getApproval: (id: string): Promise<Approval> =>
    client.get(`/ai-center/approvals/${id}`).then(r => r.data),

  getApprovalEvents: (id: string): Promise<ApprovalEvent[]> =>
    client.get(`/ai-center/approvals/${id}/events`).then(r => r.data),

  modifyApproval: (id: string, payload: Record<string, any>, note?: string): Promise<Approval> =>
    client.patch(`/ai-center/approvals/${id}/modify`, { payload, note }).then(r => r.data),

  approve: (id: string, note?: string): Promise<Approval> =>
    client.post(`/ai-center/approvals/${id}/approve`, { note }).then(r => r.data),

  reject: (id: string, note?: string): Promise<Approval> =>
    client.post(`/ai-center/approvals/${id}/reject`, { note }).then(r => r.data),

  bulkApprove: (ids: string[], note?: string): Promise<{ approved: number; skipped: number }> =>
    client.post('/ai-center/approvals/bulk/approve', { ids, note }).then(r => r.data),

  bulkReject: (ids: string[], note?: string): Promise<{ rejected: number; skipped: number }> =>
    client.post('/ai-center/approvals/bulk/reject', { ids, note }).then(r => r.data),

  // Agents
  listAgents: (): Promise<Agent[]> =>
    client.get('/ai-center/agents').then(r => r.data),

  updateAgent: (code: string, patch: { enabled?: boolean; minConfidence?: number | null }): Promise<unknown> =>
    client.patch(`/ai-center/agents/${code}`, patch).then(r => r.data),

  // Agent definitions (PRD §13: prompt + schema view/edit)
  getAgentDefinition: (code: string): Promise<AgentDefinition> =>
    client.get(`/ai-center/agents/${code}/definition`).then(r => r.data),

  updateAgentDefinition: (
    code: string,
    patch: { systemPromptAr?: string | null; outputSchema?: Record<string, any> },
  ): Promise<AgentDefinition> =>
    client.patch(`/ai-center/agents/${code}/definition`, patch).then(r => r.data),

  tokenUsageToday: (): Promise<TokenUsageToday> =>
    client.get('/ai-center/agents/token-usage/today').then(r => r.data),

  /** Per-feature daily token + cost breakdown — powers the AI Budget widget. */
  tokenUsageBreakdown: (): Promise<TokenUsageBreakdownRow[]> =>
    client.get('/ai-center/agents/token-usage/today/breakdown').then(r => r.data),

  // Audit
  approvalEvents: (limit = 100, offset = 0):
    Promise<{ data: ApprovalEvent[]; total: number; limit: number; offset: number }> =>
    client.get('/ai-center/audit/approval-events', { params: { limit, offset } }).then(r => r.data),

  aiRunStats: (days = 7): Promise<AiRunStats> =>
    client.get('/ai-center/audit/ai-runs/stats', { params: { days } }).then(r => r.data),

  aiRuns: (limit = 25, offset = 0):
    Promise<{ data: AiRunRow[]; total: number; limit: number; offset: number }> =>
    client.get('/ai-center/audit/ai-runs', { params: { limit, offset } }).then(r => r.data),

  // Maintenance
  syncNow: (): Promise<{
    recommendations: { created: number; existed: number }
    procurement:     { created: number; existed: number }
    catalog:         { created: number; existed: number }
  }> =>
    client.post('/ai-center/maintenance/sync-now').then(r => r.data),

  // Generation (replaces legacy /ai/recommendations/generate)
  generate: (): Promise<{ jobId: string; status: 'queued' }> =>
    client.post('/ai-center/generate').then(r => r.data),

  generateStatus: (jobId: string): Promise<{
    jobId:            string
    status:           'queued' | 'waiting' | 'active' | 'delayed' | 'completed' | 'failed' | 'unknown'
    recommendations?: unknown
    error?:           string
    attempts?:        number
  }> =>
    client.get(`/ai-center/generate/${jobId}`).then(r => r.data),
}
