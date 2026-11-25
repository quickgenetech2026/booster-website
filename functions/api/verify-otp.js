import { getCorsHeaders, verifyOtpToken } from './_security.js';

export async function onRequestPost(context) {
  const { request, env } = context;
  const headers = getCorsHeaders(request);

  try {
    const { token, otp } = await request.json();
    if (!token || !otp) {
      return new Response(JSON.stringify({ error: '参数缺失' }), { status: 400, headers });
    }

    const secret = env.OTP_SECRET || env.RESEND_API_KEY;
    if (!secret) {
      return new Response(JSON.stringify({ error: '验证服务未配置' }), { status: 500, headers });
    }

    const result = await verifyOtpToken(token, otp, secret);
    if (!result.valid) {
      return new Response(JSON.stringify({ error: result.error }), { status: 400, headers });
    }

    let user = null;
    if (env.USERS_KV) {
      try {
        const stored = await env.USERS_KV.get(`user:${result.email}`);
        if (stored) user = JSON.parse(stored);
      } catch { /* ignore KV parse issues */ }
    }

    return new Response(JSON.stringify({ success: true, email: result.email, user }), { status: 200, headers });
  } catch (e) {
    console.error('Verify OTP error:', e);
    return new Response(JSON.stringify({ error: '服务器错误' }), { status: 500, headers });
  }
}

export async function onRequestOptions(context) {
  return new Response(null, { headers: getCorsHeaders(context.request) });
}
