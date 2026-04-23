import { useState, useEffect } from 'react';
import { PRODUCTS } from '../data/products.js';
import { POSTS } from '../data/posts.js';
import ProductCard from '../components/ProductCard.jsx';
import ProductModal from '../components/ProductModal.jsx';
import { BlogModal } from '../components/Blog.jsx';
import BlogCarousel from '../components/BlogCarousel.jsx';
import NowPrinting from '../components/NowPrinting.jsx';
import Footer from '../components/Footer.jsx';

export default function Home() {
  const [openProduct, setOpenProduct] = useState(null);
  const [openPost, setOpenPost] = useState(null);

  useEffect(() => {
    if (window.location.hash) {
      const id = window.location.hash.slice(1);
      const el = document.getElementById(id);
      if (el) setTimeout(() => el.scrollIntoView({ behavior: 'smooth' }), 100);
    }
  }, []);

  return (
    <>
      {/* HERO */}
      <section className="hero" id="home">
        <div className="hero-bg-grid" />
        <div className="hero-glow" />
        <div className="hero-content">
          <div className="hero-logo-wrap">
            <img src="/assets/logo-large.png" alt="Dragon Keys" className="hero-logo" />
          </div>
          <p className="hero-tagline">
            Handcrafted. <span className="accent">Open Source.</span> Built for enthusiasts.
          </p>
          <p className="hero-sub">
            Custom keyboards, keychains, and precision 3D-printed parts — made with care, shipped with passion.
          </p>
          <div className="hero-actions">
            <a href="#products" className="btn btn-primary">Explore Products</a>
            <a href="#about" className="btn btn-ghost">Our Story</a>
          </div>
        </div>
        <div className="hero-scroll-hint">
          <span>Scroll</span>
          <div className="scroll-line" />
        </div>
      </section>

      {/* NOW PRINTING — renders nothing if no current printing set */}
      <NowPrinting />

      {/* ABOUT */}
      <section className="about" id="about">
        <div className="container">
          <div className="about-inner">
            <div className="about-badge">About Us</div>
            <h2 className="about-title">
              Made by a maker,<br />
              <span className="accent">for makers.</span>
            </h2>
            <p className="about-text">
              Dragon Keys started as a hobby — a passion for precision, craft, and building things that feel right in your hands. Every keyboard, keychain, and 3D-printed part is designed and assembled by hand.
            </p>
            <p className="about-text">
              The designs are open-sourced for personal use, so the community can build, learn, and iterate. No big factory. No mass production. Just quality, one piece at a time.
            </p>
            <div className="about-stats">
              <div className="stat">
                <span className="stat-num">100%</span>
                <span className="stat-label">Handcrafted</span>
              </div>
              <div className="stat">
                <span className="stat-num">OSS</span>
                <span className="stat-label">Open Source</span>
              </div>
              <div className="stat">
                <span className="stat-num">0</span>
                <span className="stat-label">Mass Production</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* PRODUCTS */}
      <section className="products" id="products">
        <div className="container">
          <div className="section-header">
            <div className="about-badge">Products</div>
            <h2 className="section-title">What we <span className="accent">make.</span></h2>
            <p className="section-sub">Tap a product for details. Order-based items go into our queue — service items route to email.</p>
          </div>
          <div className="products-grid">
            {PRODUCTS.map((p) => (
              <ProductCard key={p.id} product={p} onOpen={setOpenProduct} />
            ))}
          </div>
        </div>
      </section>

      {/* OSS */}
      <section className="oss-section">
        <div className="container">
          <div className="oss-inner">
            <div className="oss-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M12 2C6.477 2 2 6.477 2 12c0 4.418 2.865 8.166 6.839 9.489.5.092.682-.217.682-.482 0-.237-.009-.868-.013-1.703-2.782.604-3.369-1.34-3.369-1.34-.454-1.156-1.11-1.463-1.11-1.463-.908-.62.069-.608.069-.608 1.003.07 1.531 1.03 1.531 1.03.892 1.529 2.341 1.087 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.11-4.555-4.943 0-1.091.39-1.984 1.029-2.683-.103-.253-.446-1.27.098-2.647 0 0 .84-.269 2.75 1.025A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.294 2.747-1.025 2.747-1.025.546 1.377.203 2.394.1 2.647.64.699 1.028 1.592 1.028 2.683 0 3.842-2.339 4.687-4.566 4.935.359.309.678.919.678 1.852 0 1.336-.012 2.415-.012 2.744 0 .267.18.578.688.48C19.138 20.163 22 16.418 22 12c0-5.523-4.477-10-10-10z" />
              </svg>
            </div>
            <div className="oss-text">
              <h3>Open Source — <span className="oss-personal-tag">Personal Use Only</span></h3>
              <p>
                Select designs are shared on GitHub and Cults3D. You're welcome to download, build, and modify them <strong>for your own personal use</strong>. <strong>Commercial use is strictly not permitted</strong>.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* BLOG CAROUSEL */}
      <section className="blog" id="blog">
        <div className="container">
          <div className="section-header">
            <div className="about-badge">Blogs &amp; Notes</div>
            <h2 className="section-title">Thoughts from <span className="accent">the bench.</span></h2>
            <p className="section-sub">Build logs, design notes, and things I figured out the hard way.</p>
          </div>
          <BlogCarousel posts={POSTS} onOpen={setOpenPost} />
        </div>
      </section>

      <Footer />

      {openProduct && <ProductModal product={openProduct} onClose={() => setOpenProduct(null)} />}
      {openPost && <BlogModal post={openPost} onClose={() => setOpenPost(null)} />}
    </>
  );
}