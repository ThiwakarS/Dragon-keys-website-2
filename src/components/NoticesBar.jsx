import { useState, useEffect, useCallback, useRef } from 'react';
import { useSupabase } from '../hooks/useSupabase.js';

/**
 * Homepage notices bar. Reads active notices from the DB and
 * displays them above-the-fold, sorted newest first. Realtime —
 * admin edits show up instantly for everyone.
 */
const STYLES = {
  info:    { icon: 'ℹ', color: '#3ab4f2', border: 'rgba(58,180,242,0.4)'  },
  success: { icon: '✓', color: '#4ade80', border: 'rgba(74,222,128,0.4)'  },
  warning: { icon: '⚠', color: '#f2b84b', border: 'rgba(242,184,75,0.45)' },
  danger:  { icon: '⛔', color: '#f24b4b', border: 'rgba(242,75,75,0.5)'   },
};

export default function NoticesBar() {
  const supabase = useSupabase();
  const [notices, setNotices] = useState([]);
  const supabaseRef = useRef(supabase);
  supabaseRef.current = supabase;

  const fetchAll = useCallback(async () => {
    const sb = supabaseRef.current;
    if (!sb) return;
    const { data, error } = await sb
      .from('notices')
      .select('*')
      .eq('active', true)
      .order('created_at', { ascending: false });
    if (!error) setNotices(data || []);
  }, []);

  useEffect(() => {
    if (!supabase) return;
    fetchAll();

    const channel = supabase
      .channel('notices-public-' + Math.random().toString(36).slice(2, 8))
      .on('postgres_changes',
          { event: '*', schema: 'public', table: 'notices' },
          () => fetchAll())
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase]);

  if (notices.length === 0) return null;

  return (
    <section className="notices-bar">
      <div className="container">
        <div className="notices-list">
          {notices.map((n) => {
            const s = STYLES[n.level] || STYLES.info;
            return (
              <div
                key={n.id}
                className="notice-item"
                style={{
                  borderLeft: `4px solid ${s.color}`,
                  borderColor: s.border,
                }}
              >
                <span className="notice-icon" style={{ color: s.color }}>{s.icon}</span>
                <span className="notice-text">{n.message}</span>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}