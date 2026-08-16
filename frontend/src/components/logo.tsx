const MARK_PATH =
  "M5.66 9.89C6.98 19.38 8.95 23.9 10.92 23.9C12.9 23.9 15.4 15.35 16 15.35C16.6 15.35 19.1 23.9 21.08 23.9C23.05 23.9 25.02 19.38 26.34 9.89"

export function Logo({ className }: { className?: string }) {
  return (
    <svg
      className={`logo ${className ?? ""}`}
      viewBox="0 0 32 32"
      aria-hidden="true"
    >
      {/* 落地投影：主体沿地平线 y=25.4 压扁斜切而成 */}
      <g
        opacity=".28"
        transform="translate(0 25.4) skewX(-46) scale(1 .2) translate(0 -25.4)"
      >
        <path
          className="stroke-foreground"
          d={MARK_PATH}
          fill="none"
          strokeWidth="3.01"
          strokeLinecap="round"
        />
        <circle className="fill-foreground" cx="16" cy="8.29" r="2.07" />
      </g>
      <path
        className="stroke-foreground"
        d={MARK_PATH}
        fill="none"
        strokeWidth="3.01"
        strokeLinecap="round"
      />
      <circle className="dot fill-foreground" cx="16" cy="8.29" r="2.07" />
    </svg>
  )
}
