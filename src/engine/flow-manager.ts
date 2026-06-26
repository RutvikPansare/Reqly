import * as fs from 'fs/promises';
import { existsSync } from 'fs';
import * as path from 'path';
import { load, dump } from 'js-yaml';
import { FlowConfig, FlowStep, FlowDataRow } from '../types/index.js';

export class FlowNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FlowNotFoundError';
  }
}

export class FlowStepNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FlowStepNotFoundError';
  }
}

export class FlowManager {
  constructor(private baseDir: string) {}

  private get flowsDir(): string {
    return path.join(this.baseDir, 'flows');
  }

  private flowPath(name: string): string {
    return path.join(this.flowsDir, `${name}.yaml`);
  }

  private async ensureFlowsDir() {
    if (!existsSync(this.flowsDir)) {
      await fs.mkdir(this.flowsDir, { recursive: true });
    }
  }

  async createFlow(name: string, description?: string): Promise<FlowConfig> {
    await this.ensureFlowsDir();
    const flow: FlowConfig = { name, ...(description ? { description } : {}), steps: [] };
    await fs.writeFile(this.flowPath(name), dump(flow), 'utf8');
    return flow;
  }

  async getFlow(name: string): Promise<FlowConfig> {
    const filePath = this.flowPath(name);
    if (!existsSync(filePath)) {
      throw new FlowNotFoundError(`Flow ${name} not found`);
    }
    const content = await fs.readFile(filePath, 'utf8');
    return load(content) as FlowConfig;
  }

  async listFlows(): Promise<FlowConfig[]> {
    await this.ensureFlowsDir();
    const flows: FlowConfig[] = [];
    const files = await fs.readdir(this.flowsDir);
    for (const file of files) {
      if (file.endsWith('.yaml')) {
        const content = await fs.readFile(path.join(this.flowsDir, file), 'utf8');
        try {
          flows.push(load(content) as FlowConfig);
        } catch {
          // Ignore invalid yaml files
        }
      }
    }
    return flows;
  }

  async deleteFlow(name: string): Promise<void> {
    const filePath = this.flowPath(name);
    if (!existsSync(filePath)) {
      throw new FlowNotFoundError(`Flow ${name} not found`);
    }
    await fs.unlink(filePath);
  }

  async updateFlowMeta(name: string, updates: { name?: string; description?: string }): Promise<FlowConfig> {
    const flow = await this.getFlow(name);
    if (updates.description !== undefined) flow.description = updates.description;

    if (updates.name && updates.name !== name) {
      const oldPath = this.flowPath(name);
      flow.name = updates.name;
      await fs.writeFile(this.flowPath(updates.name), dump(flow), 'utf8');
      await fs.unlink(oldPath);
      return flow;
    }

    await this.saveFlow(flow);
    return flow;
  }

  private async saveFlow(flow: FlowConfig): Promise<void> {
    await fs.writeFile(this.flowPath(flow.name), dump(flow), 'utf8');
  }

  async addFlowStep(flowName: string, step: FlowStep): Promise<void> {
    const flow = await this.getFlow(flowName);
    flow.steps = [...flow.steps, step];
    await this.saveFlow(flow);
  }

  async updateFlowStep(flowName: string, stepId: string, step: FlowStep): Promise<void> {
    const flow = await this.getFlow(flowName);
    const index = flow.steps.findIndex(s => s.id === stepId);
    if (index === -1) {
      throw new FlowStepNotFoundError(`Step ${stepId} not found in flow ${flowName}`);
    }
    flow.steps[index] = step;
    await this.saveFlow(flow);
  }

  async deleteFlowStep(flowName: string, stepId: string): Promise<void> {
    const flow = await this.getFlow(flowName);
    const index = flow.steps.findIndex(s => s.id === stepId);
    if (index === -1) {
      throw new FlowStepNotFoundError(`Step ${stepId} not found in flow ${flowName}`);
    }
    flow.steps = flow.steps.filter(s => s.id !== stepId);
    await this.saveFlow(flow);
  }

  async setFlowData(flowName: string, data: FlowDataRow[]): Promise<void> {
    const flow = await this.getFlow(flowName);
    flow.data = data;
    await this.saveFlow(flow);
  }
}
