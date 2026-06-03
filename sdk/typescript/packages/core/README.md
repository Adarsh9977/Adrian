# @secureagentics/adrian

Core TypeScript SDK for Adrian multi-agent security monitoring in Node.js.

Handles the event pipeline: callback handler, event pairing, PII redaction, JSONL logging, WebSocket streaming, MCP inventory, and BLOCK/HITL tool gating.

## Install

You usually do **not** need to install this package directly. Provider packages install it automatically:

```bash
npm install @secureagentics/adrian-openai openai   # includes @secureagentics/adrian
```

Install core on its own only if you are wiring callbacks manually or building a custom integration:

```bash
npm install @secureagentics/adrian
```

## Quick start (via a provider package)

```ts
import { init, shutdown, adrian } from "@secureagentics/adrian-openai";

await init({ apiKey: process.env.ADRIAN_API_KEY });
const openai = adrian(new OpenAI());
await shutdown();
```

## Core exports

| Export | Description |
|---|---|
| `init(options?)` | Initialise the SDK |
| `shutdown()` | Flush handlers and tear down |
| `getHandler()` | Access the callback handler for manual wiring |
| `getWebSocketClient()` | Access the WebSocket client |
| `AdrianCallbackHandler` | Event callback handler class |
| `JSONLHandler` | Local JSONL event sink |

## Environment

- `ADRIAN_API_KEY`
- `ADRIAN_LOG_FILE`
- `ADRIAN_WS_URL`
- `ADRIAN_SESSION_ID`
- `ADRIAN_BLOCK_TIMEOUT`
- `ADRIAN_REPLAY_BUFFER_FRAMES`

## Manual callback wiring

```ts
import { init, getHandler } from "@secureagentics/adrian";

await init();
const handler = getHandler();
// Pass handler into your framework's callback system.
```

## Subpath export

`@secureagentics/adrian/capture` exposes shared LLM capture helpers used internally by the OpenAI and Vercel provider packages. Most apps should use `adrian()` from a provider package instead.
