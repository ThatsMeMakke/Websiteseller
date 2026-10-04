// Kontaktformular: Turnstile pruefen, dann per Resend an das Postfach schicken.
// Umgebungsvariablen (Cloudflare Pages > Einstellungen > Variablen und Geheimnisse):
//   TURNSTILE_SITE_KEY, TURNSTILE_SECRET_KEY, RESEND_API_KEY
//   optional: MAIL_TO (Standard info@seitenkino.de), MAIL_FROM

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });

const clean = (v, max) => String(v ?? '').replace(/\r/g, '').trim().slice(0, max);
const esc = s => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

// Das Formular holt sich hier den oeffentlichen Turnstile-Schluessel.
export const onRequestGet = ({ env }) =>
  json({ ready: Boolean(env.TURNSTILE_SITE_KEY && env.TURNSTILE_SECRET_KEY && env.RESEND_API_KEY), sitekey: env.TURNSTILE_SITE_KEY || null });

export async function onRequestPost({ request, env }) {
  if (!env.TURNSTILE_SECRET_KEY || !env.RESEND_API_KEY) return json({ ok: false, error: 'not-configured' }, 503);

  let f;
  try { f = await request.json(); } catch { return json({ ok: false, error: 'bad-request' }, 400); }

  // Bot-Falle: echte Menschen sehen dieses Feld nie.
  if (clean(f.website, 200)) return json({ ok: true });

  const name = clean(f.name, 120), firma = clean(f.firma, 160), email = clean(f.email, 200);
  const tel = clean(f.tel, 60), nachricht = clean(f.nachricht, 5000);
  if (!name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ ok: false, error: 'invalid' }, 422);

  const verify = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST',
    body: new URLSearchParams({
      secret: env.TURNSTILE_SECRET_KEY,
      response: clean(f.token, 4096),
      remoteip: request.headers.get('CF-Connecting-IP') || '',
    }),
  }).then(r => r.json()).catch(() => ({ success: false }));
  if (!verify.success) return json({ ok: false, error: 'captcha' }, 403);

  const text = `Name: ${name}\nFirma: ${firma}\nE-Mail: ${email}\nTelefon: ${tel}\n\n${nachricht}`;
  const sent = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      from: env.MAIL_FROM || 'SeitenKino Website <formular@seitenkino.de>',
      to: [env.MAIL_TO || 'info@seitenkino.de'],
      reply_to: email,
      subject: `Erstgespräch: ${(firma || name).replace(/\s+/g, " ")}`,
      text,
      html: `<pre style="font:15px/1.5 sans-serif;white-space:pre-wrap">${esc(text)}</pre>`,
    }),
  }).catch(() => null);
  if (!sent || !sent.ok) return json({ ok: false, error: 'send' }, 502);

  return json({ ok: true });
}
