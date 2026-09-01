import type { ToolDefinition } from "./definition.js";

export class ToolDefinitionRegistry {
  private readonly definitions = new Map<string, ToolDefinition<any, any, any>>();

  register<I, O, TWorkspace>(definition: ToolDefinition<I, O, TWorkspace>): void {
    if (this.definitions.has(definition.name)) {
      throw new Error(`Tool definition is already registered: ${definition.name}`);
    }
    this.definitions.set(definition.name, definition);
  }

  get(name: string): ToolDefinition<any, any, any> | undefined {
    return this.definitions.get(name);
  }

  require(name: string): ToolDefinition<any, any, any> {
    const definition = this.get(name);
    if (!definition) throw new Error(`Tool definition is not registered: ${name}`);
    return definition;
  }

  names(): readonly string[] {
    return Object.freeze([...this.definitions.keys()]);
  }

  list(): readonly ToolDefinition<any, any, any>[] {
    return Object.freeze([...this.definitions.values()]);
  }
}
