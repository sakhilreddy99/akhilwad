/**
 * Integration Tests for PlatePilot REST API Endpoints
 * Spins up Express on an ephemeral port and tests full HTTP request/response lifecycles.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
process.env.NODE_ENV = 'test';
const app = require('../server');

let server;
let baseUrl;

test.before(async () => {
  server = http.createServer(app);
  await new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      baseUrl = `http://127.0.0.1:${port}`;
      resolve();
    });
  });
});

test.after(async () => {
  if (server) {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('GET /api/health returns 200 and healthy status', async () => {
  const res = await fetch(`${baseUrl}/api/health`);
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.status, 'healthy');
  assert.equal(data.version, '2.0.0');
});

test('GET /api/recipes returns 50 seeded Indian staple recipes', async () => {
  const res = await fetch(`${baseUrl}/api/recipes`);
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.success, true);
  assert.equal(data.count, 50);
});

test('POST /api/optimize returns complete meal plan for ₹120', async () => {
  const payload = {
    dailyBudget: 120,
    dietPreference: 'non-veg',
    fitnessGoal: 'Muscle Gain'
  };

  const res = await fetch(`${baseUrl}/api/optimize`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.success, true);
  assert.equal(data.totals.cost, 120);
  assert.equal(data.meals.length, 4);
});

test('POST /api/optimize returns 400 when budget is missing or invalid', async () => {
  const res = await fetch(`${baseUrl}/api/optimize`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ dailyBudget: 'invalid' })
  });

  assert.equal(res.status, 400);
  const data = await res.json();
  assert.equal(data.success, false);
});

test('GET /api/hostel-mess returns hostel mess recommendations', async () => {
  const res = await fetch(`${baseUrl}/api/hostel-mess`);
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.success, true);
  assert.ok(data.schedule.length >= 7);
});

test('GET /api/community-recipes returns student crowd-sourced hacks', async () => {
  const res = await fetch(`${baseUrl}/api/community-recipes`);
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.success, true);
  assert.ok(data.recipes.length >= 3);
});
