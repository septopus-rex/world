/**
 * Minimal in-memory fake World for L2 system tests. Exposes the subset of the
 * real World API that render-free systems touch (entity/component storage +
 * queries) — no renderer, no Three.js. Extend as systems require.
 *
 * Mirrors the real method names used by systems: getComponent / addComponent /
 * queryEntities / getEntitiesWith.
 */
type Components = Record<string, any>;

export class FakeWorld {
  private nextId = 1;
  private entities = new Map<number, Components>();

  spawn(components: Components): number {
    const id = this.nextId++;
    this.entities.set(id, { ...components });
    return id;
  }

  getComponent<T = any>(id: number, name: string): T | undefined {
    return this.entities.get(id)?.[name] as T | undefined;
  }

  addComponent(id: number, name: string, value: any): void {
    const e = this.entities.get(id);
    if (e) e[name] = value;
  }

  queryEntities(name: string): number[] {
    return [...this.entities.entries()].filter(([, c]) => name in c).map(([id]) => id);
  }

  getEntitiesWith(names: string[]): number[] {
    return [...this.entities.entries()]
      .filter(([, c]) => names.every((n) => n in c))
      .map(([id]) => id);
  }
}

export function makeFakeWorld(): FakeWorld {
  return new FakeWorld();
}
