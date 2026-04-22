import { useNavigate } from 'react-router-dom';

export default function ProductCard({ product, onOpen }) {
  const navigate = useNavigate();
  const primaryImage = product.images?.[0];

  const throughputLabel = () => {
    if (product.fulfillment !== 'queue' || !product.throughputPerDay) return null;
    const t = product.throughputPerDay;
    if (t >= 1) return `Ships ${Math.round(t)} per day`;
    const days = Math.round(1 / t);
    return `Ships 1 every ${days} day${days === 1 ? '' : 's'}`;
  };

  return (
    <article className="product-card" onClick={() => onOpen(product)}>
      <div className="product-img">
        {primaryImage ? (
          <img src={primaryImage} alt={product.name} loading="lazy" />
        ) : (
          <div className="product-img-placeholder">No photo yet</div>
        )}
      </div>
      <div className="product-body">
        <span className="product-tag">{product.category}</span>
        <h3 className="product-name">{product.name}</h3>
        <p className="product-desc">{product.description}</p>
        <div className="product-price">{product.price}</div>
        {throughputLabel() && (
          <div className="product-throughput">{throughputLabel()}</div>
        )}
      </div>
    </article>
  );
}
