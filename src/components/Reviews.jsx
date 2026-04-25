import { useEffect, useState, useCallback, useRef } from 'react';
import { useUser } from '@clerk/clerk-react';
import { useSupabase } from '../hooks/useSupabase.js';
import { useToast } from '../lib/toast.jsx';

const PREVIEW_COUNT = 3;  // how many reviews to show inline before "Show all"

/* ---------- StarRating ---------- */
function StarRating({ value, onChange, size = 'md', readOnly = false }) {
  const [hover, setHover] = useState(0);
  const display = hover || value || 0;
  const px = size === 'lg' ? 26 : size === 'sm' ? 14 : 18;

  return (
    <div className="stars" role={readOnly ? 'img' : 'radiogroup'} aria-label={`Rating: ${value} of 5`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          className={`star ${n <= display ? 'filled' : ''}`}
          style={{ fontSize: px, cursor: readOnly ? 'default' : 'pointer' }}
          onMouseEnter={() => !readOnly && setHover(n)}
          onMouseLeave={() => !readOnly && setHover(0)}
          onClick={() => !readOnly && onChange?.(n)}
          disabled={readOnly}
          aria-label={`${n} star${n > 1 ? 's' : ''}`}
        >★</button>
      ))}
    </div>
  );
}

/* ---------- ReviewForm ---------- */
function ReviewForm({ initial, onSubmit, onCancel, submitting }) {
  const [rating, setRating] = useState(initial?.rating || 0);
  const [body, setBody]     = useState(initial?.body || '');
  const [err, setErr]       = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (rating < 1) { setErr('Please pick a star rating'); return; }
    onSubmit({ rating, body });
  };

  return (
    <form className="review-form" onSubmit={handleSubmit}>
      <div className="form-group">
        <label className="form-label">Your rating</label>
        <StarRating value={rating} onChange={setRating} size="lg" />
        {err && <div className="form-error">{err}</div>}
      </div>
      <div className="form-group">
        <label className="form-label">Review (optional)</label>
        <textarea
          className="form-textarea"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Share your experience — what went well, what could improve…"
          maxLength={2000}
        />
      </div>
      <div className="flex-row">
        <button type="submit" className="btn btn-primary" disabled={submitting}>
          {submitting ? 'Saving…' : (initial ? 'Update review' : 'Submit review')}
        </button>
        {onCancel && (
          <button type="button" className="btn btn-ghost" onClick={onCancel}>Cancel</button>
        )}
      </div>
    </form>
  );
}

/* ---------- ReviewItem ---------- */
function ReviewItem({ review, mine = false }) {
  return (
    <div className={`review-item ${mine ? 'review-mine' : ''}`}>
      <div className="review-item-head">
        <strong>{review.customer_name}</strong>
        {mine && <span className="review-mine-tag">Your review</span>}
        <StarRating value={review.rating} readOnly size="sm" />
        <span className="review-date">
          {new Date(review.created_at).toLocaleDateString()}
        </span>
      </div>
      {review.body && <p className="review-body">{review.body}</p>}
    </div>
  );
}

/* ---------- AllReviewsModal ---------- */
function AllReviewsModal({ reviews, onClose, currentUserId }) {
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', handler);
      document.body.style.overflow = '';
    };
  }, [onClose]);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 640 }}>
        <button className="modal-close" onClick={onClose}>✕</button>
        <h3 className="modal-title">All reviews</h3>
        <p className="modal-desc">{reviews.length} review{reviews.length === 1 ? '' : 's'}</p>
        <div className="review-list">
          {reviews.map((r) => (
            <ReviewItem key={r.id} review={r} mine={r.clerk_user_id === currentUserId} />
          ))}
        </div>
      </div>
    </div>
  );
}

/* ---------- Main Reviews block ---------- */
export default function Reviews({ productId }) {
  const supabase = useSupabase();
  const { user, isLoaded } = useUser();
  const toast = useToast();

  const [reviews, setReviews]       = useState([]);
  const [loading, setLoading]       = useState(true);
  const [canReview, setCanReview]   = useState(false);
  const [myReview, setMyReview]     = useState(null);
  const [editing, setEditing]       = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [showAll, setShowAll]       = useState(false);

  const supabaseRef = useRef(supabase);
  supabaseRef.current = supabase;

  const refetch = useCallback(async () => {
    const sb = supabaseRef.current;
    if (!sb || !productId) return;

    const { data: list } = await sb
      .from('reviews')
      .select('*')
      .eq('product_id', productId)
      .order('created_at', { ascending: false });
    setReviews(list || []);

    const uid = user?.id;
    if (uid) {
      const mine = (list || []).find((r) => r.clerk_user_id === uid);
      setMyReview(mine || null);

      const { count } = await sb
        .from('orders')
        .select('id', { count: 'exact', head: true })
        .eq('product_id', productId)
        .eq('status', 'delivered');
      setCanReview((count || 0) > 0);
    } else {
      setMyReview(null);
      setCanReview(false);
    }

    setLoading(false);
  }, [productId, user?.id]);

  useEffect(() => {
    if (!supabase || !isLoaded) return;
    refetch();

    const channel = supabase
      .channel('reviews-' + productId + '-' + Math.random().toString(36).slice(2, 8))
      .on('postgres_changes',
          { event: '*', schema: 'public', table: 'reviews', filter: `product_id=eq.${productId}` },
          () => refetch())
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase, productId, isLoaded, user?.id]);

  const avgRating = reviews.length === 0
    ? 0
    : reviews.reduce((s, r) => s + r.rating, 0) / reviews.length;

  const handleSubmit = async ({ rating, body }) => {
    setSubmitting(true);
    const { error } = await supabase.rpc('submit_review', {
      p_product_id: productId,
      p_rating: rating,
      p_body: body || null,
    });
    setSubmitting(false);
    if (error) {
      if (error.message?.includes('not_eligible_to_review')) {
        toast.show('Only customers with a delivered order can review.', 'error', 6000);
      } else {
        toast.show('Could not save review: ' + error.message, 'error');
      }
      return;
    }
    toast.show(myReview ? 'Review updated' : 'Review submitted — thank you!', 'success');
    setEditing(false);
    refetch();
  };

  const handleDelete = async () => {
    if (!myReview) return;
    if (!window.confirm('Delete your review? This cannot be undone.')) return;
    const { error } = await supabase
      .from('reviews')
      .delete()
      .eq('id', myReview.id);
    if (error) toast.show('Failed: ' + error.message, 'error');
    else {
      toast.show('Review deleted', 'success');
      refetch();
    }
  };

  // Build the list shown inline:
  //   - my own review at the top (if any)
  //   - then the most recent N from everyone else
  const otherReviews = reviews.filter((r) => r.clerk_user_id !== user?.id);
  const previewOthers = otherReviews.slice(0, PREVIEW_COUNT);
  const hasMore = otherReviews.length > PREVIEW_COUNT;

  return (
    <div className="reviews-block">
      <div className="reviews-head">
        <h4 className="reviews-title">Reviews</h4>
        {reviews.length > 0 && (
          <div className="reviews-avg">
            <StarRating value={Math.round(avgRating)} readOnly size="sm" />
            <span className="reviews-avg-text">
              {avgRating.toFixed(1)} · {reviews.length} review{reviews.length > 1 ? 's' : ''}
            </span>
          </div>
        )}
      </div>

      {/* User's own review — edit / delete */}
      {user && myReview && !editing && (
        <ReviewItem review={myReview} mine />
      )}
      {user && myReview && !editing && (
        <div className="flex-row" style={{ marginBottom: 16, marginTop: -6 }}>
          <button className="btn btn-ghost btn-small" onClick={() => setEditing(true)}>Edit</button>
          <button className="btn btn-ghost btn-small" onClick={handleDelete}>Delete</button>
        </div>
      )}

      {/* Form — new review or edit */}
      {user && canReview && (editing || !myReview) && (
        <div className="review-form-wrap">
          <div style={{ fontSize: '0.88rem', color: 'var(--muted)', marginBottom: 12 }}>
            {myReview ? 'Edit your review' : 'Share your experience'}
          </div>
          <ReviewForm
            initial={editing ? myReview : null}
            onSubmit={handleSubmit}
            onCancel={editing ? () => setEditing(false) : null}
            submitting={submitting}
          />
        </div>
      )}

      {/* Ineligible message */}
      {user && !canReview && !myReview && !loading && (
        <div style={{
          padding: '10px 14px',
          borderRadius: 8,
          border: '1px solid var(--border)',
          background: 'var(--card-2)',
          fontSize: '0.86rem',
          color: 'var(--muted)',
          marginBottom: 16,
        }}>
          Reviews open up once you have a delivered order for this product.
        </div>
      )}

      {/* Other reviews — capped list */}
      {loading ? (
        <div style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>Loading reviews…</div>
      ) : otherReviews.length === 0 ? (
        <div style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>
          {myReview ? 'No other reviews yet.' : 'No reviews yet.'}
        </div>
      ) : (
        <>
          <div className="review-list">
            {previewOthers.map((r) => (
              <ReviewItem key={r.id} review={r} />
            ))}
          </div>
          {hasMore && (
            <div style={{ marginTop: 14, textAlign: 'center' }}>
              <button
                className="btn btn-ghost btn-small"
                onClick={() => setShowAll(true)}
              >
                Show all {reviews.length} reviews →
              </button>
            </div>
          )}
        </>
      )}

      {/* Full-list modal */}
      {showAll && (
        <AllReviewsModal
          reviews={reviews}
          currentUserId={user?.id}
          onClose={() => setShowAll(false)}
        />
      )}
    </div>
  );
}