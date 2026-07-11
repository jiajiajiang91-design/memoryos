// 星图视口纯函数（拖拽缩放）。只做 viewBox 数学，不碰 DOM 和 React，
// 事件接线在 EntryLibraryPage 的 GraphView 里。

export type ViewBox = { x: number; y: number; w: number; h: number };

/**
 * 以世界坐标 (cx, cy) 为不动点缩放。factor 大于 1 放大（视口变小）。
 * 视口宽度夹在 [minW, maxW]，高度按原比例跟随。
 */
export function zoomViewBox(
  v: ViewBox,
  factor: number,
  cx: number,
  cy: number,
  minW: number,
  maxW: number
): ViewBox {
  const ratio = v.h / v.w;
  const w = Math.min(maxW, Math.max(minW, v.w / factor));
  const s = w / v.w;
  return {
    x: cx - (cx - v.x) * s,
    y: cy - (cy - v.y) * s,
    w,
    h: w * ratio,
  };
}

/** 平移：世界坐标增量直接加。拖背景时传负的指针位移。 */
export function panViewBox(v: ViewBox, dx: number, dy: number): ViewBox {
  return { ...v, x: v.x + dx, y: v.y + dy };
}

/**
 * 屏幕像素位移换算成世界坐标位移。svg 用 viewBox 且整幅等比渲染，
 * 比例就是视口宽除以元素像素宽。
 */
export function clientDeltaToWorld(
  v: ViewBox,
  clientWidth: number,
  dxPx: number,
  dyPx: number
): { dx: number; dy: number } {
  const s = clientWidth > 0 ? v.w / clientWidth : 0;
  return { dx: dxPx * s, dy: dyPx * s };
}

/** 屏幕上一个点换算成世界坐标，滚轮缩放的不动点用。 */
export function clientPointToWorld(
  v: ViewBox,
  rect: { left: number; top: number; width: number; height: number },
  clientX: number,
  clientY: number
): { x: number; y: number } {
  const px = rect.width > 0 ? (clientX - rect.left) / rect.width : 0;
  const py = rect.height > 0 ? (clientY - rect.top) / rect.height : 0;
  return { x: v.x + px * v.w, y: v.y + py * v.h };
}
