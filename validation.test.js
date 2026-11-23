/**
 * Unit Tests for Security, Input Validation & Sanitization
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const { sanitizeInput } = require('../src/middleware/security');
const {
  validateOptimizeRequest,
  validateSwapRequest,
  validateCommunityRecipeRequest
} = require('../src/middleware/validation');

function mockRes() {
  const res = {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    }
  };
  return res;
}

test('Security: XSS Input Sanitization encodes dangerous characters', () => {
  const maliciousInput = '<script>alert("hack")</script>';
  const sanitized = sanitizeInput(maliciousInput);
  assert.equal(sanitized, '&lt;script&gt;alert(&quot;hack&quot;)&lt;/script&gt;');
  assert.ok(!sanitized.includes('<script>'));
});

test('Validation: Rejects daily budget below ₹50', () => {
  const req = { body: { dailyBudget: 20 } };
  const res = mockRes();
  let calledNext = false;

  validateOptimizeRequest(req, res, () => { calledNext = true; });

  assert.equal(res.statusCode, 400);
  assert.equal(calledNext, false);
  assert.ok(res.body.details.some(d => d.includes('between ₹50 and ₹1,000')));
});

test('Validation: Rejects invalid diet preference', () => {
  const req = { body: { dailyBudget: 120, dietPreference: 'carnivore_only' } };
  const res = mockRes();
  let calledNext = false;

  validateOptimizeRequest(req, res, () => { calledNext = true; });

  assert.equal(res.statusCode, 400);
  assert.equal(calledNext, false);
  assert.ok(res.body.details.some(d => d.includes('Invalid dietPreference')));
});

test('Validation: Rejects invalid meal swap slotKey', () => {
  const req = { body: { currentPlan: { meals: [{ id: 1 }] }, slotKey: 'midnight_snack' } };
  const res = mockRes();
  let calledNext = false;

  validateSwapRequest(req, res, () => { calledNext = true; });

  assert.equal(res.statusCode, 400);
  assert.equal(calledNext, false);
});
