'use client';
import { AdminShell } from '../ui';
import { OrdersTable, useOrders } from '../orders-table';

export default function PendingEft() {
  const { orders, err } = useOrders('eft', '');
  const review = orders?.filter((o) => o.status === 'eft_review') || [];
  const waiting = orders?.filter((o) => o.status === 'awaiting_eft') || [];
  return (
    <AdminShell title="Pending EFT">
      <p className="muted" style={{ margin: 0 }}>Bank-transfer orders wait here until you confirm the money is in your account. Unpaid orders expire automatically when their timer runs out.</p>
      {err && <p className="err">{err}</p>}
      {!orders ? <p className="muted">Loading…</p> : (
        <>
          <h2 style={{ margin: '8px 0 0', fontSize: 18 }}>Proof of payment uploaded ({review.length})</h2>
          <p className="muted" style={{ margin: 0, fontSize: 14 }}>Check each payment in your banking app, then open the order and press &ldquo;Mark as paid&rdquo;.</p>
          <OrdersTable orders={review} />
          <h2 style={{ margin: '8px 0 0', fontSize: 18 }}>Waiting for payment ({waiting.length})</h2>
          <OrdersTable orders={waiting} showTimer />
        </>
      )}
    </AdminShell>
  );
}
