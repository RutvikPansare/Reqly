export interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
}

export interface HttpResponse {
  status: number;
  body: string | Record<string, unknown> | null;
  fullBody?: string | Record<string, unknown> | null;
  headers: Record<string, string>;
  latency: number;
  requestId?: string;
  timestamp: string;
  consoleLogs?: string[];
  testResults?: TestResult[];
}
