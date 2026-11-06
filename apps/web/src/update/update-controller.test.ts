import { describe, expect, it, vi } from "vitest";
import { createUpdateController } from "./update-controller";

type Options = {
  immediate?: boolean;
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
  it("registers the service worker straight away, as the app did before the prompt", () => {
    const { register } = setup();
    expect(register).toHaveBeenCalledWith(
      expect.objectContaining({ immediate: true }),
    );
  });

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

  it("ignores a check before registration", () => {
    const { controller } = setup();
    expect(() => controller.check()).not.toThrow();
  });

  it("handles the rejection of a check that fails offline", () => {
    const { controller, options } = setup();
    const caught = vi.fn();
    options().onRegisteredSW?.("/sw.js", {
      update: () => ({ catch: caught }),
    } as unknown as ServiceWorkerRegistration);
    controller.check();
    expect(caught).toHaveBeenCalledTimes(1);
  });
});
