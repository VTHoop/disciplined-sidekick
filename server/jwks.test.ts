import { describe, expect, it, vi } from "vitest";
import { lazyJwks } from "./jwks";

const header = { alg: "ES256" };
const token = { payload: "", signature: "" } as never;

describe("lazyJwks", () => {
  it("does not build the resolver until the first lookup", () => {
    const create = vi.fn();
    lazyJwks(create);
    expect(create).not.toHaveBeenCalled();
  });

  it("builds the resolver once and reuses it across lookups", async () => {
    const resolver = vi.fn().mockResolvedValue("key");
    const create = vi.fn(() => resolver);
    const jwks = lazyJwks(create);
    await jwks(header, token);
    await jwks(header, token);
    expect(create).toHaveBeenCalledTimes(1);
    expect(resolver).toHaveBeenCalledTimes(2);
  });

  it("retries building if construction failed", async () => {
    const create = vi
      .fn()
      .mockImplementationOnce(() => {
        throw new TypeError("Invalid URL");
      })
      .mockImplementationOnce(() => vi.fn().mockResolvedValue("key"));
    const jwks = lazyJwks(create);
    expect(() => jwks(header, token)).toThrow("Invalid URL");
    await expect(jwks(header, token)).resolves.toBe("key");
  });
});
