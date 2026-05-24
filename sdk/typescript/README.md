# @secureagentics/adrian

TypeScript SDK for Adrian multi-agent event capture in Node.js LangChain.js, LangGraph.js, OpenAI SDK, and Vercel AI SDK applications.

```ts
import { init } from "@secureagentics/adrian";

await init({ apiKey: process.env.ADRIAN_API_KEY });
```

The SDK mirrors the Python package: it pairs LLM/tool callbacks into `PairedEvent` objects, redacts PII, writes JSONL locally, streams protobuf frames to the Adrian WebSocket endpoint, tracks MCP servers, and applies BLOCK/HITL tool gating when LangGraph ToolNode instrumentation is available.

## OpenAI SDK

```ts
import OpenAI from "openai";
import { init, instrumentOpenAI } from "@secureagentics/adrian";

await init({ apiKey: process.env.ADRIAN_API_KEY });

const openai = instrumentOpenAI(new OpenAI());
await openai.chat.completions.create({
  model: "gpt-4o-mini",
  messages: [{ role: "user", content: "Hello" }],
});
```

`instrumentOpenAI` captures `chat.completions.create` and `responses.create` calls. Streaming chat completions are captured when the returned async iterable is consumed.

OpenAI returns tool call requests, but your app executes the tools. Wrap that local execution with `captureOpenAIToolCall` to emit Adrian tool events:

```ts
import { captureOpenAIToolCall } from "@secureagentics/adrian";

for (const toolCall of assistantMessage.tool_calls ?? []) {
  const toolResult = await captureOpenAIToolCall(toolCall, () =>
    runTool(toolCall.function.name, toolCall.function.arguments),
  );

  messages.push({
    role: "tool",
    tool_call_id: toolCall.id,
    content: toolResult,
  });
}
```

## Vercel AI SDK

```ts
import * as ai from "ai";
import { init, instrumentVercelAI } from "@secureagentics/adrian";

await init({ apiKey: process.env.ADRIAN_API_KEY });

const adrianAI = instrumentVercelAI(ai);
await adrianAI.generateText({
  model,
  prompt: "Hello",
});
```

`instrumentVercelAI` wraps `generateText`, `streamText`, `generateObject`, and `streamObject`. Stream results are emitted after the Vercel result promises such as `text`, `toolCalls`, and `usage` settle.

If you pass Vercel AI SDK tools with `execute` functions, wrap the tools object before passing it to `generateText`:

```ts
import { instrumentVercelAITools } from "@secureagentics/adrian";

const result = await adrianAI.generateText({
  model,
  prompt: "Use the weather tool.",
  tools: instrumentVercelAITools(tools),
});
```

If your app executes Vercel AI SDK tool calls manually, wrap that execution with `captureVercelAIToolCall` or the shorter `captureAITool` alias:

```ts
import { captureAITool } from "@secureagentics/adrian";

for (const toolCall of result.toolCalls ?? []) {
  const toolResult = await captureAITool(toolCall, () =>
    runTool(toolCall.toolName, toolCall.args),
  );
}
```

## Environment

- `ADRIAN_API_KEY`
- `ADRIAN_LOG_FILE`
- `ADRIAN_WS_URL`
- `ADRIAN_SESSION_ID`
- `ADRIAN_BLOCK_TIMEOUT`
- `ADRIAN_REPLAY_BUFFER_FRAMES`

## Manual Callback Wiring

```ts
import { init, getHandler } from "@secureagentics/adrian";

await init({ autoInstrument: false });
const handler = getHandler();
```
