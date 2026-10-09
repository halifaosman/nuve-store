// Branded HTML emails. Table layout and inline styles so they look right in Gmail, Outlook and phone mail apps.
// Every email also gets a plain-text version.

export const INK = '#1E1714', BERRY = '#A3324A', PAPER = '#FBF8F6', LINE = '#E4D9D2', MUTED = '#5F5049', BLUSH = '#F3ECE7';

const esc = (s: unknown) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const nl2br = (s: string) => esc(s).replace(/\n/g, '<br>');
export { rand } from './money'; // same price format as the store (R449, R449,50)
const SANS = "font-family:Manrope,'Segoe UI',Helvetica,Arial,sans-serif";
const SERIF = "font-family:'DM Serif Display',Georgia,'Times New Roman',serif";

export type Brand = { site: string; name: string; supportEmail: string; supportPhone: string; address: string };

export type Block =
  | { p: string }                                   // paragraph (plain text, line breaks kept)
  | { html: string }                                // trusted HTML built here
  | { button: string; href: string }
  | { rows: [string, string][]; title?: string }    // label / value table
  | { lines: [string, string][]; total?: [string, string] } // order lines with a total
  | { quote: string; by?: string }
  | { steps: string[]; title?: string }
  | { note: string };

function block(b: Block): string {
  if ('p' in b) return `<p style="margin:0 0 16px;${SANS};font-size:16px;line-height:1.6;color:${INK}">${nl2br(b.p)}</p>`;
  if ('html' in b) return b.html;
  if ('button' in b) return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 22px"><tr><td style="border-radius:999px;background:${BERRY}">
      <a href="${esc(b.href)}" style="display:inline-block;padding:15px 28px;${SANS};font-size:16px;font-weight:800;color:#ffffff;text-decoration:none;border-radius:999px">${esc(b.button)}</a></td></tr></table>`;
  if ('rows' in b) return `${b.title ? `<p style="margin:0 0 8px;${SANS};font-size:14px;font-weight:800;color:${INK}">${esc(b.title)}</p>` : ''}
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px;border:1px solid ${LINE};border-radius:14px;border-collapse:separate;background:#ffffff">
    ${b.rows.map(([k, v], i) => `<tr><td style="padding:11px 14px;${i ? `border-top:1px solid ${LINE};` : ''}${SANS};font-size:14px;color:${MUTED};width:42%;vertical-align:top">${esc(k)}</td>
      <td style="padding:11px 14px;${i ? `border-top:1px solid ${LINE};` : ''}${SANS};font-size:14px;font-weight:700;color:${INK};text-align:right">${nl2br(v)}</td></tr>`).join('')}</table>`;
  if ('lines' in b) return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px;border:1px solid ${LINE};border-radius:14px;border-collapse:separate;background:#ffffff">
    ${b.lines.map(([k, v], i) => `<tr><td style="padding:11px 14px;${i ? `border-top:1px solid ${LINE};` : ''}${SANS};font-size:15px;color:${INK}">${esc(k)}</td><td style="padding:11px 14px;${i ? `border-top:1px solid ${LINE};` : ''}${SANS};font-size:15px;color:${INK};text-align:right;white-space:nowrap">${esc(v)}</td></tr>`).join('')}
    ${b.total ? `<tr><td style="padding:13px 14px;border-top:2px solid ${INK};${SANS};font-size:17px;font-weight:800;color:${INK}">${esc(b.total[0])}</td><td style="padding:13px 14px;border-top:2px solid ${INK};${SANS};font-size:17px;font-weight:800;color:${INK};text-align:right">${esc(b.total[1])}</td></tr>` : ''}</table>`;
  if ('quote' in b) return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px"><tr><td style="background:${BLUSH};border-radius:14px;padding:16px 18px;${SANS};font-size:15px;line-height:1.6;color:${INK}">
      ${nl2br(b.quote)}${b.by ? `<div style="margin-top:8px;font-size:13px;color:${MUTED}">${esc(b.by)}</div>` : ''}</td></tr></table>`;
  if ('steps' in b) return `${b.title ? `<p style="margin:0 0 10px;${SANS};font-size:14px;font-weight:800;color:${INK}">${esc(b.title)}</p>` : ''}
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 20px">${b.steps.map((s, i) => `<tr><td style="padding:0 12px 10px 0;vertical-align:top">
      <div style="width:26px;height:26px;line-height:26px;border-radius:50%;background:${BERRY};color:#fff;text-align:center;${SANS};font-size:13px;font-weight:800">${i + 1}</div></td>
      <td style="padding:3px 0 10px;${SANS};font-size:15px;line-height:1.5;color:${INK}">${esc(s)}</td></tr>`).join('')}</table>`;
  return `<p style="margin:0 0 16px;${SANS};font-size:13px;line-height:1.55;color:${MUTED}">${nl2br(b.note)}</p>`;
}

function text(b: Block): string {
  if ('p' in b) return b.p;
  if ('html' in b) return '';
  if ('button' in b) return `${b.button}: ${b.href}`;
  if ('rows' in b) return (b.title ? `${b.title}\n` : '') + b.rows.map(([k, v]) => `${k}: ${v.replace(/\n/g, ', ')}`).join('\n');
  if ('lines' in b) return b.lines.map(([k, v]) => `${k}  ${v}`).join('\n') + (b.total ? `\n${b.total[0]}  ${b.total[1]}` : '');
  if ('quote' in b) return `> ${b.quote.replace(/\n/g, '\n> ')}${b.by ? `\n  ${b.by}` : ''}`;
  if ('steps' in b) return (b.title ? `${b.title}\n` : '') + b.steps.map((s, i) => `${i + 1}. ${s}`).join('\n');
  return b.note;
}

/** Wraps blocks in the Nuvé layout. `preheader` is the grey preview line inboxes show next to the subject. */
export function layout(brand: Brand, o: { preheader: string; title: string; blocks: Block[]; admin?: boolean }): { html: string; text: string } {
  const contact = [brand.supportEmail && `<a href="mailto:${esc(brand.supportEmail)}" style="color:${MUTED}">${esc(brand.supportEmail)}</a>`, brand.supportPhone && esc(brand.supportPhone)].filter(Boolean).join(' · ');
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light only"><title>${esc(o.title)}</title></head>
<body style="margin:0;padding:0;background:${PAPER}">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">${esc(o.preheader)}&#8199;&#65279;&#847;&#8199;&#65279;&#847;&#8199;&#65279;&#847;</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${PAPER}"><tr><td align="center" style="padding:24px 12px">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px">
    <tr><td style="background:${INK};border-radius:20px 20px 0 0;padding:22px 28px">
      <a href="${esc(brand.site)}" style="text-decoration:none"><img src="${esc(brand.site)}/brand/email-logo.png" width="132" height="34" alt="${esc(brand.name)}" style="display:block;border:0;width:132px;height:auto"></a>
      ${o.admin ? `<span style="${SANS};font-size:12px;font-weight:800;color:#E8DDD6;letter-spacing:.06em">Store admin</span>` : ''}
    </td></tr>
    <tr><td style="background:#ffffff;border:1px solid ${LINE};border-top:0;border-radius:0 0 20px 20px;padding:30px 28px 14px">
      <h1 style="margin:0 0 18px;${SERIF};font-weight:400;font-size:30px;line-height:1.15;color:${INK}">${esc(o.title)}</h1>
      ${o.blocks.map(block).join('\n')}
    </td></tr>
    <tr><td style="padding:20px 28px;${SANS};font-size:12px;line-height:1.6;color:${MUTED};text-align:center">
      ${o.admin ? 'Sent by your Nuvé store.' : `Questions? Just reply to this email${contact ? ` or contact us: ${contact}` : ''}.`}<br>
      ${esc(brand.name)}${brand.address ? ` · ${esc(brand.address)}` : ''} · <a href="${esc(brand.site)}" style="color:${MUTED}">${esc(brand.site.replace(/^https?:\/\//, ''))}</a>
    </td></tr>
  </table>
</td></tr></table></body></html>`;
  const txt = [o.title, '', ...o.blocks.map(text).filter(Boolean).flatMap((t) => [t, '']),
    '—', o.admin ? 'Sent by your Nuvé store.' : `Questions? Reply to this email.`, `${brand.name} · ${brand.site}`].join('\n');
  return { html, text: txt };
}
