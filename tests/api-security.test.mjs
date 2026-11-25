import test from 'node:test';
import assert from 'node:assert/strict';
import {
  escapeHtml,
  sanitizeHeaderText,
  createOtpToken,
  verifyOtpToken,
  generateSecureOtp,
  getCorsHeaders,
} from '../functions/api/_security.js';

test('OTP token hides plaintext OTP and verifies correctly with HMAC', async () => {
  const secret = 'test-secret-key-123';
  const otp = generateSecureOtp();
  assert.match(otp, /^\d{6}$/);

  const token = await createOtpToken('User@Example.com', otp, secret, 60_000);
  // Plaintext OTP must NEVER appear in the token or its base64 payload
  assert.doesNotMatch(token, new RegExp(otp));
  const payload = atob(token.split('.')[0]);
  assert.doesNotMatch(payload, new RegExp(otp));

  // Valid OTP passes
  const ok = await verifyOtpToken(token, otp, secret);
  assert.deepEqual(ok, { valid: true, email: 'user@example.com' });

  // Wrong OTP fails
  const wrong = await verifyOtpToken(token, '000000', secret);
  assert.equal(wrong.valid, false);

  // Tampered payload fails
  const tamperedPayload = btoa(JSON.stringify({ email: 'admin@tflabservice.com', exp: Date.now() + 60_000 }));
  const tampered = `${tamperedPayload}.${token.split('.')[1]}`;
  const bad = await verifyOtpToken(tampered, otp, secret);
  assert.equal(bad.valid, false);
});

test('expired OTP token is rejected', async () => {
  const secret = 'test-secret-key-123';
  const token = await createOtpToken('user@example.com', '123456', secret, -1000);
  const res = await verifyOtpToken(token, '123456', secret);
  assert.equal(res.valid, false);
  assert.match(res.error, /过期/);
});

test('escapeHtml and sanitizeHeaderText neutralize HTML and header injection', () => {
  assert.equal(escapeHtml('<script>alert("x")</script>'), '&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;');
  assert.equal(sanitizeHeaderText('Alice\r\nBcc: evil@attacker.com'), 'Alice Bcc: evil@attacker.com');
});

test('CORS allows site and localhost origins and rejects arbitrary origins', () => {
  const makeReq = (origin) => ({ headers: new Map(origin ? [['Origin', origin]] : []) });
  assert.equal(getCorsHeaders(makeReq('https://tflabservice.com'))['Access-Control-Allow-Origin'], 'https://tflabservice.com');
  assert.equal(getCorsHeaders(makeReq('http://localhost:5173'))['Access-Control-Allow-Origin'], 'http://localhost:5173');
  assert.equal(getCorsHeaders(makeReq('https://evil.example'))['Access-Control-Allow-Origin'], 'https://tflabservice.com');
});
