import { CollectionRunResult, RequestRunResult } from '../collection-runner.js';
import { FlowRunResult, StepResult } from '../../types/flow.js';

interface TestCase {
  name: string;
  classname: string;
  time: number;
  failureMessage?: string;
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function toTestCases(result: RequestRunResult, classname: string): TestCase[] {
  const time = result.duration / 1000;
  const cases: TestCase[] = [];

  // A request that threw (network failure, script error) has no assertions and no
  // response. Report it as a single failing testcase so CI does not go green on a
  // request that never completed.
  if (result.error) {
    return [{ name: result.requestName, classname, time, failureMessage: result.error }];
  }

  if (result.assertions.length === 0 && !result.response?.testResults?.length) {
    const status = result.response?.status ?? 0;
    const implicitFailed = status >= 500;
    return [{
      name: result.requestName,
      classname,
      time,
      failureMessage: implicitFailed ? `status ${status} >= 500` : undefined
    }];
  }

  for (const a of result.assertions) {
    cases.push({
      name: `${result.requestName} :: ${a.message}`,
      classname,
      time,
      failureMessage: a.passed ? undefined : a.message
    });
  }

  for (const t of (result.response?.testResults ?? [])) {
    cases.push({
      name: `${result.requestName} :: ${t.name}`,
      classname,
      time,
      failureMessage: t.passed ? undefined : (t.error ?? t.name)
    });
  }

  return cases;
}

function renderSuite(suiteName: string, testCases: TestCase[]): string {
  const failures = testCases.filter(tc => tc.failureMessage !== undefined).length;
  const totalTime = testCases.reduce((sum, tc) => sum + tc.time, 0);

  const lines: string[] = [];
  lines.push(`<testsuite name="${escapeXml(suiteName)}" tests="${testCases.length}" failures="${failures}" time="${totalTime.toFixed(3)}">`);
  for (const tc of testCases) {
    if (tc.failureMessage) {
      const msg = escapeXml(tc.failureMessage);
      lines.push(`  <testcase name="${escapeXml(tc.name)}" classname="${escapeXml(tc.classname)}" time="${tc.time.toFixed(3)}">`);
      lines.push(`    <failure message="${msg}">${msg}</failure>`);
      lines.push(`  </testcase>`);
    } else {
      lines.push(`  <testcase name="${escapeXml(tc.name)}" classname="${escapeXml(tc.classname)}" time="${tc.time.toFixed(3)}"/>`);
    }
  }
  lines.push(`</testsuite>`);
  return lines.join('\n');
}

export function toJUnit(results: CollectionRunResult): string {
  const testCases = results.results.flatMap(r => toTestCases(r, results.collection));
  return renderSuite(results.collection, testCases);
}

function stepToTestCase(step: StepResult, classname: string): TestCase {
  return {
    name: step.stepId,
    classname,
    time: step.duration / 1000,
    failureMessage: step.passed ? undefined : (step.error || `step ${step.stepId} failed`)
  };
}

export function toJUnitFromFlow(result: FlowRunResult): string {
  const steps = result.dataRows ? result.dataRows.flatMap(r => r.steps) : result.steps;
  const testCases = steps.map(s => stepToTestCase(s, result.flowName));
  return renderSuite(result.flowName, testCases);
}

export function toJUnitFromData(result: any): string {
  const suites = [];
  for (const run of result.runs) {
    const testCases = run.result.results.flatMap((r: any) => toTestCases(r, result.collection));
    const suiteName = `${result.collection} (Row ${run.rowNumber})`;
    suites.push(renderSuite(suiteName, testCases));
  }
  return `<?xml version="1.0" encoding="UTF-8"?>\n<testsuites>\n${suites.join('\n')}\n</testsuites>`;
}
