# @secureagentics/adrian-langchain

LangChain.js and LangGraph.js instrumentation for Adrian security monitoring. Includes `@secureagentics/adrian` as a dependency — no separate core install needed.

## Install

```bash
npm install @secureagentics/adrian-langchain @langchain/core @langchain/langgraph
```

```ts
import { init, adrian } from "@secureagentics/adrian-langchain";
```

## Usage

```ts
import { init, shutdown, adrian } from "@secureagentics/adrian-langchain";

await init({ apiKey: process.env.ADRIAN_API_KEY });
await adrian();

// Your normal LangChain / LangGraph code runs here.

await shutdown();
```

After `adrian()`:

- LangChain runnables and chat models receive the Adrian callback handler automatically.
- LangGraph graphs are wrapped with invocation tracking.
- ToolNode execution waits for BLOCK/HITL verdicts from the Adrian WebSocket.

Unlike the OpenAI and Vercel packages, LangChain does not wrap a client object. Call `adrian()` once after `init()` to patch the framework globally.

## Advanced: custom handler wiring

```ts
import { init, getHandler, getWebSocketClient, adrianWith } from "@secureagentics/adrian-langchain";

await init();
await adrianWith(getHandler, getWebSocketClient);
```

## API

| Export | Description |
|---|---|
| `init(options?)` | Initialise Adrian (re-exported from core) |
| `shutdown()` | Tear down Adrian (re-exported from core) |
| `adrian()` | Enable LangChain / LangGraph instrumentation |
| `adrianWith(getHandler, getWebSocketClient)` | Enable instrumentation with custom handler accessors |
| `blockedToolNodeResponse(input, ws)` | Check ToolNode input against policy (used internally) |
| `extractToolCalls(input)` | Extract tool calls from graph state |
| `buildBlockedResponse(toolCalls)` | Build a blocked tool response message |

See the [workspace README](../README.md) for environment variables and multi-provider setup.
