'use strict';

const API_URL = 'https://api.anthropic.com/v1/messages';
const API_VERSION = '2023-06-01';

/**
 * Minimal Anthropic Messages API client (no SDK dependency).
 * `fetchImpl` is injectable so tests can run without network access.
 */
function createAiClient({ apiKey, model, maxTokens = 600, fetchImpl = globalThis.fetch, timeoutMs = 30000 }) {
  if (!apiKey) throw new Error('An Anthropic API key is required');

  /**
   * @param {{system: string, messages: Array<{role: 'user'|'assistant', content: string}>}} input
   * @returns {Promise<string>} the model's text reply
   */
  async function complete({ system, messages }) {
    const res = await fetchImpl(API_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': API_VERSION,
      },
      body: JSON.stringify({ model, max_tokens: maxTokens, system, messages }),
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw new Error(`AI request failed (${res.status}): ${detail.slice(0, 300)}`);
    }

    const body = await res.json();
    const text = (body.content || [])
      .filter((block) => block.type === 'text')
      .map((block) => block.text)
      .join('')
      .trim();
    if (!text) throw new Error('AI returned an empty response');
    return text;
  }

  return { complete };
}

module.exports = { createAiClient };
