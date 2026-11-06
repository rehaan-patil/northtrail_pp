import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import Script from 'next/script';

import './globals.css';
import './workspace-theme.css';

export const metadata: Metadata = {
  title: 'Northtrail — Trade Review Workspace',
  description:
    'Compare DeFi quotes, review execution economics, analyze risk and preserve verifiable decision evidence.',
  applicationName: 'Northtrail',
  keywords: [
    'Northtrail',
    'DeFi',
    'Ethereum',
    'Trade Intelligence',
    'Execution Assurance',
    'Uniswap',
  ],
};

const themeBootstrap = `
(function () {
  try {
    var savedTheme = localStorage.getItem('northtrail-theme');

    var theme =
      savedTheme === 'light' || savedTheme === 'dark'
        ? savedTheme
        : (
            window.matchMedia(
              '(prefers-color-scheme: dark)'
            ).matches
              ? 'dark'
              : 'light'
          );

    document.documentElement.dataset.theme = theme;
  } catch (error) {
    document.documentElement.dataset.theme =
      window.matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light';
  }
})();
`;

export default function RootLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <meta
          name="theme-color"
          content="#ffffff"
        />

        <meta
          name="color-scheme"
          content="light dark"
        />

        <Script
          id="northtrail-theme-bootstrap"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{
            __html: themeBootstrap,
          }}
        />
      </head>

      <body>
        {children}
      </body>
    </html>
  );
}