/** Znak NavBajsa. Boje dolaze iz tokena teme. Debljina linije ovisi o veličini prikaza. */
export function LogoMark({ size }: { size: number }) {
  if (size < 24) {
    return (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width={size} height={size} className="block shrink-0" aria-hidden="true">
        <rect width="512" height="512" rx="112" fill="var(--accent)" />
        <path d="M256 430C224 396 146 330 146 226A110 110 0 0 1 366 226C366 330 288 396 256 430Z" fill="var(--logo-ink)" />
        <circle cx="256" cy="226" r="48" fill="var(--accent)" />
        <circle cx="256" cy="226" r="20" fill="var(--logo-ink)" />
      </svg>
    )
  }
  const wheel = size >= 128 ? 20 : size >= 48 ? 26 : 22
  const frame = size >= 128 ? 26 : size >= 48 ? 32 : 28
  const handle = size >= 48
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width={size} height={size} className="block shrink-0" aria-hidden="true">
      <rect width="512" height="512" rx="112" fill="var(--accent)" />
      <g transform="translate(3 6)" fill="none" stroke="var(--logo-ink)" strokeLinecap="round" strokeLinejoin="round">
        <g strokeWidth={wheel}>
          <circle cx="150" cy="280" r="62" />
          <path d="M362 342C348 326 306 296 306 266A56 56 0 0 1 418 266C418 296 376 326 362 342Z" />
        </g>
        <path strokeWidth={frame} d={handle ? "M150 280L212 188H326L362 266M326 188L342 160H366" : "M150 280L212 188H326L362 266"} />
      </g>
    </svg>
  )
}

export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={className ?? "text-[22px] font-semibold leading-none tracking-[-0.02em]"}>
      <span className="text-ink">Nav</span>
      <span className="text-pine">Bajs</span>
    </span>
  )
}
