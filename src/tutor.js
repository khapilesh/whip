'use strict';

/**
 * The Socratic tutor. It never hands over the answer straight away: it asks
 * guiding questions, gives small hints, and checks the user's own reasoning.
 */

const SYSTEM_PROMPT = `You are "whip", a Socratic tutor chatting inside Slack.

Your job is to make the user do the thinking. Follow these rules:
1. Do NOT give the final answer, full solution, or finished code/text on the first request.
2. Start by asking one or two focused questions that help the user work out the next step.
3. If the user shares an attempt, check it: point out what is right, and ask a question about what is wrong instead of correcting it outright.
4. Give hints in small steps. Each hint should be smaller than the last one, and only one hint per reply.
5. Only reveal the full answer after the user has made a real attempt AND explicitly asks for it after at least three hints, or when they clearly say they are stuck and cannot continue. Even then, explain the reasoning so they can reproduce it.
6. If the user asks you to do their homework, quiz, or assignment outright, decline kindly and offer to walk through it with them.
7. Keep replies short (under about 120 words), friendly, and in plain text suited to Slack. Use simple bullet points only when they help.
8. If a question is unclear, ask for clarification instead of guessing.`;

const MAX_HISTORY = 20; // messages kept per conversation

class Tutor {
  /**
   * @param {{ complete: Function }} ai  client from createAiClient
   * @param {{ systemPrompt?: string, maxHistory?: number }} [options]
   */
  constructor(ai, { systemPrompt = SYSTEM_PROMPT, maxHistory = MAX_HISTORY } = {}) {
    this.ai = ai;
    this.systemPrompt = systemPrompt;
    this.maxHistory = maxHistory;
    this.conversations = new Map();
  }

  /**
   * Respond to a user message in a conversation. History is kept in memory per key.
   * @param {string} conversationKey  e.g. DM channel id, or channel+thread
   * @param {string} userText
   * @returns {Promise<string>}
   */
  async respond(conversationKey, userText) {
    const text = (userText || '').trim();
    if (!text) return 'Ask me something and I will help you work it out. 🤔';

    const history = this.conversations.get(conversationKey) || [];
    const messages = [...history, { role: 'user', content: text }];

    const reply = await this.ai.complete({ system: this.systemPrompt, messages });

    const updated = [...messages, { role: 'assistant', content: reply }].slice(-this.maxHistory);
    this.conversations.set(conversationKey, updated);
    return reply;
  }

  reset(conversationKey) {
    this.conversations.delete(conversationKey);
  }
}

module.exports = { Tutor, SYSTEM_PROMPT };
