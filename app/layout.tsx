import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "浅草おにぎりデリバリー | Asakusa Onigiri Delivery",
  description: "Artisanal Tokyo Onigiri Breakfast Box Delivered to Your Hotel",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <head>
        <script src="https://cdn.tailwindcss.com"></script>
      </head>
      <body className="antialiased min-h-screen bg-[#f7f5f0] text-[#2d2926]">
        {children}
      </body>
    </html>
  );
}