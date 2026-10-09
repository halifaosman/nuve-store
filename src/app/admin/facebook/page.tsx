'use client';
import { useCallback, useEffect, useState } from 'react';
import { AdminShell, api } from '../ui';
import type { FbConfig, FbStatus, Rule } from '@/lib/fbauto';

type Row = { comment_id: string; post_id: string; from_name: string | null; message: string | null; commented_at: string; rule_key: string | null; action: string; reply: string | null; note: string | null; done: boolean; created_at: string };
type Data = { config: FbConfig; status: FbStatus; log: Row[]; needs: Row[]; week: Record<string, number>; tokenSet: boolean; pageId: string; placeholders: Record<string, string> };

const ACTION: Record<string, [string, string]> = {
  replied: ['Replied', 'var(--ok)'], would_reply: ['Would reply (test)', 'var(--gold)'], hidden: ['Hidden', 'var(--berry)'], would_hide: ['Would hide (test)', 'var(--gold)'],
  flagged: ['Flagged for you', 'var(--berry)'], skipped: ['Left alone', 'var(--soft)'], error: ['Error', 'var(--berry)'],
};
const when = (iso?: string) => (iso ? new Date(iso).toLocaleString('en-ZA', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Johannesburg' }) : 'never');
const fbLink = (r: Row) => `https://www.facebook.com/${r.post_id}?comment_id=${r.comment_id.split('_').pop()}`;
const card = { display: 'flex', flexDirection: 'column' as const, gap: 12 };
const ta = { font: 'inherit', fontSize: 14, padding: 10, borderRadius: 10, border: '1px solid var(--line)', width: '100%' };

function Toggle({ on, set, label, hint }: { on: boolean; set: (v: boolean) => void; label: string; hint?: string }) {
  return (
    <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', cursor: 'pointer' }}>
      <input type="checkbox" checked={on} onChange={(e) => set(e.target.checked)} style={{ width: 20, height: 20, marginTop: 2 }} />
      <span><b style={{ fontWeight: 600 }}>{label}</b>{hint && <span className="muted" style={{ display: 'block', fontSize: 13 }}>{hint}</span>}</span>
    </label>
  );
}

export default function FacebookReplies() {
  const [d, setD] = useState<Data | null>(null);
  const [c, setC] = useState<FbConfig | null>(null);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState('');
  const [tryText, setTryText] = useState('How much is it and do you deliver to Durban?');
  const [tryRes, setTryRes] = useState<{ action: string; rule: string | null; reply: string; note: string; flag: boolean } | null>(null);
  const [dirty, setDirty] = useState(false);

  const load = useCallback(() => api<Data>('/api/admin/fbauto').then((j) => { setD(j); setC((old) => (dirty && old ? old : j.config)); }).catch((e) => setErr(e.message)), [dirty]);
  useEffect(() => { load(); const t = setInterval(load, 30000); return () => clearInterval(t); }, [load]);

  if (!d || !c) return <AdminShell title="Facebook replies">{err ? <p className="err">{err}</p> : <p className="muted">Loading…</p>}</AdminShell>;

  const edit = (patch: Partial<FbConfig>) => { setC({ ...c, ...patch }); setDirty(true); setMsg(''); };
  const editRule = (i: number, patch: Partial<Rule>) => edit({ rules: c.rules.map((r, k) => (k === i ? { ...r, ...patch } : r)) });
  const move = (i: number, by: number) => { const r = [...c.rules]; const [x] = r.splice(i, 1); r.splice(Math.max(0, Math.min(r.length, i + by)), 0, x); edit({ rules: r }); };

  async function save(next = c) {
    setBusy('save'); setErr(''); setMsg('');
    try { const j = await api<{ config: FbConfig }>('/api/admin/fbauto', { method: 'PUT', json: next }); setC(j.config); setDirty(false); setMsg('Saved.'); load(); }
    catch (e) { setErr((e as Error).message); }
    setBusy('');
  }
  async function act(action: string, extra: Record<string, unknown> = {}) {
    setBusy(action); setErr(''); setMsg('');
    try {
      const j = await api<Record<string, unknown>>('/api/admin/fbauto', { method: 'POST', json: { action, ...extra } });
      if (action === 'connect') setMsg(`Connected to “${(j.page as { name: string }).name}”. Found ${j.comments} recent comments.${(j.errors as string[]).length ? ` Note: ${(j.errors as string[]).join(' · ')}` : ''}`);
      if (action === 'check') setMsg(`Checked ${j.checked} comments, acted on ${j.acted}.${j.error ? ` ${j.error}` : ''}`);
      load();
    } catch (e) { setErr((e as Error).message); }
    setBusy('');
  }
  async function preview() {
    try { setTryRes(await api('/api/admin/fbauto', { method: 'POST', json: { action: 'preview', text: tryText, config: c } })); } catch (e) { setErr((e as Error).message); }
  }

  const s = d.status;
  const live = c.enabled && !c.testMode;

  return (
    <AdminShell title="Facebook replies">
      <p className="muted" style={{ margin: 0, maxWidth: 760 }}>
        Every minute the store checks your Facebook Page for new comments on posts and ads. It answers common questions with your replies below, hides spam and competitor comments, and lists complaints here for you. Comments are only answered once, and never from before you switched it on.
      </p>

      {/* status */}
      <div className="card" style={{ ...card, maxWidth: 860, borderColor: live ? 'var(--ok)' : undefined }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'baseline' }}>
          <b>{!d.tokenSet ? 'Not connected yet' : live ? `On: replying on ${s.page?.name || 'your Page'}` : c.enabled ? 'Test mode: nothing is posted yet' : 'Off'}</b>
          <span className="muted" style={{ fontSize: 13 }}>Last check: {when(s.lastRun)}{s.checked !== undefined ? `, ${s.checked} comments seen` : ''}</span>
        </div>
        {s.error && <p className="err" style={{ margin: 0 }}>{s.error}</p>}
        {d.tokenSet ? (
          <>
            <Toggle on={c.enabled} set={(v) => { const n = { ...c, enabled: v }; setC(n); save(n); }} label="Auto-replies on" hint="Starts with comments written from now on." />
            <Toggle on={c.testMode} set={(v) => { const n = { ...c, testMode: v }; setC(n); save(n); }} label="Test mode" hint="Shows below what it would reply or hide, without posting anything on Facebook. Turn off when you're happy with the replies." />
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button className="ghost" onClick={() => act('connect')} disabled={!!busy}>{busy === 'connect' ? 'Testing…' : 'Test connection'}</button>
              {c.enabled && <button className="ghost" onClick={() => act('check')} disabled={!!busy}>{busy === 'check' ? 'Checking…' : 'Check for new comments now'}</button>}
            </div>
          </>
        ) : (
          <details open>
            <summary style={{ cursor: 'pointer', fontWeight: 700 }}>How to connect your Page (about 15 minutes, once)</summary>
            <ol style={{ margin: '10px 0 0', paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 8, fontSize: 14 }}>
              <li>Go to <a href="https://developers.facebook.com/apps" target="_blank" rel="noopener noreferrer">developers.facebook.com/apps</a> → <b>Create app</b>. Choose <b>Other</b>, then app type <b>Business</b>. Name it “Nuvé replies” and pick your business portfolio.</li>
              <li>Open <a href="https://business.facebook.com/settings/system-users" target="_blank" rel="noopener noreferrer">Business settings → Users → System users</a> → <b>Add</b>. Name: “Nuvé bot”, role: <b>Admin</b>.</li>
              <li>With “Nuvé bot” selected, click <b>Assign assets</b>: under <b>Pages</b> pick your Nuvé Page and turn on full control. Under <b>Apps</b> pick “Nuvé replies” and turn on full control.</li>
              <li>Click <b>Generate token</b> → choose “Nuvé replies” → expiry <b>Never</b> → tick <code>pages_show_list</code>, <code>pages_read_engagement</code>, <code>pages_read_user_content</code>, <code>pages_manage_engagement</code> and <code>pages_manage_ads</code> → <b>Generate</b>.</li>
              <li>Copy the token. In this admin open <a href="/admin/server">Server settings</a> → <b>Facebook Page replies</b>: paste it as the Page access token, enter Page ID <code>{d.pageId || '61587599011799'}</code>, and save.</li>
              <li>Come back here and press <b>Test connection</b>. Keep the token private: don&apos;t send it in emails or chats.</li>
            </ol>
          </details>
        )}
        <p className="muted" style={{ margin: 0, fontSize: 13 }}>Last 7 days: {d.week.replied || 0} replied, {d.week.hidden || 0} hidden, {d.week.flagged || 0} flagged{(d.week.would_reply || d.week.would_hide) ? `, ${(d.week.would_reply || 0) + (d.week.would_hide || 0)} in test mode` : ''}.</p>
      </div>

      {msg && <p style={{ margin: 0, color: 'var(--ok)', fontWeight: 600 }}>{msg}</p>}
      {err && <p className="err" style={{ margin: 0 }}>{err}</p>}

      {/* needs you */}
      {d.needs.length > 0 && (
        <div className="card" style={{ ...card, maxWidth: 860, borderColor: 'var(--berry)' }}>
          <b>Needs you ({d.needs.length})</b>
          <p className="muted" style={{ margin: 0, fontSize: 13 }}>Complaints and anything that went wrong. Open the comment on Facebook to follow up, then tick it off.</p>
          {d.needs.map((r) => (
            <div key={r.comment_id} style={{ borderTop: '1px solid var(--line)', paddingTop: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'baseline' }}>
                <b>{r.from_name || 'Someone'}</b><span className="muted" style={{ fontSize: 13 }}>{when(r.commented_at)}</span>
                <span style={{ fontSize: 12, fontWeight: 800, color: ACTION[r.action]?.[1] }}>{ACTION[r.action]?.[0] || r.action}</span>
              </div>
              <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{r.message}</p>
              {r.reply && <p className="muted" style={{ margin: 0, fontSize: 14 }}>Reply{r.action === 'would_reply' ? ' (test mode, not posted)' : ''}: {r.reply}</p>}
              {r.action === 'error' && <p className="err" style={{ margin: 0, fontSize: 13 }}>{r.note}</p>}
              <div style={{ display: 'flex', gap: 8 }}>
                <a className="ghost" style={{ display: 'inline-flex', alignItems: 'center' }} href={fbLink(r)} target="_blank" rel="noopener noreferrer">Open on Facebook</a>
                <button className="ghost" onClick={() => act('done', { id: r.comment_id })}>Done</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* try it */}
      <div className="card" style={{ ...card, maxWidth: 860 }}>
        <b>Try a comment</b>
        <p className="muted" style={{ margin: 0, fontSize: 13 }}>Type something a customer might write to see which topic it matches and what would be replied. Uses your unsaved changes too.</p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input value={tryText} onChange={(e) => setTryText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') preview(); }} style={{ ...ta, flex: 1, minWidth: 220 }} aria-label="Example comment" />
          <button className="btn small" onClick={preview}>Try it</button>
        </div>
        {tryRes && (
          <div style={{ background: 'var(--blush)', borderRadius: 12, padding: 12, fontSize: 14, display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span><b>{tryRes.action === 'reply' ? 'Reply' : tryRes.action === 'hide' ? 'Hide the comment' : tryRes.action === 'flag' ? 'Flag for you' : 'Leave it alone'}</b>{tryRes.rule ? ` · topic “${tryRes.rule}”` : ''}{tryRes.flag && tryRes.action !== 'flag' ? ' · also flagged for you' : ''} <span className="muted">({tryRes.note})</span></span>
            {tryRes.reply && <span>{tryRes.reply}</span>}
          </div>
        )}
      </div>

      {/* topics */}
      <div style={{ ...card, maxWidth: 860 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
          <h2 style={{ margin: 0, fontSize: 20 }}>Topics</h2>
          <span className="muted" style={{ fontSize: 13 }}>Checked from top to bottom; the first match wins.</span>
        </div>
        <p className="muted" style={{ margin: 0, fontSize: 13 }}>
          Keywords: separate with commas. Replies: one per line; one is picked at random each time so your Page doesn&apos;t repeat itself. You can use {'{name}'} (their first name), {'{link}'} ({d.placeholders.link}), {'{price1}'} (R{d.placeholders.price1}), {'{price2}'} (R{d.placeholders.price2}), {'{price3}'} (R{d.placeholders.price3}), {'{ready}'} ({d.placeholders.ready} days) and {'{deliver}'} ({d.placeholders.deliver} days). Prices and days come from Store settings.
        </p>
        {c.rules.map((r, i) => (
          <div key={i} className="card" style={{ ...card, opacity: r.on ? 1 : 0.6 }}>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <input type="checkbox" checked={r.on} onChange={(e) => editRule(i, { on: e.target.checked })} style={{ width: 20, height: 20 }} aria-label="Topic on" />
              <input value={r.label} onChange={(e) => editRule(i, { label: e.target.value })} style={{ ...ta, width: 'auto', flex: 1, minWidth: 160, fontWeight: 700 }} aria-label="Topic name" />
              <select value={r.action} onChange={(e) => editRule(i, { action: e.target.value as Rule['action'] })} style={{ ...ta, width: 'auto' }} aria-label="What to do">
                <option value="reply">Reply</option><option value="hide">Hide comment</option><option value="flag">Only flag for me</option>
              </select>
              <button className="ghost" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Move up">↑</button>
              <button className="ghost" onClick={() => move(i, 1)} disabled={i === c.rules.length - 1} aria-label="Move down">↓</button>
              <button className="ghost" style={{ color: 'var(--berry)' }} onClick={() => { if (confirm(`Remove the topic “${r.label}”?`)) edit({ rules: c.rules.filter((_, k) => k !== i) }); }}>Remove</button>
            </div>
            <div className="f"><label>Keywords</label><textarea rows={r.key === 'spam' ? 4 : 2} value={r.keywords} onChange={(e) => editRule(i, { keywords: e.target.value })} style={ta} /></div>
            {r.action === 'reply' && <div className="f"><label>Replies (one per line)</label><textarea rows={Math.min(6, Math.max(2, r.replies.split('\n').length + 1))} value={r.replies} onChange={(e) => editRule(i, { replies: e.target.value })} style={ta} /></div>}
            {r.action === 'reply' && <Toggle on={r.flag} set={(v) => editRule(i, { flag: v })} label="Also list under “Needs you”" />}
          </div>
        ))}
        <button className="ghost" style={{ alignSelf: 'flex-start' }} onClick={() => edit({ rules: [...c.rules, { key: `topic${Date.now().toString(36)}`, label: 'New topic', on: true, action: 'reply', flag: false, keywords: '', replies: '' }] })}>Add a topic</button>
      </div>

      <div className="card" style={{ ...card, maxWidth: 860 }}>
        <b>Limits</b>
        <div className="row2">
          <div className="f"><label htmlFor="hl">Most replies per hour</label><input id="hl" type="number" min={1} max={200} value={c.hourlyLimit} onChange={(e) => edit({ hourlyLimit: Number(e.target.value) })} /></div>
          <div className="f"><label htmlFor="ma">Ignore comments older than (hours)</label><input id="ma" type="number" min={1} max={168} value={c.maxAgeHours} onChange={(e) => edit({ maxAgeHours: Number(e.target.value) })} /></div>
        </div>
        <Toggle on={c.skipTags} set={(v) => edit({ skipTags: v })} label="Ignore comments that only tag friends" hint="People tagging a friend under an ad don't need a reply." />
        <Toggle on={c.fallbackOn} set={(v) => edit({ fallbackOn: v })} label="Reply to comments that match no topic" hint="Off is safer: odd questions are left for you to answer." />
        {c.fallbackOn && <textarea rows={2} value={c.fallback} onChange={(e) => edit({ fallback: e.target.value })} style={ta} aria-label="General reply" />}
        <p className="muted" style={{ margin: 0, fontSize: 13 }}>The bot also replies only once to the same person on the same post.</p>
      </div>

      <div style={{ position: 'sticky', bottom: 0, background: 'var(--paper)', padding: '10px 0', display: 'flex', gap: 12, alignItems: 'center', maxWidth: 860 }}>
        <button className="btn" onClick={() => save()} disabled={!!busy || !dirty}>{busy === 'save' ? 'Saving…' : dirty ? 'Save changes' : 'Saved'}</button>
        {dirty && <button className="ghost" onClick={() => { setC(d.config); setDirty(false); }}>Undo changes</button>}
      </div>

      {/* activity */}
      <div className="card" style={{ ...card, maxWidth: 860 }}>
        <b>Recent activity</b>
        {!d.log.length ? <p className="muted" style={{ margin: 0 }}>Nothing yet. New comments appear here within a minute.</p> : d.log.map((r) => (
          <div key={r.comment_id} style={{ borderTop: '1px solid var(--line)', paddingTop: 8, display: 'flex', flexDirection: 'column', gap: 3, fontSize: 14 }}>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'baseline' }}>
              <span style={{ fontSize: 12, fontWeight: 800, color: ACTION[r.action]?.[1] }}>{ACTION[r.action]?.[0] || r.action}</span>
              <b>{r.from_name || 'Someone'}</b>
              <span className="muted" style={{ fontSize: 12 }}>{when(r.commented_at)}</span>
              <a href={fbLink(r)} target="_blank" rel="noopener noreferrer" style={{ marginLeft: 'auto', fontSize: 12 }}>View</a>
            </div>
            <span>{r.message}</span>
            {r.reply && <span className="muted">↳ {r.reply}</span>}
            {r.note && <span className="muted" style={{ fontSize: 12 }}>{r.note}</span>}
          </div>
        ))}
      </div>
    </AdminShell>
  );
}
