import Link from "next/link";
import { getServerSession } from "next-auth/next";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";

export default async function Home() {
  // Check if the user is already authenticated
  const session = await getServerSession(authOptions);
  
  // If authenticated, redirect to dashboard
  if (session) {
    redirect('/dashboard');
  }

  return (
    <div className="flex flex-col min-h-screen">
      <header className="border-b border-gray-200 dark:border-gray-700">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-4 flex justify-between items-center">
          <h1 className="text-xl font-bold">Productive AI</h1>
          <nav>
            <ul className="flex space-x-4">
              <li>
                <Link
                  href="/auth/login"
                  className="px-4 py-2 rounded-md bg-blue-600 text-white font-medium hover:bg-blue-700"
                >
                  Sign In
                </Link>
              </li>
              <li>
                <Link
                  href="/auth/register"
                  className="px-4 py-2 rounded-md border border-gray-300 dark:border-gray-600 font-medium hover:bg-gray-50 dark:hover:bg-gray-800"
                >
                  Register
                </Link>
              </li>
            </ul>
          </nav>
        </div>
      </header>
      
      <main className="flex-grow flex flex-col items-center justify-center p-8 text-center">
        <div className="max-w-3xl">
          <h2 className="text-4xl font-bold tracking-tight mb-4">
            Transcript Analysis with AI
          </h2>
          <p className="text-lg text-gray-600 dark:text-gray-300 mb-8">
            Upload meeting transcripts, analyze themes, identify knowledge gaps, and visualize relationships.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              href="/auth/register"
              className="px-6 py-3 rounded-md bg-blue-600 text-white font-medium hover:bg-blue-700"
            >
              Get Started
            </Link>
            <Link
              href="/auth/login"
              className="px-6 py-3 rounded-md border border-gray-300 dark:border-gray-600 font-medium hover:bg-gray-50 dark:hover:bg-gray-800"
            >
              Sign In
            </Link>
          </div>
        </div>
      </main>
      
      <footer className="border-t border-gray-200 dark:border-gray-700 py-6">
        <div className="container mx-auto px-4 text-center text-gray-500 dark:text-gray-400">
          <p>© {new Date().getFullYear()} Productive AI. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
