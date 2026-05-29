import { useState, useEffect, useCallback, useRef } from 'react';
import { Navigate } from 'react-router-dom';
import { useUser } from '@clerk/clerk-react';
import { useSupabase } from '../hooks/useSupabase.js';
import { useToast } from '../lib/toast.jsx';
import { ORDER_STATUSES, STATUS_LABELS, ACTIVE_STATUSES, isAdmin, calculateEta } from '../lib/utils.js';
import { PRODUCTS } from '../data/products.js';
import Footer from '../components/Footer.jsx';

export default function Admin() {
  const { user, isLoaded } = useUser();
  const supabase = useSupabase();
  const toast = useToast();

  const PAGE_SIZE = 100;

  const [section, setSection] = useState('orders'); // orders | notices
  const [tab, setTab] = useState('active');
  const [page, setPage] = useState(0);            // 0-indexed, per current tab
  const [rows, setRows] = useState([]);           // ONLY the current page of orders
  const [counts, setCounts] = useState({
    active: 0, ready: 0, shipped: 0, delivered: 0, cancelled: 0, total: 0, perProduct: {},
  });
  const [loading, setLoading] = useState(true);

  const supabaseRef = useRef(supabase);
  supabaseRef.current = supabase;

  // Keep current tab/page reachable from the realtime callback without
  // recreating the subscription on every change.
  const tabRef  = useRef(tab);  tabRef.current  = tab;
  const pageRef = useRef(page); pageRef.current = page;

  // Apply the active tab's status filter to a query builder.
  const applyTabFilter = useCallback((q, t) => {
    if (t === 'active')    return q.in('status', ACTIVE_STATUSES);
    if (t === 'ready')     return q.eq('status', 'ready_to_ship');
    if (t === 'shipped')   return q.eq('status', 'shipped');
    if (t === 'delivered') return q.eq('status', 'delivered');
    if (t === 'cancelled') return q.eq('status', 'cancelled');
    return q; // 'all'
  }, []);

  // Global counts for the stat boxes + tab labels. These query the base
  // `orders` table with head:true (count only, NO rows transferred), so
  // they stay accurate across all pages without pulling 500+ records.
  const fetchCounts = useCallback(async () => {
    const sb = supabaseRef.current;
    if (!sb) return;
    const base = () => sb.from('orders').select('id', { count: 'exact', head: true });
    const queueProducts = PRODUCTS.filter((p) => p.fulfillment === 'queue');

    try {
      const results = await Promise.all([
        base(),                                              // total
        base().in('status', ACTIVE_STATUSES),                // active
        base().eq('status', 'ready_to_ship'),                // ready to ship
        base().eq('status', 'shipped'),                      // shipped
        base().eq('status', 'delivered'),                    // delivered
        base().eq('status', 'cancelled'),                    // cancelled
        ...queueProducts.map((p) =>
          base().eq('product_id', p.id).in('status', ACTIVE_STATUSES)),
      ]);
      const [total, active, ready, shipped, delivered, cancelled, ...perRes] = results;
      const perProduct = {};
      queueProducts.forEach((p, i) => { perProduct[p.id] = perRes[i].count || 0; });
      setCounts({
        total:     total.count     || 0,
        active:    active.count    || 0,
        ready:     ready.count     || 0,
        shipped:   shipped.count   || 0,
        delivered: delivered.count || 0,
        cancelled: cancelled.count || 0,
        perProduct,
      });
    } catch (e) {
      // Counts are non-critical; don't block the table on a count failure.
      console.error('count fetch failed', e);
    }
  }, []);

  // One page of orders for the current tab. Uses .range() (NO count) so
  // only PAGE_SIZE rows come back and the view's per-row queue-position
  // sub-queries run for just those rows — not the whole table. The total
  // for the pager comes from the cheap base-table counts instead.
  //   background:true  -> refresh in place without blanking the table
  //                       (used after edits + realtime), so the big loader
  //                       only appears on real navigation / first load.
  const fetchPage = useCallback(async (tabArg, pageArg, { background = false } = {}) => {
    const sb = supabaseRef.current;
    if (!sb) return;
    if (!background) setLoading(true);

    const from = pageArg * PAGE_SIZE;
    const to   = from + PAGE_SIZE - 1;

    let q = sb
      .from('admin_orders_with_position')
      .select('*')
      .order('product_id',  { ascending: true })
      .order('sort_order',  { ascending: true, nullsFirst: false })
      .order('queue_number',{ ascending: true })
      .range(from, to);
    q = applyTabFilter(q, tabArg);

    const { data, error } = await q;
    if (error) {
      toast.show('Could not load orders: ' + error.message, 'error');
      setLoading(false);
      return;
    }

    setRows(data || []);
    setLoading(false);
  }, [applyTabFilter, toast]);

  // Refresh everything that's currently on screen (counts + current page).
  // Used after any admin mutation and on realtime events. Background mode
  // keeps the table visible (no full-screen loader on every status change).
  const refresh = useCallback(() => {
    fetchCounts();
    fetchPage(tabRef.current, pageRef.current, { background: true });
  }, [fetchCounts, fetchPage]);

  // Counts + realtime subscription — set up once per admin session.
  useEffect(() => {
    const isUserAdmin = user?.publicMetadata?.role === 'admin';
    if (!supabase || !isUserAdmin) return;
    fetchCounts();

    const channelName = 'admin-orders-' + Math.random().toString(36).slice(2, 10);
    const channel = supabase
      .channel(channelName)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => {
        fetchCounts();
        fetchPage(tabRef.current, pageRef.current, { background: true });
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase, user?.publicMetadata?.role]);

  // Current page of data — refetched whenever the tab or page changes.
  // (Not background: navigating SHOULD show the loader.)
  useEffect(() => {
    const isUserAdmin = user?.publicMetadata?.role === 'admin';
    if (!supabase || !isUserAdmin) return;
    fetchPage(tab, page);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase, user?.publicMetadata?.role, tab, page]);

  // Switching tabs always resets to the first page.
  const changeTab = (t) => { setTab(t); setPage(0); };

  // Total rows for the CURRENT tab — read from the cheap global counts,
  // so the pager never pays for an exact count over the heavy view.
  const tabTotal = (
    tab === 'active'    ? counts.active
  : tab === 'ready'     ? counts.ready
  : tab === 'shipped'   ? counts.shipped
  : tab === 'delivered' ? counts.delivered
  : tab === 'cancelled' ? counts.cancelled
  :                       counts.total
  );
  const pageTotal = tabTotal;

  // If rows were removed from a later page (e.g. shipped/cancelled away),
  // clamp the current page back into range once counts refresh.
  useEffect(() => {
    const maxPage = Math.max(0, Math.ceil(pageTotal / PAGE_SIZE) - 1);
    if (page > maxPage) setPage(maxPage);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageTotal]);

  // The current page of rows is already filtered + paginated server-side.
  const filtered = rows;

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
      else { toast.show('Order cancelled', 'success'); refresh(); }
      return;
    }

    const update = { status: newStatus, updated_at: new Date().toISOString() };
    // Once an order leaves the print stage, it's no longer "printing now".
    if (newStatus === 'shipped' || newStatus === 'delivered' || newStatus === 'ready_to_ship') {
      update.is_current = false;
    }

    const { error } = await supabase.from('orders').update(update).eq('id', order.id);
    if (error) toast.show('Failed: ' + error.message, 'error');
    else { toast.show('Status updated to ' + STATUS_LABELS[newStatus], 'success'); refresh(); }
  };

  const handleTrackingChange = async (orderId, tracking) => {
    const { error } = await supabase
      .from('orders')
      .update({ tracking_number: tracking, updated_at: new Date().toISOString() })
      .eq('id', orderId);
    if (error) toast.show('Failed: ' + error.message, 'error');
    else { toast.show('Tracking saved', 'success'); refresh(); }
  };

  const handleMove = async (orderId, direction) => {
    const { error } = await supabase.rpc('move_order', { p_order_id: orderId, p_direction: direction });
    if (error) toast.show('Failed to move: ' + error.message, 'error');
    else refresh();
  };

  const handleSetCurrent = async (order) => {
    const { error } = await supabase.rpc('set_current_printing', { p_order_id: order.id });
    if (error) toast.show('Failed: ' + error.message, 'error');
    else { toast.show(`#${order.queue_number} is now printing`, 'success'); refresh(); }
  };

  const handleClearCurrent = async (productId) => {
    const { error } = await supabase.rpc('clear_current_printing', { p_product_id: productId });
    if (error) toast.show('Failed: ' + error.message, 'error');
    else { toast.show('Cleared "now printing"', 'success'); refresh(); }
  };

  const whatsappLink = (order) => {
    if (!order.whatsapp_number) return '#';
    const msg = encodeURIComponent(
      `Hi ${order.customer_name}, this is regarding your Dragon Keys order #${order.queue_number} (${order.product_name}). Current status: ${STATUS_LABELS[order.status]}.`
    );
    return `https://wa.me/${order.whatsapp_number}?text=${msg}`;
  };

  // Stat boxes + tab labels read from the global counts (fetched via
  // count-only queries), so they reflect ALL orders, not just this page.
  const stats = counts;

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
              <button className={`tab-btn ${tab === 'active' ? 'active' : ''}`} onClick={() => changeTab('active')}>
                Active ({stats.active})
              </button>
              <button className={`tab-btn ${tab === 'ready' ? 'active' : ''}`} onClick={() => changeTab('ready')}>
                Ready to Ship ({stats.ready})
              </button>
              <button className={`tab-btn ${tab === 'shipped' ? 'active' : ''}`} onClick={() => changeTab('shipped')}>
                Shipped ({stats.shipped})
              </button>
              <button className={`tab-btn ${tab === 'delivered' ? 'active' : ''}`} onClick={() => changeTab('delivered')}>
                Delivered ({stats.delivered})
              </button>
              <button className={`tab-btn ${tab === 'cancelled' ? 'active' : ''}`} onClick={() => changeTab('cancelled')}>
                Cancelled ({stats.cancelled})
              </button>
              <button className={`tab-btn ${tab === 'all' ? 'active' : ''}`} onClick={() => changeTab('all')}>
                All ({stats.total})
              </button>
            </div>

            {loading ? (
              <div className="loading-center"><div className="loader loader-large" /></div>
            ) : filtered.length === 0 ? (
              <div className="empty-state">No orders in this view.</div>
            ) : (
              <>
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  gap: 8,
                  margin: '4px 2px 12px',
                  fontSize: '0.82rem',
                  color: 'var(--muted)',
                  fontFamily: 'var(--font-display)',
                  letterSpacing: '0.03em',
                }}>
                  <span>
                    Showing {page * PAGE_SIZE + 1}–{page * PAGE_SIZE + filtered.length} of {Math.max(pageTotal, page * PAGE_SIZE + filtered.length)}
                  </span>
                  {pageTotal > PAGE_SIZE && (
                    <span>Page {page + 1} of {Math.ceil(pageTotal / PAGE_SIZE)}</span>
                  )}
                </div>

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
                      // "active" here = still in the production queue. Ready-to-ship
                      // orders are printed/in-hand, so they get no queue controls.
                      const active = !['shipped','delivered','cancelled','ready_to_ship'].includes(o.status);
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

              <Pager
                page={page}
                pageSize={PAGE_SIZE}
                total={pageTotal}
                onPage={setPage}
              />
              </>
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
    else refresh();
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

function Pager({ page, pageSize, total, onPage }) {
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  if (pageCount <= 1) return null;

  const last = pageCount - 1;

  // Windowed page list: always show first + last + current±1, with
  // ellipses bridging any gaps (e.g.  ← 1 … 4 [5] 6 … 20 → ).
  const wanted = new Set([0, last, page - 1, page, page + 1]);
  const visible = [...wanted].filter((p) => p >= 0 && p <= last).sort((a, b) => a - b);
  const items = [];
  let prev = null;
  for (const p of visible) {
    if (prev !== null && p - prev > 1) items.push(`gap-${p}`);
    items.push(p);
    prev = p;
  }

  const btnStyle = { minWidth: 38, padding: '6px 10px' };

  return (
    <div style={{
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      gap: 6,
      flexWrap: 'wrap',
      marginTop: 20,
    }}>
      <button
        className="btn btn-ghost btn-small"
        style={btnStyle}
        onClick={() => onPage(page - 1)}
        disabled={page <= 0}
        aria-label="Previous page"
        type="button"
      >←</button>

      {items.map((it) =>
        typeof it === 'string' ? (
          <span key={it} style={{ color: 'var(--muted)', padding: '0 4px' }}>…</span>
        ) : (
          <button
            key={it}
            className={`btn btn-small ${it === page ? 'btn-primary' : 'btn-ghost'}`}
            style={btnStyle}
            onClick={() => onPage(it)}
            aria-label={`Page ${it + 1}`}
            aria-current={it === page ? 'page' : undefined}
            type="button"
          >{it + 1}</button>
        )
      )}

      <button
        className="btn btn-ghost btn-small"
        style={btnStyle}
        onClick={() => onPage(page + 1)}
        disabled={page >= last}
        aria-label="Next page"
        type="button"
      >→</button>
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