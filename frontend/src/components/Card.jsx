export default function Card({ className = '', children, ...props }) {
  return <section className={`bg-surface text-content rounded-token shadow-card p-density [border:var(--card-border)] ${className}`} {...props}>{children}</section>
}
