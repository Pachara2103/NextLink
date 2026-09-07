import type { Metadata } from "next";
import { Anuphan, Bai_Jamjuree, IBM_Plex_Mono } from "next/font/google";
import { IconSprite } from "@/components/icons";
import { AuthProvider } from "@/store/auth-store";
import "./globals.css";

const anuphan = Anuphan({
  variable: "--font-anuphan",
  subsets: ["latin", "thai"],
  display: "swap",
});

const baiJamjuree = Bai_Jamjuree({
  variable: "--font-bai-jamjuree",
  subsets: ["latin", "thai"],
  weight: ["500", "600", "700"],
  display: "swap",
});

const plexMono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "NextLink AI Console",
  description:
    "ระบบผู้ช่วย AI สรุปข้อมูลผู้ประสานงานอัตโนมัติจาก Group Line และจัดการการผูกกลุ่มไลน์กับบริษัท",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="th"
      className={`${anuphan.variable} ${baiJamjuree.variable} ${plexMono.variable} h-full antialiased`}
    >
      <body className="min-h-full bg-bg font-body text-text-2">
        <IconSprite />
        {/* Both the login page and the console read the same session. */}
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
