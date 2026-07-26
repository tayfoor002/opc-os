export function StatCard({
  label,
  value,
  detail
}: {
  label: string;
  value: string | number;
  detail: string;
}) {
  return (
    <article className="statCard">
      <span className="statLabel">{label}</span>
      <strong>{value}</strong>
      <small>{detail}</small>
    </article>
  );
}
