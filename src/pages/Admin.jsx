import { useState, useEffect, useMemo } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useUser } from '@clerk/clerk-react';
import { useSupabase } from '../hooks/useSupabase.js';
import { useToast } from '../lib/toast.jsx';
import { ORDER_STATUSES, STATUS_LABELS, isAdmin, calculateEta } from '../lib/utils.js';
import { PRODUCTS } from '../data/products.js';
import StatusPill from '../components/StatusPill.jsx';
import Footer from '../components/Footer.jsx';

const WHATSAPP_NUMBER = import.meta.env.VITE_WHATSAPP_NUMBER || '';

export default function Admin() {
  const { user, isLoaded } = useUser();
  const supabase = useSupabase();
  const toast = useToast();

  const [tab, setTab] = useState('active'); // active | shipped | all
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!supabase || !isAdmin(user)) return;

    let cancelled = false;

    const fetchAll = async () => {
      const { data, error } = await supabase
        .from('admin_orders_with_position')
        .select('*')
        .order('created_at', { ascending: false });

      if (cancelled) return;
      if (error) {
        toast.show('Could not load orders: ' + error.message, 'error');
        setLoading(false);
        return;
      }
      setOrders(data || []);
      setLoading(false);
    };

    fetchAll();

    const channel = supabase
      .channel('admin-orders-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'orders' },
        () => fetchAll()
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [supabase, user]);

  const filtered = useMemo(() => {
    if (tab === 'active') {
      return orders.filter((o) => o.status !== 'shipped' && o.status !== 'cancelled');
    }
    if (tab === 'shipped') {
      return orders.filter((o) => o.status === 'shipped');
    }
    return orders;
  }, [orders, tab]);

  // Hard-block non-admins AFTER all hooks (rules of hooks)
  if (isLoaded && !isAdmin(user)) {
    return <Navigate to="/" replace />;
  }

  const handleStatusChange = async (orderId, newStatus) => {
    const { error } = await supabase
      .from('orders')
      .update({ status: newStatus, updated_at: new Date().toISOString() })
      .eq('id', orderId);

    if (error) {
      toast.show('Failed to update: ' + error.message, 'error');
    } else {
      toast.show('Status updated to ' + STATUS_LABELS[newStatus], 'success');
    }
  };

  const handleTrackingChange = async (orderId, tracking) => {
    const { error } = await supabase
      .from('orders')
      .update({ tracking_number: tracking, updated_at: new Date().toISOString() })
      .eq('id', orderId);
    if (error) toast.show('Failed: ' + error.message, 'error');
    else toast.show('Tracking saved', 'success');
  };

  const whatsappLink = (order) => {
    if (!WHATSAPP_NUMBER || !order.whatsapp_number) return '#';
    const msg = encodeURIComponent(
      `Hi ${order.customer_name}, this is regarding your Dragon Keys order #${order.queue_number} (${order.product_name}). Current status: ${STATUS_LABELS[order.status]}.`
    );
    return `https://wa.me/${order.whatsapp_number}?text=${msg}`;
  };

  const stats = useMemo(() => {
    const active = orders.filter((o) => o.status !== 'shipped' && o.status !== 'cancelled').length;
    const shipped = orders.filter((o) => o.status === 'shipped').length;
    const perProduct = {};
    for (const p of PRODUCTS.filter((pp) => pp.fulfillment === 'queue')) {
      perProduct[p.id] = orders.filter((o) => o.product_id === p.id && o.status !== 'shipped' && o.status !== 'cancelled').length;
    }
    return { active, shipped, perProduct, total: orders.length };
  }, [orders]);

  return (
    <div className="page">
      <div className="page-inner" style={{ maxWidth: 1200 }}>
        <h1 className="page-title">Admin <span className="accent">Panel</span></h1>
        <p className="page-subtitle">Manage orders, update status, and message customers.</p>

        {/* Stats grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16, marginBottom: 32 }}>
          <StatBox label="Active Orders" value={stats.active} />
          <StatBox label="Shipped" value={stats.shipped} />
          <StatBox label="Total" value={stats.total} />
          {Object.entries(stats.perProduct).map(([pid, count]) => {
            const product = PRODUCTS.find((p) => p.id === pid);
            return <StatBox key={pid} label={`${product?.name} queue`} value={count} small />;
          })}
        </div>

        {/* Tabs */}
        <div className="tab-nav">
          <button className={`tab-btn ${tab === 'active' ? 'active' : ''}`} onClick={() => setTab('active')}>
            Active ({orders.filter((o) => o.status !== 'shipped' && o.status !== 'cancelled').length})
          </button>
          <button className={`tab-btn ${tab === 'shipped' ? 'active' : ''}`} onClick={() => setTab('shipped')}>
            Shipped
          </button>
          <button className={`tab-btn ${tab === 'all' ? 'active' : ''}`} onClick={() => setTab('all')}>
            All
          </button>
        </div>

        {loading ? (
          <div className="loading-center">
            <div className="loader loader-large" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="empty-state">No orders in this view.</div>
        ) : (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Queue</th>
                  <th>Customer</th>
                  <th>Product</th>
                  <th>Position</th>
                  <th>ETA</th>
                  <th>Status</th>
                  <th>Tracking</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((o) => {
                  const active = o.status !== 'shipped' && o.status !== 'cancelled';
                  const eta = active ? calculateEta(o.product_id, o.position_in_product_queue || 1) : null;
                  return (
                    <tr key={o.id}>
                      <td><strong style={{ color: 'var(--blue)' }}>#{o.queue_number}</strong></td>
                      <td>
                        <div style={{ fontWeight: 500 }}>{o.customer_name}</div>
                        <div style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>{o.whatsapp_number}</div>
                      </td>
                      <td>{o.product_name}</td>
                      <td>{active ? `${o.position_in_product_queue}/${o.total_in_product_queue}` : '—'}</td>
                      <td>{eta ? `~${eta.days}d` : '—'}</td>
                      <td>
                        <select
                          className="form-select"
                          style={{ padding: '6px 10px', fontSize: '0.85rem', minWidth: 180 }}
                          value={o.status}
                          onChange={(e) => handleStatusChange(o.id, e.target.value)}
                        >
                          {ORDER_STATUSES.map((s) => (
                            <option key={s} value={s}>{STATUS_LABELS[s]}</option>
                          ))}
                        </select>
                      </td>
                      <td>
                        {o.status === 'shipped' ? (
                          <TrackingInput
                            initial={o.tracking_number || ''}
                            onSave={(val) => handleTrackingChange(o.id, val)}
                          />
                        ) : (
                          <span style={{ color: 'var(--muted)', fontSize: '0.82rem' }}>—</span>
                        )}
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <a
                            href={whatsappLink(o)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="btn btn-whatsapp btn-small"
                            title="Message on WhatsApp"
                          >
                            WA
                          </a>
                          <button
                            className="btn btn-ghost btn-small"
                            onClick={() => toast.show(`Address: ${o.address}, ${o.pincode}`, 'info', 8000)}
                          >
                            Addr
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <Footer />
    </div>
  );
}

function StatBox({ label, value, small = false }) {
  return (
    <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 10, padding: 18 }}>
      <div style={{ fontSize: '0.72rem', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--muted)', fontFamily: 'var(--font-display)', marginBottom: 6 }}>
        {label}
      </div>
      <div style={{ fontFamily: 'var(--font-display)', fontSize: small ? '1.4rem' : '1.8rem', fontWeight: 800, color: 'var(--blue)' }}>
        {value}
      </div>
    </div>
  );
}

function TrackingInput({ initial, onSave }) {
  const [value, setValue] = useState(initial);
  const [dirty, setDirty] = useState(false);
  return (
    <div style={{ display: 'flex', gap: 6 }}>
      <input
        className="form-input"
        style={{ padding: '6px 10px', fontSize: '0.82rem', minWidth: 140 }}
        value={value}
        onChange={(e) => { setValue(e.target.value); setDirty(true); }}
        placeholder="Tracking #"
      />
      {dirty && (
        <button
          className="btn btn-primary btn-small"
          onClick={() => { onSave(value); setDirty(false); }}
        >
          Save
        </button>
      )}
    </div>
  );
}
