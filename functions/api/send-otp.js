import {
  getCorsHeaders,
  isValidEmail,
  generateSecureOtp,
  createOtpToken,
} from './_security.js';

export async function onRequestPost(context) {
  const { request, env } = context;
  const headers = getCorsHeaders(request);

  try {
    const { contact, type } = await request.json();

    if (!contact) {
      return new Response(JSON.stringify({ error: '请输入邮箱或手机号' }), { status: 400, headers });
    }

    if (type === 'phone') {
      return new Response(JSON.stringify({ error: '暂不支持短信验证，请切换至邮箱验证' }), { status: 400, headers });
    }

    const email = String(contact).trim().toLowerCase();
    if (!isValidEmail(email)) {
      return new Response(JSON.stringify({ error: '邮箱格式不正确' }), { status: 400, headers });
    }

    const apiKey = env.RESEND_API_KEY;
    const secret = env.OTP_SECRET || env.RESEND_API_KEY;
    if (!secret || !apiKey) {
      return new Response(JSON.stringify({ error: '验证码服务未配置' }), { status: 500, headers });
    }

    const otp = generateSecureOtp();
    const token = await createOtpToken(email, otp, secret);

    const emailHtml = `
<div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; background: #fff;">
  <div style="background: linear-gradient(135deg,#9B0023,#C8102E); padding: 28px 36px; border-radius: 12px 12px 0 0;">
    <h1 style="color:#fff; margin:0; font-size:20px; font-weight:800;">博仕达生物 — 登录验证码</h1>
  </div>
  <div style="padding: 32px 36px; border: 1px solid #f0f0f0; border-top:none; border-radius: 0 0 12px 12px;">
    <p style="color:#555; font-size:15px; margin:0 0 24px;">您正在登录博仕达生物官网，验证码为：</p>
    <div style="text-align:center; margin: 24px 0;">
      <span style="font-size:42px; font-weight:900; color:#C8102E; letter-spacing:10px; font-family:monospace;">${otp}</span>
    </div>
    <p style="color:#999; font-size:13px; margin:24px 0 0; border-top:1px solid #f0f0f0; padding-top:16px;">
      验证码有效期 <strong>10 分钟</strong>，请勿泄露给他人。<br/>
      如非本人操作，请忽略此邮件。
    </p>
  </div>
</div>`;

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: '博仕达生物 <service@tflabservice.com>',
        to: [email],
        subject: `【博仕达生物】登录验证码：${otp}`,
        html: emailHtml,
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error('Resend OTP error:', err);
      return new Response(JSON.stringify({ error: '验证码发送失败，请稍后重试' }), { status: 500, headers });
    }

    return new Response(JSON.stringify({ success: true, token }), { status: 200, headers });
  } catch (e) {
    console.error('Send OTP error:', e);
    return new Response(JSON.stringify({ error: '服务器错误' }), { status: 500, headers });
  }
}

export async function onRequestOptions(context) {
  return new Response(null, { headers: getCorsHeaders(context.request) });
}
