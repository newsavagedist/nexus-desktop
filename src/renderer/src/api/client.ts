import type { CategorizedProvider, ChatResponse } from "../types"

declare global {
  interface Window {
    nexus: typeof api
  }
}

const nexus = (window as any).nexus || {}

export const api = {
  getProvidersCategorized: async (): Promise<Record<string, CategorizedProvider[]>> => {
    const providers = await nexus.providers?.list?.() || []
    const free: CategorizedProvider[] = []
    const paid: CategorizedProvider[] = []
    const local: CategorizedProvider[] = []
    for (const p of providers) {
      const mapped = {
        id: p.id,
        name: p.name,
        base_url: p.baseUrl,
        api_type: p.apiType,
        requires_key: p.requiresKey,
        register_url: p.registerUrl,
        models: p.models.map((m: any) => ({
          id: m.id,
          context: m.context,
          vision: m.vision,
          tools: m.tools,
          free: m.free,
          paid: m.paid,
        })),
      }
      if (!p.requiresKey || p.id === 'ollama' || p.id === 'llamacpp') {
        local.push(mapped)
      } else if (p.models.some((m: any) => m.free)) {
        free.push(mapped)
      } else {
        paid.push(mapped)
      }
    }
    return { free, paid, local }
  },

  getAvailableProviders: async () => {
    const cat = await api.getProvidersCategorized()
    return cat
  },

  sendMessage: async (
    _conversationId: number, content: string, _agentId: string,
    modelClass?: string, model?: string,
  ): Promise<ChatResponse> => {
    const result = await nexus.providers?.send?.(
      [{ role: 'user', content }],
      { modelClass, model },
    )
    return {
      user_message: { id: Date.now(), role: 'user', content },
      agent_message: {
        id: Date.now() + 1,
        role: 'assistant',
        content: result?.content || '',
        model: result?.model,
        tokens_used: result?.tokensUsed,
        duration: result?.duration,
      },
    }
  },

  getProviderHealth: async (): Promise<Record<string, { healthy: boolean; failures: number }>> => {
    const providers = await nexus.providers?.list?.() || []
    const result: Record<string, any> = {}
    for (const p of providers) {
      const vaultKeys = await nexus.vault?.getKeys?.() || {}
      result[p.id] = {
        healthy: !!vaultKeys[p.id] || !p.requiresKey,
        failures: 0,
      }
    }
    return result
  },

  getAgentConfig: async (agentId: string): Promise<any> => {
    const hasKey = !!(await nexus.vault?.resolveKey?.(agentId))
    return {
      params: { model: '', temperature: 0.7, max_tokens: 8192, system_prompt: '' },
      has_api_key: hasKey,
    }
  },

  saveAgentConfig: async (agentId: string, config: any): Promise<any> => {
    if (config.api_key) {
      await nexus.vault?.setKey?.(agentId, config.api_key)
    }
    return { status: 'ok' }
  },

  getUserAnalytics: async (_days = 30): Promise<Record<string, { model: string; tokens: number; requests: number; errors: number }[]>> => {
    return {}
  },

  getTimeline: async (_days = 7): Promise<{ day: string; tokens: number; requests: number }[]> => {
    return []
  },

  getErrors: async (_days = 7): Promise<{ provider: string; error: string; count: number }[]> => {
    return []
  },

  listConversations: async (): Promise<{ id: number; title: string }[]> => {
    return JSON.parse(localStorage.getItem('nexus-convs') || '[]')
  },

  createConversation: async (title: string): Promise<{ id: number; title: string }> => {
    const convs = JSON.parse(localStorage.getItem('nexus-convs') || '[]')
    const conv = { id: Date.now(), title }
    convs.push(conv)
    localStorage.setItem('nexus-convs', JSON.stringify(convs))
    return conv
  },

  getConversation: async (id: number): Promise<{ id: number; title: string; messages: any[] }> => {
    const data = JSON.parse(localStorage.getItem(`nexus-conv-${id}`) || '{"messages":[]}')
    return { id, title: '', messages: data.messages || [] }
  },

  deleteConversation: async (id: number): Promise<void> => {
    const convs = JSON.parse(localStorage.getItem('nexus-convs') || '[]')
    localStorage.setItem('nexus-convs', JSON.stringify(convs.filter((c: any) => c.id !== id)))
    localStorage.removeItem(`nexus-conv-${id}`)
  },

  updateConversationTitle: async (id: number, title: string): Promise<{ id: number; title: string }> => {
    const convs = JSON.parse(localStorage.getItem('nexus-convs') || '[]')
    const idx = convs.findIndex((c: any) => c.id === id)
    if (idx >= 0) {
      convs[idx].title = title
      localStorage.setItem('nexus-convs', JSON.stringify(convs))
    }
    return { id, title }
  },

  uploadFile: async (_file: File): Promise<any> => {
    return { file_id: '', filename: '', mime_type: '', size: 0, type: '', url: '', preview: '' }
  },
}
