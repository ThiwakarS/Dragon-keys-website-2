import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useToast } from '../lib/toast.jsx';

const SUPPORT_EMAIL = import.meta.env.VITE_SUPPORT_EMAIL || 'support@dragonkeys.dev';

export default function ProductModal({ product, onClose }) {
  const navigate = useNavigate();
  const toast = useToast();

  // Close on Escape
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', handler);
      document.body.style.overflow = '';
    };
  }, [onClose]);

  if (!product) return null;

  const primaryImage = product.images?.[0];

  const handleEmailClick = () => {
    const subject = encodeURIComponent(`Enquiry: ${product.name}`);
    const body = encodeURIComponent(
      `Hi,\n\nI'm interested in the ${product.name}.\n\nDetails / requirements:\n\n\nThanks,\n`
    );
    window.location.href = `mailto:${SUPPORT_EMAIL}?subject=${subject}&body=${body}`;
  };

  const handleCopyEmail = async () => {
    try {
      await navigator.clipboard.writeText(SUPPORT_EMAIL);
      toast.show(`Copied to clipboard: ${SUPPORT_EMAIL}`, 'success');
    } catch {
      toast.show(`Couldn't copy automatically. Email: ${SUPPORT_EMAIL}`, 'error', 6000);
    }
  };

  const handleOrder = () => {
    onClose();
    navigate(`/order/${product.id}`);
  };

  const hasOss = product.openSource?.github || product.openSource?.cults3d;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose} aria-label="Close">✕</button>

        {primaryImage && (
          <div className="product-img" style={{ borderRadius: 10, marginBottom: 20, maxHeight: 360 }}>
            <img src={primaryImage} alt={product.name} />
          </div>
        )}

        <span className="product-tag" style={{ marginBottom: 10 }}>{product.category}</span>
        <h3 className="modal-title">{product.name}</h3>
        <p className="modal-desc">{product.description}</p>

        <div className="product-price" style={{ marginBottom: 16 }}>{product.price}</div>

        {product.specs?.length > 0 && (
          <div style={{ marginBottom: 20 }}>
            <h4 style={{ fontFamily: 'var(--font-display)', fontSize: '0.85rem', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 10 }}>
              Specs
            </h4>
            <div style={{ display: 'grid', gap: 8 }}>
              {product.specs.map((s, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--border)', fontSize: '0.92rem' }}>
                  <span style={{ color: 'var(--muted)' }}>{s.label}</span>
                  <span>{s.value}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {hasOss && (
          <div style={{ marginBottom: 20, padding: 14, background: 'var(--card-2)', borderRadius: 10, border: '1px solid var(--border)' }}>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: '0.78rem', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--blue)', marginBottom: 8 }}>
              Open Source
            </div>
            <div className="flex-row">
              {product.openSource.github && (
                <a href={product.openSource.github} target="_blank" rel="noopener noreferrer" className="btn btn-ghost btn-small">
                  GitHub →
                </a>
              )}
              {product.openSource.cults3d && (
                <a href={product.openSource.cults3d} target="_blank" rel="noopener noreferrer" className="btn btn-ghost btn-small">
                  Cults3D →
                </a>
              )}
            </div>
            <p style={{ fontSize: '0.82rem', color: 'var(--muted)', marginTop: 10, lineHeight: 1.5 }}>
              Files are for <strong>personal use only</strong>. Commercial use is not permitted.
            </p>
          </div>
        )}

        <div className="flex-row" style={{ marginTop: 8 }}>
          {product.fulfillment === 'queue' ? (
            <button className="btn btn-primary" onClick={handleOrder}>
              Order Now →
            </button>
          ) : (
            <>
              <button className="btn btn-email" onClick={handleEmailClick}>
                Email us
              </button>
              <button className="btn btn-ghost" onClick={handleCopyEmail}>
                Copy email
              </button>
              <span style={{ fontSize: '0.85rem', color: 'var(--muted)', alignSelf: 'center' }}>
                or reach us at <strong style={{ color: 'var(--white)' }}>{SUPPORT_EMAIL}</strong>
              </span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
