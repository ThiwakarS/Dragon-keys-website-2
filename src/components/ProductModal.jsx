import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useToast } from '../lib/toast.jsx';

// Email routing:
//   - "queue" products go through the booking form (no email needed)
//   - "email" products (keychain, build service) go to ORDERS inbox
const ORDERS_EMAIL  = import.meta.env.VITE_ORDERS_EMAIL  || 'orders@dragonkeys.dev';
const SUPPORT_EMAIL = import.meta.env.VITE_SUPPORT_EMAIL || 'support@dragonkeys.dev';

const NOTE_STYLES = {
  info:    { border: 'var(--border)',          icon: 'ℹ',  color: 'var(--muted)' },
  caution: { border: 'rgba(242,184,75,0.4)',   icon: '⚠',  color: '#f2b84b' },
  tip:     { border: 'rgba(58,180,242,0.35)',  icon: '💡', color: 'var(--blue)' },
};

/* ---------- Media helpers ---------- */

function getYouTubeId(src) {
  if (!src || typeof src !== 'string') return null;
  if (src.startsWith('youtube:')) return src.slice(8);
  const m = src.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&?/]+)/);
  return m ? m[1] : null;
}

function detectMediaType(src) {
  if (!src) return null;
  if (getYouTubeId(src)) return 'youtube';
  if (/\.(mp4|webm|mov|ogg)(\?.*)?$/i.test(src)) return 'video';
  return 'image';
}

function MediaView({ src, alt }) {
  const type = detectMediaType(src);
  if (type === 'youtube') {
    const id = getYouTubeId(src);
    return (
      <div className="gallery-youtube">
        <iframe
          src={`https://www.youtube.com/embed/${id}`}
          title={alt}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        />
      </div>
    );
  }
  if (type === 'video') return <video src={src} controls preload="metadata" key={src} />;
  return <img src={src} alt={alt} />;
}

function Thumb({ src, active, onClick }) {
  const type = detectMediaType(src);
  const className = `gallery-thumb ${active ? 'active' : ''}`;

  if (type === 'youtube') {
    const id = getYouTubeId(src);
    return (
      <button className={className} onClick={onClick} type="button" aria-label="YouTube video">
        <img src={`https://img.youtube.com/vi/${id}/default.jpg`} alt="" />
        <span className="gallery-thumb-badge">▶</span>
      </button>
    );
  }
  if (type === 'video') {
    return (
      <button className={className} onClick={onClick} type="button" aria-label="Video">
        <video src={src} muted preload="metadata" />
        <span className="gallery-thumb-badge">▶</span>
      </button>
    );
  }
  return (
    <button className={className} onClick={onClick} type="button" aria-label="Image">
      <img src={src} alt="" loading="lazy" />
    </button>
  );
}

function Gallery({ media, alt }) {
  const [index, setIndex] = useState(0);
  const total = media.length;

  const prev = useCallback(() => setIndex((i) => (i - 1 + total) % total), [total]);
  const next = useCallback(() => setIndex((i) => (i + 1) % total), [total]);

  useEffect(() => {
    if (total <= 1) return;
    const handler = (e) => {
      if (e.key === 'ArrowLeft') prev();
      else if (e.key === 'ArrowRight') next();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [prev, next, total]);

  if (total === 0) return null;

  return (
    <div className="gallery">
      <div className="gallery-main">
        <MediaView src={media[index]} alt={alt} />
        {total > 1 && (
          <>
            <button className="gallery-nav gallery-prev" onClick={prev} aria-label="Previous" type="button">←</button>
            <button className="gallery-nav gallery-next" onClick={next} aria-label="Next" type="button">→</button>
            <div className="gallery-counter">{index + 1} / {total}</div>
          </>
        )}
      </div>
      {total > 1 && (
        <div className="gallery-thumbs">
          {media.map((src, i) => (
            <Thumb key={i} src={src} active={i === index} onClick={() => setIndex(i)} />
          ))}
        </div>
      )}
    </div>
  );
}

/* ---------- Main modal ---------- */

export default function ProductModal({ product, onClose }) {
  const navigate = useNavigate();
  const toast = useToast();

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

  const media = (product.images || []).filter(Boolean);
  const hasOss = product.openSource?.github || product.openSource?.cults3d;

  // Always route email-fulfillment CTAs to the ORDERS inbox
  const contactEmail = ORDERS_EMAIL;

  const handleEmailClick = () => {
    const subject = encodeURIComponent(`Order enquiry: ${product.name}`);
    const body = encodeURIComponent(
      `Hi,\n\nI'd like to place an order for the ${product.name}.\n\nDetails / requirements:\n\n\nThanks,\n`
    );
    window.location.href = `mailto:${contactEmail}?subject=${subject}&body=${body}`;
  };

  const handleCopyEmail = async () => {
    try {
      await navigator.clipboard.writeText(contactEmail);
      toast.show(`Copied to clipboard: ${contactEmail}`, 'success');
    } catch {
      toast.show(`Couldn't copy. Email us at: ${contactEmail}`, 'error', 6000);
    }
  };

  const handleOrder = () => {
    onClose();
    navigate(`/order/${product.id}`);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 720 }}>
        <button className="modal-close" onClick={onClose}>✕</button>

        {media.length > 0 && <Gallery media={media} alt={product.name} />}

        <span className="product-tag" style={{ marginBottom: 10 }}>{product.category}</span>
        <h3 className="modal-title">{product.name}</h3>
        <p className="modal-desc">{product.description}</p>
        <div className="product-price" style={{ marginBottom: 20 }}>{product.price}</div>

        {product.specs?.length > 0 && (
          <div style={{ marginBottom: 20 }}>
            {product.specs.map((group, gi) => (
              <div key={gi} style={{ marginBottom: 16 }}>
                <div style={{
                  fontFamily: 'var(--font-display)',
                  fontSize: '0.75rem',
                  fontWeight: 700,
                  letterSpacing: '0.12em',
                  textTransform: 'uppercase',
                  color: 'var(--blue)',
                  marginBottom: 8,
                }}>
                  {group.label}
                </div>
                {group.rows?.map((row, ri) => (
                  <div key={ri} style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    gap: 16,
                    padding: '8px 0',
                    borderBottom: '1px solid var(--border)',
                    fontSize: '0.9rem',
                  }}>
                    <span style={{ color: 'var(--muted)', flexShrink: 0 }}>{row.key}</span>
                    <span style={{ textAlign: 'right' }}>{row.value}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}

        {product.notes?.length > 0 && (
          <div style={{ marginBottom: 20, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {product.notes.map((note, i) => {
              const style = NOTE_STYLES[note.type] || NOTE_STYLES.info;
              return (
                <div key={i} style={{
                  padding: '10px 14px',
                  borderRadius: 8,
                  border: `1px solid ${style.border}`,
                  background: 'var(--card-2)',
                  fontSize: '0.87rem',
                  lineHeight: 1.6,
                  display: 'flex',
                  gap: 10,
                }}>
                  <span style={{ color: style.color, flexShrink: 0, marginTop: 1 }}>{style.icon}</span>
                  <span
                    style={{ color: 'var(--muted)' }}
                    dangerouslySetInnerHTML={{ __html: note.text }}
                  />
                </div>
              );
            })}
          </div>
        )}

        {hasOss && (
          <div style={{
            marginBottom: 20,
            padding: 14,
            background: 'var(--card-2)',
            borderRadius: 10,
            border: '1px solid var(--border)',
          }}>
            <div style={{
              fontFamily: 'var(--font-display)',
              fontSize: '0.75rem',
              fontWeight: 700,
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
              color: 'var(--blue)',
              marginBottom: 10,
            }}>
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

        <div className="flex-row">
          {product.fulfillment === 'queue' ? (
            <button className="btn btn-primary" onClick={handleOrder}>
              Order Now →
            </button>
          ) : (
            <>
              <button className="btn btn-email" onClick={handleEmailClick}>
                Email to order
              </button>
              <button className="btn btn-ghost" onClick={handleCopyEmail}>
                Copy email
              </button>
              <span style={{ fontSize: '0.85rem', color: 'var(--muted)', alignSelf: 'center' }}>
                {contactEmail}
              </span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}