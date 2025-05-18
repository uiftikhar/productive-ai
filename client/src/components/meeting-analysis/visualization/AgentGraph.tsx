import { useEffect, useMemo, useState, useCallback } from 'react';
import { 
  ReactFlowProvider, 
  ReactFlow as ReactFlowComponent,
  Controls,
  Background,
  MiniMap,
  useNodesState,
  useEdgesState,
  NodeTypes,
  Panel,
  BackgroundVariant,
  Node,
  NodeProps,
  Edge
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import { AgentNode } from './nodes/AgentNode';
import { ServiceNode } from './nodes/ServiceNode';
import { prepareGraphData } from './utils/graph-processor';
import { AgentEvent } from '@/hooks/useAgentVisualization';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

// Define node data interfaces
interface AgentNodeData {
  label: string;
  type: 'supervisor' | 'manager' | 'worker' | 'service';
  status: 'pending' | 'in_progress' | 'completed' | 'error';
  metrics?: {
    calls: number;
    duration: number;
  };
  details?: any;
}

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
}

// Custom node types
const nodeTypes: NodeTypes = {
  agentNode: AgentNode as any, // Type assertion to avoid complex typing issues
  serviceNode: ServiceNode as any,
};

interface AgentGraphProps {
  events: AgentEvent[];
  sessionId: string;
}

// Wrap the main flow component in ReactFlowProvider
export function AgentGraph({ events, sessionId }: AgentGraphProps) {
  return (
    <ReactFlowProvider>
      <AgentGraphFlow events={events} sessionId={sessionId} />
    </ReactFlowProvider>
  );
}

// Main flow component with ReactFlow logic
function AgentGraphFlow({ events, sessionId }: AgentGraphProps) {
  // Use any as a workaround for the complex type constraints
  const [nodes, setNodes, onNodesChange] = useNodesState<any>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<any>([]);
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  
  // Process events into graph structure whenever events change
  useEffect(() => {
    if (!events.length) return;
    
    const { nodes: newNodes, edges: newEdges } = prepareGraphData(events);
    setNodes(newNodes);
    setEdges(newEdges);
  }, [events, setNodes, setEdges]);
  
  // Handle node selection
  const onNodeClick = useCallback((event: React.MouseEvent, node: Node) => {
    setSelectedNode(prevSelected => (node.id === prevSelected ? null : node.id));
  }, []);
  
  // Get details for selected node
  const selectedNodeDetails = useMemo(() => {
    if (!selectedNode || !events.length) return null;
    
    return events.filter(e => 
      (e.data.agentId === selectedNode) || 
      (e.data.serviceType && e.data.agentId === selectedNode)
    );
  }, [selectedNode, events]);
  
  // Default viewport config
  const defaultViewport = { x: 0, y: 0, zoom: 1 };
  
  const agentNodeCount = useMemo(() => {
    return nodes.filter((n: any) => n.type === 'agentNode').length;
  }, [nodes]);
  
  return (
    <div className="h-full flex flex-col relative">
      <div className={`flex-grow ${selectedNodeDetails ? 'h-2/3' : 'h-full'}`}>
        <ReactFlowComponent
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onNodeClick={onNodeClick}
          nodeTypes={nodeTypes}
          fitView
          defaultViewport={defaultViewport}
          minZoom={0.2}
          maxZoom={4}
          proOptions={{ hideAttribution: true }}
        >
          <Background variant={BackgroundVariant.Dots} gap={16} size={1} />
          <Controls />
          <MiniMap 
            nodeStrokeWidth={3}
            zoomable
            pannable
          />
          <Panel position="top-center" className="bg-white/70 rounded p-2 text-sm">
            Session: {sessionId} • Events: {events.length} • Agents: {agentNodeCount}
          </Panel>
        </ReactFlowComponent>
      </div>
      
      {selectedNodeDetails && selectedNodeDetails.length > 0 && (
        <div className="h-1/3 overflow-auto p-4 border-t border-gray-200">
          <Card>
            <CardHeader className="py-3">
              <CardTitle className="text-sm font-medium">Agent Events</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="max-h-[200px] overflow-auto">
                <table className="w-full text-xs">
                  <thead className="bg-gray-50 sticky top-0">
                    <tr>
                      <th className="py-2 px-3 text-left">Time</th>
                      <th className="py-2 px-3 text-left">Event</th>
                      <th className="py-2 px-3 text-left">Agent</th>
                      <th className="py-2 px-3 text-right">Duration</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedNodeDetails.map((event, index) => {
                      // Calculate relative time from first event
                      const firstTime = selectedNodeDetails[0].timestamp;
                      const relativeTime = ((event.timestamp - firstTime) / 1000).toFixed(2);
                      
                      return (
                        <tr 
                          key={`${event.event}-${index}`}
                          className="border-t border-gray-100 hover:bg-gray-50"
                        >
                          <td className="py-2 px-3">+{relativeTime}s</td>
                          <td className="py-2 px-3 font-medium">
                            {event.event.replace('agent.', '').replace('service.', '')}
                          </td>
                          <td className="py-2 px-3">{event.data.agentType}</td>
                          <td className="py-2 px-3 text-right tabular-nums">
                            {event.data.duration ? `${event.data.duration}ms` : '-'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
} 