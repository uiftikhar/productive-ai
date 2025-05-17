'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertCircle, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export function SessionList() {
  const router = useRouter();
  
  return (
    <div className="flex flex-col items-center justify-center py-8 text-center">
      <p className="text-muted-foreground mb-4">Session-based analysis has been replaced with direct transcript analysis.</p>
      <Button onClick={() => router.push('/meeting-analysis')}>
        Go to Meeting Analysis
      </Button>
    </div>
  );
} 