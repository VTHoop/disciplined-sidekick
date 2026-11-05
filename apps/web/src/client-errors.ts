/** The browser data calls whose failures are recorded. */
export type Operation =
  | "save"
  | "parse"
  | "load_entries"
  | "load_targets"
  | "save_targets"
  | "delete_item";

/** A failed data call: the message, the error code and the HTTP status (0 = no response). */
export class DataError extends Error {
  readonly code: string | null;
  readonly status: number | null;

  constructor(
    message: string,
    { code, status }: { code?: string | null; status?: number | null } = {},
  ) {
    super(message);
    this.name = "DataError";
    this.code = code ?? null;
    this.status = status ?? null;
  }
}

/** The error part of a supabase-js result, with that result's HTTP status. */
export const toDataError = (
  error: { message: string; code?: string | null },
  status?: number,
) => new DataError(error.message, { code: error.code, status });

/** A call that threw before any response arrived: status 0, like a failed fetch. */
export const toThrownError = (e: unknown) =>
  new DataError(e instanceof Error ? e.message : String(e), { status: 0 });

export type FailureKind = "network" | "session" | "other";

const NETWORK_NAMES = new Set(["TypeError", "TimeoutError", "AbortError"]);
const SESSION_CODES = new Set(["PGRST301", "PGRST303"]);

const nameOf = (error: unknown) =>
  typeof error === "object" && error !== null && "name" in error
    ? String(error.name)
    : "";

/**
 * A connection problem (no response), an expired sign-in, or anything else
 * (including a database rejection, which is an answer and not a lost response).
 */
export function failureKind(error: unknown): FailureKind {
  if (error instanceof DataError) {
    if (error.status === 0) return "network";
    if (
      error.status === 401 ||
      (error.code !== null && SESSION_CODES.has(error.code)) ||
      /jwt expired/i.test(error.message)
    ) {
      return "session";
    }
    return "other";
  }
  return NETWORK_NAMES.has(nameOf(error)) ? "network" : "other";
}

export type RecordFailure = (operation: Operation, error: unknown) => unknown;

/**
 * Records a failure without ever affecting the caller: a recorder that throws
 * or rejects is ignored.
 */
export function report(
  record: RecordFailure,
  operation: Operation,
  error: unknown,
) {
  try {
    Promise.resolve(record(operation, error)).catch(() => {});
  } catch {
    // Recording is best effort.
  }
}

interface ClientErrorRow {
  operation: Operation;
  error_message: string;
  error_code: string | null;
  http_status: number | null;
  online: boolean;
  app_version: string;
}

/** The slice of the supabase-js client the recorder uses, so it can be tested without a network. */
export interface ClientErrorsDb {
  from(table: "client_errors"): {
    insert(row: ClientErrorRow): PromiseLike<{ error: unknown }>;
  };
}

const MAX_MESSAGE = 1000;

const describe = (error: unknown) => {
  if (error instanceof DataError) {
    return {
      message: error.message,
      code: error.code,
      status: error.status,
    };
  }
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "object" &&
          error !== null &&
          "message" in error &&
          typeof error.message === "string"
        ? error.message
        : String(error);
  return { message, code: null, status: null };
};

/**
 * Writes one client_errors row per call. Never throws, never retries and
 * queues nothing: if the write fails (offline, for example) the row is lost.
 */
export function createClientErrorRecorder({
  db,
  version,
  online,
}: {
  db: ClientErrorsDb;
  version: string;
  online: () => boolean;
}) {
  return async (operation: Operation, error: unknown): Promise<void> => {
    try {
      const { message, code, status } = describe(error);
      await db.from("client_errors").insert({
        operation,
        error_message: message.slice(0, MAX_MESSAGE),
        error_code: code,
        http_status: status !== null && status > 0 ? status : null,
        online: online(),
        app_version: version,
      });
    } catch {
      // Recording must never affect the user.
    }
  };
}
