import { Link } from 'react-router-dom';

export default function NotFound() {
  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      textAlign: 'center',
      padding: 24,
    }}>
      <img src="/assets/logo-small.png" alt="DK" style={{ height: 64, marginBottom: 40, opacity: 0.9 }} />
      <div style={{
        fontFamily: 'var(--font-display)',
        fontSize: 'clamp(5rem, 20vw, 9rem)',
        fontWeight: 800,
        color: 'var(--blue)',
        lineHeight: 1,
        letterSpacing: '-0.04em',
        opacity: 0.25,
        marginBottom: 8,
      }}>
        404
      </div>
      <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(1.4rem, 4vw, 2rem)', fontWeight: 800, marginBottom: 12 }}>
        Page not found.
      </h1>
      <p style={{ color: 'var(--muted)', maxWidth: 380, lineHeight: 1.65, marginBottom: 36 }}>
        This page doesn't exist or was moved.
      </p>
      <Link to="/" className="btn btn-primary">← Back to Dragon Keys</Link>
    </div>
  );
}
