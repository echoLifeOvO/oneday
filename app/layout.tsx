import type { Metadata, Viewport } from "next";
import "maplibre-gl/dist/maplibre-gl.css";
import "./globals.css";
import { LocaleProvider } from "@/components/locale-provider";
import VisualViewport from "@/components/visual-viewport";

export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover", interactiveWidget: "resizes-content", themeColor: "#f7f3eb" };

export const metadata: Metadata = {
  description:
    "在地球上留下一天。看看不同地方的人，花了多少钱，怎样度过，又有什么感受。",
  icons: { icon: "/favicon.svg" },
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body><VisualViewport/><LocaleProvider>{children}</LocaleProvider></body>
    </html>
  );
}
