import { Assertion } from './assertion.js';

export type StepType = 'run' | 'extract' | 'assert' | 'poll' | 'conditional';

export interface RunStep {
  type: 'run';
  id: string;
  collection: string;
  request: string;
  retry?: { times: number; on: number[]; delay: number };
}

export interface ExtractStep {
  type: 'extract';
  id: string;
  from: string;
  into: string;
}

export interface AssertStep {
  type: 'assert';
  id: string;
  assertions: Assertion[];
}

export interface PollStep {
  type: 'poll';
  id: string;
  collection: string;
  request: string;
  until: string;
  maxAttempts: number;
  delay: number;
}

export interface ConditionalStep {
  type: 'conditional';
  id: string;
  if: string;
  then: string | 'abort' | 'skip';
  else?: string | 'abort' | 'skip';
}

export type FlowStep = RunStep | ExtractStep | AssertStep | PollStep | ConditionalStep;

export interface FlowDataRow {
  [key: string]: string;
}

export interface FlowConfig {
  name: string;
  description?: string;
  data?: FlowDataRow[];
  steps: FlowStep[];
}

export interface StepResult {
  stepId: string;
  type: StepType;
  passed: boolean;
  response?: unknown;
  error?: string;
  duration: number;
}

export interface RowResult {
  data: FlowDataRow;
  passed: boolean;
  steps: StepResult[];
}

export interface FlowRunResult {
  flowName: string;
  passed: boolean;
  steps: StepResult[];
  dataRows?: RowResult[];
  duration: number;
}
