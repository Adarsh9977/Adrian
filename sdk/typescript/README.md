# Adrian TypeScript SDK

Monorepo for the Adrian TypeScript SDK. Pick the package for your framework — the core SDK is installed automatically.

## Packages

| Package | npm name | Install | Import |
|---|---|---|---|
| OpenAI | `@secureagentics/adrian-openai` | `npm install @secureagentics/adrian-openai openai` | `import { init, adrian, captureTool } from "@secureagentics/adrian-openai"` |
| Vercel AI | `@secureagentics/adrian-vercel` | `npm install @secureagentics/adrian-vercel ai` | `import { init, adrian, adrianTools, captureTool } from "@secureagentics/adrian-vercel"` |
| LangChain | `@secureagentics/adrian-langchain` | `npm install @secureagentics/adrian-langchain @langchain/core @langchain/langgraph` | `import { init, adrian } from "@secureagentics/adrian-langchain"` |
| Core only | `@secureagentics/adrian` | `npm install @secureagentics/adrian` | `import { init, shutdown } from "@secureagentics/adrian"` |

Provider packages depend on `@secureagentics/adrian` and re-export `init`, `shutdown`, and other core APIs — one install, one import.

## Two-step setup

1. **`init()`** — starts the event pipeline (JSONL, WebSocket, PII redaction).
2. **`adrian()`** — connects your framework to Adrian.

Both come from the same provider package:

```ts
// OpenAI
import { init, adrian, captureTool } from "@secureagentics/adrian-openai";

// Vercel AI
import { init, adrian, adrianTools, captureTool } from "@secureagentics/adrian-vercel";

// LangChain / LangGraph
import { init, adrian } from "@secureagentics/adrian-langchain";

await init({ apiKey: process.env.ADRIAN_API_KEY });
```

## Unified API

All provider packages export the **same function names**:

| Export | OpenAI | Vercel AI | LangChain |
|---|---|---|---|
| `init` / `shutdown` | Re-exported from core | Re-exported from core | Re-exported from core |
| `adrian(...)` | Wrap an OpenAI client | Wrap an AI module or tools object | Enable callbacks (no arguments) |
| `adrianTools(...)` | — | Wrap tool definitions for `generateText` | — |
| `captureTool(...)` | Capture manual tool execution | Capture manual tool execution | — |

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

### Vercel AI SDK

```bash
npm install @secureagentics/adrian-vercel ai
```

```ts
import * as ai from "ai";
import { init, shutdown, adrian, adrianTools, captureTool } from "@secureagentics/adrian-vercel";

await init({ apiKey: process.env.ADRIAN_API_KEY });

const monitored = adrian(ai);

const result = await monitored.generateText({
  model,
  prompt: "What's the weather in London?",
  tools: adrianTools(tools),
});

for (const toolCall of result.toolCalls ?? []) {
  await captureTool(toolCall, () => runTool(toolCall.toolName, toolCall.args));
}

await shutdown();
```

### LangChain / LangGraph

```bash
npm install @secureagentics/adrian-langchain @langchain/core @langchain/langgraph
```

```ts
import { init, shutdown, adrian } from "@secureagentics/adrian-langchain";

await init({ apiKey: process.env.ADRIAN_API_KEY });
await adrian();

// Your normal LangChain / LangGraph code runs here.

await shutdown();
```

## Using multiple providers

Install each provider package you need. Core is deduplicated to a single copy:

```bash
npm install @secureagentics/adrian-openai @secureagentics/adrian-vercel openai ai
```

```ts
import { init, adrian as adrianOpenAI } from "@secureagentics/adrian-openai";
import { adrian as adrianVercel } from "@secureagentics/adrian-vercel";
import { adrian as adrianLangChain } from "@secureagentics/adrian-langchain";

await init({ apiKey: process.env.ADRIAN_API_KEY });
await adrianLangChain();

const openai = adrianOpenAI(new OpenAI());
const monitored = adrianVercel(vercelAi);
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

Per-package docs: [core](./packages/core) · [openai](./packages/openai) · [vercel](./packages/vercel) · [langchain](./packages/langchain)
