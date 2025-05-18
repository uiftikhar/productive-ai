import { memo } from 'react';
import { Handle, Position, NodeProps } from '@xyflow/react';

// Define what data we expect in our custom node
interface AgentNodeData {
  label: string;
  type: 'supervisor' | 'manager' | 'worker' | 'service';
  status: 'pending' | 'in_progress' | 'completed' | 'error';
  metrics?: {
    calls: number;
    duration: number;
  };
  details?: any;
  [key: string]: any; // Index signature to satisfy Record<string, unknown>
}

// Export the data type for use in other components
export type { AgentNodeData };

// The component implementation
export const AgentNode = memo(({ data, isConnectable }: NodeProps) => {
  // Cast data to our custom type for type safety
  const agentData = data as AgentNodeData;
  const { label, type, status, metrics } = agentData;
  
  // Determine the node color based on status and type
  const getBgColor = () => {
    if (status === 'error') return 'bg-red-100 border-red-500';
    if (status === 'in_progress') return 'bg-blue-100 border-blue-500';
    if (status === 'completed') return 'bg-green-100 border-green-500';
    
    // Default colors by agent type
    switch (type) {
      case 'supervisor':
        return 'bg-purple-100 border-purple-500';
      case 'manager':
        return 'bg-indigo-100 border-indigo-500';
      case 'worker':
        return 'bg-amber-100 border-amber-500';
      default:
        return 'bg-gray-100 border-gray-500';
    }
  };
  
  return (
    <div 
      className={`px-4 py-2 rounded-lg border-2 shadow-md ${getBgColor()} min-w-[150px]`}
      data-testid="agent-node"
    >
      <Handle
        type="target"
        position={Position.Top}
        isConnectable={isConnectable}
        className="w-2 h-2"
      />
      
      <div className="font-medium text-center truncate">{label}</div>
      
      <div className="mt-1">
        <div className="text-xs flex justify-between items-center">
          <span className="font-bold capitalize">{type}</span>
          <span className="capitalize text-xs px-2 py-0.5 rounded-full bg-white/60">{status}</span>
        </div>
      </div>
      
      {metrics && (
        <div className="text-xs mt-1 flex justify-between">
          <span>{metrics.duration > 0 ? `${metrics.duration}ms` : ''}</span>
          <span>{metrics.calls > 0 ? `${metrics.calls} calls` : ''}</span>
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

AgentNode.displayName = 'AgentNode'; 