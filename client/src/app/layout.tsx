import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { NextAuthProvider } from "@/providers/NextAuthProvider";
import { ThemeProvider } from "@/providers/ThemeProvider";
import { ReactQueryProvider } from "@/providers/ReactQueryProvider";
import { TranscriptProvider } from "@/components/TranscriptProvider";
import { AuthProvider } from '../context/AuthContext';
import AutoLogin from '../components/auth/AutoLogin';

const inter = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Productive AI | Transcript Analysis",
  description: "Analyze meeting transcripts with AI",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${inter.variable} ${jetbrainsMono.variable} antialiased`}
      >
        <AuthProvider>
          <AutoLogin enabled={true}>
            <NextAuthProvider>
              <ReactQueryProvider>
                <ThemeProvider
                  attribute="class"
                  defaultTheme="system"
                  enableSystem
                  disableTransitionOnChange
                >
                  <TranscriptProvider>
                    {children}
                  </TranscriptProvider>
                </ThemeProvider>
              </ReactQueryProvider>
            </NextAuthProvider>
          </AutoLogin>
        </AuthProvider>
      </body>
    </html>
  );
}
