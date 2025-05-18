import { useMemo } from 'react';
import { AgentEvent } from '@/hooks/useAgentVisualization';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Card } from '@/components/ui/card';

interface MetricsPanelProps {
  events: AgentEvent[];
}

export function MetricsPanel({ events }: MetricsPanelProps) {
  const metrics = useMemo(() => {
    // Agent metrics
    const agentCalls = new Map<string, number>();
    const agentDurations = new Map<string, number[]>();
    
    // Service metrics
    const serviceCalls = new Map<string, number>();
    const serviceErrors = new Map<string, number>();
    
    // Overall metrics
    let totalAgents = 0;
    let totalServices = 0;
    let totalDuration = 0;
    let startTime = Infinity;
    let endTime = 0;
    let errorCount = 0;
    
    events.forEach(event => {
      const { data } = event;
      
      // Track earliest and latest timestamps
      startTime = Math.min(startTime, event.timestamp);
      endTime = Math.max(endTime, event.timestamp);
      
      // Track agent metrics
      if (event.event === 'agent.started' && data.agentType) {
        const currentCount = agentCalls.get(data.agentType) || 0;
        agentCalls.set(data.agentType, currentCount + 1);
        totalAgents++;
      }
      
      // Track errors
      if (event.event.includes('error')) {
        errorCount++;
      }
      
      // Track agent durations
      if (event.event === 'agent.completed' && data.duration) {
        if (!agentDurations.has(data.agentType)) {
          agentDurations.set(data.agentType, []);
        }
        agentDurations.get(data.agentType)!.push(data.duration);
        totalDuration += data.duration;
      }
      
      // Track service calls
      if (data.serviceType && data.operation) {
        const serviceKey = `${data.serviceType}.${data.operation}`;
        const currentCount = serviceCalls.get(serviceKey) || 0;
        serviceCalls.set(serviceKey, currentCount + 1);
        totalServices++;
        
        // Track service errors
        if (event.event.includes('Error')) {
          const errorCount = serviceErrors.get(serviceKey) || 0;
          serviceErrors.set(serviceKey, errorCount + 1);
        }
      }
    });
    
    // Calculate average durations
    const averageDurations = new Map<string, number>();
    agentDurations.forEach((durations, agentType) => {
      const sum = durations.reduce((acc, val) => acc + val, 0);
      averageDurations.set(agentType, Math.round(sum / durations.length));
    });
    
    return {
      totalAgents,
      totalServices,
      totalDuration,
      elapsedTime: endTime - startTime,
      errorCount,
      agentCalls: Object.fromEntries(agentCalls),
      averageDurations: Object.fromEntries(averageDurations),
      serviceCalls: Object.fromEntries(serviceCalls),
      serviceErrors: Object.fromEntries(serviceErrors),
    };
  }, [events]);
  
  if (!events.length) {
    return <div className="text-center py-4 text-sm text-gray-500">No metrics to display yet</div>;
  }
  
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-2">
        <Card className="p-3">
          <div className="text-xs text-gray-500">Total Time</div>
          <div className="text-xl font-bold tabular-nums">
            {(metrics.elapsedTime / 1000).toFixed(2)}s
          </div>
        </Card>
        
        <Card className="p-3">
          <div className="text-xs text-gray-500">Agent Calls</div>
          <div className="text-xl font-bold tabular-nums">{metrics.totalAgents}</div>
        </Card>
        
        <Card className="p-3">
          <div className="text-xs text-gray-500">Service Calls</div>
          <div className="text-xl font-bold tabular-nums">{metrics.totalServices}</div>
        </Card>
      </div>
      
      <div className="grid grid-cols-2 gap-4">
        <div>
          <h4 className="text-sm font-medium mb-2">Agent Performance</h4>
          <ScrollArea className="h-[180px]">
            <div className="space-y-1 pr-4">
              {Object.entries(metrics.averageDurations)
                .sort((a, b) => b[1] - a[1]) // Sort by duration
                .map(([agent, avg]) => (
                <div key={agent} className="bg-white p-2 rounded border flex justify-between items-center">
                  <div className="text-xs truncate max-w-[150px]">{agent}</div>
                  <div className="text-xs font-medium tabular-nums">{avg}ms</div>
                </div>
              ))}
            </div>
          </ScrollArea>
        </div>
        
        <div>
          <h4 className="text-sm font-medium mb-2">Service Usage</h4>
          <ScrollArea className="h-[180px]">
            <div className="space-y-1 pr-4">
              {Object.entries(metrics.serviceCalls)
                .sort((a, b) => b[1] - a[1]) // Sort by call count
                .map(([service, count]) => (
                <div key={service} className="bg-white p-2 rounded border flex justify-between items-center">
                  <div className="text-xs truncate max-w-[150px]">{service}</div>
                  <div className="text-xs font-medium tabular-nums">
                    {count} calls
                    {metrics.serviceErrors[service] > 0 && 
                      <span className="ml-1 text-red-500">
                        ({metrics.serviceErrors[service]} errors)
                      </span>
                    }
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        </div>
      </div>
    </div>
  );
} 