import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useUser } from '@clerk/clerk-react';
import { useSupabase } from '../hooks/useSupabase.js';
import { findProduct } from '../data/products.js';
import { useToast } from '../lib/toast.jsx';
import { isValidPincode, calculateEta, formatShipDate } from '../lib/utils.js';
import Footer from '../components/Footer.jsx';

// --- Local phone validators ---
// Country code: "+" followed by 1-3 digits
const isValidCountryCode = (cc) => /^\+\d{1,3}$/.test(cc);
// Mobile: exactly 10 digits (India format)
const isValidMobile = (n) => /^\d{10}$/.test(n);

export default function BookOrder() {
  const { productId } = useParams();
  const navigate = useNavigate();
  const { user } = useUser();
  const supabase = useSupabase();
  const toast = useToast();

  const product = findProduct(productId);

  const [form, setForm] = useState({
    customer_name: '',
    country_code: '+91',
    mobile_number: '',
    address: '',
    pincode: '',
  });
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [checking, setChecking] = useState(true);
  const [blockedMessage, setBlockedMessage] = useState('');
  const [result, setResult] = useState(null);

  // Prefill name from Clerk profile
  useEffect(() => {
    if (user?.fullName && !form.customer_name) {
      setForm((f) => ({ ...f, customer_name: user.fullName }));
    }
  }, [user]);

  // Check if product exists and if user already has an active order
  useEffect(() => {
    if (!product) {
      navigate('/404', { replace: true });
      return;
    }
    if (product.fulfillment !== 'queue') {
      navigate('/', { replace: true });
      return;
    }
    if (!supabase) return;

    let cancelled = false;
    (async () => {
      setChecking(true);
      const { data, error } = await supabase.rpc('check_can_book');
      if (cancelled) return;
      if (error) {
        toast.show('Could not verify booking eligibility. Try again.', 'error');
        setChecking(false);
        return;
      }
      if (data && data.length > 0 && !data[0].can_book) {
        setBlockedMessage(data[0].reason || 'You already have an active order.');
      }
      setChecking(false);
    })();

    return () => { cancelled = true; };
  }, [supabase, product, navigate]);

  // Generic field update (clears field-specific error)
  const update = (field) => (e) => {
    setForm((f) => ({ ...f, [field]: e.target.value }));
    setErrors((err) => ({ ...err, [field]: null }));
  };

  // Special update for mobile — strip non-digits, cap at 10
  const updateMobile = (e) => {
    const digits = e.target.value.replace(/\D/g, '').slice(0, 10);
    setForm((f) => ({ ...f, mobile_number: digits }));
    setErrors((err) => ({ ...err, mobile_number: null }));
  };

  // Special update for country code — keep "+" at start, digits after
  const updateCountryCode = (e) => {
    let val = e.target.value;
    if (!val.startsWith('+')) val = '+' + val.replace(/\D/g, '');
    // Keep "+" and up to 3 digits
    val = '+' + val.slice(1).replace(/\D/g, '').slice(0, 3);
    setForm((f) => ({ ...f, country_code: val }));
    setErrors((err) => ({ ...err, country_code: null }));
  };

  const validate = () => {
    const errs = {};
    if (!form.customer_name.trim()) errs.customer_name = 'Name is required';
    if (!isValidCountryCode(form.country_code)) errs.country_code = 'Invalid country code';
    if (!isValidMobile(form.mobile_number)) errs.mobile_number = 'Enter a 10-digit mobile number';
    if (!form.address.trim() || form.address.trim().length < 10) errs.address = 'Please provide a full address';
    if (!isValidPincode(form.pincode)) errs.pincode = 'Pincode must be 6 digits';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate() || !supabase) return;

    // Combine country code (digits only) + mobile
    const fullNumber = form.country_code.replace(/\D/g, '') + form.mobile_number;

    setSubmitting(true);
    const { data, error } = await supabase.rpc('create_order', {
      p_product_id: product.id,
      p_product_name: product.name,
      p_customer_name: form.customer_name.trim(),
      p_whatsapp_number: fullNumber,
      p_address: form.address.trim(),
      p_pincode: form.pincode.trim(),
    });
    setSubmitting(false);

    if (error) {
      if (error.message?.includes('active_order_exists')) {
        setBlockedMessage('You already have an active order. Please wait for it to ship before placing another.');
      } else {
        toast.show(error.message || 'Something went wrong. Please try again.', 'error');
      }
      return;
    }

    const order = Array.isArray(data) ? data[0] : data;
    setResult(order);
    toast.show('Order placed — queue position assigned!', 'success');
  };

  if (!product) return null;

  // Blocked state
  if (!checking && blockedMessage) {
    return (
      <div className="page">
        <div className="page-inner">
          <Link to="/" className="btn btn-ghost btn-small" style={{ marginBottom: 24 }}>← Back</Link>
          <h1 className="page-title">Can't place order yet</h1>
          <p className="page-subtitle">{blockedMessage}</p>
          <Link to="/my-orders" className="btn btn-primary">View My Orders →</Link>
        </div>
        <Footer />
      </div>
    );
  }

  // Success state
  if (result) {
    const eta = calculateEta(product.id, result.position_in_product_queue || 1);
    return (
      <div className="page">
        <div className="page-inner">
          <h1 className="page-title"><span className="accent">Order placed.</span></h1>
          <p className="page-subtitle">
            I'll message you on WhatsApp shortly to confirm the deposit. Save this page for your records.
          </p>

          <div className="order-card">
            <div className="order-card-head">
              <div>
                <div className="order-title">{product.name}</div>
                <div style={{ color: 'var(--muted)', fontSize: '0.9rem', marginTop: 4 }}>
                  Order ID: <code>{result.id}</code>
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: '0.72rem', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--muted)', fontFamily: 'var(--font-display)' }}>
                  Queue #
                </div>
                <div className="order-queue-num">#{result.queue_number}</div>
              </div>
            </div>

            <div className="order-meta">
              <div className="order-meta-item">
                <span className="order-meta-label">Status</span>
                <span className="order-meta-value">Awaiting Deposit</span>
              </div>
              <div className="order-meta-item">
                <span className="order-meta-label">Position in queue</span>
                <span className="order-meta-value">{result.position_in_product_queue} of {result.total_in_product_queue}</span>
              </div>
            </div>

            <div className="order-eta">
              Estimated to ship in <strong>~{eta.days} days</strong> (around <strong>{formatShipDate(eta.shipDate)}</strong>).
              This is an estimate based on current queue load.
            </div>
          </div>

          <div className="flex-row" style={{ marginTop: 24 }}>
            <Link to="/my-orders" className="btn btn-primary">View My Orders</Link>
            <Link to="/" className="btn btn-ghost">Back to Home</Link>
          </div>
        </div>
        <Footer />
      </div>
    );
  }

  return (
    <div className="page">
      <div className="page-inner">
        <Link to="/" className="btn btn-ghost btn-small" style={{ marginBottom: 24 }}>← Back</Link>
        <h1 className="page-title">Book your <span className="accent">{product.name}</span></h1>
        <p className="page-subtitle">
          Fill this in and I'll message you on WhatsApp to confirm the deposit.
        </p>

        {checking ? (
          <div className="loading-center">
            <div className="loader loader-large" />
            <span>Checking eligibility…</span>
          </div>
        ) : (
          <form onSubmit={handleSubmit} noValidate>
            <div className="form-group">
              <label className="form-label">Your Name</label>
              <input
                className="form-input"
                type="text"
                value={form.customer_name}
                onChange={update('customer_name')}
                placeholder="Full name"
                autoComplete="name"
              />
              {errors.customer_name && <div className="form-error">{errors.customer_name}</div>}
            </div>

            <div className="form-group">
              <label className="form-label">WhatsApp Number</label>
              <div style={{ display: 'flex', gap: 10 }}>
                <input
                  className="form-input"
                  style={{ width: 90, flexShrink: 0, textAlign: 'center' }}
                  type="text"
                  value={form.country_code}
                  onChange={updateCountryCode}
                  placeholder="+91"
                  maxLength={4}
                  autoComplete="tel-country-code"
                  aria-label="Country code"
                />
                <input
                  className="form-input"
                  style={{ flex: 1 }}
                  type="tel"
                  value={form.mobile_number}
                  onChange={updateMobile}
                  placeholder="9876543210"
                  maxLength={10}
                  inputMode="numeric"
                  autoComplete="tel-national"
                  aria-label="Mobile number"
                />
              </div>
              <div className="form-help">10-digit mobile number (India, +91 pre-filled)</div>
              {errors.country_code && <div className="form-error">{errors.country_code}</div>}
              {errors.mobile_number && <div className="form-error">{errors.mobile_number}</div>}
            </div>

            <div className="form-group">
              <label className="form-label">Shipping Address</label>
              <textarea
                className="form-textarea"
                value={form.address}
                onChange={update('address')}
                placeholder="Street, area, city, state"
                autoComplete="street-address"
              />
              {errors.address && <div className="form-error">{errors.address}</div>}
            </div>

            <div className="form-group">
              <label className="form-label">Pincode</label>
              <input
                className="form-input"
                type="text"
                value={form.pincode}
                onChange={update('pincode')}
                placeholder="6-digit postal code"
                autoComplete="postal-code"
                maxLength={6}
                inputMode="numeric"
              />
              {errors.pincode && <div className="form-error">{errors.pincode}</div>}
            </div>

            <div style={{ padding: 16, background: 'var(--card-2)', borderRadius: 10, border: '1px solid var(--border)', marginBottom: 20, fontSize: '0.9rem', color: 'var(--muted)' }}>
              <strong style={{ color: 'var(--white)' }}>How this works:</strong> You'll get a queue number immediately. I'll then message you on WhatsApp to collect the deposit. Once paid, I start printing. Final payment is collected before shipping.
            </div>

            <button type="submit" className="btn btn-primary btn-large" disabled={submitting}>
              {submitting ? <><div className="loader" /> Placing order…</> : 'Place Order'}
            </button>
          </form>
        )}
      </div>
      <Footer />
    </div>
  );
}