import { describe, expect, it } from "vitest";
import type { PairedEvent } from "../src/format/types.js";
import { Mode, type Verdict } from "../src/proto/schema.js";
import { reconnectDelayMsAfterClose, WebSocketClient } from "../src/ws.js";

function client(): WebSocketClient {
  return new WebSocketClient({ url: "ws://localhost:0", sessionId: "sess", apiKey: "key", replayBufferFrames: 10 });
}

function verdict(eventId: string): Verdict {
  return {
    eventId,
    sessionId: "sess",
    madCode: "M3_TEST",
    policy: { mode: Mode.MODE_BLOCK, policyM0: false, policyM2: false, policyM3: true, policyM4: false },
    hitl: null,
  };
}

function llmEvent(eventId: string): PairedEvent {
  return {
    eventId,
    invocationId: "inv",
    sessionId: "sess",
    runId: "run",
    parentRunId: "",
    timestamp: new Date(0).toISOString(),
    pairType: "llm",
    agent: { agentId: "agent", systemPrompt: "", userInstruction: "" },
    parent: null,
    data: { kind: "llm", model: "ChatOpenAI", messages: [], output: "", toolCalls: [{ id: "tool-1", name: "search", args: {} }], usage: null },
    metadata: null,
  };
}

describe("WebSocketClient verdict waiting", () => {
  it("replays a verdict that arrives before a waiter is registered", async () => {
    const ws = client();
    const early = verdict("evt-1");
    (ws as unknown as { resolveVerdict: (eventId: string, verdict: Verdict) => void }).resolveVerdict("evt-1", early);

    await expect(ws.waitForVerdict("evt-1", 1)).resolves.toBe(early);
  });

  it("resolves every waiter registered for the same event", async () => {
    const ws = client();
    const expected = verdict("evt-2");
    const first = ws.waitForVerdict("evt-2", 1);
    const second = ws.waitForVerdict("evt-2", 1);

    (ws as unknown as { resolveVerdict: (eventId: string, verdict: Verdict) => void }).resolveVerdict("evt-2", expected);

    await expect(Promise.all([first, second])).resolves.toEqual([expected, expected]);
  });

  it("uses cached event verdicts for correlated tool calls", async () => {
    const ws = client();
    await ws.onPairedEvent(llmEvent("evt-3"));
    const expected = verdict("evt-3");
    (ws as unknown as { resolveVerdict: (eventId: string, verdict: Verdict) => void }).resolveVerdict("evt-3", expected);

    await expect(ws.waitForToolCallVerdict("tool-1", 1)).resolves.toBe(expected);
  });

  it("schedules a 60s reconnect delay after quota-exhausted close", () => {
    expect(reconnectDelayMsAfterClose(4003)).toBe(60_000);
    expect(reconnectDelayMsAfterClose(1000)).toBeNull();
    expect(reconnectDelayMsAfterClose(undefined)).toBeNull();
  });

  it("applies quota reconnect delay via scheduleReconnectAfterClose", () => {
    const ws = client();
    ws.scheduleReconnectAfterClose(4003);
    expect((ws as unknown as { nextReconnectDelay: number | null }).nextReconnectDelay).toBe(60_000);
  });

  it("does not set reconnect delay for ordinary close codes", () => {
    const ws = client();
    ws.scheduleReconnectAfterClose(1006);
    expect((ws as unknown as { nextReconnectDelay: number | null }).nextReconnectDelay).toBeNull();
  });
});
