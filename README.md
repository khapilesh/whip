# whip

A Slack bot with three slash commands:

| Command | What it does |
| --- | --- |
| `/joinprvt` | Sends you (the owner) a DM with **Accept** / **Decline** buttons. On accept, the requester is invited to your private channel. |
| `/join` | Adds the user who ran it to your public channel. |
| `/movierequest <title>` | Adds a movie to a shared request list. `/movierequest` or `/movierequest list` shows the list. Duplicates are ignored. |
| `/ask <question>` | Asks the chatbot a question. |

The chatbot also answers **direct messages** to the bot and **@mentions** in channels. It replies in a thread and remembers the conversation in that thread.

### How the attitude works

The chatbot is a general-purpose assistant styled as a strict, old-fashioned schoolmaster (the name is a nod to the whip). It makes you work for answers: it asks for an attempt and offers hints before giving the full answer. Its tone depends on how many wrong answers you have given in that conversation:

| Wrong answers so far | Tone |
| --- | --- |
| 0 | Stern but courteous |
| 1 | Snappish |
| 2–3 | Rude and scolding |
| 4+ | Very rude |

The model judges whether each of your messages is a wrong answer to a question the bot asked. Tone only changes on the reply after a wrong answer is counted. The count and conversation memory live in process memory and reset when the bot restarts.

Even at the top level the bot stays away from profanity, slurs, threats, and insults about personal traits. It roasts the answers, not you. Edit `TONE_LEVELS` in `src/chatbot.js` to change this.

## 1. Create the Slack app

1. Go to <https://api.slack.com/apps> → **Create New App** → **From a manifest**, choose your workspace, and paste the contents of `slack-app-manifest.yml`.
2. **Install to Workspace**.
3. Copy the **Bot User OAuth Token** (`xoxb-...`) from *OAuth & Permissions*.
4. Under *Basic Information* → *App-Level Tokens*, generate a token with the `connections:write` scope (`xapp-...`).
5. Copy the **Signing Secret** from *Basic Information* (optional in Socket Mode).
6. Get an Anthropic API key from <https://console.anthropic.com> for the chatbot. Set it as `ANTHROPIC_API_KEY`. You can override the model with `ANTHROPIC_MODEL` (default `claude-sonnet-4-5`).

## 2. Find the IDs you need

- **Your user ID** (`OWNER_USER_ID`): profile → ⋮ → *Copy member ID*.
- **Public channel ID** (`PUBLIC_CHANNEL_ID`): open the channel → channel name → *About* → bottom of the dialog, or right-click → *Copy link* and take the `C...` part.
- **Private channel ID** (`PRIVATE_CHANNEL_ID`): same method for your private channel (starts with `G` or `C`).

**Important:** invite the bot into both channels first (`/invite @whip`). Slack only lets the bot add people to channels it is a member of.

## 3. Configure and run

```bash
npm install
cp .env.example .env   # then fill in the values
npm start
```

Run the tests with `npm test`.

Join requests and movie requests are saved to `data/db.json` (override with `DATA_FILE`). This folder is git-ignored.

## Project layout

```
src/index.js      Slack app wiring (commands, button actions)
src/handlers.js   Command logic, independent of Slack transport (unit tested)
src/store.js      JSON file storage for requests
src/ai.js         Anthropic Messages API client (plain fetch, no SDK)
src/chatbot.js    Chatbot: tone levels, wrong-answer tracking, conversation memory
src/config.js     Environment variable loading
test/             node:test unit tests
```
