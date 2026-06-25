// Panel size constraints — mirror the layout tokens in DESIGN.md. These are
// behavioural limits (pixels), consumed by useResizable; colours/spacing still
// come from CSS variables.

export const SIDEBAR = { min: 160, max: 400, default: 220 } as const
export const RIGHT_PANEL = { min: 160, max: 360, default: 200 } as const
export const RESULTS = {
  min: 120,
  default: 200,
  // DESIGN.md caps the results panel at 60% of the window height.
  max: (): number => Math.round(window.innerHeight * 0.6),
} as const
