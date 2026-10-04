// Kontaktformular: Turnstile pruefen, dann per Brevo an das Postfach schicken.
// Optional mit Wunschtermin fuer einen Call (Regeln und Speicher in termin.js).
// Umgebungsvariablen (Cloudflare Pages > Einstellungen > Variablen und Geheimnisse):
//   TURNSTILE_SITE_KEY, TURNSTILE_SECRET_KEY, BREVO_API_KEY
//   fuer die Terminbuchung zusaetzlich: KV-Bindung TERMINE, TERMIN_SECRET
//   optional: MAIL_TO (Standard info@seitenkino.de), MAIL_FROM (Standard formular@seitenkino.de)

import { json, clean, esc, sendMail, validSlot, labelDate, getDay, putDay, isFree, reqTtl, sign } from './termin.js';

// Das Formular holt sich hier den oeffentlichen Turnstile-Schluessel.
export const onRequestGet = ({ env }) =>
  json({ ready: Boolean(env.TURNSTILE_SITE_KEY && env.TURNSTILE_SECRET_KEY && env.BREVO_API_KEY), sitekey: env.TURNSTILE_SITE_KEY || null });

export async function onRequestPost({ request, env }) {
  if (!env.TURNSTILE_SECRET_KEY || !env.BREVO_API_KEY) return json({ ok: false, error: 'not-configured' }, 503);

  let f;
  try { f = await request.json(); } catch { return json({ ok: false, error: 'bad-request' }, 400); }

  // Bot-Falle: echte Menschen sehen dieses Feld nie.
  if (clean(f.website, 200)) return json({ ok: true });

  const name = clean(f.name, 120), firma = clean(f.firma, 160), email = clean(f.email, 200);
  const tel = clean(f.tel, 60), nachricht = clean(f.nachricht, 5000);
  if (!name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ ok: false, error: 'invalid' }, 422);

  const date = clean(f.termin_datum, 10), time = clean(f.termin_zeit, 5), dur = Number(f.termin_dauer) || 0;
  const wantsSlot = Boolean(date || time);
  if (wantsSlot && (!validSlot(date, time, dur) || !tel)) return json({ ok: false, error: 'slot-invalid' }, 422);

  const verify = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST',
    body: new URLSearchParams({
      secret: env.TURNSTILE_SECRET_KEY,
      response: clean(f.token, 4096),
      remoteip: request.headers.get('CF-Connecting-IP') || '',
    }),
  }).then(r => r.json()).catch(() => ({ success: false }));
  if (!verify.success) return json({ ok: false, error: 'captcha' }, 403);

  const owner = env.MAIL_TO || 'info@seitenkino.de';
  const who = (firma || name).replace(/\s+/g, ' ');
  const base = `Name: ${name}\nFirma: ${firma}\nE-Mail: ${email}\nTelefon: ${tel}\n\n${nachricht}`;

  // Ohne Wunschtermin: einfache Anfrage wie bisher.
  if (!wantsSlot) {
    const ok = await sendMail(env, { to: owner, replyTo: { email, name }, subject: `Erstgespräch: ${who}`, text: base });
    return ok ? json({ ok: true }) : json({ ok: false, error: 'send' }, 502);
  }

  const when = `${labelDate(date)}, ${time} Uhr (${dur} Min.)`;

  // Terminbuchung nicht eingerichtet: Wunschtermin nur als Text mitschicken.
  if (!env.TERMINE || !env.TERMIN_SECRET) {
    const ok = await sendMail(env, { to: owner, replyTo: { email, name }, subject: `Erstgespräch mit Wunschtermin: ${who}`, text: `Wunschtermin: ${when}\n\n${base}` });
    return ok ? json({ ok: true, booked: false }) : json({ ok: false, error: 'send' }, 502);
  }

  const day = await getDay(env, date);
  if (!isFree(day, time, dur)) return json({ ok: false, error: 'taken' }, 409);

  const id = crypto.randomUUID();
  const req = { id, date, time, dur, name, firma, email, tel, nachricht, status: 'pending', created: new Date().toISOString() };
  day.pending = id;
  await env.TERMINE.put('req:' + id, JSON.stringify(req), reqTtl(date));
  await putDay(env, date, day);

  const link = `${new URL(request.url).origin}/api/termin?id=${id}&sig=${await sign(id, env.TERMIN_SECRET)}`;
  const text = `Neue Terminanfrage: ${when}\n\n${base}\n\nBestätigen oder absagen:\n${link}\n\nBis du entscheidest, ist der ganze Tag für weitere Buchungen gesperrt.`;
  const html = `<div style="font:15px/1.6 sans-serif;color:#111"><h2 style="margin:0 0 10px">Neue Terminanfrage</h2><p style="font-size:17px"><b>${esc(when)}</b></p>
<pre style="font:15px/1.5 sans-serif;white-space:pre-wrap">${esc(base)}</pre>
<p><a href="${esc(link)}" style="display:inline-block;background:#e7c98f;color:#17120a;padding:12px 22px;border-radius:999px;text-decoration:none;font-weight:600">Bestätigen oder absagen</a></p>
<p style="color:#666">Bis du entscheidest, ist der ganze Tag für weitere Buchungen gesperrt.</p></div>`;
  const ok = await sendMail(env, { to: owner, replyTo: { email, name }, subject: `Terminanfrage: ${labelDate(date)}, ${time} Uhr · ${who}`, text, html });
  if (!ok) {
    // Ohne Mail an uns darf der Tag nicht gesperrt bleiben.
    day.pending = null;
    await putDay(env, date, day);
    await env.TERMINE.delete('req:' + id);
    return json({ ok: false, error: 'send' }, 502);
  }

  await sendMail(env, {
    to: email, toName: name, replyTo: { email: owner, name: 'SeitenKino' },
    subject: `Deine Terminanfrage: ${labelDate(date)}, ${time} Uhr`,
    text: `Hallo ${name},\n\ndanke für deine Anfrage! Dein Wunschtermin:\n${when}\n\nWir prüfen den Termin und schicken dir so schnell wie möglich eine Bestätigung.\n\nDein SeitenKino-Team`,
  });
  return json({ ok: true, booked: true });
}
