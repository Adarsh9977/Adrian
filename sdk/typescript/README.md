# Adrian TypeScript SDK

Monorepo for the Adrian TypeScript SDK. Pick the package for your framework - the core SDK is installed automatically.

## Packages

| Package | npm name | Install | Import |
|---|---|---|---|
| OpenAI | `@secureagentics/adrian-openai` | `npm install @secureagentics/adrian-openai openai` | `import { init, adrian, captureTool } from "@secureagentics/adrian-openai"` |
| Core only | `@secureagentics/adrian` | `npm install @secureagentics/adrian` | `import { init, shutdown } from "@secureagentics/adrian"` |

Provider packages depend on `@secureagentics/adrian` and re-export `init`, `shutdown`, and other core APIs — one install, one import.

## Two-step setup

1. **`init()`** — starts the event pipeline (JSONL, WebSocket, PII redaction).
2. **`adrian()`** — connects your framework to Adrian.

Both come from the same provider package:

```ts
import { init, adrian, captureTool } from "@secureagentics/adrian-openai";

await init({ apiKey: process.env.ADRIAN_API_KEY });
```

## Unified API

The OpenAI provider package exports the familiar Adrian entrypoints:

| Export | Purpose |
|---|---|
| `init` / `shutdown` | Re-exported from core |
| `adrian(...)` | Wrap an OpenAI client |
| `captureTool(...)` | Capture manual tool execution |

Shared option types (same names in every provider package):

| Type | Purpose |
|---|---|
| `AdrianOptions` | Optional metadata when wrapping a client or module |
| `ToolCallLike` | Shape of a tool call passed to `captureTool` |
| `ToolCaptureOptions` | Optional metadata when capturing tool execution |

## Examples

### OpenAI

```bash
npm install @secureagentics/adrian-openai openai
```

```ts
import OpenAI from "openai";
import { init, shutdown, adrian, captureTool } from "@secureagentics/adrian-openai";

await init({ apiKey: process.env.ADRIAN_API_KEY });

const openai = adrian(new OpenAI());

const response = await openai.chat.completions.create({
  model: "gpt-4o-mini",
  messages: [{ role: "user", content: "Hello" }],
});

for (const toolCall of response.choices[0].message.tool_calls ?? []) {
  await captureTool(toolCall, () => runTool(toolCall.function.name, toolCall.function.arguments));
}

await shutdown();
```

## Environment variables

| Variable | Description |
|---|---|
| `ADRIAN_API_KEY` | API key from the Adrian dashboard |
| `ADRIAN_LOG_FILE` | Local JSONL log path (default: `events.jsonl`) |
| `ADRIAN_WS_URL` | WebSocket endpoint (default: `ws://localhost:8080/ws`) |
| `ADRIAN_SESSION_ID` | Session identifier for grouping events |
| `ADRIAN_BLOCK_TIMEOUT` | Seconds to wait for a BLOCK/HITL verdict |
| `ADRIAN_REPLAY_BUFFER_FRAMES` | WebSocket replay buffer size |

## Development

```bash
npm install
npm run build
npm test
```

Build or test a single package:

```bash
npm run build -w @secureagentics/adrian
npm test -w @secureagentics/adrian-openai
```

Per-package docs: [core](./packages/core) · [openai](./packages/openai)
