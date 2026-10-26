'use strict';

/**
 * Slack-agnostic command logic. Each handler receives a Slack `client`
 * (WebClient-compatible), the config, and the store, so it can be unit-tested
 * with a fake client.
 */

const ACTION_APPROVE = 'joinprvt_approve';
const ACTION_DECLINE = 'joinprvt_decline';

function isAlreadyInChannel(err) {
  if (!err) return false;
  return err.data?.error === 'already_in_channel' || /already_in_channel/.test(err.message || '');
}

/** /joinprvt — ask the owner for permission to join the private channel. */
async function handleJoinPrivate({ command, client, config, store }) {
  if (command.user_id === config.ownerUserId) {
    return { text: 'You are the owner, so you already have access to the private channel.' };
  }

  const request = store.addJoinRequest({
    userId: command.user_id,
    userName: command.user_name,
  });

  await client.chat.postMessage({
    channel: config.ownerUserId,
    text: `Join request from <@${command.user_id}> for the private channel.`,
    blocks: [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*Private channel join request*\n<@${command.user_id}> wants to join the private channel.`,
        },
      },
      {
        type: 'actions',
        block_id: `joinprvt_${request.id}`,
        elements: [
          { type: 'button', style: 'primary', text: { type: 'plain_text', text: 'Accept' }, action_id: ACTION_APPROVE, value: request.id },
          { type: 'button', style: 'danger', text: { type: 'plain_text', text: 'Decline' }, action_id: ACTION_DECLINE, value: request.id },
        ],
      },
    ],
  });

  return { text: 'Your request to join the private channel was sent to the owner. You will be notified when it is reviewed.' };
}

/** Button: owner accepts a /joinprvt request. */
async function handleJoinPrivateDecision({ action, body, client, config, store }) {
  const approved = action.action_id === ACTION_APPROVE;
  const decider = body.user.id;

  if (decider !== config.ownerUserId) {
    return { ephemeral: 'Only the owner can respond to this request.' };
  }

  const request = store.resolveJoinRequest(action.value, approved ? 'approved' : 'declined');
  if (!request) {
    return { ephemeral: 'This request was already handled or no longer exists.' };
  }

  if (approved) {
    if (!config.privateChannelId) {
      throw new Error('PRIVATE_CHANNEL_ID is not configured, cannot invite user.');
    }
    try {
      await client.conversations.invite({
        channel: config.privateChannelId,
        users: request.userId,
      });
    } catch (err) {
      if (!isAlreadyInChannel(err)) throw err;
    }
  }

  await client.chat.postMessage({
    channel: request.userId,
    text: approved
      ? 'Your request to join the private channel was accepted. Welcome!'
      : 'Your request to join the private channel was declined.',
  });

  const statusText = approved ? `✅ Accepted by <@${decider}>` : `❌ Declined by <@${decider}>`;
  return {
    text: `Join request from <@${request.userId}>: ${statusText}`,
  };
}

/** /join — add the requesting user to the public channel. */
async function handleJoinPublic({ command, client, config }) {
  try {
    await client.conversations.invite({
      channel: config.publicChannelId,
      users: command.user_id,
    });
  } catch (err) {
    if (isAlreadyInChannel(err)) {
      return { text: 'You are already in the public channel.' };
    }
    throw err;
  }
  return { text: `You've been added to the public channel <#${config.publicChannelId}>.` };
}

/** /movierequest <title> — add a movie to the request list. No text lists current requests. */
async function handleMovieRequest({ command, store }) {
  const title = (command.text || '').trim();

  if (!title || title.toLowerCase() === 'list') {
    const movies = store.listMovieRequests();
    if (movies.length === 0) {
      return { text: 'No movies have been requested yet. Try `/movierequest <title>`.' };
    }
    const lines = movies.map((m, i) => `${i + 1}. ${m.title} (requested by <@${m.userId}>)`);
    return { text: `*Requested movies:*\n${lines.join('\n')}` };
  }

  const { added, request } = store.addMovieRequest({
    title,
    userId: command.user_id,
    userName: command.user_name,
  });

  if (!added) {
    return { text: `"${request.title}" is already on the movie request list.` };
  }
  return { text: `Added "${request.title}" to the movie request list. 🎬` };
}

/** Strip Slack mention tokens like <@U123> from message text. */
function stripMentions(text) {
  return (text || '').replace(/<@[A-Z0-9]+>/g, '').trim();
}

/** /ask <question> - ask the tutor. Conversation is kept per user and channel. */
async function handleAsk({ command, tutor }) {
  const question = (command.text || '').trim();
  if (!question) {
    return { text: 'Usage: `/ask <your question>`. I will guide you to the answer rather than just giving it.' };
  }
  const reply = await tutor.respond(`ask:${command.channel_id}:${command.user_id}`, question);
  return { text: reply };
}

module.exports = {
  handleAsk,
  stripMentions,
  handleJoinPrivate,
  handleJoinPrivateDecision,
  handleJoinPublic,
  handleMovieRequest,
  ACTION_APPROVE,
  ACTION_DECLINE,
};
