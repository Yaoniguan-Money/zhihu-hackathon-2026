import type { SVGProps } from "react";

/**
 * 手写线性图标集（替代 emoji）。统一 24 viewBox、stroke=currentColor。
 */

const PATHS: Record<string, string> = {
  magnifier: "M10.5 4a6.5 6.5 0 1 1 0 13 6.5 6.5 0 0 1 0-13Zm5.2 11.7L20 20",
  mic:
    "M12 3a3 3 0 0 1 3 3v5a3 3 0 0 1-6 0V6a3 3 0 0 1 3-3ZM5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21m-3.5 0h7",
  play: "M8 5.5v13l10.5-6.5L8 5.5Z",
  stop: "M7 7h10v10H7z",
  pin: "M12 3l1.8 4.6L18 9l-3.4 3 .9 5-3.5-2.6L8.5 17l.9-5L6 9l4.2-1.4L12 3Z",
  bolt: "M13 3 5 13.5h5L11 21l8-10.5h-5L13 3Z",
  board:
    "M4 5h16v11H4zM4 5l1.5-2h13L20 5M9 20h6M12 16v4M7.5 9.5h4M7.5 12.5h6",
  file: "M7 3h7l4 4v14H7zM14 3v4h4M10 12h5M10 16h5",
  send: "M4 12 20 4l-4 16-4.5-5.5L4 12Zm7.5 2.5L20 4",
  back: "M14 6l-6 6 6 6",
  next: "M10 6l6 6-6 6",
  alert: "M12 4a8 8 0 1 1 0 16 8 8 0 0 1 0-16Zm0 4v5m0 3v.5",
  check: "M5 12.5 10 17.5 19 7",
  refresh: "M20 12a8 8 0 1 1-2.3-5.6M20 4v4h-4",
  sparkle:
    "M12 4l1.6 4.6L18 10l-4.4 1.4L12 16l-1.6-4.6L6 10l4.4-1.4L12 4Zm7 8 .8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8.8-2.2Z",
  scale: "M12 4v16M6 8h12M6 8l-2.5 6h5L6 8Zm12 0-2.5 6h5L18 8ZM8 20h8",
  home: "M4 11 12 4l8 7M6 10v10h12V10",
  quote:
    "M8 7c-2 1-3 3-3 6v4h5v-6H7c0-2 .5-3 2-4L8 7Zm9 0c-2 1-3 3-3 6v4h5v-6h-3c0-2 .5-3 2-4L17 7Z",
  link: "M9 12h6M9 12a3 3 0 1 0-3-3m3 3a3 3 0 1 1-3 3m12-3a3 3 0 1 0 3-3 3 3 0 0 0-3-3m0 6a3 3 0 1 1 3 3",
  mask: "M4 8c2.5 1.2 5.2 1.8 8 1.8S17.5 9.2 20 8c.4 5.5-2 12-8 12S3.6 13.5 4 8Zm4.5 3.5c.6.8 1.5 1.2 2.5 1.2m4.5-1.2c-.6.8-1.5 1.2-2.5 1.2",
  eye: "M3 12s3.5-6 9-6 9 6 9 6-3.5 6-9 6-9-6-9-6Zm9 2.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z",
  "sound-on":
    "M4 10v4h3l4 3.5v-11L7 10H4Zm11.5-2.5a5.5 5.5 0 0 1 0 9M13.5 10a2.8 2.8 0 0 1 0 4",
  "sound-off": "M4 10v4h3l4 3.5v-11L7 10H4Zm11 0 5 4m0-4-5 4",
};

export type IconName = keyof typeof PATHS | string;

export function Icon({
  name,
  size = 18,
  filled = false,
  ...rest
}: { name: IconName; size?: number; filled?: boolean } & SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth={filled ? 0 : 1.9}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      {...rest}
    >
      <path d={PATHS[name] ?? PATHS.sparkle} />
    </svg>
  );
}
