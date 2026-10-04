// Terminbuchung fuer Calls: freie Termine liefern, Anfragen bestaetigen oder absagen.
// Zusaetzlich zu kontakt.js:
//   KV-Namespace mit dem Bindungsnamen TERMINE
//   TERMIN_SECRET (beliebige lange Zufallszeichenkette, signiert die Links in der Mail)
//
// Regeln: Mo bis Fr 17 bis 20 Uhr, Sa 14 bis 16 Uhr, 30 oder 60 Minuten, frühestens übermorgen.
// Eine offene Anfrage sperrt den ganzen Tag, bis sie bestaetigt oder abgesagt ist.
// Nach der Bestaetigung ist nur noch die gebuchte Zeit belegt.

export const TZ = 'Europe/Berlin';
export const DAYS_AHEAD = 21;
const WINDOWS = { 1: [1020, 1200], 2: [1020, 1200], 3: [1020, 1200], 4: [1020, 1200], 5: [1020, 1200], 6: [840, 960] };
const WD = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];

export const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });
export const clean = (v, max) => String(v ?? '').replace(/\r/g, '').trim().slice(0, max);
export const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

// ---------- Datum und Zeit (immer deutsche Zeit) ----------
export function berlinToday(now = new Date()){
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}
const parts = d => d.split('-').map(Number);
export function addDays(d, n){
  const [y, m, day] = parts(d);
  return new Date(Date.UTC(y, m - 1, day + n)).toISOString().slice(0, 10);
}
export const dow = d => { const [y, m, day] = parts(d); return new Date(Date.UTC(y, m - 1, day)).getUTCDay(); };
export const toMin = t => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
export const toTime = m => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
export function labelDate(d){ const [y, m, day] = parts(d); return `${WD[dow(d)]}, ${String(day).padStart(2, '0')}.${String(m).padStart(2, '0')}.${y}`; }

export function bookableDates(today = berlinToday()){
  const out = [];
  for (let i = 2; i < 2 + DAYS_AHEAD; i++) { const d = addDays(today, i); if (WINDOWS[dow(d)]) out.push(d); }
  return out;
}
export function slotsFor(d, dur){
  const w = WINDOWS[dow(d)]; if (!w) return [];
  const out = [];
  for (let s = w[0]; s + dur <= w[1]; s += 30) out.push(toTime(s));
  return out;
}
const overlaps = (a, ad, b, bd) => toMin(a) < toMin(b) + bd && toMin(b) < toMin(a) + ad;
export function validSlot(d, time, dur, today = berlinToday()){
  return (dur === 30 || dur === 60) && bookableDates(today).includes(d) && slotsFor(d, dur).includes(time);
}

// Wandelt deutsche Ortszeit in UTC um (fuer den Kalendereintrag).
export function berlinToUtc(d, time){
  const [y, m, day] = parts(d), [h, mi] = time.split(':').map(Number);
  const guess = Date.UTC(y, m - 1, day, h, mi);
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: TZ, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric' })
    .formatToParts(new Date(guess)).map(x => [x.type, x.value]));
  const asBerlin = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute);
  return new Date(guess - (asBerlin - guess));
}

// ---------- Speicher (Cloudflare KV) ----------
const emptyDay = () => ({ pending: null, confirmed: [] });
export async function getDay(env, d){ return (await env.TERMINE.get('day:' + d, 'json')) || emptyDay(); }
// Automatisch loeschen: Tagesdaten 2 Tage, Anfragen 60 Tage nach dem Termin.
const ttl = (d, n) => ({ expiration: Math.floor(Date.parse(addDays(d, n) + 'T00:00:00Z') / 1000) });
const dayTtl = d => ttl(d, 2);
export const reqTtl = d => ttl(d, 60);
export const putDay = (env, d, v) => env.TERMINE.put('day:' + d, JSON.stringify(v), dayTtl(d));
export const isFree = (day, time, dur) => !day.pending && !day.confirmed.some(c => overlaps(time, dur, c.time, c.dur));

// ---------- Signatur fuer die Links in der Mail ----------
export async function sign(id, secret){
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(id));
  return [...new Uint8Array(mac)].map(b => b.toString(16).padStart(2, '0')).join('');
}
async function checkSig(id, sig, secret){
  const good = await sign(id, secret);
  if (!sig || sig.length !== good.length) return false;
  let diff = 0; for (let i = 0; i < good.length; i++) diff |= good.charCodeAt(i) ^ sig.charCodeAt(i);
  return diff === 0;
}

// ---------- Mailversand (Brevo) ----------
export async function sendMail(env, { to, toName, replyTo, subject, text, html, attachment }){
  const body = {
    sender: { name: 'SeitenKino', email: env.MAIL_FROM || 'formular@seitenkino.de' },
    to: [{ email: to, ...(toName ? { name: toName } : {}) }],
    subject, textContent: text, htmlContent: html || `<pre style="font:15px/1.5 sans-serif;white-space:pre-wrap">${esc(text)}</pre>`,
  };
  if (replyTo) body.replyTo = replyTo;
  if (attachment) body.attachment = [attachment];
  const r = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'api-key': env.BREVO_API_KEY, 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify(body),
  }).catch(() => null);
  return Boolean(r && r.ok);
}

function ics(req){
  const fmt = dt => dt.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const start = berlinToUtc(req.date, req.time), end = new Date(start.getTime() + req.dur * 60000);
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//SeitenKino//Termin//DE', 'METHOD:PUBLISH', 'BEGIN:VEVENT',
    `UID:${req.id}@seitenkino.de`, `DTSTAMP:${fmt(new Date())}`, `DTSTART:${fmt(start)}`, `DTEND:${fmt(end)}`,
    'SUMMARY:Erstgespräch mit SeitenKino', 'DESCRIPTION:Wir rufen dich zur vereinbarten Zeit an.', 'END:VEVENT', 'END:VCALENDAR'];
  return btoa(String.fromCharCode(...new TextEncoder().encode(lines.join('\r\n'))));
}

// ---------- Seiten fuer Bestaetigen und Absagen ----------
const page = (title, inner) => new Response(`<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${esc(title)}</title>
<style>body{margin:0;font:16px/1.6 system-ui,sans-serif;background:#060c1a;color:#eef3fb;display:grid;place-items:center;min-height:100vh;padding:20px;box-sizing:border-box}
main{max-width:520px;width:100%;background:#0c1730;border:1px solid rgba(95,225,255,.3);border-radius:20px;padding:28px}h1{font-size:1.4rem;margin:0 0 14px}
dl{display:grid;grid-template-columns:auto 1fr;gap:6px 14px;margin:0 0 20px}dt{color:#a9badb}dd{margin:0}textarea{width:100%;box-sizing:border-box;min-height:90px;border-radius:12px;border:1px solid rgba(150,200,240,.5);background:#060c1a;color:#eef3fb;padding:10px;font:inherit}
.row{display:flex;gap:10px;flex-wrap:wrap;margin-top:14px}button{flex:1;font:inherit;font-weight:600;border:0;border-radius:999px;padding:13px 18px;cursor:pointer}.ok{background:#e7c98f;color:#17120a}.no{background:transparent;color:#eef3fb;border:1px solid rgba(150,200,240,.5)}p{color:#a9badb}</style></head>
<body><main>${inner}</main></body></html>`, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } });

const details = r => `<dl><dt>Termin</dt><dd>${esc(labelDate(r.date))}, ${esc(r.time)} Uhr (${r.dur} Min.)</dd><dt>Name</dt><dd>${esc(r.name)}</dd>
${r.firma ? `<dt>Firma</dt><dd>${esc(r.firma)}</dd>` : ''}<dt>E-Mail</dt><dd>${esc(r.email)}</dd><dt>Telefon</dt><dd>${esc(r.tel)}</dd>
${r.nachricht ? `<dt>Nachricht</dt><dd>${esc(r.nachricht)}</dd>` : ''}</dl>`;

export async function onRequestGet({ request, env }){
  const url = new URL(request.url);
  const id = url.searchParams.get('id');
  if (!id) {
    // Freie Termine fuer das Formular
    if (!env.TERMINE) return json({ ready: false });
    const days = await Promise.all(bookableDates().map(async d => {
      const day = await getDay(env, d);
      if (day.pending) return null;
      const free = dur => slotsFor(d, dur).filter(t => isFree(day, t, dur));
      return { date: d, label: labelDate(d), s30: free(30), s60: free(60) };
    }));
    return json({ ready: true, days: days.filter(d => d && d.s30.length) });
  }
  if (!env.TERMINE || !env.TERMIN_SECRET) return page('Nicht eingerichtet', '<h1>Terminbuchung ist nicht eingerichtet.</h1>');
  const sig = url.searchParams.get('sig');
  if (!(await checkSig(id, sig, env.TERMIN_SECRET))) return page('Ungültig', '<h1>Dieser Link ist ungültig.</h1>');
  const req = await env.TERMINE.get('req:' + id, 'json');
  if (!req) return page('Nicht gefunden', '<h1>Diese Anfrage gibt es nicht mehr.</h1>');
  if (req.status !== 'pending') return page('Erledigt', `<h1>Schon erledigt: ${req.status === 'confirmed' ? 'bestätigt' : 'abgesagt'}.</h1>${details(req)}`);
  return page('Terminanfrage', `<h1>Terminanfrage</h1>${details(req)}
<form method="post"><input type="hidden" name="id" value="${esc(id)}"><input type="hidden" name="sig" value="${esc(sig)}">
<label for="msg"><p>Nachricht an den Kunden (optional, kommt mit in die Mail):</p></label><textarea id="msg" name="msg" maxlength="1500"></textarea>
<div class="row"><button class="ok" name="a" value="confirm">Termin bestätigen</button><button class="no" name="a" value="decline">Termin absagen</button></div></form>`);
}

export async function onRequestPost({ request, env }){
  if (!env.TERMINE || !env.TERMIN_SECRET) return page('Nicht eingerichtet', '<h1>Terminbuchung ist nicht eingerichtet.</h1>');
  const f = await request.formData();
  const id = clean(f.get('id'), 64), sig = clean(f.get('sig'), 128), a = f.get('a'), msg = clean(f.get('msg'), 1500);
  if (!(await checkSig(id, sig, env.TERMIN_SECRET))) return page('Ungültig', '<h1>Dieser Link ist ungültig.</h1>');
  const req = await env.TERMINE.get('req:' + id, 'json');
  if (!req) return page('Nicht gefunden', '<h1>Diese Anfrage gibt es nicht mehr.</h1>');
  if (req.status !== 'pending') return page('Erledigt', `<h1>Schon erledigt: ${req.status === 'confirmed' ? 'bestätigt' : 'abgesagt'}.</h1>`);

  const day = await getDay(env, req.date);
  if (day.pending === id) day.pending = null;
  const when = `${labelDate(req.date)}, ${req.time} Uhr`;
  const note = msg ? `\n\nNachricht von uns:\n${msg}` : '';
  let mailed;
  if (a === 'confirm') {
    day.confirmed.push({ time: req.time, dur: req.dur, id });
    req.status = 'confirmed';
    mailed = await sendMail(env, {
      to: req.email, toName: req.name, replyTo: { email: env.MAIL_TO || 'info@seitenkino.de', name: 'SeitenKino' },
      subject: `Dein Termin steht: ${when}`,
      text: `Hallo ${req.name},\n\ndein Erstgespräch ist bestätigt:\n${when} (${req.dur} Minuten)\n\nWir rufen dich unter ${req.tel} an. Den Termin findest du auch als Kalendereintrag im Anhang.${note}\n\nBis dann!\nDein SeitenKino-Team`,
      attachment: { name: 'termin-seitenkino.ics', content: ics(req) },
    });
  } else if (a === 'decline') {
    req.status = 'declined';
    mailed = await sendMail(env, {
      to: req.email, toName: req.name, replyTo: { email: env.MAIL_TO || 'info@seitenkino.de', name: 'SeitenKino' },
      subject: `Dein Wunschtermin am ${labelDate(req.date)} klappt leider nicht`,
      text: `Hallo ${req.name},\n\nam ${when} schaffen wir es leider nicht.${note}\n\nSuch dir gern einen anderen Termin aus: https://seitenkino.de/#kontakt\nOder antworte einfach auf diese Mail.\n\nDein SeitenKino-Team`,
    });
  } else return page('Fehler', '<h1>Unbekannte Aktion.</h1>');

  await putDay(env, req.date, day);
  await env.TERMINE.put('req:' + id, JSON.stringify(req), reqTtl(req.date));
  const done = req.status === 'confirmed' ? 'Termin bestätigt.' : 'Termin abgesagt, der Tag ist wieder frei.';
  return page(done, `<h1>${done}</h1>${details(req)}<p>${mailed ? 'Der Kunde hat eine E-Mail bekommen.' : 'Achtung: Die E-Mail an den Kunden konnte nicht gesendet werden. Bitte schreib ihm selbst.'}</p>`);
}
