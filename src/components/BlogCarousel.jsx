import { useRef, useState, useEffect, useCallback } from 'react';
import { BlogCard } from './Blog.jsx';

/**
 * Horizontal carousel for blog posts.
 * - Fixed card width (320px) so layout doesn't stretch
 * - 1 post → centered
 * - 2 posts → side by side, centered
 * - 3+ posts → scrollable with arrow buttons
 * Posts are shown in the order of the POSTS array (first = newest = leftmost).
 */
export default function BlogCarousel({ posts, onOpen }) {
  const trackRef = useRef(null);
  const [atStart, setAtStart] = useState(true);
  const [atEnd, setAtEnd]     = useState(true);

  const updateArrows = useCallback(() => {
    const el = trackRef.current;
    if (!el) return;
    setAtStart(el.scrollLeft <= 8);
    // 8px tolerance for floating-point rounding
    setAtEnd(el.scrollLeft + el.clientWidth >= el.scrollWidth - 8);
  }, []);

  useEffect(() => {
    updateArrows();
    const el = trackRef.current;
    if (!el) return;

    el.addEventListener('scroll', updateArrows, { passive: true });
    window.addEventListener('resize', updateArrows);
    return () => {
      el.removeEventListener('scroll', updateArrows);
      window.removeEventListener('resize', updateArrows);
    };
  }, [updateArrows, posts.length]);

  const scrollBy = (amount) => {
    trackRef.current?.scrollBy({ left: amount, behavior: 'smooth' });
  };

  if (!posts || posts.length === 0) return null;

  // Step size — roughly one card + gap
  const STEP = 340;

  // Hide arrows entirely if everything fits in view (≤ 2 cards most likely)
  const showArrows = !(atStart && atEnd);

  return (
    <div className="blog-carousel">
      {showArrows && (
        <button
          className="blog-carousel-arrow blog-carousel-prev"
          onClick={() => scrollBy(-STEP)}
          disabled={atStart}
          aria-label="Older posts"
          type="button"
        >←</button>
      )}

      <div
        className={`blog-carousel-track ${posts.length <= 2 ? 'blog-carousel-track-centered' : ''}`}
        ref={trackRef}
      >
        {posts.map((p) => (
          <div className="blog-carousel-slot" key={p.id}>
            <BlogCard post={p} onOpen={onOpen} />
          </div>
        ))}
      </div>

      {showArrows && (
        <button
          className="blog-carousel-arrow blog-carousel-next"
          onClick={() => scrollBy(STEP)}
          disabled={atEnd}
          aria-label="Older posts"
          type="button"
        >→</button>
      )}
    </div>
  );
}