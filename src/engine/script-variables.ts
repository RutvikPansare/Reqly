export class ScriptVariableStore {
  private variables: Map<string, Record<string, string>> = new Map();

  get(collectionName: string, key: string): string | undefined {
    return this.variables.get(collectionName)?.[key];
  }

  set(collectionName: string, key: string, value: string): void {
    if (!this.variables.has(collectionName)) {
      this.variables.set(collectionName, {});
    }
    this.variables.get(collectionName)![key] = value;
  }

  getAll(collectionName: string): Record<string, string> {
    return this.variables.get(collectionName) || {};
  }

  clear(): void {
    this.variables.clear();
  }
}
