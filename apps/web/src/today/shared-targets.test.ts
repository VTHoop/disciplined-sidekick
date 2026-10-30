import type { StoredTargets } from "@disciplined-sidekick/core";
import { describe, expect, it, vi } from "vitest";
import { createFakeTargets } from "../settings/fake-targets";
import { createSharedTargets } from "./shared-targets";
import { TARGETS } from "./test-utils";

describe("createSharedTargets", () => {
  it("loads once and keeps the result", async () => {
    const store = createFakeTargets(TARGETS);
    const shared = createSharedTargets(store);
    expect(await shared.load()).toEqual(TARGETS);
    expect(await shared.load()).toEqual(TARGETS);
    expect(store.load).toHaveBeenCalledTimes(1);
  });

  it("does not keep a failed load, so the next call tries again", async () => {
    const store = createFakeTargets(TARGETS);
    store.failNextLoad();
    const shared = createSharedTargets(store);
    await expect(shared.load()).rejects.toThrow("offline");
    expect(await shared.load()).toEqual(TARGETS);
    expect(store.load).toHaveBeenCalledTimes(2);
  });

  it("reload drops the kept result", async () => {
    const store = createFakeTargets(TARGETS);
    const shared = createSharedTargets(store);
    await shared.load();
    await shared.reload();
    expect(store.load).toHaveBeenCalledTimes(2);
  });

  it("tells subscribers about a save, with the edited flag set for fruit/veg", async () => {
    const store = createFakeTargets({
      calories: 2200,
      protein: 140,
      fruitVeg: null,
      fruitVegEdited: false,
    });
    const shared = createSharedTargets(store);
    await shared.load();
    const heard = vi.fn<(stored: StoredTargets | null) => void>();
    shared.subscribe(heard);
    await shared.save("fruitVeg", 500);
    expect(heard).toHaveBeenLastCalledWith({
      calories: 2200,
      protein: 140,
      fruitVeg: 500,
      fruitVegEdited: true,
    });
    await shared.save("calories", 1500);
    expect(heard).toHaveBeenCalledTimes(2);
    expect(await shared.load()).toMatchObject({
      calories: 1500,
      fruitVeg: 500,
    });
    expect(store.load).toHaveBeenCalledTimes(1);
  });

  it("stops telling a subscriber that unsubscribed", async () => {
    const shared = createSharedTargets(createFakeTargets(TARGETS));
    await shared.load();
    const heard = vi.fn();
    shared.subscribe(heard)();
    await shared.save("calories", 1500);
    expect(heard).not.toHaveBeenCalled();
  });

  it("loads again after a save made before any load, since the other fields are unknown", async () => {
    const store = createFakeTargets(TARGETS);
    const shared = createSharedTargets(store);
    const heard = vi.fn();
    shared.subscribe(heard);
    await shared.save("calories", 1500);
    expect(heard).not.toHaveBeenCalled();
    expect(store.load).not.toHaveBeenCalled();
    expect(await shared.load()).toMatchObject({ calories: 1500, protein: 140 });
    expect(store.load).toHaveBeenCalledTimes(1);
  });

  it("does not report a save that failed", async () => {
    const store = createFakeTargets(TARGETS);
    const shared = createSharedTargets(store);
    await shared.load();
    const heard = vi.fn();
    shared.subscribe(heard);
    store.failNextSave();
    await expect(shared.save("calories", 1500)).rejects.toThrow("offline");
    expect(heard).not.toHaveBeenCalled();
    expect(await shared.load()).toEqual(TARGETS);
  });
});
