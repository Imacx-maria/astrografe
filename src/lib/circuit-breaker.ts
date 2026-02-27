const MAX_COOLDOWN_MS = 10 * 60 * 1000; // 10 minutes
const BASE_COOLDOWN_MS = 30 * 1000; // 30 seconds

export class CircuitBreaker {
  private failCount = 0;
  private cooldownUntil = 0;

  constructor(public readonly modelId: string) {}

  isHealthy(): boolean {
    return Date.now() >= this.cooldownUntil;
  }

  recordSuccess() {
    this.failCount = 0;
    this.cooldownUntil = 0;
  }

  recordFailure() {
    this.failCount += 1;
    const cooldown = Math.min(
      Math.pow(2, this.failCount - 1) * BASE_COOLDOWN_MS,
      MAX_COOLDOWN_MS
    );
    this.cooldownUntil = Date.now() + cooldown;
  }
}

export class ModelPool {
  private breakers: Map<string, CircuitBreaker>;
  private cursor = 0;
  private models: string[];

  constructor(modelIds: string[]) {
    this.models = modelIds;
    this.breakers = new Map(modelIds.map((id) => [id, new CircuitBreaker(id)]));
  }

  nextHealthy(): string | null {
    for (let i = 0; i < this.models.length; i++) {
      const idx = (this.cursor + i) % this.models.length;
      const model = this.models[idx];
      if (this.breakers.get(model)!.isHealthy()) {
        this.cursor = (idx + 1) % this.models.length;
        return model;
      }
    }
    return null;
  }

  recordSuccess(modelId: string) {
    this.breakers.get(modelId)?.recordSuccess();
  }

  recordFailure(modelId: string) {
    this.breakers.get(modelId)?.recordFailure();
  }

  get size(): number {
    return this.models.length;
  }
}
