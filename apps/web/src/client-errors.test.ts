import { describe, expect, it, vi } from "vitest";
import {
  type ClientErrorsDb,
  createClientErrorRecorder,
  DataError,
  failureKind,
} from "./client-errors";

function setup(
  insert: (row: Record<string, unknown>) => unknown = async () => ({
    error: null,
  }),
  online = true,
) {
  const insertMock = vi.fn(insert);
  const from = vi.fn((_table: "client_errors") => ({ insert: insertMock }));
  const record = createClientErrorRecorder({
    db: { from } as unknown as ClientErrorsDb,
    version: "abc1234",
    online: () => online,
  });
  return { record, from, insert: insertMock };
}

describe("DataError", () => {
  it("carries the message, code and HTTP status of a failed call", () => {
    const e = new DataError("boom", { code: "23505", status: 409 });
    expect(e).toBeInstanceOf(Error);
    expect(e).toMatchObject({ message: "boom", code: "23505", status: 409 });
  });

  it("defaults the code and status to null", () => {
    expect(new DataError("boom")).toMatchObject({ code: null, status: null });
  });
});

describe("failureKind", () => {
  it.each([
    ["no response (status 0)", new DataError("x", { status: 0 }), "network"],
    ["a thrown fetch TypeError", new TypeError("Failed to fetch"), "network"],
    ["a timeout", new DOMException("timed out", "TimeoutError"), "network"],
    ["an HTTP 401", new DataError("x", { status: 401 }), "session"],
    [
      "an expired JWT code",
      new DataError("x", { code: "PGRST301", status: 401 }),
      "session",
    ],
    ["a JWT expired message", new DataError("JWT expired"), "session"],
    [
      "a database rejection",
      new DataError("x", { code: "23505", status: 409 }),
      "other",
    ],
    ["a server error", new DataError("x", { status: 500 }), "other"],
    ["an unknown error", new Error("boom"), "other"],
    ["a non-error", "boom", "other"],
  ])("tells %s apart", (_, error, kind) => {
    expect(failureKind(error)).toBe(kind);
  });
});

describe("createClientErrorRecorder", () => {
  it("inserts one row into client_errors with exactly the diagnostic fields", async () => {
    const { record, from, insert } = setup();
    await record(
      "save",
      new DataError("duplicate key", { code: "23505", status: 409 }),
    );

    expect(from).toHaveBeenCalledWith("client_errors");
    expect(insert).toHaveBeenCalledOnce();
    expect(insert).toHaveBeenCalledWith({
      operation: "save",
      error_message: "duplicate key",
      error_code: "23505",
      http_status: 409,
      online: true,
      app_version: "abc1234",
    });
  });

  it("stores no HTTP status when there was no response", async () => {
    const { record, insert } = setup();
    await record("save", new DataError("Failed to fetch", { status: 0 }));
    expect(insert.mock.calls[0]?.[0]).toMatchObject({
      http_status: null,
      error_code: null,
    });
  });

  it("records a plain Error by its message, with no code or status", async () => {
    const { record, insert } = setup();
    await record("load_targets", new TypeError("Failed to fetch"));
    expect(insert.mock.calls[0]?.[0]).toMatchObject({
      operation: "load_targets",
      error_message: "Failed to fetch",
      error_code: null,
      http_status: null,
    });
  });

  it("records whether the browser was online", async () => {
    const { record, insert } = setup(undefined, false);
    await record("parse", new DataError("x", { status: 0 }));
    expect(insert.mock.calls[0]?.[0]).toMatchObject({ online: false });
  });

  it("writes a row for every attempt, so a retry that fails again adds one", async () => {
    const { record, insert } = setup();
    await record("save", new DataError("x", { status: 0 }));
    await record("save", new DataError("x", { status: 0 }));
    expect(insert).toHaveBeenCalledTimes(2);
  });

  it.each([
    ["an error result", async () => ({ error: { message: "rls" } })],
    [
      "a rejection",
      async () => {
        throw new TypeError("Failed to fetch");
      },
    ],
    [
      "a synchronous throw",
      () => {
        throw new Error("no client");
      },
    ],
  ])(
    "never fails the caller or retries when the insert gives %s",
    async (_, insert) => {
      const { record, insert: spy } = setup(insert);
      await expect(
        record("save", new DataError("x", { status: 0 })),
      ).resolves.toBeUndefined();
      // Nothing is queued: the one attempt is the only attempt.
      expect(spy).toHaveBeenCalledOnce();
    },
  );

  it("never fails the caller when the database client itself throws", async () => {
    const record = createClientErrorRecorder({
      db: {
        from: () => {
          throw new Error("boom");
        },
      } as unknown as ClientErrorsDb,
      version: "v",
      online: () => true,
    });
    await expect(record("save", new Error("x"))).resolves.toBeUndefined();
  });
});
