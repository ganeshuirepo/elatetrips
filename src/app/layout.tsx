import type { Metadata } from 'next';
import { Cormorant_Garamond, Plus_Jakarta_Sans } from 'next/font/google';
import './globals.css';
import StoreProvider from '@/store/StoreProvider';
import ThemeRegistry from '@/theme/ThemeRegistry';

// Luxury type pairing: Cormorant Garamond (display serif) + Plus Jakarta Sans (UI).
const cormorant = Cormorant_Garamond({
  variable: '--font-serif-lux',
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  display: 'swap',
});

const jakarta = Plus_Jakarta_Sans({
  variable: '--font-sans-lux',
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700', '800'],
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'ElateTrips — Plan your perfect celebration trip',
  description: 'Celebration-first travel: where, when, who and what — booked together in one go.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${cormorant.variable} ${jakarta.variable} h-full`}>
      <body className="min-h-full">
        <StoreProvider>
          <ThemeRegistry>{children}</ThemeRegistry>
        </StoreProvider>
      </body>
    </html>
  );
}
