# whip

A Slack bot with three slash commands:

| Command | What it does |
| --- | --- |
| `/joinprvt` | Sends you (the owner) a DM with **Accept** / **Decline** buttons. On accept, the requester is invited to your private channel. |
| `/join` | Adds the user who ran it to your public channel. |
| `/movierequest <title>` | Adds a movie to a shared request list. `/movierequest` or `/movierequest list` shows the list. Duplicates are ignored. |

The bot runs in **Socket Mode**, so it needs no public URL or hosting to receive commands.

## 1. Create the Slack app

1. Go to <https://api.slack.com/apps> → **Create New App** → **From a manifest**, choose your workspace, and paste the contents of `slack-app-manifest.yml`.
2. **Install to Workspace**.
3. Copy the **Bot User OAuth Token** (`xoxb-...`) from *OAuth & Permissions*.
4. Under *Basic Information* → *App-Level Tokens*, generate a token with the `connections:write` scope (`xapp-...`).
5. Copy the **Signing Secret** from *Basic Information* (optional in Socket Mode).

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
src/config.js     Environment variable loading
test/             node:test unit tests
```
