import { describe, it, expect, vi, beforeEach } from "vitest";
import { CircuitBreaker, ModelPool } from "./circuit-breaker";

describe("CircuitBreaker", () => {
  beforeEach(() => vi.useFakeTimers());

  it("starts healthy", () => {
    const cb = new CircuitBreaker("test-model");
    expect(cb.isHealthy()).toBe(true);
  });

  it("marks unhealthy after first failure and sets cooldown", () => {
    const cb = new CircuitBreaker("test-model");
    cb.recordFailure();
    expect(cb.isHealthy()).toBe(false);
  });

  it("recovers after cooldown expires", () => {
    const cb = new CircuitBreaker("test-model");
    cb.recordFailure(); // cooldown = 30s (2^0 * 30)
    vi.advanceTimersByTime(31_000);
    expect(cb.isHealthy()).toBe(true);
  });

  it("doubles cooldown on repeated failures (exponential backoff)", () => {
    const cb = new CircuitBreaker("test-model");
    cb.recordFailure(); // fail 1: 30s cooldown
    vi.advanceTimersByTime(31_000);
    cb.recordFailure(); // fail 2: 60s cooldown
    vi.advanceTimersByTime(31_000);
    expect(cb.isHealthy()).toBe(false); // still in cooldown
    vi.advanceTimersByTime(30_000);
    expect(cb.isHealthy()).toBe(true);
  });

  it("resets fail count on success", () => {
    const cb = new CircuitBreaker("test-model");
    cb.recordFailure();
    vi.advanceTimersByTime(31_000);
    cb.recordSuccess();
    cb.recordFailure(); // should reset to 30s again
    vi.advanceTimersByTime(31_000);
    expect(cb.isHealthy()).toBe(true);
  });

  it("caps cooldown at 10 minutes", () => {
    const cb = new CircuitBreaker("test-model");
    for (let i = 0; i < 10; i++) {
      cb.recordFailure();
      vi.advanceTimersByTime(600_001);
    }
    // After many failures, cooldown should still recover after <= 10 min
    vi.advanceTimersByTime(600_001);
    expect(cb.isHealthy()).toBe(true);
  });
});

describe("ModelPool", () => {
  it("returns models in round-robin order", () => {
    const pool = new ModelPool(["a", "b", "c"]);
    expect(pool.nextHealthy()).toBe("a");
    expect(pool.nextHealthy()).toBe("b");
    expect(pool.nextHealthy()).toBe("c");
    expect(pool.nextHealthy()).toBe("a");
  });

  it("skips unhealthy models", () => {
    const pool = new ModelPool(["a", "b", "c"]);
    pool.recordFailure("a");
    expect(pool.nextHealthy()).toBe("b");
    expect(pool.nextHealthy()).toBe("c");
    expect(pool.nextHealthy()).toBe("b"); // a still unhealthy
  });

  it("returns null if all models are unhealthy", () => {
    const pool = new ModelPool(["a", "b"]);
    pool.recordFailure("a");
    pool.recordFailure("b");
    expect(pool.nextHealthy()).toBeNull();
  });
});
