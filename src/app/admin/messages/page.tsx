'use client';
import { useCallback, useEffect, useState } from 'react';
import { AdminShell, api } from '../ui';

type Msg = { id: string; name: string; email: string; phone: string | null; order_ref: string | null; topic: string | null; message: string; status: 'new' | 'read' | 'done'; created_at: string };
const when = (iso: string) => new Date(iso).toLocaleString('en-ZA', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Johannesburg' });

export default function Messages() {
  const [show, setShow] = useState<'open' | 'done' | 'all'>('open');
  const [list, setList] = useState<Msg[] | null>(null);
  const [err, setErr] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);
  const load = useCallback(() => api<{ messages: Msg[] }>(`/api/admin/messages?show=${show}`).then((j) => setList(j.messages)).catch((e) => setErr(e.message)), [show]);
  useEffect(() => { load(); }, [load]);

  const setStatus = async (m: Msg, status: Msg['status']) => { await api(`/api/admin/messages/${m.id}`, { method: 'PATCH', json: { status } }); load(); };
  const expand = (m: Msg) => { setOpenId(openId === m.id ? null : m.id); if (m.status === 'new') setStatus(m, 'read'); };
  const reply = (m: Msg) => `mailto:${m.email}?subject=${encodeURIComponent(`Re: ${m.topic || 'your message'}${m.order_ref ? ` (${m.order_ref})` : ''}`)}&body=${encodeURIComponent(`Hi ${m.name.split(' ')[0]},\n\n\n\n---\nYou wrote on ${when(m.created_at)}:\n${m.message}`)}`;

  return (
    <AdminShell title="Messages">
      <p className="muted" style={{ margin: 0 }}>Messages from the Contact Us form on the store. Reply by email, then mark them done.</p>
      <div style={{ display: 'flex', gap: 6 }}>
        {(['open', 'done', 'all'] as const).map((k) => (
          <button key={k} className="ghost" onClick={() => setShow(k)} style={{ background: show === k ? 'var(--ink)' : undefined, color: show === k ? 'var(--paper)' : undefined }}>
            {k === 'open' ? 'To answer' : k === 'done' ? 'Done' : 'All'}
          </button>
        ))}
      </div>
      {err && <p className="err">{err}</p>}
      {!list ? <p className="muted">Loading…</p> : !list.length ? <div className="card"><p className="muted" style={{ margin: 0 }}>{show === 'open' ? 'No messages waiting. 🎉' : 'Nothing here yet.'}</p></div> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {list.map((m) => (
            <div key={m.id} className="card" style={{ display: 'flex', flexDirection: 'column', gap: 10, borderColor: m.status === 'new' ? 'var(--berry)' : undefined }}>
              <button onClick={() => expand(m)} style={{ all: 'unset', cursor: 'pointer', display: 'flex', gap: 12, alignItems: 'baseline', flexWrap: 'wrap' }} aria-expanded={openId === m.id}>
                {m.status === 'new' && <span style={{ background: 'var(--berry)', color: 'var(--white)', borderRadius: 999, fontSize: 11, fontWeight: 800, padding: '2px 8px' }}>NEW</span>}
                <b>{m.name}</b>
                <span className="muted">{m.topic}{m.order_ref ? ` · ${m.order_ref}` : ''}</span>
                <span className="muted" style={{ marginLeft: 'auto', fontSize: 13 }}>{when(m.created_at)}</span>
                {openId !== m.id && <span className="muted" style={{ flexBasis: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.message}</span>}
              </button>
              {openId === m.id && (
                <>
                  <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{m.message}</p>
                  <div className="muted" style={{ fontSize: 14 }}>{m.email}{m.phone ? ` · ${m.phone}` : ''}</div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <a className="btn small" href={reply(m)}>Reply by email</a>
                    {m.phone && <a className="ghost" style={{ display: 'inline-flex', alignItems: 'center' }} href={`https://wa.me/${m.phone.replace(/\D/g, '').replace(/^0/, '27')}`} target="_blank" rel="noopener noreferrer">WhatsApp</a>}
                    {m.order_ref && <a className="ghost" style={{ display: 'inline-flex', alignItems: 'center' }} href={`/admin?q=${encodeURIComponent(m.order_ref)}`}>Find order</a>}
                    {m.status !== 'done' ? <button className="ghost" onClick={() => setStatus(m, 'done')}>Mark done</button> : <button className="ghost" onClick={() => setStatus(m, 'read')}>Reopen</button>}
                    <button className="ghost" style={{ color: 'var(--berry)' }} onClick={async () => { if (confirm('Delete this message?')) { await api(`/api/admin/messages/${m.id}`, { method: 'DELETE' }); load(); } }}>Delete</button>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </AdminShell>
  );
}
