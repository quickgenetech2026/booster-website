import {
  getCorsHeaders,
  escapeHtml,
  sanitizeHeaderText,
  isValidEmail,
} from './_security.js';

export async function onRequestPost(context) {
  const { request, env } = context;
  const headers = getCorsHeaders(request);

  try {
    const body = await request.json();
    const name = String(body?.name ?? '').trim().slice(0, 100);
    const email = String(body?.email ?? '').trim().slice(0, 254);
    const company = String(body?.company ?? '').trim().slice(0, 200);
    const message = String(body?.message ?? '').trim().slice(0, 5000);

    // Honeypot anti-spam field
    if (body?.website) {
      return new Response(JSON.stringify({ success: true }), { status: 200, headers });
    }

    if (!name || !message) {
      return new Response(JSON.stringify({ error: '姓名和留言内容不能为空' }), { status: 400, headers });
    }
    if (email && !isValidEmail(email)) {
      return new Response(JSON.stringify({ error: '邮箱格式不正确' }), { status: 400, headers });
    }

    const apiKey = env.RESEND_API_KEY;
    if (!apiKey) {
      return new Response(JSON.stringify({ error: '邮件服务未配置' }), { status: 500, headers });
    }

    const emailBody = `
<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
  <h2 style="color: #C8102E; border-bottom: 2px solid #C8102E; padding-bottom: 10px;">
    新留言 — 博仕达官网
  </h2>
  <table style="width: 100%; border-collapse: collapse;">
    <tr>
      <td style="padding: 10px; background: #f9f9f9; font-weight: bold; width: 120px;">姓名</td>
      <td style="padding: 10px; border-left: 3px solid #C8102E;">${escapeHtml(name)}</td>
    </tr>
    <tr>
      <td style="padding: 10px; background: #f9f9f9; font-weight: bold;">邮箱</td>
      <td style="padding: 10px; border-left: 3px solid #C8102E;">${escapeHtml(email || '未填写')}</td>
    </tr>
    <tr>
      <td style="padding: 10px; background: #f9f9f9; font-weight: bold;">单位名称</td>
      <td style="padding: 10px; border-left: 3px solid #C8102E;">${escapeHtml(company || '未填写')}</td>
    </tr>
    <tr>
      <td style="padding: 10px; background: #f9f9f9; font-weight: bold; vertical-align: top;">留言内容</td>
      <td style="padding: 10px; border-left: 3px solid #C8102E; white-space: pre-wrap;">${escapeHtml(message)}</td>
    </tr>
  </table>
  <p style="color: #999; font-size: 12px; margin-top: 20px;">
    此邮件由上海博仕达生物工程有限公司官网自动发送
  </p>
</div>`;

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'Booster官网留言 <service@tflabservice.com>',
        to: ['service@tflabservice.com'],
        reply_to: email || undefined,
        subject: `【官网留言】${sanitizeHeaderText(name, 50)} - ${sanitizeHeaderText(company, 50)}`,
        html: emailBody,
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error('Resend error:', err);
      return new Response(JSON.stringify({ error: '发送失败，请稍后重试' }), { status: 500, headers });
    }

    return new Response(JSON.stringify({ success: true }), { status: 200, headers });

  } catch (e) {
    console.error('Contact error:', e);
    return new Response(JSON.stringify({ error: '服务器错误' }), { status: 500, headers });
  }
}

export async function onRequestOptions(context) {
  return new Response(null, { headers: getCorsHeaders(context.request) });
}
