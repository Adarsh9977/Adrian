import { randomUUID } from "node:crypto";
import type { AdrianCallbackHandler } from "../handler.js";
import { runWithInvocationId } from "../context.js";
import type { CallbackMetadata, ChatMessage, LlmEndData, TokenUsage, ToolArgs, ToolCallRecord } from "../types.js";

export interface LlmCaptureInput {
  model: string;
  messages: ChatMessage[];
  metadata?: CallbackMetadata | null;
  parentRunId?: string;
}

export async function captureLlmCall<T>(
  getHandler: () => AdrianCallbackHandler | null,
  input: LlmCaptureInput,
  execute: () => Promise<T>,
  extractOutput: (result: T) => LlmEndData | Promise<LlmEndData>,
): Promise<T> {
  const handler = getHandler();
  if (!handler) return execute();

  const runId = randomUUID();
  return runWithInvocationId(randomUUID(), async () => {
    await handler.handleChatModelStart({ name: input.model }, [input.messages], runId, input.parentRunId, { metadata: input.metadata ?? null });
    try {
      const result = await execute();
      await handler.handleLLMEnd(await extractOutput(result), runId);
      return result;
    } catch (error) {
      await handler.handleLLMError(error, runId);
      throw error;
    }
  });
}

export function captureLlmAsyncIterable<T>(
  getHandler: () => AdrianCallbackHandler | null,
  input: LlmCaptureInput,
  iterable: AsyncIterable<T>,
  aggregate: (chunk: T) => void,
  extractOutput: () => LlmEndData,
): AsyncIterable<T> {
  const handler = getHandler();
  if (!handler) return iterable;

  const runId = randomUUID();
  const invocationId = randomUUID();

  async function* wrapped(): AsyncGenerator<T> {
    await handler?.handleChatModelStart({ name: input.model }, [input.messages], runId, input.parentRunId, { metadata: input.metadata ?? null });
    yield* runWithInvocationId(invocationId, async function* () {
      let emitted = false;
      let failed = false;
      try {
        for await (const chunk of iterable) {
          aggregate(chunk);
          yield chunk;
        }
        emitted = true;
        await handler?.handleLLMEnd(await extractOutput(), runId);
      } catch (error) {
        failed = true;
        await handler?.handleLLMError(error, runId);
        throw error;
      } finally {
        if (!emitted && !failed) await handler?.handleLLMEnd(await extractOutput(), runId);
      }
    });
  }

  return wrapped();
}

export function normalizeMessages(input: unknown): ChatMessage[] {
  if (typeof input === "string") return [{ role: "user", content: input }];
  if (!Array.isArray(input)) return [];
  return input.map((message) => {
    const obj = message && typeof message === "object" ? message as Record<string, unknown> : {};
    return {
      role: String(obj.role ?? "unknown"),
      content: stringifyContent(obj.content ?? obj.text ?? ""),
    };
  });
}

export function messagesFromPromptLike(args: Record<string, unknown>): ChatMessage[] {
  const messages = normalizeMessages(args.messages);
  if (messages.length > 0) return prependSystem(args.system, messages);
  if (typeof args.prompt === "string") return prependSystem(args.system, [{ role: "user", content: args.prompt }]);
  if (typeof args.input === "string") return prependSystem(args.system, [{ role: "user", content: args.input }]);
  return prependSystem(args.system, []);
}

export function stringifyContent(value: unknown): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    return value.map((part) => {
      if (typeof part === "string") return part;
      if (part && typeof part === "object") {
        const obj = part as Record<string, unknown>;
        if (typeof obj.text === "string") return obj.text;
        if (typeof obj.content === "string") return obj.content;
      }
      return stringifyJson(part);
    }).join("");
  }
  return stringifyJson(value);
}

export function normalizeUsage(usage: unknown, promptKeys = ["promptTokens", "prompt_tokens", "input_tokens"], completionKeys = ["completionTokens", "completion_tokens", "output_tokens"]): TokenUsage | null {
  if (!usage || typeof usage !== "object") return null;
  const obj = usage as Record<string, unknown>;
  const promptTokens = numberFromKeys(obj, promptKeys);
  const completionTokens = numberFromKeys(obj, completionKeys);
  const totalTokens = numberFromKeys(obj, ["totalTokens", "total_tokens"]) ?? ((promptTokens ?? 0) + (completionTokens ?? 0));
  if (promptTokens === null && completionTokens === null && totalTokens === 0) return null;
  return { promptTokens: promptTokens ?? 0, completionTokens: completionTokens ?? 0, totalTokens };
}

export function parseToolArgs(value: unknown): ToolArgs {
  if (!value) return {};
  if (typeof value === "object" && !Array.isArray(value)) return value as ToolArgs;
  if (typeof value !== "string") return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as ToolArgs : {};
  } catch {
    return {};
  }
}

export function emptyLlmEnd(output = "", toolCalls: ToolCallRecord[] = [], usage: TokenUsage | null = null): LlmEndData {
  return { output, toolCalls, usage };
}

function prependSystem(system: unknown, messages: ChatMessage[]): ChatMessage[] {
  return typeof system === "string" && system.length > 0 ? [{ role: "system", content: system }, ...messages] : messages;
}

function numberFromKeys(obj: Record<string, unknown>, keys: string[]): number | null {
  for (const key of keys) {
    const value = obj[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
  }
  return null;
}

function stringifyJson(value: unknown): string {
  if (value === null || value === undefined) return "";
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}
