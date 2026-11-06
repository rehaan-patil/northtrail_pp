import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Northtrail — Know the choice. Prove the outcome.',
  description:
    'Review trade evidence, understand authority, and verify outcomes. Northtrail developer preview.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}