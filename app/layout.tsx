import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Roof Works Admin',
  description: 'Roof Works of Texas — Admin Panel',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
