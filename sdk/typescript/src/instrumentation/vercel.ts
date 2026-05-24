import { randomUUID } from "node:crypto";
import { runWithInvocationId } from "../context.js";
import { getHandler } from "../index.js";
import type { CallbackMetadata, LlmEndData, ToolCallRecord } from "../types.js";
import { captureLlmCall, emptyLlmEnd, messagesFromPromptLike, normalizeUsage, parseToolArgs, stringifyContent } from "./common.js";

export interface VercelAIInstrumentationOptions {
  metadata?: CallbackMetadata | null;
}

export interface VercelAIToolCallLike {
  toolCallId?: string;
  id?: string;
  toolName?: string;
  name?: string;
  args?: unknown;
}

export interface VercelAIToolCallCaptureOptions {
  metadata?: CallbackMetadata | null;
  parentRunId?: string;
}

type VercelToolExecute = (args: unknown, options?: unknown, ...rest: unknown[]) => unknown;

const VERCEL_METHODS = new Set(["generateText", "streamText", "generateObject", "streamObject"]);

export function instrumentVercelAI<T extends Record<PropertyKey, unknown>>(ai: T, options: VercelAIInstrumentationOptions = {}): T {
  return new Proxy(ai, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver);
      if (!VERCEL_METHODS.has(String(prop)) || typeof value !== "function") return value;
      return function adrianVercelAI(this: unknown, args: Record<string, unknown> = {}, ...rest: unknown[]) {
        return captureVercelCall(String(prop), () => value.call(this, args, ...rest), args, options);
      };
    },
  });
}

export const withAdrianVercelAI = instrumentVercelAI;

export function instrumentVercelAITools<T extends Record<string, unknown>>(tools: T, options: VercelAIToolCallCaptureOptions = {}): T {
  return Object.fromEntries(Object.entries(tools).map(([toolName, toolDef]) => {
    if (!toolDef || typeof toolDef !== "object") return [toolName, toolDef];
    const execute = (toolDef as { execute?: unknown }).execute;
    if (typeof execute !== "function") return [toolName, toolDef];

    return [toolName, {
      ...(toolDef as Record<string, unknown>),
      execute(this: unknown, args: unknown, executionOptions?: unknown, ...rest: unknown[]) {
        const toolCallId = extractToolCallId(executionOptions);
        return captureVercelAIToolCall({
          toolCallId,
          toolName,
          args,
        }, () => (execute as VercelToolExecute).call(this, args, executionOptions, ...rest), options);
      },
    }];
  })) as T;
}

export async function captureVercelAIToolCall<T>(
  toolCall: VercelAIToolCallLike,
  execute: () => T | Promise<T>,
  options: VercelAIToolCallCaptureOptions = {},
): Promise<T> {
  const handler = getHandler();
  if (!handler) return execute();

  const runId = randomUUID();
  const toolName = String(toolCall.toolName ?? toolCall.name ?? "unknown");
  const toolCallId = String(toolCall.toolCallId ?? toolCall.id ?? "");
  const input = stringifyContent(toolCall.args);
  const metadata = integrationMetadata(options.metadata, "vercel-ai.tool_call");

  return runWithInvocationId(randomUUID(), async () => {
    await handler.handleToolStart({ name: toolName }, input, runId, options.parentRunId, { metadata, toolCallId });
    try {
      const result = await execute();
      await handler.handleToolEnd(result, runId);
      return result;
    } catch (error) {
      await handler.handleToolError(error, runId);
      throw error;
    }
  });
}

export const captureAITool = captureVercelAIToolCall;

function captureVercelCall<T>(operation: string, execute: () => T, args: Record<string, unknown>, options: VercelAIInstrumentationOptions): unknown {
  const model = extractModelName(args.model);
  const metadata = integrationMetadata(options.metadata, operation);
  const result = execute();

  if (operation.startsWith("stream")) {
    void Promise.resolve(result).then((resolved) => emitVercelStreamResult(model, args, metadata, resolved)).catch(() => undefined);
    return result;
  }

  return Promise.resolve(result).then((resolved) => captureLlmCall(getHandler, { model, messages: messagesFromPromptLike(args), metadata }, async () => resolved, extractVercelResult));
}

async function emitVercelStreamResult(model: string, args: Record<string, unknown>, metadata: CallbackMetadata, result: unknown): Promise<void> {
  await captureLlmCall(getHandler, { model, messages: messagesFromPromptLike(args), metadata }, async () => result, async (streamResult) => {
    const obj = streamResult && typeof streamResult === "object" ? streamResult as Record<string, unknown> : {};
    const [text, toolCalls, usage] = await Promise.all([
      resolveMaybe(obj.text, ""),
      resolveMaybe(obj.toolCalls, []),
      resolveMaybe(obj.usage, null),
    ]);
    return emptyLlmEnd(typeof text === "string" ? text : stringifyContent(text), normalizeVercelToolCalls(toolCalls), normalizeVercelUsage(usage));
  });
}

function extractVercelResult(result: unknown): LlmEndData {
  const obj = result && typeof result === "object" ? result as Record<string, unknown> : {};
  const output = typeof obj.text === "string" ? obj.text : typeof obj.object !== "undefined" ? stringifyContent(obj.object) : "";
  return emptyLlmEnd(output, normalizeVercelToolCalls(obj.toolCalls), normalizeVercelUsage(obj.usage));
}

function normalizeVercelToolCalls(raw: unknown): ToolCallRecord[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((call) => {
    const obj = call && typeof call === "object" ? call as Record<string, unknown> : {};
    return {
      id: String(obj.toolCallId ?? obj.id ?? ""),
      name: String(obj.toolName ?? obj.name ?? ""),
      args: parseToolArgs(obj.args),
    };
  });
}

function normalizeVercelUsage(usage: unknown): LlmEndData["usage"] {
  return normalizeUsage(usage, ["promptTokens", "inputTokens"], ["completionTokens", "outputTokens"]);
}

async function resolveMaybe(value: unknown, fallback: unknown): Promise<unknown> {
  if (value === undefined || value === null) return fallback;
  return Promise.resolve(value);
}

function extractModelName(model: unknown): string {
  if (typeof model === "string") return model;
  if (model && typeof model === "object") {
    const obj = model as Record<string, unknown>;
    return String(obj.modelId ?? obj.model ?? obj.id ?? obj.name ?? "vercel-ai");
  }
  return "vercel-ai";
}

function extractToolCallId(executionOptions: unknown): string {
  if (!executionOptions || typeof executionOptions !== "object") return "";
  const obj = executionOptions as Record<string, unknown>;
  return String(obj.toolCallId ?? obj.id ?? "");
}

function integrationMetadata(metadata: CallbackMetadata | null | undefined, operation: string): CallbackMetadata {
  return { ...(metadata ?? {}), adrianIntegration: "vercel-ai", operation };
}
