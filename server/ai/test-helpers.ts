import type { AiClient } from "./run";
import type { AiRunRow, AiRunStore } from "./store";

export interface FakeUsage {
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
}

export interface FakeMessage {
  model: string;
  stop_reason: string;
  stop_details?: { type: "refusal"; category: string | null } | null;
  text: string;
  usage?: FakeUsage;
}

/** A scripted response: a message to return, or an error to throw. */
export type Scripted = FakeMessage | Error;

/**
 * Stands in for the Anthropic client. Like the SDK's `messages.parse`, it runs
 * the request's `output_config.format.parse` over the response text.
 */
export function fakeClient(script: Scripted[]) {
  const calls: Record<string, unknown>[] = [];
  const client = {
    messages: {
      async parse(params: Record<string, unknown>) {
        calls.push(params);
        const next = script[calls.length - 1] ?? script.at(-1);
        if (next instanceof Error) throw next;
        if (!next) throw new Error("fakeClient: empty script");
        const format = (
          params.output_config as {
            format: { parse: (text: string) => unknown };
          }
        ).format;
        return {
          id: "msg_test",
          type: "message",
          role: "assistant",
          model: next.model,
          stop_reason: next.stop_reason,
          stop_details: next.stop_details ?? null,
          content: [{ type: "text", text: next.text }],
          usage: {
            cache_read_input_tokens: null,
            cache_creation_input_tokens: null,
            ...(next.usage ?? { input_tokens: 0, output_tokens: 0 }),
          },
          parsed_output:
            next.stop_reason === "end_turn"
              ? format.parse(next.text)
              : undefined,
        };
      },
    },
  } as unknown as AiClient;
  return { client, calls };
}

export function memoryStore(options: { failWith?: Error } = {}) {
  const rows: AiRunRow[] = [];
  const store: AiRunStore = {
    async insert(row) {
      if (options.failWith) throw options.failWith;
      rows.push(row);
    },
  };
  return { store, rows };
}
