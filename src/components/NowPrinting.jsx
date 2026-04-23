import { useState, useEffect } from 'react';
import { useSupabase } from '../hooks/useSupabase.js';

/**
 * "Now printing" banner — reads from the public_now_printing view,
 * which only exposes product_id, product_name, queue_number. No user data.
 * Renders nothing if no product is currently printing.
 */
export default function NowPrinting() {
  const supabase = useSupabase();
  const [items, setItems] = useState([]);

  useEffect(() => {
    if (!supabase) return;
    let cancelled = false;

    const fetch = async () => {
      const { data, error } = await supabase
        .from('public_now_printing')
        .select('*');
      if (cancelled) return;
      if (!error && data) setItems(data);
    };

    fetch();

    // Realtime: when admin flips is_current, refetch
    const channel = supabase
      .channel('public-now-printing')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => fetch())
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [supabase]);

  if (items.length === 0) return null;

  return (
    <section className="now-printing">
      <div className="container">
        <div className="now-printing-inner">
          <div className="now-printing-label">
            <span className="now-printing-dot" />
            Currently Printing
          </div>
          <div className="now-printing-list">
            {items.map((it) => (
              <div key={it.product_id} className="now-printing-item">
                <span className="now-printing-num">#{it.queue_number}</span>
                <span className="now-printing-product">{it.product_name}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}