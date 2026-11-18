/**
 * Local LLM Status Poller (Ollama / LM Studio)
 * Polled ONLY while the AI Hub widget is visible to maintain near-zero CPU and bandwidth budgets.
 */
export interface LocalLlmStatus {
  online: boolean;
  model: string | null;
  sizeBytes: number;
  vramBytes: number;
}

export async function pollOllamaStatus(endpoint = 'http://127.0.0.1:11434'): Promise<LocalLlmStatus> {
  try {
    const res = await fetch(`${endpoint}/api/ps`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(1500),
    });

    if (!res.ok) {
      return { online: false, model: null, sizeBytes: 0, vramBytes: 0 };
    }

    const data = await res.json();
    const models = data.models || [];
    if (models.length === 0) {
      return { online: true, model: 'Idle', sizeBytes: 0, vramBytes: 0 };
    }

    const running = models[0];
    return {
      online: true,
      model: running.name || running.model,
      sizeBytes: running.size || 0,
      vramBytes: running.size_vram || 0,
    };
  } catch {
    return { online: false, model: null, sizeBytes: 0, vramBytes: 0 };
  }
}
