const ALLOWED_ORIGINS = new Set([
  'https://tflabservice.com',
  'https://www.tflabservice.com',
]);

export function getCorsHeaders(request) {
  const origin = request?.headers?.get('Origin') || '';
  const isLocal = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
  const allowOrigin = ALLOWED_ORIGINS.has(origin) || isLocal ? origin : 'https://tflabservice.com';
  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Vary': 'Origin',
    'Content-Type': 'application/json',
  };
}

export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[ch]);
}

export function sanitizeHeaderText(value, maxLen = 120) {
  return String(value ?? '').replace(/[\r\n]+/g, ' ').trim().slice(0, maxLen);
}

export function isValidEmail(email) {
  return typeof email === 'string' && email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function generateSecureOtp() {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return String(100000 + (buf[0] % 900000));
}

async function hmacSha256Hex(secret, message) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(message));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function timingSafeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

/**
 * Create a signed OTP token that NEVER embeds the plaintext OTP.
 */
export async function createOtpToken(email, otp, secret, ttlMs = 10 * 60 * 1000) {
  const normalizedEmail = String(email).trim().toLowerCase();
  const exp = Date.now() + ttlMs;
  const payload = btoa(JSON.stringify({ email: normalizedEmail, exp }));
  const sig = await hmacSha256Hex(secret, `${normalizedEmail}:${otp}:${exp}`);
  return `${payload}.${sig}`;
}

/**
 * Verify an OTP against a signed token.
 */
export async function verifyOtpToken(token, otp, secret) {
  if (typeof token !== 'string' || typeof otp !== 'string') {
    return { valid: false, error: '参数缺失' };
  }
  const parts = token.split('.');
  if (parts.length !== 2) {
    return { valid: false, error: '验证码无效' };
  }
  const [payloadB64, providedSig] = parts;
  let parsed;
  try {
    parsed = JSON.parse(atob(payloadB64));
  } catch {
    return { valid: false, error: '验证码无效' };
  }
  const { email, exp } = parsed || {};
  if (!email || typeof exp !== 'number') {
    return { valid: false, error: '验证码无效' };
  }
  if (Date.now() > exp) {
    return { valid: false, error: '验证码已过期，请重新获取' };
  }
  const expectedSig = await hmacSha256Hex(secret, `${email}:${otp.trim()}:${exp}`);
  if (!timingSafeEqual(providedSig, expectedSig)) {
    return { valid: false, error: '验证码错误，请检查后重试' };
  }
  return { valid: true, email };
}
