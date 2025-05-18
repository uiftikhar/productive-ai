import { memo } from 'react';
import { Handle, Position, NodeProps } from '@xyflow/react';

// Define what data we expect in our service node
interface ServiceNodeData {
  label: string;
  serviceType: 'rag' | 'pinecone' | 'llm';
  operation: string;
  status: 'pending' | 'in_progress' | 'completed' | 'error';
  metrics?: {
    duration: number;
    calls?: number;
  };
  details?: any;
  query?: { [key: string]: any };
  options?: { [key: string]: any };
  [key: string]: any; // Index signature to satisfy Record<string, unknown>
}

// Export the data type for use in other components
export type { ServiceNodeData };

// The component implementation
export const ServiceNode = memo(({ data, isConnectable }: NodeProps) => {
  // Cast data to our custom type for type safety
  const serviceData = data as ServiceNodeData;
  const { label, serviceType, status, metrics, query } = serviceData;
  
  // Determine the node color based on service type
  const getBgColor = () => {
    if (status === 'error') return 'bg-red-100 border-red-500';
    
    switch (serviceType) {
      case 'rag':
        return 'bg-teal-100 border-teal-500';
      case 'pinecone':
        return 'bg-violet-100 border-violet-500';
      case 'llm':
        return 'bg-sky-100 border-sky-500';
      default:
        return 'bg-gray-100 border-gray-500';
    }
  };
  
  const getIcon = () => {
    switch (serviceType) {
      case 'rag':
        return '📚';
      case 'pinecone':
        return '🌲';
      case 'llm':
        return '🧠';
      default:
        return '🔧';
    }
  };

  // Format query for display (truncate if too long)
  const getQueryDisplay = () => {
    if (!query) return null;
    
    let queryText = '';
    if (typeof query === 'string') {
      queryText = query;
    } else if (query.text || query.query) {
      queryText = query.text || query.query;
    } else {
      try {
        queryText = JSON.stringify(query).substring(0, 50);
      } catch (e) {
        queryText = 'Complex query';
      }
    }
    
    return queryText.length > 25 ? queryText.substring(0, 22) + '...' : queryText;
  };
  
  return (
    <div 
      className={`px-4 py-2 rounded-lg border-2 shadow-md ${getBgColor()} min-w-[140px] max-w-[200px]`}
      data-testid="service-node"
    >
      <Handle
        type="target"
        position={Position.Top}
        isConnectable={isConnectable}
        className="w-2 h-2"
      />
      
      <div className="flex items-center justify-center gap-1">
        <span>{getIcon()}</span>
        <div className="font-medium text-center truncate">{label}</div>
      </div>
      
      <div className="mt-1">
        <div className="text-xs flex justify-between items-center">
          <span className="font-bold capitalize">{serviceType}</span>
          <span className="capitalize text-xs px-2 py-0.5 rounded-full bg-white/60">{status}</span>
        </div>
      </div>
      
      {query && (
        <div className="text-xs mt-1 truncate italic text-gray-600 bg-white/40 px-1 rounded">
          {getQueryDisplay()}
        </div>
      )}
      
      {metrics && (
        <div className="text-xs mt-1 text-center">
          {metrics.duration > 0 && <span>{metrics.duration}ms</span>}
        </div>
      )}
      
      <Handle
        type="source"
        position={Position.Bottom}
        isConnectable={isConnectable}
        className="w-2 h-2"
      />
    </div>
  );
});

ServiceNode.displayName = 'ServiceNode'; 