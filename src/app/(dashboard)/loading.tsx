/**
 * Loading state (workbook §6.9): fixed-size skeletons inside the mounted shell, so the topbar's Run now
 * and navigation never move. The heading shows the field's underpaint only; no brushwork is drawn until
 * the real page decides its seed, so imagery never reshuffles.
 */
export default function Loading() {
  return <div className="page-stack" aria-busy="true">
    <p className="sr-only" role="status">Loading page…</p>
    <div className="page-heading loading-heading" aria-hidden="true"><div className="page-plaque"><div className="skeleton w40" /><div className="skeleton tall w60" /><div className="skeleton w80" /></div></div>
    <div className="metric-grid" aria-hidden="true">{[0, 1, 2, 3].map(i => <div className="card metric" key={i}><div className="skeleton w40" /><div className="skeleton tall w60" /><div className="skeleton w80" /></div>)}</div>
    <div className="card loading-card" aria-hidden="true"><div className="skeleton w40" /><div className="skeleton w80" /><div className="skeleton w60" /><div className="skeleton w80" /></div>
  </div>;
}
