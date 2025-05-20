import NextAuth from 'next-auth/next';
import { authOptions } from '@/lib/auth';

// Create the handler using the authOptions
const handler = NextAuth(authOptions);

// Export the GET and POST handlers (valid Next.js Route exports)
export { handler as GET, handler as POST };
