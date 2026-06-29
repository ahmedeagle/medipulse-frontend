import api from './client'

export type ResponseCardColor = 'emerald' | 'amber' | 'red' | 'blue'

export type ResponseCard =
  | {
      type: 'kpi_row'
      items: Array<{ label: string; value: string; color: ResponseCardColor }>
    }
  | {
      type: 'table'
      title?: string
      columns: Array<{ key: string; header: string; align?: 'start' | 'end' }>
      rows: Record<string, string | number | null>[]
    }
  | {
      type: 'action_confirmed'
      message: string
      route?: string
    }
  | {
      type: 'bars'
      title?: string
      items: Array<{ label: string; value: string; pct: number; color: ResponseCardColor }>
    }

export interface ChatActionButton {
  label: string
  route?: string
  actionType?: string
}

export interface ChatAnswer {
  type: 'answer' | 'not_configured' | 'error'
  text?: string
  cards?: ResponseCard[]
  question?: string
  message?: string
  actions?: ChatActionButton[]
  conversationId?: string
  followUps?: string[]
}

export interface ChatExecuteResult {
  count: number
  approvalIds: string[]
  message: string
  route: string
}

export interface ChatConversationSummary {
  id: string
  title: string
  messageCount: number
  updatedAt: string
}

export interface ChatHistoryMessage {
  id: string
  role: 'user' | 'assistant'
  text: string
  cards?: ResponseCard[]
  actions?: ChatActionButton[]
  createdAt: string
}

export const chatApi = {
  ask: (question: string, conversationId?: string): Promise<ChatAnswer> =>
    api.post<ChatAnswer>('/pharmacy/chat/ask', { question, conversationId }).then((r) => r.data),

  execute: (actionType: string): Promise<ChatExecuteResult> =>
    api.post<ChatExecuteResult>('/pharmacy/chat/execute', { actionType }).then((r) => r.data),

  listConversations: (): Promise<ChatConversationSummary[]> =>
    api.get<ChatConversationSummary[]>('/pharmacy/chat/conversations').then((r) => r.data),

  getConversation: (id: string): Promise<ChatHistoryMessage[]> =>
    api.get<ChatHistoryMessage[]>(`/pharmacy/chat/conversations/${id}`).then((r) => r.data),

  deleteConversation: (id: string): Promise<{ deleted: boolean }> =>
    api.delete<{ deleted: boolean }>(`/pharmacy/chat/conversations/${id}`).then((r) => r.data),
}
