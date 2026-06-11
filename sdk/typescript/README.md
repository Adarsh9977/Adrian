# Adrian TypeScript SDK

Monorepo for the Adrian TypeScript SDK. Pick the package for your framework — the core SDK is installed automatically.

The core package owns the event pipeline: event pairing, PII redaction, JSONL logging, WebSocket streaming, policy verdicts, and shared capture helpers. Provider packages, such as OpenAI, adapt framework-specific request and response shapes into that core pipeline.

## Packages

| Package | npm name | Install | Import |
|---|---|---|---|
| OpenAI | `@secureagentics/adrian-openai` | `npm install @secureagentics/adrian-openai openai` | `import { adrian } from "@secureagentics/adrian-openai"` |
| Core only | `@secureagentics/adrian` | `npm install @secureagentics/adrian` | `import { adrian } from "@secureagentics/adrian"` |

Provider packages depend on `@secureagentics/adrian` and extend the `adrian` namespace with framework helpers — one install, one import.

## Two-step setup

1. **`adrian.init()`** — starts the event pipeline (JSONL, WebSocket, PII redaction).
2. **`adrian.openai()`** — wraps an OpenAI client for capture (OpenAI package only).

Both come from the same provider package:

```ts
import { adrian } from "@secureagentics/adrian-openai";

await adrian.init({ apiKey: process.env.ADRIAN_API_KEY });
```

## Unified API

The OpenAI provider package exports the Adrian namespace:

| Export | Purpose |
|---|---|
| `adrian.init` / `adrian.shutdown` | Core lifecycle |
| `adrian.openai(...)` | Wrap an OpenAI client |
| `adrian.captureTool(...)` | Capture manual tool execution |

Shared option types (same names in every provider package):

| Type | Purpose |
|---|---|
| `AdrianOptions` | Optional metadata when wrapping a client or module |
| `ToolCallLike` | Shape of a tool call passed to `captureTool` |
| `ToolCaptureOptions` | Optional metadata when capturing tool execution |

Named exports (`init`, `shutdown`, etc.) remain available for compatibility.

## Examples

### OpenAI

```bash
npm install @secureagentics/adrian-openai openai
```

```ts
import OpenAI from "openai";
import { adrian } from "@secureagentics/adrian-openai";

await adrian.init({ apiKey: process.env.ADRIAN_API_KEY });

const openai = adrian.openai(new OpenAI());

const response = await openai.chat.completions.create({
  model: "gpt-4o-mini",
  messages: [{ role: "user", content: "Hello" }],
});

await adrian.shutdown();
```

### OpenAI tool execution

OpenAI returns tool call requests; your app still executes the tools. Wrap that execution with `adrian.captureTool` so Adrian can apply BLOCK/HITL policy and capture the tool result:

```ts
import OpenAI from "openai";
import { adrian, AdrianPolicyBlockedError, BLOCKED_TOOL_MESSAGE } from "@secureagentics/adrian-openai";

await adrian.init({ apiKey: process.env.ADRIAN_API_KEY });

const openai = adrian.openai(new OpenAI());
const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
  { role: "user", content: "What is the weather in Paris?" },
];

async function getWeather(city: string) {
  return { city, forecast: "sunny" };
}

const response = await openai.chat.completions.create({
  model: "gpt-4o-mini",
  messages,
  tools: [
    {
      type: "function",
      function: {
        name: "get_weather",
        description: "Get the current weather for a city",
        parameters: {
          type: "object",
          properties: { city: { type: "string" } },
          required: ["city"],
        },
      },
    },
  ],
});

const assistantMessage = response.choices[0]?.message;
if (!assistantMessage) throw new Error("OpenAI response did not include an assistant message");

messages.push(assistantMessage);

for (const toolCall of assistantMessage.tool_calls ?? []) {
  let toolResult: unknown;

  try {
    toolResult = await adrian.captureTool(toolCall, async () => {
      const args = JSON.parse(toolCall.function.arguments || "{}") as { city?: string };
      return getWeather(args.city ?? "");
    });
  } catch (error) {
    if (!(error instanceof AdrianPolicyBlockedError)) throw error;
    toolResult = BLOCKED_TOOL_MESSAGE;
  }

  messages.push({
    role: "tool",
    tool_call_id: toolCall.id,
    content: typeof toolResult === "string" ? toolResult : JSON.stringify(toolResult),
  });
}

await adrian.shutdown();
```

### Responses API

```ts
const response = await openai.responses.create({
  model: "gpt-4o-mini",
  input: "Summarize the security considerations for this workflow.",
});

console.log(response.output_text);
```

### Streaming

Streaming calls are passed through unchanged. Adrian emits one paired event when the stream finishes or the consumer exits early:

```ts
const stream = await openai.chat.completions.create({
  model: "gpt-4o-mini",
  messages: [{ role: "user", content: "Write a short haiku." }],
  stream: true,
});

for await (const chunk of stream) {
  process.stdout.write(chunk.choices[0]?.delta?.content ?? "");
}
```

### Local logging only

Use `wsUrl: null` when you want JSONL logging without connecting to the Adrian backend (even when `ADRIAN_WS_URL` is set):

```ts
await adrian.init({
  wsUrl: null,
  logFile: "events.jsonl",
  onEvent: (eventType, data, runId, parentRunId, eventId) => {
    console.log({ eventType, runId, parentRunId, eventId, data });
  },
});
```

## Core-only usage

For manual callback wiring without a provider package, use `@secureagentics/adrian` directly:

```ts
import { adrian } from "@secureagentics/adrian";

await adrian.init({ wsUrl: null });
const handler = adrian.getHandler();
await adrian.shutdown();
```

See the core sections below for manual LLM/tool pairing, custom handlers, and environment variables.

## Core exports

| Export | Description |
|---|---|
| `adrian.init(options?)` | Initialise the SDK |
| `adrian.shutdown()` | Flush handlers and tear down |
| `adrian.getHandler()` | Access the callback handler for manual wiring |
| `adrian.getWebSocketClient()` | Access the WebSocket client |
| `AdrianCallbackHandler` | Event callback handler class |
| `JSONLHandler` | Local JSONL event sink |

## Environment

Explicit `init()` options take precedence over environment variables.

| Variable | Description |
|---|---|
| `ADRIAN_API_KEY` | API key used for WebSocket authentication |
| `ADRIAN_LOG_FILE` | Local JSONL log path (default: `events.jsonl`) |
| `ADRIAN_WS_URL` | WebSocket endpoint (default: `ws://localhost:8080/ws`) |
| `ADRIAN_SESSION_ID` | Session identifier for grouping events |
| `ADRIAN_BLOCK_TIMEOUT` | Seconds to wait for a BLOCK-mode verdict before fail-open (default: `30`) |
| `ADRIAN_REPLAY_BUFFER_FRAMES` | WebSocket replay buffer size (default: `1000`) |

## Policy and BLOCK mode

When connected over WebSocket and the dashboard policy is in **BLOCK** or **HITL** mode, the SDK waits for backend verdicts on tool calls proposed by an LLM turn. In **BLOCK** mode, if no verdict arrives within `blockTimeout` seconds, the SDK **fail-open** and allows execution (matching the Python SDK). Dashboard-configurable failure policy is planned for a later release.

## Manual callback wiring

```ts
import { adrian } from "@secureagentics/adrian";

await adrian.init();
const handler = adrian.getHandler();
```

For custom integrations, pair an LLM start and end with the same `runId`:

```ts
import { randomUUID } from "node:crypto";
import { adrian } from "@secureagentics/adrian";

await adrian.init({ wsUrl: null });

const handler = adrian.getHandler();
const runId = randomUUID();

await handler?.handleChatModelStart(
  { name: "custom-model" },
  [[{ role: "user", content: "Hello" }]],
  runId,
);

await handler?.handleLLMEnd(
  {
    output: "Hi there",
    toolCalls: [],
    usage: { promptTokens: 1, completionTokens: 2, totalTokens: 3 },
  },
  runId,
);

await adrian.shutdown();
```

## Custom event handlers

```ts
import { adrian, type EventHandler, type PairedEvent } from "@secureagentics/adrian";

const handler: EventHandler = {
  onPairedEvent(event: PairedEvent) {
    console.log(event.pairType, event.eventId);
  },
  close() {},
};

await adrian.init({ handlers: [handler] });
```

## Subpath export

`@secureagentics/adrian/capture` exposes shared LLM capture helpers used internally by provider packages.

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

Per-package npm readmes point here: [core](./packages/core) · [openai](./packages/openai)
