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
}

export interface ChatExecuteResult {
  count: number
  approvalIds: string[]
  message: string
  route: string
}

export const chatApi = {
  ask: (question: string): Promise<ChatAnswer> =>
    api.post<ChatAnswer>('/pharmacy/chat/ask', { question }).then((r) => r.data),

  execute: (actionType: string): Promise<ChatExecuteResult> =>
    api.post<ChatExecuteResult>('/pharmacy/chat/execute', { actionType }).then((r) => r.data),
}
