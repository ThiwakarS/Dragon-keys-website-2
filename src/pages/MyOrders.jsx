import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useSupabase } from '../hooks/useSupabase.js';
import { useToast } from '../lib/toast.jsx';
import { calculateEta, formatShipDate } from '../lib/utils.js';
import StatusPill from '../components/StatusPill.jsx';
import Footer from '../components/Footer.jsx';

export default function MyOrders() {
  const supabase = useSupabase();
  const toast = useToast();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!supabase) return;

    let cancelled = false;

    const fetchOrders = async () => {
      // This view returns the user's orders WITH computed queue position
      const { data, error } = await supabase
        .from('my_orders_with_position')
        .select('*')
        .order('created_at', { ascending: false });

      if (cancelled) return;
      if (error) {
        toast.show('Could not load orders. Please refresh.', 'error');
        setLoading(false);
        return;
      }
      setOrders(data || []);
      setLoading(false);
    };

    fetchOrders();

    // Realtime: subscribe to changes on the user's own orders
    const channel = supabase
      .channel('my-orders-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'orders' },
        () => {
          // On any change, refetch (RLS ensures we only see our own)
          fetchOrders();
        }
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [supabase]);

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
            const eta = o.status === 'shipped' || o.status === 'cancelled'
              ? null
              : calculateEta(o.product_id, o.position_in_product_queue || 1);
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

                <div className="order-meta">
                  {o.status !== 'shipped' && o.status !== 'cancelled' && (
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
              </div>
            );
          })
        )}
      </div>
      <Footer />
    </div>
  );
}
