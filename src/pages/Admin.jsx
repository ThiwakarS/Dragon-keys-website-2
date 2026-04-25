import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Navigate } from 'react-router-dom';
import { useUser } from '@clerk/clerk-react';
import { useSupabase } from '../hooks/useSupabase.js';
import { useToast } from '../lib/toast.jsx';
import { ORDER_STATUSES, STATUS_LABELS, isAdmin, calculateEta } from '../lib/utils.js';
import { PRODUCTS } from '../data/products.js';
import Footer from '../components/Footer.jsx';

export default function Admin() {
  const { user, isLoaded } = useUser();
  const supabase = useSupabase();
  const toast = useToast();

  const [section, setSection] = useState('orders'); // orders | notices
  const [tab, setTab] = useState('active');
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);

  const supabaseRef = useRef(supabase);
  supabaseRef.current = supabase;

  const fetchAll = useCallback(async () => {
    const sb = supabaseRef.current;
    if (!sb) return;
    const { data, error } = await sb
      .from('admin_orders_with_position')
      .select('*')
      .order('product_id', { ascending: true })
      .order('sort_order', { ascending: true, nullsFirst: false })
      .order('queue_number', { ascending: true });
    if (error) {
      toast.show('Could not load orders: ' + error.message, 'error');
      setLoading(false);
      return;
    }
    setOrders(data || []);
    setLoading(false);
  }, [toast]);

  useEffect(() => {
    const isUserAdmin = user?.publicMetadata?.role === 'admin';
    if (!supabase || !isUserAdmin) return;
    fetchAll();

    const channelName = 'admin-orders-' + Math.random().toString(36).slice(2, 10);
    const channel = supabase
      .channel(channelName)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => fetchAll())
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase, user?.publicMetadata?.role]);

  const filtered = useMemo(() => {
    if (tab === 'active') {
      return orders.filter((o) => !['shipped', 'delivered', 'cancelled'].includes(o.status));
    }
    if (tab === 'shipped')   return orders.filter((o) => o.status === 'shipped');
    if (tab === 'delivered') return orders.filter((o) => o.status === 'delivered');
    if (tab === 'cancelled') return orders.filter((o) => o.status === 'cancelled');
    return orders;
  }, [orders, tab]);

  if (isLoaded && !isAdmin(user)) {
    return <Navigate to="/" replace />;
  }

  const handleStatusChange = async (order, newStatus) => {
    if (newStatus === 'cancelled') {
      const reason = window.prompt(
        'Reason for cancellation (shown to the customer):',
        order.cancellation_reason || ''
      );
      if (reason === null) return;
      const { error } = await supabase
        .from('orders')
        .update({
          status: 'cancelled',
          cancellation_reason: reason.trim() || 'Cancelled by admin',
          is_current: false,
          updated_at: new Date().toISOString(),
        })
        .eq('id', order.id);
      if (error) toast.show('Failed: ' + error.message, 'error');
      else { toast.show('Order cancelled', 'success'); fetchAll(); }
      return;
    }

    const update = { status: newStatus, updated_at: new Date().toISOString() };
    // When marking shipped or delivered, clear "is_current"
    if (newStatus === 'shipped' || newStatus === 'delivered') {
      update.is_current = false;
    }

    const { error } = await supabase.from('orders').update(update).eq('id', order.id);
    if (error) toast.show('Failed: ' + error.message, 'error');
    else { toast.show('Status updated to ' + STATUS_LABELS[newStatus], 'success'); fetchAll(); }
  };

  const handleTrackingChange = async (orderId, tracking) => {
    const { error } = await supabase
      .from('orders')
      .update({ tracking_number: tracking, updated_at: new Date().toISOString() })
      .eq('id', orderId);
    if (error) toast.show('Failed: ' + error.message, 'error');
    else { toast.show('Tracking saved', 'success'); fetchAll(); }
  };

  const handleMove = async (orderId, direction) => {
    const { error } = await supabase.rpc('move_order', { p_order_id: orderId, p_direction: direction });
    if (error) toast.show('Failed to move: ' + error.message, 'error');
    else fetchAll();
  };

  const handleSetCurrent = async (order) => {
    const { error } = await supabase.rpc('set_current_printing', { p_order_id: order.id });
    if (error) toast.show('Failed: ' + error.message, 'error');
    else { toast.show(`#${order.queue_number} is now printing`, 'success'); fetchAll(); }
  };

  const handleClearCurrent = async (productId) => {
    const { error } = await supabase.rpc('clear_current_printing', { p_product_id: productId });
    if (error) toast.show('Failed: ' + error.message, 'error');
    else { toast.show('Cleared "now printing"', 'success'); fetchAll(); }
  };

  const whatsappLink = (order) => {
    if (!order.whatsapp_number) return '#';
    const msg = encodeURIComponent(
      `Hi ${order.customer_name}, this is regarding your Dragon Keys order #${order.queue_number} (${order.product_name}). Current status: ${STATUS_LABELS[order.status]}.`
    );
    return `https://wa.me/${order.whatsapp_number}?text=${msg}`;
  };

  const stats = useMemo(() => {
    const active    = orders.filter((o) => !['shipped','delivered','cancelled'].includes(o.status)).length;
    const shipped   = orders.filter((o) => o.status === 'shipped').length;
    const delivered = orders.filter((o) => o.status === 'delivered').length;
    const cancelled = orders.filter((o) => o.status === 'cancelled').length;
    const perProduct = {};
    for (const p of PRODUCTS.filter((pp) => pp.fulfillment === 'queue')) {
      perProduct[p.id] = orders.filter((o) =>
        o.product_id === p.id &&
        !['shipped','delivered','cancelled'].includes(o.status)
      ).length;
    }
    return { active, shipped, delivered, cancelled, perProduct, total: orders.length };
  }, [orders]);

  return (
    <div className="page">
      <div className="page-inner" style={{ maxWidth: 1280 }}>
        <h1 className="page-title">Admin <span className="accent">Panel</span></h1>
        <p className="page-subtitle">Manage orders, notices, and the production queue.</p>

        {/* Top-level section nav */}
        <div className="tab-nav" style={{ marginBottom: 20 }}>
          <button className={`tab-btn ${section === 'orders' ? 'active' : ''}`} onClick={() => setSection('orders')}>
            Orders
          </button>
          <button className={`tab-btn ${section === 'notices' ? 'active' : ''}`} onClick={() => setSection('notices')}>
            Notices
          </button>
        </div>

        {section === 'notices' ? (
          <AdminNotices supabase={supabase} toast={toast} />
        ) : (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16, marginBottom: 32 }}>
              <StatBox label="Active" value={stats.active} />
              <StatBox label="Shipped" value={stats.shipped} />
              <StatBox label="Delivered" value={stats.delivered} />
              <StatBox label="Cancelled" value={stats.cancelled} />
              <StatBox label="Total" value={stats.total} />
              {Object.entries(stats.perProduct).map(([pid, count]) => {
                const product = PRODUCTS.find((p) => p.id === pid);
                return <StatBox key={pid} label={`${product?.name} queue`} value={count} small />;
              })}
            </div>

            <div className="tab-nav">
              <button className={`tab-btn ${tab === 'active' ? 'active' : ''}`} onClick={() => setTab('active')}>
                Active ({stats.active})
              </button>
              <button className={`tab-btn ${tab === 'shipped' ? 'active' : ''}`} onClick={() => setTab('shipped')}>
                Shipped ({stats.shipped})
              </button>
              <button className={`tab-btn ${tab === 'delivered' ? 'active' : ''}`} onClick={() => setTab('delivered')}>
                Delivered ({stats.delivered})
              </button>
              <button className={`tab-btn ${tab === 'cancelled' ? 'active' : ''}`} onClick={() => setTab('cancelled')}>
                Cancelled ({stats.cancelled})
              </button>
              <button className={`tab-btn ${tab === 'all' ? 'active' : ''}`} onClick={() => setTab('all')}>
                All
              </button>
            </div>

            {loading ? (
              <div className="loading-center"><div className="loader loader-large" /></div>
            ) : filtered.length === 0 ? (
              <div className="empty-state">No orders in this view.</div>
            ) : (
              <div className="admin-table-wrap">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>Queue</th>
                      <th>Order</th>
                      <th>Customer</th>
                      <th>Product &amp; Options</th>
                      <th>Pos / ETA</th>
                      <th>Status</th>
                      <th>Tracking</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((o) => {
                      const active = !['shipped','delivered','cancelled'].includes(o.status);
                      const eta = active ? calculateEta(o.product_id, o.position_in_product_queue || 1) : null;
                      const opts = o.selected_options || {};
                      const hasOpts = Object.keys(opts).length > 0;

                      return (
                        <tr key={o.id} style={o.is_current ? { background: 'rgba(58,180,242,0.06)' } : undefined}>
                          <td>
                            <strong style={{ color: 'var(--blue)' }}>#{o.queue_number}</strong>
                            {o.is_current && (
                              <div style={{
                                fontSize: '0.62rem',
                                letterSpacing: '0.1em',
                                textTransform: 'uppercase',
                                color: 'var(--blue)',
                                fontFamily: 'var(--font-display)',
                                marginTop: 4,
                              }}>● Printing now</div>
                            )}
                          </td>
                          <td>
                            {active && (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                                <button
                                  className="btn btn-ghost btn-small"
                                  style={{ padding: '2px 8px', fontSize: '0.7rem', minWidth: 32 }}
                                  onClick={() => handleMove(o.id, 'up')}
                                  title="Move up"
                                >↑</button>
                                <button
                                  className="btn btn-ghost btn-small"
                                  style={{ padding: '2px 8px', fontSize: '0.7rem', minWidth: 32 }}
                                  onClick={() => handleMove(o.id, 'down')}
                                  title="Move down"
                                >↓</button>
                              </div>
                            )}
                          </td>
                          <td>
                            <div style={{ fontWeight: 500 }}>{o.customer_name}</div>
                            <div style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>{o.whatsapp_number}</div>
                          </td>
                          <td>
                            <div style={{ fontWeight: 500, fontSize: '0.88rem' }}>{o.product_name}</div>
                            {hasOpts && (
                              <div style={{ fontSize: '0.78rem', color: 'var(--muted)', marginTop: 4 }}>
                                {Object.entries(opts).map(([k, v]) => (
                                  <div key={k}>
                                    <span style={{ textTransform: 'capitalize' }}>{k}:</span>{' '}
                                    <span style={{ color: 'var(--white)' }}>{v}</span>
                                  </div>
                                ))}
                              </div>
                            )}
                            {o.cancellation_reason && (
                              <div style={{ fontSize: '0.78rem', color: '#f2b84b', marginTop: 4, fontStyle: 'italic' }}>
                                ⚠ {o.cancellation_reason}
                              </div>
                            )}
                          </td>
                          <td>
                            {active ? (
                              <>
                                <div>{o.position_in_product_queue}/{o.total_in_product_queue}</div>
                                <div style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>~{eta?.days}d</div>
                              </>
                            ) : '—'}
                          </td>
                          <td>
                            <select
                              className="form-select"
                              style={{ padding: '6px 10px', fontSize: '0.85rem', minWidth: 170 }}
                              value={o.status}
                              onChange={(e) => handleStatusChange(o, e.target.value)}
                            >
                              {ORDER_STATUSES.map((s) => (
                                <option key={s} value={s}>{STATUS_LABELS[s]}</option>
                              ))}
                            </select>
                          </td>
                          <td>
                            {(o.status === 'shipped' || o.status === 'delivered') ? (
                              <TrackingInput
                                initial={o.tracking_number || ''}
                                onSave={(val) => handleTrackingChange(o.id, val)}
                              />
                            ) : <span style={{ color: 'var(--muted)', fontSize: '0.82rem' }}>—</span>}
                          </td>
                          <td>
                            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                              <a
                                href={whatsappLink(o)}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="btn btn-whatsapp btn-small"
                                title="Message on WhatsApp"
                              >WA</a>
                              <button
                                className="btn btn-ghost btn-small"
                                onClick={() => toast.show(`Address: ${o.address}, ${o.pincode}`, 'info', 8000)}
                              >Addr</button>
                              {active && (
                                o.is_current ? (
                                  <button
                                    className="btn btn-ghost btn-small"
                                    onClick={() => handleClearCurrent(o.product_id)}
                                  >Clear</button>
                                ) : (
                                  <button
                                    className="btn btn-primary btn-small"
                                    onClick={() => handleSetCurrent(o)}
                                  >Set ▶</button>
                                )
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>
      <Footer />
    </div>
  );
}

/* ========== Notices admin sub-section ========== */

function AdminNotices({ supabase, toast }) {
  const [notices, setNotices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ level: 'info', message: '' });

  const fetchAll = useCallback(async () => {
    if (!supabase) return;
    const { data, error } = await supabase
      .from('notices')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) toast.show('Could not load notices: ' + error.message, 'error');
    else setNotices(data || []);
    setLoading(false);
  }, [supabase, toast]);

  useEffect(() => {
    fetchAll();
    if (!supabase) return;
    const ch = supabase
      .channel('admin-notices-' + Math.random().toString(36).slice(2, 8))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notices' }, () => fetchAll())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase]);

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!form.message.trim()) {
      toast.show('Please enter a message', 'error');
      return;
    }
    const { error } = await supabase
      .from('notices')
      .insert({ level: form.level, message: form.message.trim(), active: true });
    if (error) toast.show('Failed: ' + error.message, 'error');
    else {
      toast.show('Notice posted', 'success');
      setForm({ level: 'info', message: '' });
      fetchAll();
    }
  };

  const toggleActive = async (notice) => {
    const { error } = await supabase
      .from('notices')
      .update({ active: !notice.active })
      .eq('id', notice.id);
    if (error) toast.show('Failed: ' + error.message, 'error');
    else fetchAll();
  };

  const handleDelete = async (notice) => {
    if (!window.confirm('Delete this notice permanently?')) return;
    const { error } = await supabase.from('notices').delete().eq('id', notice.id);
    if (error) toast.show('Failed: ' + error.message, 'error');
    else { toast.show('Deleted', 'success'); fetchAll(); }
  };

  return (
    <div>
      <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.4rem', marginBottom: 16 }}>
        Site-wide notices
      </h2>
      <p style={{ color: 'var(--muted)', fontSize: '0.92rem', marginBottom: 24 }}>
        Active notices show on the homepage to all visitors. Use them for alerts like
        material shortages, technical issues, or good news (e.g. printing resumed).
      </p>

      {/* New-notice form */}
      <form onSubmit={handleCreate} style={{
        background: 'var(--card)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-lg)',
        padding: 20,
        marginBottom: 32,
      }}>
        <div className="form-group">
          <label className="form-label">Type</label>
          <select
            className="form-select"
            value={form.level}
            onChange={(e) => setForm({ ...form, level: e.target.value })}
          >
            <option value="info">ℹ Info (blue)</option>
            <option value="success">✓ Good news (green)</option>
            <option value="warning">⚠ Warning (yellow)</option>
            <option value="danger">⛔ Danger (red)</option>
          </select>
        </div>
        <div className="form-group">
          <label className="form-label">Message</label>
          <textarea
            className="form-textarea"
            value={form.message}
            onChange={(e) => setForm({ ...form, message: e.target.value })}
            placeholder="e.g. Out of TPU material — orders paused until April 30"
            maxLength={500}
          />
          <div className="form-help">{form.message.length} / 500 chars</div>
        </div>
        <button type="submit" className="btn btn-primary">Post notice</button>
      </form>

      {/* Existing notices */}
      <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.1rem', marginBottom: 12 }}>
        All notices
      </h3>
      {loading ? (
        <div className="loading-center"><div className="loader" /></div>
      ) : notices.length === 0 ? (
        <div className="empty-state">No notices yet.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {notices.map((n) => (
            <div key={n.id} style={{
              padding: 14,
              borderRadius: 10,
              border: `1px solid ${n.active ? 'var(--border-strong)' : 'var(--border)'}`,
              background: 'var(--card)',
              opacity: n.active ? 1 : 0.5,
              display: 'flex',
              gap: 12,
              alignItems: 'flex-start',
              flexWrap: 'wrap',
            }}>
              <div style={{ flex: 1, minWidth: 240 }}>
                <div style={{
                  fontSize: '0.7rem',
                  letterSpacing: '0.1em',
                  textTransform: 'uppercase',
                  color: levelColor(n.level),
                  fontFamily: 'var(--font-display)',
                  marginBottom: 4,
                }}>
                  {n.level} {n.active ? '' : '· (inactive)'}
                </div>
                <div style={{ fontSize: '0.95rem', marginBottom: 4 }}>{n.message}</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>
                  {new Date(n.created_at).toLocaleString()}
                </div>
              </div>
              <div className="flex-row">
                <button className="btn btn-ghost btn-small" onClick={() => toggleActive(n)}>
                  {n.active ? 'Deactivate' : 'Activate'}
                </button>
                <button className="btn btn-ghost btn-small" onClick={() => handleDelete(n)}>
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function levelColor(level) {
  return {
    info: 'var(--blue)',
    success: '#4ade80',
    warning: '#f2b84b',
    danger: '#f24b4b',
  }[level] || 'var(--muted)';
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
        style={{ padding: '6px 10px', fontSize: '0.82rem', minWidth: 120 }}
        value={value}
        onChange={(e) => { setValue(e.target.value); setDirty(true); }}
        placeholder="Tracking #"
      />
      {dirty && (
        <button className="btn btn-primary btn-small" onClick={() => { onSave(value); setDirty(false); }}>
          Save
        </button>
      )}
    </div>
  );
}