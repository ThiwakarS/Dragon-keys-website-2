export default function Footer() {
  return (
    <footer className="footer">
      <div className="container">
        <div className="footer-inner">
          <div className="footer-brand">
            <img src="/assets/logo-small.png" alt="DK" className="footer-logo" />
            <span>Dragon Keys</span>
          </div>
          <p className="footer-copy">
            © {new Date().getFullYear()} Dragon Keys. Handcrafted with passion.
            <br />
            Open source designs for personal use only.
          </p>
          <div className="footer-links">
            <a href="/#products">Products</a>
            <a href="/#about">About</a>
          </div>
        </div>
      </div>
    </footer>
  );
}
