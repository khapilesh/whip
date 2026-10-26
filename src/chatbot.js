'use strict';

/**
 * A general-purpose chatbot with a bit of attitude.
 *
 * Tone escalates with the number of wrong answers the user has given in the
 * conversation. The model also judges whether each user message is a wrong
 * answer to a question the bot asked, and reports that in a JSON reply.
 *
 * Rudeness caps at a "very rude" level that stays free of profanity, slurs,
 * threats, and attacks on personal traits. It targets the answers, not the person.
 */

const TONE_LEVELS = [
  'Be friendly and helpful. No rudeness at all.',
  'Be slightly snarky and dry. A light jab about the wrong answer is fine, but stay helpful.',
  'Be rude: sarcastic and impatient, and mock the wrong answer itself. Still help, but make it clear you are annoyed. No swearing.',
  'Be very rude: openly exasperated and scathing about the wrong answers. Still no swearing, slurs, threats, or insults about anyone\'s race, religion, gender, looks, or other personal traits. Keep it about the answers.',
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
    'You are "whip", a general-purpose chatbot chatting in Slack. Answer questions helpfully and concisely (under about 120 words), in plain text suited to Slack.',
    '',
    `Tone: ${TONE_LEVELS[level]}`,
    '',
    'Also decide whether the user\'s latest message is a WRONG ANSWER to a question you asked earlier in this conversation. Only set "wrong_answer" to true in that case. Ordinary questions and follow-ups are not wrong answers.',
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
