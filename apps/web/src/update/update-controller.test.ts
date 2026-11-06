import { describe, expect, it, vi } from "vitest";
import { createUpdateController } from "./update-controller";

type Options = {
  onNeedRefresh?: () => void;
  onRegisteredSW?: (
    url: string | undefined,
    registration: ServiceWorkerRegistration | undefined,
  ) => void;
};

function setup() {
  const updateSW = vi.fn(async (_reload?: boolean) => {});
  let options: Options = {};
  const register = vi.fn((opts: Options) => {
    options = opts;
    return updateSW;
  });
  const controller = createUpdateController(register);
  return { controller, register, updateSW, options: () => options };
}

describe("createUpdateController", () => {
  it("is not available until the service worker reports a waiting version", () => {
    const { controller, options } = setup();
    const listener = vi.fn();
    controller.subscribe(listener);
    expect(controller.available()).toBe(false);
    options().onNeedRefresh?.();
    expect(controller.available()).toBe(true);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("stops notifying an unsubscribed listener", () => {
    const { controller, options } = setup();
    const listener = vi.fn();
    controller.subscribe(listener)();
    options().onNeedRefresh?.();
    expect(listener).not.toHaveBeenCalled();
  });

  it("never applies the update by itself", () => {
    const { options, updateSW } = setup();
    options().onNeedRefresh?.();
    expect(updateSW).not.toHaveBeenCalled();
  });

  it("applies the waiting version and reloads only when asked", () => {
    const { controller, options, updateSW } = setup();
    options().onNeedRefresh?.();
    controller.reload();
    expect(updateSW).toHaveBeenCalledWith(true);
  });

  it("asks the registration to look for a new deploy on check", () => {
    const { controller, options } = setup();
    const update = vi.fn(async () => {});
    options().onRegisteredSW?.("/sw.js", {
      update,
    } as unknown as ServiceWorkerRegistration);
    controller.check();
    expect(update).toHaveBeenCalledTimes(1);
  });

  it("ignores a check before registration and a check that fails offline", async () => {
    const { controller, options } = setup();
    expect(() => controller.check()).not.toThrow();
    const update = vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    });
    options().onRegisteredSW?.("/sw.js", {
      update,
    } as unknown as ServiceWorkerRegistration);
    expect(() => controller.check()).not.toThrow();
    await Promise.resolve();
  });
});
