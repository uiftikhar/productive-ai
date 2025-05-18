import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AgentGraph } from './AgentGraph';
import { AgentTimeline } from './AgentTimeline';
import { MetricsPanel } from './MetricsPanel';
import { AgentEvent } from '@/hooks/useAgentVisualization';
import { Badge } from '@/components/ui/badge';
import { Loader2, AlertCircle } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

interface AgentVisualizationProps {
  events: AgentEvent[];
  sessionId: string;
  connected: boolean;
  isLoading?: boolean;
  connectionError?: string | null;
}

export function AgentVisualization({ 
  events, 
  sessionId, 
  connected, 
  isLoading = false,
  connectionError = null
}: AgentVisualizationProps) {
  const [activeTab, setActiveTab] = useState('graph');
  
  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-lg font-bold">Agent Workflow Visualization</h2>
        <div className="flex items-center space-x-2">
          <Badge variant="outline" className={`${connected ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
            {connected ? 'Connected' : 'Disconnected'}
          </Badge>
          <Badge variant="outline" className="bg-gray-100">
            {events.length} Events
          </Badge>
        </div>
      </div>
      
      {connectionError && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Connection Error</AlertTitle>
          <AlertDescription>
            {connectionError}. 
            <p className="mt-1">The visualization may not display real-time updates.</p>
          </AlertDescription>
        </Alert>
      )}
      
      <Card>
        <CardHeader className="px-4 py-3 border-b">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="grid grid-cols-3 w-[400px]">
              <TabsTrigger value="graph">Graph View</TabsTrigger>
              <TabsTrigger value="timeline">Timeline</TabsTrigger>
              <TabsTrigger value="metrics">Metrics</TabsTrigger>
            </TabsList>
          </Tabs>
        </CardHeader>
        <CardContent className="p-0 h-[600px]">
          {isLoading ? (
            <div className="h-full flex items-center justify-center">
              <div className="flex flex-col items-center space-y-4">
                <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
                <p className="text-sm text-gray-500">Connecting to agent visualization...</p>
              </div>
            </div>
          ) : events.length === 0 && !connectionError ? (
            <div className="h-full flex items-center justify-center">
              <div className="flex flex-col items-center space-y-4 text-center px-6">
                <p className="text-gray-500">Waiting for agent events...</p>
                <p className="text-sm text-gray-400">
                  Events will appear here as the analysis progresses. This may take a few moments to begin.
                </p>
              </div>
            </div>
          ) : (
            <>
              <TabsContent value="graph" className="h-full m-0 border-none">
                <AgentGraph events={events} sessionId={sessionId} />
              </TabsContent>
              
              <TabsContent value="timeline" className="h-full m-0 p-4">
                <AgentTimeline events={events} />
              </TabsContent>
              
              <TabsContent value="metrics" className="h-full m-0 p-4">
                <MetricsPanel events={events} />
              </TabsContent>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
} 