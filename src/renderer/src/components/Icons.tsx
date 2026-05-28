// v2 icon set - small, consistent stroked SVGs sized for the .ibtn buttons (16px) and tabs
// (14-16px). Stroke uses currentColor so .ibtn / .ibtn.on / .tb-search etc. drive the color.
import type React from 'react'

type Props = React.SVGProps<SVGSVGElement> & { size?: number }

const svg = (size: number, children: React.ReactNode, p: Props): React.JSX.Element => (
  <svg
    {...p}
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.6"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    {children}
  </svg>
)

export const Ico = {
  book: (p: Props = {}) =>
    svg(
      p.size ?? 16,
      <>
        <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15.5H6.5A2.5 2.5 0 0 0 4 21V5.5z" />
        <path d="M4 5.5A2.5 2.5 0 0 0 6.5 8H20" />
      </>,
      p
    ),
  shelf: (p: Props = {}) =>
    svg(
      p.size ?? 16,
      <>
        <rect x="3" y="4" width="4" height="16" rx="1" />
        <rect x="9" y="4" width="4" height="16" rx="1" />
        <rect x="15" y="8" width="6" height="12" rx="1" />
      </>,
      p
    ),
  search: (p: Props = {}) =>
    svg(
      p.size ?? 16,
      <>
        <circle cx="11" cy="11" r="6.5" />
        <path d="m20 20-3.6-3.6" />
      </>,
      p
    ),
  sparkle: (p: Props = {}) =>
    svg(
      p.size ?? 16,
      <path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M18 6l-2.5 2.5M8.5 15.5 6 18" />,
      p
    ),
  star: (p: Props = {}) =>
    svg(
      p.size ?? 16,
      <path d="M12 3l2 4 4 1-3 3 1 5-4-2-4 2 1-5-3-3 4-1z" />,
      p
    ),
  edit: (p: Props = {}) =>
    svg(
      p.size ?? 16,
      <>
        <path d="M4 20h4l10-10-4-4L4 16v4z" />
        <path d="m14 6 4 4" />
      </>,
      p
    ),
  toc: (p: Props = {}) =>
    svg(p.size ?? 16, <path d="M4 6h16M4 12h16M4 18h10" />, p),
  bookmark: (p: Props = {}) =>
    svg(p.size ?? 14, <path d="M6 4h12v17l-6-3.5L6 21z" />, p),
  slides: (p: Props = {}) =>
    svg(
      p.size ?? 16,
      <>
        <rect x="3" y="5" width="18" height="13" rx="2" />
        <path d="M9 20h6" />
      </>,
      p
    ),
  info: (p: Props = {}) =>
    svg(
      p.size ?? 16,
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 11v5M12 8h.01" />
      </>,
      p
    ),
  sun: (p: Props = {}) =>
    svg(
      p.size ?? 16,
      <>
        <circle cx="12" cy="12" r="4" />
        <path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.5 5.5l1.4 1.4M17.1 17.1l1.4 1.4M5.5 18.5l1.4-1.4M17.1 6.9l1.4-1.4" />
      </>,
      p
    ),
  moon: (p: Props = {}) =>
    svg(p.size ?? 16, <path d="M20 14.5A8.5 8.5 0 1 1 9.5 4 7 7 0 0 0 20 14.5z" />, p),
  folder: (p: Props = {}) =>
    svg(
      p.size ?? 16,
      <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z" />,
      p
    ),
  download: (p: Props = {}) =>
    svg(p.size ?? 16, <path d="M12 4v12m0 0-4-4m4 4 4-4M4 20h16" />, p),
  plus: (p: Props = {}) => svg(p.size ?? 14, <path d="M12 5v14M5 12h14" />, p),
  close: (p: Props = {}) => svg(p.size ?? 16, <path d="M6 6l12 12M18 6 6 18" />, p),
  arrLeft: (p: Props = {}) => svg(p.size ?? 14, <path d="m14 6-6 6 6 6" />, p),
  arrRight: (p: Props = {}) => svg(p.size ?? 14, <path d="m10 6 6 6-6 6" />, p),
  more: (p: Props = {}) =>
    svg(
      p.size ?? 16,
      <>
        <circle cx="6" cy="12" r="1.6" fill="currentColor" stroke="none" />
        <circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none" />
        <circle cx="18" cy="12" r="1.6" fill="currentColor" stroke="none" />
      </>,
      p
    ),
  check: (p: Props = {}) =>
    svg(
      p.size ?? 16,
      <>
        <rect x="4" y="4" width="16" height="16" rx="2" />
        <path d="m8 12 3 3 6-6" />
      </>,
      p
    ),
  graph: (p: Props = {}) =>
    svg(
      p.size ?? 16,
      <>
        <circle cx="6" cy="6" r="2" />
        <circle cx="18" cy="6" r="2" />
        <circle cx="6" cy="18" r="2" />
        <circle cx="18" cy="18" r="2" />
        <circle cx="12" cy="12" r="2" />
        <path d="m7.5 7.5 3 3M16.5 7.5l-3 3M7.5 16.5l3-3M16.5 16.5l-3-3" />
      </>,
      p
    ),
  card: (p: Props = {}) =>
    svg(
      p.size ?? 16,
      <>
        <rect x="3" y="6" width="14" height="12" rx="1.5" />
        <rect x="7" y="3" width="14" height="12" rx="1.5" />
      </>,
      p
    ),
  layers: (p: Props = {}) =>
    svg(
      p.size ?? 16,
      <>
        <path d="m12 3 9 5-9 5-9-5z" />
        <path d="m3 13 9 5 9-5" />
      </>,
      p
    ),
  type: (p: Props = {}) =>
    svg(p.size ?? 16, <><path d="M4 7V5h16v2" /><path d="M12 5v14" /><path d="M9 19h6" /></>, p),
  cog: (p: Props = {}) =>
    svg(
      p.size ?? 16,
      <>
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.8L4.2 7a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
      </>,
      p
    ),
  tag: (p: Props = {}) =>
    svg(
      p.size ?? 16,
      <>
        <path d="M3 12V5a2 2 0 0 1 2-2h7l9 9-9 9z" />
        <circle cx="8" cy="8" r="1.2" />
      </>,
      p
    ),
  bolt: (p: Props = {}) =>
    svg(p.size ?? 14, <path d="M13 3 4 14h7l-1 7 9-11h-7l1-7z" />, p),
  highlight: (p: Props = {}) =>
    svg(
      p.size ?? 16,
      <>
        <path d="M3 21h6" />
        <path d="m6 18 7-7 4 4-7 7H6v-4z" />
        <path d="M14 5l5 5" />
      </>,
      p
    )
}

export type IcoKey = keyof typeof Ico
