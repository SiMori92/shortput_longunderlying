/** Brand mark: Brabant's low sun over the garden ground. Decorative; the visible name carries the meaning. */
export function SunMark({ size = 26 }: { size?: number }) {
  return <svg className="sun-mark" width={size} height={size} viewBox="0 0 26 26" aria-hidden="true" focusable="false">
    <path d="M4 17a9 9 0 0 1 18 0z" fill="#d1a93a" />
    <path d="M3.6 15.2a9.6 9.6 0 0 1 6-8.4" fill="none" stroke="#a2432a" strokeWidth="2" strokeLinecap="round" />
    <path d="M2 20.5c4-2 7.5 1.2 11-.3s7.2-1.8 11 .2" fill="none" stroke="#443c6b" strokeWidth="2.4" strokeLinecap="round" />
  </svg>;
}
