import { test } from 'node:test';
import assert from 'node:assert/strict';
import { priceCall, DEFAULT_PRICING } from '../lib/pricing.js';
import { checkBudget, shouldBlock } from '../lib/budget.js';
import { panelState } from '../lib/cost-view.js';

test('priceCall: deepseek-chat rates', () => {
  const cost = priceCall('deepseek-chat', 1_000_000, 0);
  assert.equal(cost, 0.14);
  const cost2 = priceCall('deepseek-chat', 0, 1_000_000);
  assert.equal(cost2, 0.28);
});

test('priceCall: unknown model returns 0', () => {
  assert.equal(priceCall('unknown-model', 1000, 500), 0);
});

test('priceCall: custom pricing table', () => {
  const custom = { 'my-model': { promptPerMillion: 1, completionPerMillion: 2 } };
  assert.equal(priceCall('my-model', 500_000, 250_000, custom), 1.0);
});

test('checkBudget: under budget', () => {
  const entries = [
    { timestamp: 1000, model: 'm', promptTokens: 0, completionTokens: 0, cost: 10, sessionId: 's1' },
  ];
  const budget = { monthly: 50, enforce: false, periodStart: 0 };
  const status = checkBudget(entries, budget);
  assert.equal(status.exceeded, false);
  assert.equal(status.spent, 10);
  assert.equal(status.remaining, 40);
});

test('checkBudget: over budget', () => {
  const entries = [
    { timestamp: 1000, model: 'm', promptTokens: 0, completionTokens: 0, cost: 60, sessionId: 's1' },
  ];
  const budget = { monthly: 50, enforce: false, periodStart: 0 };
  const status = checkBudget(entries, budget);
  assert.equal(status.exceeded, true);
  assert.equal(status.remaining, -10);
});

test('checkBudget: only counts entries after periodStart', () => {
  const entries = [
    { timestamp: 500, model: 'm', promptTokens: 0, completionTokens: 0, cost: 100, sessionId: 's1' },
    { timestamp: 1500, model: 'm', promptTokens: 0, completionTokens: 0, cost: 10, sessionId: 's2' },
  ];
  const budget = { monthly: 50, enforce: false, periodStart: 1000 };
  const status = checkBudget(entries, budget);
  assert.equal(status.spent, 10);
});

test('shouldBlock: enforce=false never blocks', () => {
  const entries = [
    { timestamp: 0, model: 'm', promptTokens: 0, completionTokens: 0, cost: 100, sessionId: 's1' },
  ];
  const budget = { monthly: 50, enforce: false, periodStart: 0 };
  assert.equal(shouldBlock(entries, budget), false);
});

test('shouldBlock: enforce=true blocks when exceeded', () => {
  const entries = [
    { timestamp: 0, model: 'm', promptTokens: 0, completionTokens: 0, cost: 100, sessionId: 's1' },
  ];
  const budget = { monthly: 50, enforce: true, periodStart: 0 };
  assert.equal(shouldBlock(entries, budget), true);
});

test('panelState: aggregates correctly', () => {
  const now = Date.now();
  const entries = [
    { timestamp: now, model: 'deepseek-chat', promptTokens: 100, completionTokens: 50, cost: 0.01, sessionId: 's1' },
    { timestamp: now, model: 'deepseek-chat', promptTokens: 200, completionTokens: 100, cost: 0.02, sessionId: 's1' },
    { timestamp: now, model: 'deepseek-reasoner', promptTokens: 100, completionTokens: 50, cost: 0.05, sessionId: 's2' },
  ];
  const payload = panelState(entries, null);
  assert.equal(payload.perModel.length, 2);
  assert.equal(payload.perModel[0].model, 'deepseek-reasoner'); // highest spend
  assert.equal(payload.recentSessions.length, 2);
});

test('panelState: empty entries', () => {
  const payload = panelState([], null);
  assert.equal(payload.todaySpend, 0);
  assert.equal(payload.monthSpend, 0);
  assert.equal(payload.perModel.length, 0);
  assert.equal(payload.recentSessions.length, 0);
});
