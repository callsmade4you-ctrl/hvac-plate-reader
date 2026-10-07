import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Platewise | HVAC Intelligence',
  description: 'HVAC rating plate OCR and replacement equipment matching.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
