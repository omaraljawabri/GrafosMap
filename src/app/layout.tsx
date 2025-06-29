
import type { Metadata } from 'next';
import './globals.css';
import Footer from './_components/footer';
import { Toaster } from './_components/ui/toaster';

export const metadata: Metadata = {
  title: 'GrafosMap',
  description: 'Welcome to GrafosMap',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark"><head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
        <link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;700&display=swap" rel="stylesheet" />
      </head><body className="font-body antialiased flex flex-col min-h-screen bg-background">

        <main className="flex-grow">
          {children}
        </main>
        <Footer />
        <Toaster /></body></html>
  );
}
