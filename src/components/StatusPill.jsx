import { STATUS_LABELS } from '../lib/utils.js';

export default function StatusPill({ status }) {
  return (
    <span className={`status-pill status-${status}`}>
      {STATUS_LABELS[status] || status}
    </span>
  );
}
