'use strict';

/**
 * A general-purpose chatbot styled as an old-fashioned schoolmaster.
 *
 * Tone escalates with the number of wrong answers the user has given in the
 * conversation. The model also judges whether each user message is a wrong
 * answer to a question the bot asked, and reports that in a JSON reply.
 *
 * Rudeness caps at a "very rude" level that stays free of profanity, slurs,
 * threats, and attacks on personal traits. It targets the answers, not the person.
 */

const TONE_LEVELS = [
  'Stern but courteous, like an old-fashioned schoolmaster who expects the best from you. Address the user as "young scholar" or "my dear".',
  'Snappish, like a schoolmaster who has seen this mistake before. A pointed remark about the wrong answer is fine. Address the user as "young scholar".',
  'Rude and scolding, like a schoolmaster rapping knuckles with a ruler. Mock the wrong answer itself and tell them to sit up and think. No swearing.',
  'Very rude and scathing, like a tyrannical schoolmaster who has run out of patience. Still no swearing, slurs, threats, or insults about anyone\'s race, religion, gender, looks, or other personal traits. Keep it about the answers.',
];

/** Map the count of wrong answers so far to a tone level 0-3. */
function rudenessLevel(wrongCount) {
  if (wrongCount <= 0) return 0;
  if (wrongCount === 1) return 1;
  if (wrongCount <= 3) return 2;
  return 3;
}

function buildSystemPrompt(level) {
  return [
    'You are "whip", a general-purpose chatbot in Slack, styled as a strict old-fashioned schoolmaster. You speak in an antiquated, formal voice (words like "pray", "indeed", "mark me", "sit up straight"). Keep replies under about 120 words, in plain text suited to Slack.',
    '',
    'Make the user work for their answers. When they ask a question:',
    '- Do not hand over the full answer on the first ask. Demand that they make an attempt, and offer one small hint.',
    '- Once they have made a genuine attempt, check it. If it is right, say so grudgingly and give the full answer with the reasoning. If it is wrong, say so and offer one smaller hint.',
    '- Give the full answer straight away only if they say they give up, ask you outright to stop making them work, or the question is a simple greeting or small talk.',
    '- Never do their homework or assignment in full; work through it with them.',
    '',
    `Tone: ${TONE_LEVELS[level]}`,
    '',
    'Also decide whether the user\'s latest message is a WRONG ANSWER to a question you asked or a hint you gave earlier in this conversation. Only set "wrong_answer" to true in that case. Ordinary questions, follow-ups, and requests for help are not wrong answers.',
    '',
    'Respond ONLY with a JSON object, no other text:',
    '{"reply": "<your message to the user>", "wrong_answer": true or false}',
  ].join('\n');
}

/** Parse the model's JSON reply. Falls back to plain text if the model ignores the format. */
function parseReply(raw) {
  const text = String(raw || '');
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start !== -1 && end > start) {
    try {
      const parsed = JSON.parse(text.slice(start, end + 1));
      if (typeof parsed.reply === 'string' && parsed.reply.trim()) {
        return { reply: parsed.reply.trim(), wrongAnswer: parsed.wrong_answer === true };
      }
    } catch (_) {
      // fall through to plain-text fallback
    }
  }
  return { reply: text.trim(), wrongAnswer: false };
}

const MAX_HISTORY = 20; // messages kept per conversation

class Chatbot {
  /**
   * @param {{ complete: Function }} ai  client from createAiClient
   * @param {{ maxHistory?: number }} [options]
   */
  constructor(ai, { maxHistory = MAX_HISTORY } = {}) {
    this.ai = ai;
    this.maxHistory = maxHistory;
    this.conversations = new Map(); // key -> { messages, wrongCount }
  }

  /**
   * Reply to a user message. Tone uses the wrong-answer count from earlier
   * turns, so the current message's verdict takes effect on the next reply.
   * @param {string} conversationKey  e.g. DM channel id, or channel+thread
   * @param {string} userText
   * @returns {Promise<string>}
   */
  async respond(conversationKey, userText) {
    const text = (userText || '').trim();
    if (!text) return 'You sent nothing. Try asking me an actual question.';

    const state = this.conversations.get(conversationKey) || { messages: [], wrongCount: 0 };
    const messages = [...state.messages, { role: 'user', content: text }];
    const level = rudenessLevel(state.wrongCount);

    const raw = await this.ai.complete({ system: buildSystemPrompt(level), messages });
    const { reply, wrongAnswer } = parseReply(raw);

    this.conversations.set(conversationKey, {
      messages: [...messages, { role: 'assistant', content: reply }].slice(-this.maxHistory),
      wrongCount: state.wrongCount + (wrongAnswer ? 1 : 0),
    });
    return reply;
  }

  /** Current tone level and wrong-answer count for a conversation (for debugging/tests). */
  status(conversationKey) {
    const state = this.conversations.get(conversationKey);
    const wrongCount = state ? state.wrongCount : 0;
    return { wrongCount, level: rudenessLevel(wrongCount) };
  }

  reset(conversationKey) {
    this.conversations.delete(conversationKey);
  }
}

module.exports = { Chatbot, buildSystemPrompt, parseReply, rudenessLevel, TONE_LEVELS };
