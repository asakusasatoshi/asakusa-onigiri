import Script from 'next/script';

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ja">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        {/* Next.jsの正しい作法でTailwindのCDNを読み込み直します */}
        <Script src="https://cdn.tailwindcss.com" strategy="beforeInteractive" />
      </head>
      <body className="antialiased min-h-screen bg-[#fafaf9] text-[#2d2926]">
        {children}
      </body>
    </html>
  );
}