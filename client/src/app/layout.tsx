import type { Metadata } from 'next';
import { Inter, JetBrains_Mono } from 'next/font/google';
import './globals.css';
import { NextAuthProvider } from '@/providers/NextAuthProvider';
import { ThemeProvider } from '@/providers/ThemeProvider';
import { ReactQueryProvider } from '@/providers/ReactQueryProvider';
import { TranscriptProvider } from '@/components/TranscriptProvider';
import { AuthProvider } from '../context/AuthContext';
import AutoLogin from '../components/auth/AutoLogin';
import { AuthCheck } from '@/components/auth-check';
import Script from 'next/script';

const inter = Inter({
  variable: '--font-sans',
  subsets: ['latin'],
});

const jetbrainsMono = JetBrains_Mono({
  variable: '--font-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: 'Productive AI | Transcript Analysis',
  description: 'Analyze meeting transcripts with AI',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  // Define the environment variables script as a string
  const envScript = `
    window.ENV = {
      API_URL: "${process.env.NEXT_PUBLIC_API_URL || ''}",
      BROWSER_API_URL: "${process.env.NEXT_PUBLIC_BROWSER_API_URL || 'http://localhost:3000'}"
    };
    console.log("Environment initialized:", window.ENV);
  `;

  return (
    <html lang='en' suppressHydrationWarning>
      <head />
      <body
        className={`${inter.variable} ${jetbrainsMono.variable} min-h-screen bg-background font-sans antialiased`}
      >
        {/* Add the script at the beginning of the body */}
        <Script
          id='env-script'
          strategy='beforeInteractive'
          dangerouslySetInnerHTML={{ __html: envScript }}
        />

        <NextAuthProvider>
          <ReactQueryProvider>
            <ThemeProvider
              attribute='class'
              defaultTheme='system'
              enableSystem
              disableTransitionOnChange
            >
              <AuthProvider>
                <AuthCheck />
                <TranscriptProvider>
                  {children}
                  {/* <AutoLogin enabled={true}>
                  </AutoLogin> */}
                </TranscriptProvider>
              </AuthProvider>
            </ThemeProvider>
          </ReactQueryProvider>
        </NextAuthProvider>
      </body>
    </html>
  );
}
