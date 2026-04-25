import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useSupabase } from '../hooks/useSupabase.js';
import { useToast } from '../lib/toast.jsx';
import { calculateEta, formatShipDate, USER_CANCELLABLE_STATUSES } from '../lib/utils.js';
import StatusPill from '../components/StatusPill.jsx';
import Footer from '../components/Footer.jsx';

export default function MyOrders() {
  const supabase = useSupabase();
  const toast = useToast();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchOrders = async () => {
    if (!supabase) return;
    const { data, error } = await supabase
      .from('my_orders_with_position')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) {
      toast.show('Could not load orders. Please refresh.', 'error');
      setLoading(false);
      return;
    }
    setOrders(data || []);
    setLoading(false);
  };

  useEffect(() => {
    if (!supabase) return;
    fetchOrders();

    const channel = supabase
      .channel('my-orders-changes-' + Math.random().toString(36).slice(2, 8))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => fetchOrders())
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase]);

  const handleCancel = async (order) => {
    const reason = window.prompt(
      'Cancel this order?\n\nOptional: tell us why (leave blank to skip).',
      ''
    );
    if (reason === null) return;

    const { error } = await supabase.rpc('cancel_my_order', {
      p_order_id: order.id,
      p_reason:   reason.trim() || null,
    });

    if (error) {
      if (error.message?.includes('too_late_to_cancel')) {
        toast.show("Can't cancel — printing has started. Contact us on WhatsApp.", 'error', 6000);
      } else if (error.message?.includes('already_final')) {
        toast.show('This order is already finalised.', 'error');
      } else {
        toast.show('Failed: ' + error.message, 'error');
      }
      return;
    }

    toast.show('Order cancelled.', 'success');
    fetchOrders();
  };

  return (
    <div className="page">
      <div className="page-inner">
        <Link to="/" className="btn btn-ghost btn-small" style={{ marginBottom: 24 }}>← Back to Home</Link>
        <h1 className="page-title">My <span className="accent">Orders</span></h1>
        <p className="page-subtitle">Status updates in real time as I process your order.</p>

        {loading ? (
          <div className="loading-center">
            <div className="loader loader-large" />
            <span>Loading your orders…</span>
          </div>
        ) : orders.length === 0 ? (
          <div className="empty-state">
            <p style={{ marginBottom: 20 }}>No orders yet.</p>
            <Link to="/" className="btn btn-primary">Browse Products</Link>
          </div>
        ) : (
          orders.map((o) => {
            const active    = !['shipped', 'delivered', 'cancelled'].includes(o.status);
            const canCancel = USER_CANCELLABLE_STATUSES.includes(o.status);
            const eta       = active ? calculateEta(o.product_id, o.position_in_product_queue || 1) : null;
            const opts      = o.selected_options || {};
            const hasOpts   = Object.keys(opts).length > 0;

            return (
              <div key={o.id} className="order-card">
                <div className="order-card-head">
                  <div>
                    <div className="order-title">{o.product_name}</div>
                    <div style={{ color: 'var(--muted)', fontSize: '0.82rem', marginTop: 6 }}>
                      Placed {new Date(o.created_at).toLocaleDateString()}
                    </div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8 }}>
                    <StatusPill status={o.status} />
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: '0.7rem', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--muted)', fontFamily: 'var(--font-display)' }}>
                        Queue #
                      </div>
                      <div className="order-queue-num">#{o.queue_number}</div>
                    </div>
                  </div>
                </div>

                {hasOpts && (
                  <div style={{ marginTop: 12, padding: 12, background: 'var(--card-2)', borderRadius: 8, border: '1px solid var(--border)' }}>
                    <div style={{ fontSize: '0.72rem', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--muted)', fontFamily: 'var(--font-display)', marginBottom: 6 }}>
                      Your selections
                    </div>
                    <div style={{ display: 'grid', gap: 4, fontSize: '0.9rem' }}>
                      {Object.entries(opts).map(([k, v]) => (
                        <div key={k} style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span style={{ color: 'var(--muted)', textTransform: 'capitalize' }}>{k}</span>
                          <span>{v}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="order-meta">
                  {active && (
                    <div className="order-meta-item">
                      <span className="order-meta-label">Position</span>
                      <span className="order-meta-value">
                        {o.position_in_product_queue} of {o.total_in_product_queue}
                      </span>
                    </div>
                  )}
                  {o.tracking_number && (
                    <div className="order-meta-item">
                      <span className="order-meta-label">Tracking</span>
                      <span className="order-meta-value">{o.tracking_number}</span>
                    </div>
                  )}
                </div>

                {eta && (
                  <div className="order-eta">
                    Estimated to ship in <strong>~{eta.days} days</strong> (around <strong>{formatShipDate(eta.shipDate)}</strong>).
                  </div>
                )}
                {o.status === 'shipped' && (
                  <div className="order-eta">
                    <strong>Shipped!</strong> Thank you for your order.
                  </div>
                )}
                {o.status === 'delivered' && (
                  <div className="order-eta" style={{ color: 'var(--status-shipped)' }}>
                    <strong>Delivered!</strong> You can now leave a review on the product page.
                  </div>
                )}
                {o.status === 'cancelled' && (
                  <div className="order-eta" style={{ color: '#f2b84b' }}>
                    <strong>Cancelled.</strong>
                    {o.cancellation_reason && (<>  Reason: <em>{o.cancellation_reason}</em></>)}
                  </div>
                )}

                {canCancel && (
                  <div className="flex-row" style={{ marginTop: 16 }}>
                    <button
                      className="btn btn-ghost btn-small"
                      onClick={() => handleCancel(o)}
                    >
                      Cancel this order
                    </button>
                    <span style={{ fontSize: '0.78rem', color: 'var(--muted)', alignSelf: 'center' }}>
                      (Once printing starts, cancellation isn't possible.)
                    </span>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
      <Footer />
    </div>
  );
}