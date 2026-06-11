// 品牌徽标（2026-06-11 按参考稿重做）：圆角菱形 + 白色四角星光。
// 菱形渐变 亮蓝→克莱因蓝（参考稿如此；按钮等控件仍守纯色纪律）。
// SVG 内联绘制保证任意尺寸锐利；gradient id 用 useId 防多实例冲突。

import { useId } from "react";

export default function BrandMark({ size = 56, className = "" }: { size?: number; className?: string }) {
  const gid = useId();
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={gid} x1="14" y1="8" x2="52" y2="58" gradientUnits="userSpaceOnUse">
          <stop stopColor="#4F6FFF" />
          <stop offset="1" stopColor="#002FA7" />
        </linearGradient>
      </defs>
      {/* 圆角方块旋转 45° = 菱形 */}
      <rect
        x="13"
        y="13"
        width="38"
        height="38"
        rx="9.5"
        transform="rotate(45 32 32)"
        fill={`url(#${gid})`}
      />
      {/* 内描边：一圈极淡的白，给菱形一点玻璃感 */}
      <rect
        x="15.2"
        y="15.2"
        width="33.6"
        height="33.6"
        rx="7.5"
        transform="rotate(45 32 32)"
        stroke="rgba(255,255,255,0.28)"
        strokeWidth="1.2"
        fill="none"
      />
      {/* 白色四角星光 */}
      <path
        d="M32 17.5
           C 33.6 26.4, 37.6 30.4, 46.5 32
           C 37.6 33.6, 33.6 37.6, 32 46.5
           C 30.4 37.6, 26.4 33.6, 17.5 32
           C 26.4 30.4, 30.4 26.4, 32 17.5 Z"
        fill="#fff"
      />
    </svg>
  );
}
