export interface LayoutRect {
  x: number
  y: number
  width: number
  height: number
}

/**
 * Layout rect of `element` in `container`'s padding-box coordinates, ignoring
 * CSS transforms. The share previews pop with a scale while the forge reads
 * the badge, so getBoundingClientRect would report the scaled rect.
 */
export function layoutRectWithin(
  element: HTMLElement,
  container: HTMLElement,
): LayoutRect | null {
  const width = element.offsetWidth
  const height = element.offsetHeight
  if (width < 1 || height < 1) return null

  let x = 0
  let y = 0
  let node: HTMLElement | null = element

  while (node && node !== container) {
    x += node.offsetLeft
    y += node.offsetTop
    node = node.offsetParent as HTMLElement | null
  }

  if (node !== container) return null

  return { x, y, width, height }
}
