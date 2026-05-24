import { afterEach, describe, expect, it } from "vitest";
import { captureOpenAIToolCall, init, instrumentOpenAI, shutdown } from "../src/index.js";
import type { EventData } from "../src/types.js";

describe("OpenAI instrumentation", () => {
  afterEach(async () => {
    await shutdown();
  });

  it("captures chat completion calls as paired LLM events", async () => {
    const events: EventData[] = [];
    const client = instrumentOpenAI({
      chat: {
        completions: {
          create: async (_body: Record<string, unknown>) => ({
            choices: [{
              message: {
                content: "hello",
                tool_calls: [{
                  id: "call-1",
                  function: { name: "search", arguments: "{\"query\":\"docs\"}" },
                }],
              },
            }],
            usage: { prompt_tokens: 3, completion_tokens: 4, total_tokens: 7 },
          }),
        },
      },
    });

    await init({ handlers: [], autoInstrument: false, sessionId: "sess", wsUrl: null, onEvent: (_type, data) => {
      events.push(data);
    } });
    const result = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "system", content: "be brief" }, { role: "user", content: "hi" }],
    });

    expect(result.choices[0]?.message.content).toBe("hello");
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      kind: "llm",
      model: "gpt-4o-mini",
      output: "hello",
      usage: { promptTokens: 3, completionTokens: 4, totalTokens: 7 },
    });
    expect("toolCalls" in events[0] && events[0].toolCalls[0]).toMatchObject({ id: "call-1", name: "search", args: { query: "docs" } });
  });

  it("captures responses API calls", async () => {
    const events: EventData[] = [];
    const client = instrumentOpenAI({
      responses: {
          create: async (_body: Record<string, unknown>) => ({
          output_text: "done",
          output: [{ type: "function_call", call_id: "call-2", name: "lookup", arguments: "{\"id\":42}" }],
          usage: { input_tokens: 5, output_tokens: 6, total_tokens: 11 },
        }),
      },
    });

    await init({ handlers: [], autoInstrument: false, sessionId: "sess", wsUrl: null, onEvent: (_type, data) => {
      events.push(data);
    } });
    await client.responses.create({ model: "gpt-4.1", input: "run lookup" });

    expect(events[0]).toMatchObject({
      kind: "llm",
      model: "gpt-4.1",
      output: "done",
      toolCalls: [{ id: "call-2", name: "lookup", args: { id: 42 } }],
    });
  });

  it("captures camelCase chat tool calls", async () => {
    const events: EventData[] = [];
    const client = instrumentOpenAI({
      chat: {
        completions: {
          create: async (_body: Record<string, unknown>) => ({
            choices: [{
              message: {
                content: null,
                toolCalls: [{
                  id: "call-3",
                  name: "search",
                  args: { query: "camel" },
                }],
              },
            }],
          }),
        },
      },
    });

    await init({ handlers: [], autoInstrument: false, sessionId: "sess", wsUrl: null, onEvent: (_type, data) => {
      events.push(data);
    } });
    await client.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: "use search" }] });

    expect(events[0]).toMatchObject({
      kind: "llm",
      model: "gpt-4o-mini",
      toolCalls: [{ id: "call-3", name: "search", args: { query: "camel" } }],
    });
  });

  it("captures responses API streaming tool calls and text", async () => {
    const events: EventData[] = [];
    async function* stream() {
      yield { type: "response.output_text.delta", delta: "The answer " };
      yield { type: "response.output_item.added", item: { id: "item-1", type: "function_call", call_id: "call-4", name: "lookup" } };
      yield { type: "response.function_call_arguments.delta", item_id: "item-1", delta: "{\"id\"" };
      yield { type: "response.function_call_arguments.delta", item_id: "item-1", delta: ":7}" };
      yield { type: "response.output_text.delta", delta: "is ready." };
    }
    const client = instrumentOpenAI({
      responses: {
        create: async (_body: Record<string, unknown>) => stream(),
      },
    });

    await init({ handlers: [], autoInstrument: false, sessionId: "sess", wsUrl: null, onEvent: (_type, data) => {
      events.push(data);
    } });
    const result = await client.responses.create({ model: "gpt-4.1", input: "lookup id 7", stream: true });
    for await (const _chunk of result) {
      // consume the stream so Adrian can emit the paired event
    }

    expect(events[0]).toMatchObject({
      kind: "llm",
      model: "gpt-4.1",
      output: "The answer is ready.",
      toolCalls: [{ id: "call-4", name: "lookup", args: { id: 7 } }],
    });
  });

  it("emits partial stream data when the consumer stops early", async () => {
    const events: EventData[] = [];
    async function* stream() {
      yield { choices: [{ delta: { content: "first " } }] };
      yield { choices: [{ delta: { content: "second" } }] };
    }
    const client = instrumentOpenAI({
      chat: {
        completions: {
          create: async (_body: Record<string, unknown>) => stream(),
        },
      },
    });

    await init({ handlers: [], autoInstrument: false, sessionId: "sess", wsUrl: null, onEvent: (_type, data) => {
      events.push(data);
    } });
    const result = await client.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: "stream" }], stream: true });
    for await (const _chunk of result) {
      break;
    }

    expect(events[0]).toMatchObject({
      kind: "llm",
      model: "gpt-4o-mini",
      output: "first ",
    });
  });

  it("captures local OpenAI tool execution as a tool event", async () => {
    const events: Array<{ type: string; data: EventData }> = [];
    await init({ handlers: [], autoInstrument: false, sessionId: "sess", wsUrl: null, onEvent: (type, data) => {
      events.push({ type, data });
    } });

    const result = await captureOpenAIToolCall({
      id: "call-weather",
      type: "function",
      function: { name: "get_weather", arguments: "{\"city\":\"San Francisco\"}" },
    }, async () => ({ temperatureF: 58, condition: "cloudy" }));

    expect(result).toEqual({ temperatureF: 58, condition: "cloudy" });
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      type: "tool",
      data: {
        kind: "tool",
        toolName: "get_weather",
        toolCallId: "call-weather",
        input: "{\"city\":\"San Francisco\"}",
        output: "{\"temperatureF\":58,\"condition\":\"cloudy\"}",
      },
    });
  });

  it("captures local OpenAI tool execution errors as tool events", async () => {
    const events: Array<{ type: string; data: EventData }> = [];
    await init({ handlers: [], autoInstrument: false, sessionId: "sess", wsUrl: null, onEvent: (type, data) => {
      events.push({ type, data });
    } });

    await expect(captureOpenAIToolCall({
      id: "call-weather",
      type: "function",
      function: { name: "get_weather", arguments: "{\"city\":\"San Francisco\"}" },
    }, async () => {
      throw new Error("weather API unavailable");
    })).rejects.toThrow("weather API unavailable");

    expect(events[0]).toMatchObject({
      type: "tool",
      data: {
        kind: "tool",
        toolName: "get_weather",
        toolCallId: "call-weather",
        output: "[ERROR] Error: weather API unavailable",
        error: { name: "Error", message: "weather API unavailable" },
      },
    });
  });

  it("captures OpenAI request errors as LLM events", async () => {
    const events: Array<{ type: string; data: EventData }> = [];
    const client = instrumentOpenAI({
      chat: {
        completions: {
          create: async (_body: Record<string, unknown>) => {
            throw new Error("rate limited");
          },
        },
      },
    });

    await init({ handlers: [], autoInstrument: false, sessionId: "sess", wsUrl: null, onEvent: (type, data) => {
      events.push({ type, data });
    } });

    await expect(client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: "hi" }],
    })).rejects.toThrow("rate limited");

    expect(events[0]).toMatchObject({
      type: "llm",
      data: {
        kind: "llm",
        model: "gpt-4o-mini",
        output: "[ERROR] Error: rate limited",
        error: { name: "Error", message: "rate limited" },
      },
    });
  });
});
