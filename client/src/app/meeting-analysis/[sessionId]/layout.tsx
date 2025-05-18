import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Meeting Analysis Results',
  description: 'View the results of your meeting analysis',
};

export default async function MeetingAnalysisLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-gray-50">
      {children}
    </div>
  );
} 