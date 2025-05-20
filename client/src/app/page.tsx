'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/button';

export default function Home() {
  return (
    <main className='flex min-h-screen flex-col items-center justify-center p-8'>
      <div className='mx-auto flex max-w-3xl flex-col items-center text-center'>
        <h1 className='mb-4 text-4xl font-bold tracking-tight md:text-5xl'>
          Productive AI Meeting Transcript Analyzer
        </h1>

        <p className='mb-8 text-xl text-muted-foreground'>
          Upload your meeting transcripts, analyze them with AI, and extract valuable insights.
        </p>

        <div className='flex flex-col gap-4 sm:flex-row'>
          <Link href='/transcripts'>
            <Button size='lg'>
              Get Started
              <svg
                xmlns='http://www.w3.org/2000/svg'
                fill='none'
                viewBox='0 0 24 24'
                strokeWidth={1.5}
                stroke='currentColor'
                className='ml-2 h-5 w-5'
              >
                <path
                  strokeLinecap='round'
                  strokeLinejoin='round'
                  d='M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3'
                />
              </svg>
            </Button>
          </Link>
        </div>

        <div className='mt-16 grid grid-cols-1 gap-8 md:grid-cols-3'>
          <div className='flex flex-col items-center rounded-lg border p-6 text-center'>
            <svg
              xmlns='http://www.w3.org/2000/svg'
              fill='none'
              viewBox='0 0 24 24'
              strokeWidth={1.5}
              stroke='currentColor'
              className='mb-4 h-10 w-10 text-primary'
            >
              <path
                strokeLinecap='round'
                strokeLinejoin='round'
                d='M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5'
              />
            </svg>
            <h2 className='mb-2 text-xl font-semibold'>Upload</h2>
            <p className='text-muted-foreground'>Upload meeting transcripts in various formats.</p>
          </div>

          <div className='flex flex-col items-center rounded-lg border p-6 text-center'>
            <svg
              xmlns='http://www.w3.org/2000/svg'
              fill='none'
              viewBox='0 0 24 24'
              strokeWidth={1.5}
              stroke='currentColor'
              className='mb-4 h-10 w-10 text-primary'
            >
              <path
                strokeLinecap='round'
                strokeLinejoin='round'
                d='M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19.8 15.3M14.25 3.104c.251.023.501.05.75.082M19.8 15.3l-1.57.393A9.065 9.065 0 0112 15a9.065 9.065 0 00-6.23-.693L5 14.5m14.8.8l1.402 1.402c1.232 1.232.65 3.318-1.067 3.611A48.309 48.309 0 0112 21c-2.773 0-5.491-.235-8.135-.687-1.718-.293-2.3-2.379-1.067-3.61L5 14.5'
              />
            </svg>
            <h2 className='mb-2 text-xl font-semibold'>Analyze</h2>
            <p className='text-muted-foreground'>
              Process transcripts with AI to extract insights.
            </p>
          </div>

          <div className='flex flex-col items-center rounded-lg border p-6 text-center'>
            <svg
              xmlns='http://www.w3.org/2000/svg'
              fill='none'
              viewBox='0 0 24 24'
              strokeWidth={1.5}
              stroke='currentColor'
              className='mb-4 h-10 w-10 text-primary'
            >
              <path
                strokeLinecap='round'
                strokeLinejoin='round'
                d='M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0118 16.5h-2.25m-7.5 0h7.5m-7.5 0l-1 3m8.5-3l1 3m0 0l.5 1.5m-.5-1.5h-9.5m0 0l-.5 1.5m.75-9l3-3 2.148 2.148A12.061 12.061 0 0116.5 7.605'
              />
            </svg>
            <h2 className='mb-2 text-xl font-semibold'>Gain Insights</h2>
            <p className='text-muted-foreground'>Discover key points, themes, and action items.</p>
          </div>
        </div>
      </div>
    </main>
  );
}
