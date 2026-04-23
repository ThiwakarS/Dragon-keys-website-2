const SUPPORT_EMAIL = import.meta.env.VITE_SUPPORT_EMAIL || 'support@dragonkeys.dev';

export default function Footer() {
  return (
    <footer className="footer">
      <div className="container">
        <div className="footer-inner">
          <div className="footer-brand">
            <img src="/assets/logo-small.png" alt="DK" className="footer-logo" />
            <span>Dragon Keys</span>
          </div>

          <div className="footer-copy">
            <div>© {new Date().getFullYear()} Dragon Keys. Handcrafted with passion.</div>
            <div style={{ marginTop: 4 }}>Open source designs for personal use only.</div>
            <div style={{ marginTop: 10 }}>
              <span style={{ color: 'var(--muted)', fontSize: '0.82rem', marginRight: 6 }}>
                Support:
              </span>
              <a
                href={`mailto:${SUPPORT_EMAIL}`}
                style={{
                  color: 'var(--blue)',
                  textDecoration: 'none',
                  fontFamily: 'var(--font-display)',
                  fontSize: '0.85rem',
                  letterSpacing: '0.03em',
                }}
              >
                {SUPPORT_EMAIL}
              </a>
            </div>
          </div>

          <div className="footer-links">
            <a href="/#products">Products</a>
            <a href="/#about">About</a>
          </div>
        </div>
      </div>
    </footer>
  );
}