import { useEffect, useState } from 'react';
import { renderMarkdown } from '../lib/markdown.jsx';

export function BlogCard({ post, onOpen }) {
  return (
    <article className="blog-card" onClick={() => onOpen(post)}>
      {post.coverImage && (
        <div className="blog-cover">
          <img src={post.coverImage} alt={post.title} loading="lazy" />
        </div>
      )}
      <div className="blog-body">
        <div className="blog-meta">
          <span className="blog-post-tag">{post.category}</span>
          <span>{post.date}</span>
        </div>
        <h3 className="blog-title">{post.title}</h3>
        <p className="blog-summary">{post.summary}</p>
      </div>
    </article>
  );
}

export function BlogModal({ post, onClose }) {
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', handler);
      document.body.style.overflow = '';
    };
  }, [onClose]);

  if (!post) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 760 }}>
        <button className="modal-close" onClick={onClose} aria-label="Close">✕</button>

        {post.coverImage && (
          <div style={{ marginBottom: 24, aspectRatio: '16 / 9', overflow: 'hidden', borderRadius: 10 }}>
            <img src={post.coverImage} alt={post.title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          </div>
        )}

        <div className="blog-meta" style={{ marginBottom: 12 }}>
          <span className="blog-post-tag">{post.category}</span>
          <span>{post.date}</span>
        </div>

        <h2 className="modal-title" style={{ fontSize: '1.9rem' }}>{post.title}</h2>

        <div className="blog-modal-content" style={{ marginTop: 24, lineHeight: 1.8, color: 'var(--white)' }}>
          {renderMarkdown(post.content)}
        </div>
      </div>
    </div>
  );
}
