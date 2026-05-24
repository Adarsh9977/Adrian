import { afterEach, describe, expect, it } from "vitest";
import { captureAITool, captureVercelAIToolCall, init, instrumentVercelAI, instrumentVercelAITools, shutdown } from "../src/index.js";
import type { EventData } from "../src/types.js";

describe("Vercel AI SDK instrumentation", () => {
  afterEach(async () => {
    await shutdown();
  });

  it("captures generateText calls as paired LLM events", async () => {
    const events: EventData[] = [];
    const ai = instrumentVercelAI({
      generateText: async (_args: Record<string, unknown>) => ({
        text: "hello from vercel",
        toolCalls: [{ toolCallId: "tool-1", toolName: "search", args: { query: "adrian" } }],
        usage: { promptTokens: 8, completionTokens: 9, totalTokens: 17 },
      }),
    });

    await init({ handlers: [], autoInstrument: false, sessionId: "sess", wsUrl: null, onEvent: (_type, data) => {
      events.push(data);
    } });
    const result = await ai.generateText({
      model: { modelId: "openai/gpt-4o-mini" },
      system: "be brief",
      prompt: "hello",
    });

    expect(result.text).toBe("hello from vercel");
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      kind: "llm",
      model: "openai/gpt-4o-mini",
      output: "hello from vercel",
      toolCalls: [{ id: "tool-1", name: "search", args: { query: "adrian" } }],
      usage: { promptTokens: 8, completionTokens: 9, totalTokens: 17 },
    });
  });

  it("emits streamText events when the result promises settle", async () => {
    const events: EventData[] = [];
    const ai = instrumentVercelAI({
      streamText: (_args: Record<string, unknown>) => ({
        text: Promise.resolve("streamed"),
        toolCalls: Promise.resolve([]),
        usage: Promise.resolve({ inputTokens: 2, outputTokens: 3, totalTokens: 5 }),
      }),
    });

    await init({ handlers: [], autoInstrument: false, sessionId: "sess", wsUrl: null, onEvent: (_type, data) => {
      events.push(data);
    } });
    const result = await ai.streamText({ model: "gpt-4o", messages: [{ role: "user", content: "hi" }] });
    await result.text;

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(events[0]).toMatchObject({
      kind: "llm",
      model: "gpt-4o",
      output: "streamed",
      usage: { promptTokens: 2, completionTokens: 3, totalTokens: 5 },
    });
  });

  it("captures local Vercel AI tool execution as a tool event", async () => {
    const events: Array<{ type: string; data: EventData }> = [];
    await init({ handlers: [], autoInstrument: false, sessionId: "sess", wsUrl: null, onEvent: (type, data) => {
      events.push({ type, data });
    } });

    const result = await captureVercelAIToolCall({
      toolCallId: "tool-weather",
      toolName: "getWeather",
      args: { city: "San Francisco" },
    }, async () => ({ temperatureF: 58, condition: "cloudy" }));

    expect(result).toEqual({ temperatureF: 58, condition: "cloudy" });
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      type: "tool",
      data: {
        kind: "tool",
        toolName: "getWeather",
        toolCallId: "tool-weather",
        input: "{\"city\":\"San Francisco\"}",
        output: "{\"temperatureF\":58,\"condition\":\"cloudy\"}",
      },
    });
  });

  it("captures local Vercel AI tool errors as tool events", async () => {
    const events: Array<{ type: string; data: EventData }> = [];
    await init({ handlers: [], autoInstrument: false, sessionId: "sess", wsUrl: null, onEvent: (type, data) => {
      events.push({ type, data });
    } });

    await expect(captureAITool({
      toolCallId: "tool-weather",
      toolName: "getWeather",
      args: { city: "San Francisco" },
    }, async () => {
      throw new Error("weather API unavailable");
    })).rejects.toThrow("weather API unavailable");

    expect(events[0]).toMatchObject({
      type: "tool",
      data: {
        kind: "tool",
        toolName: "getWeather",
        toolCallId: "tool-weather",
        output: "[ERROR] Error: weather API unavailable",
        error: { name: "Error", message: "weather API unavailable" },
      },
    });
  });

  it("wraps Vercel AI SDK tool execute functions", async () => {
    const events: Array<{ type: string; data: EventData }> = [];
    const tools = instrumentVercelAITools({
      getWeather: {
        description: "Get current weather for a city.",
        execute: async ({ city }: { city: string }, _options?: unknown) => ({ city, temperatureF: 58 }),
      },
    });

    await init({ handlers: [], autoInstrument: false, sessionId: "sess", wsUrl: null, onEvent: (type, data) => {
      events.push({ type, data });
    } });

    const result = await tools.getWeather.execute({ city: "San Francisco" }, { toolCallId: "tool-weather" });

    expect(result).toEqual({ city: "San Francisco", temperatureF: 58 });
    expect(events[0]).toMatchObject({
      type: "tool",
      data: {
        kind: "tool",
        toolName: "getWeather",
        toolCallId: "tool-weather",
        input: "{\"city\":\"San Francisco\"}",
        output: "{\"city\":\"San Francisco\",\"temperatureF\":58}",
      },
    });
  });
});
