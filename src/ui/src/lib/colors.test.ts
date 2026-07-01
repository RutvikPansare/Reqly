import { describe, it, expect } from 'vitest';
import { requestBadgeInfo } from './colors.js';

describe('requestBadgeInfo', () => {
  it('returns correct label and style for websocket', () => {
    const result = requestBadgeInfo('websocket', undefined);
    expect(result.label).toBe('WS');
    expect(result.style?.color).toBe('#f59e0b');
  });

  it('returns correct label and style for sse', () => {
    const result = requestBadgeInfo('sse', undefined);
    expect(result.label).toBe('SSE');
    expect(result.style?.color).toBe('#14b8a6');
  });

  it('returns correct label and style for socketio', () => {
    const result = requestBadgeInfo('socketio', undefined);
    expect(result.label).toBe('SIO');
    expect(result.style?.color).toBe('#8b5cf6');
  });

  it('returns correct label and style for mqtt', () => {
    const result = requestBadgeInfo('mqtt', undefined);
    expect(result.label).toBe('MQTT');
    expect(result.style?.color).toBe('#f97316');
  });
});
