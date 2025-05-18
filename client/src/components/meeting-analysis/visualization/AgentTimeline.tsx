import { useMemo } from 'react';
import { AgentEvent } from '@/hooks/useAgentVisualization';
import { ScrollArea } from '@/components/ui/scroll-area';

interface AgentTimelineProps {
  events: AgentEvent[];
}

export function AgentTimeline({ events }: AgentTimelineProps) {
  const timelineEvents = useMemo(() => {
    return events
      .filter(e => e.event.startsWith('agent.') || e.event.startsWith('service.'))
      .sort((a, b) => a.timestamp - b.timestamp);
  }, [events]);
  
  const startTime = useMemo(() => {
    if (!timelineEvents.length) return 0;
    return timelineEvents[0].timestamp;
  }, [timelineEvents]);
  
  const getEventColor = (event: AgentEvent) => {
    // Service events
    if (event.event.startsWith('service.')) {
      if (event.event.includes('Error')) return 'bg-red-100 border-red-400';
      if (event.event.includes('Completed')) return 'bg-green-100 border-green-400';
      return 'bg-teal-100 border-teal-400';
    }
    
    // Agent events
    if (event.event === 'agent.started') return 'bg-blue-100 border-blue-400';
    if (event.event === 'agent.completed') return 'bg-green-100 border-green-400';
    if (event.event === 'agent.error') return 'bg-red-100 border-red-400';
    if (event.event.includes('processState')) return 'bg-violet-100 border-violet-400';
    
    return 'bg-gray-100 border-gray-400';
  };
  
  // Get event icon
  const getEventIcon = (event: AgentEvent) => {
    if (event.event.startsWith('service.')) {
      if (event.data.serviceType === 'rag') return '📚';
      if (event.data.serviceType === 'pinecone') return '🌲';
      if (event.data.serviceType === 'llm') return '🧠';
      return '🔧';
    }
    
    if (event.event === 'agent.started') return '▶️';
    if (event.event === 'agent.completed') return '✅';
    if (event.event === 'agent.error') return '❌';
    
    return '⚙️';
  };
  
  // Format query for display
  const getQueryDisplay = (event: AgentEvent) => {
    if (!event.data.query) return null;
    
    const query = event.data.query;
    let queryText = '';
    
    if (typeof query === 'string') {
      queryText = query;
    } else if (query.text || query.query) {
      queryText = query.text || query.query;
    } else {
      try {
        queryText = JSON.stringify(query).substring(0, 30);
      } catch (e) {
        queryText = 'Complex query';
      }
    }
    
    return queryText.length > 30 ? queryText.substring(0, 27) + '...' : queryText;
  };
  
  if (!timelineEvents.length) {
    return <div className="text-center py-4 text-sm text-gray-500">No events to display yet</div>;
  }
  
  return (
    <ScrollArea className="h-[300px]">
      <div className="space-y-2 pr-4">
        {timelineEvents.map((event, idx) => {
          const { data } = event;
          const relativeTime = ((event.timestamp - startTime) / 1000).toFixed(2);
          const queryDisplay = getQueryDisplay(event);
          
          return (
            <div 
              key={`${event.event}-${idx}`}
              className={`p-2 rounded border ${getEventColor(event)} flex items-center text-sm`}
            >
              <div className="w-16 flex-shrink-0 text-xs font-mono">
                +{relativeTime}s
              </div>
              <div className="flex-shrink-0 mr-2">
                {getEventIcon(event)}
              </div>
              <div className="overflow-hidden flex-grow">
                <div className="font-medium truncate">
                  {event.event.includes('service') 
                    ? `${data.serviceType}: ${data.operation}` 
                    : data.agentType}
                </div>
                <div className="text-xs truncate max-w-xs opacity-70">
                  {event.event.replace('agent.', '').replace(`service.${data.serviceType}.`, '')}
                  {data.duration && ` (${data.duration}ms)`}
                </div>
                {queryDisplay && (
                  <div className="text-xs italic bg-white/40 px-1 rounded mt-1 truncate">
                    {queryDisplay}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </ScrollArea>
  );
} 