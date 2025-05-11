'use client';

import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import ReactFlow, {
  Node,
  Edge,
  Controls,
  Background,
  useNodesState,
  useEdgesState,
  MarkerType,
  Panel
} from 'reactflow';
import 'reactflow/dist/style.css';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2 } from 'lucide-react';
import { API_CONFIG } from '@/config/api';

// Custom node components
function DefaultNode({ data }: { data: any }) {
  return (
    <div className="bg-white border border-gray-200 rounded-md p-2 shadow-md">
      <div className="font-semibold">{data.label}</div>
    </div>
  );
}

function AgentNode({ data }: { data: any }) {
  const getAgentTypeColor = (agentType: string) => {
    switch (agentType) {
      case 'supervisor': return 'bg-blue-100 border-blue-500 text-blue-800';
      case 'manager': return 'bg-indigo-100 border-indigo-500 text-indigo-800';
      case 'worker': return 'bg-blue-50 border-blue-400 text-blue-700';
      default: return 'bg-gray-100 border-gray-500 text-gray-800';
    }
  };
  
  const colorClass = getAgentTypeColor(data.agentType);
  
  return (
    <div className={`border-2 rounded-md p-3 shadow-md ${colorClass}`} style={{ minWidth: '150px' }}>
      <div className="font-bold">{data.label}</div>
      {data.expertise && (
        <div className="text-xs mt-1">
          {Array.isArray(data.expertise) ? data.expertise.join(', ') : data.expertise}
        </div>
      )}
    </div>
  );
}

function TaskNode({ data }: { data: any }) {
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed': return 'bg-green-100 border-green-500 text-green-800';
      case 'in_progress': return 'bg-amber-100 border-amber-500 text-amber-800';
      case 'failed': return 'bg-red-100 border-red-500 text-red-800';
      default: return 'bg-amber-50 border-amber-400 text-amber-700';
    }
  };
  
  const colorClass = getStatusColor(data.status);
  
  return (
    <div className={`border-2 rounded-md p-2 shadow-md ${colorClass}`} style={{ maxWidth: '200px' }}>
      <div className="font-semibold">{data.label}</div>
      {data.content && (
        <div className="text-xs mt-1 line-clamp-2">{data.content}</div>
      )}
    </div>
  );
}

function TopicNode({ data }: { data: any }) {
  return (
    <div className="bg-emerald-50 border-2 border-emerald-500 rounded-md p-2 shadow-md text-emerald-800" style={{ maxWidth: '150px' }}>
      <div className="font-semibold">{data.label}</div>
      {data.relevance && (
        <div className="text-xs mt-1">Relevance: {(data.relevance * 100).toFixed(0)}%</div>
      )}
    </div>
  );
}

function ActionItemNode({ data }: { data: any }) {
  return (
    <div className="bg-purple-50 border-2 border-purple-500 rounded-md p-2 shadow-md text-purple-800" style={{ maxWidth: '200px' }}>
      <div className="font-semibold">{data.label}</div>
      {data.assignee && (
        <div className="text-xs mt-1">Assignee: {data.assignee}</div>
      )}
    </div>
  );
}

function ResultNode({ data }: { data: any }) {
  return (
    <div className="bg-pink-50 border-2 border-pink-500 rounded-md p-2 shadow-md text-pink-800" style={{ maxWidth: '200px' }}>
      <div className="font-semibold">{data.label}</div>
      {data.count !== undefined && (
        <div className="text-xs mt-1">Items: {data.count}</div>
      )}
    </div>
  );
}

interface AgentVisualizationProps {
  sessionId: string;
}

export default function AgentVisualization({ sessionId }: AgentVisualizationProps) {
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [hasInitialData, setHasInitialData] = useState(false);
  
  // Memoize the nodeTypes to prevent React Flow warning
  const nodeTypes = useMemo(() => ({
    default: DefaultNode,
    agent: AgentNode,
    task: TaskNode,
    topic: TopicNode,
    action: ActionItemNode,
    result: ResultNode
  }), []);
  
  // Fetch initial data via REST API
  useEffect(() => {
    fetchInitialGraphData();
  }, [sessionId]);

  // Set up WebSocket connection with retry logic
  useEffect(() => {
    const connectWebSocket = () => {
      // Clear any existing connection
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      
      // Clear any pending reconnect timeout
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
      
      try {
        // Create WebSocket connection - Fix: Use the correct server host instead of client host
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsHost = process.env.NEXT_PUBLIC_API_HOST || 'localhost:3001';
        const wsUrl = `${protocol}//${wsHost}/ws/visualization`;
        
        console.log('Connecting to WebSocket:', wsUrl);
        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;
        
        // Connection opened
        ws.addEventListener('open', () => {
          console.log('WebSocket connected');
          setIsConnected(true);
          setError(null);
          
          // Subscribe to updates for this session
          ws.send(JSON.stringify({
            type: 'subscribe',
            runId: sessionId
          }));
        });
        
        // Connection closed
        ws.addEventListener('close', () => {
          console.log('WebSocket disconnected');
          setIsConnected(false);
          
          // Schedule reconnect
          reconnectTimeoutRef.current = setTimeout(() => {
            console.log('Attempting to reconnect WebSocket...');
            connectWebSocket();
          }, 3000);
        });
        
        // Handle errors
        ws.addEventListener('error', (event) => {
          console.error('WebSocket error:', event);
          
          // Don't set error if we have initial data
          if (!hasInitialData) {
            setError('Failed to connect to visualization server');
          }
        });
        
        // Listen for messages
        ws.addEventListener('message', (event) => {
          try {
            const data = JSON.parse(event.data);
            
            // Handle subscribed confirmation
            if (data.type === 'subscribed' && data.runId === sessionId) {
              console.log('Subscribed to visualization updates');
            }
            
            // Handle state updates
            if (data.type === 'stateUpdate' && data.runId === sessionId) {
              processGraphUpdate(data.state);
            }
          } catch (err) {
            console.error('Error processing WebSocket message:', err);
          }
        });
      } catch (error) {
        console.error('Error creating WebSocket:', error);
        setIsConnected(false);
        
        // Schedule reconnect
        reconnectTimeoutRef.current = setTimeout(() => {
          console.log('Attempting to reconnect WebSocket...');
          connectWebSocket();
        }, 3000);
      }
    };
    
    // Start connection
    connectWebSocket();
    
    // Clean up
    return () => {
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
    };
  }, [sessionId, hasInitialData]);
  
  // Process graph updates from the server
  const processGraphUpdate = useCallback((graphData: any) => {
    // Ensure we have valid graph data
    if (!graphData) {
      console.warn('Received empty graph data');
      return;
    }
    
    // Extract nodes and edges from the data structure
    const rawNodes = graphData.nodes || [];
    const rawEdges = graphData.edges || [];
    
    if (rawNodes.length === 0 && rawEdges.length === 0) {
      console.warn('Graph data contains no nodes or edges');
      // Don't update if we have existing data
      if (nodes.length > 0 || edges.length > 0) {
        return;
      }
    }
    
    setIsLoading(false);
    
    // Convert server nodes to ReactFlow nodes
    const flowNodes = rawNodes.map((node: any) => {
      let nodeType = 'default';
      
      // Map visualization element types to node types
      switch (node.type) {
        case 'agent':
          nodeType = 'agent';
          break;
        case 'topic':
          nodeType = 'topic';
          break;
        case 'action_item':
          nodeType = 'action';
          break;
        case 'insight':
          nodeType = node.properties?.resultType ? 'result' : 'task';
          break;
        default:
          nodeType = 'default';
      }
      
      // Determine node positioning
      let position = node.position || { x: 0, y: 0 };
      
      // If no position is defined, use a layout algorithm
      if (!node.position) {
        // This is a simple layout algorithm, in a real implementation
        // you would use a more sophisticated algorithm
        const randomOffset = () => Math.floor(Math.random() * 400) - 200;
        
        // Organize by node type
        switch (node.type) {
          case 'agent':
            if (node.properties?.agentType === 'supervisor') {
              position = { x: 400, y: 100 };
            } else if (node.properties?.agentType === 'manager') {
              position = { x: 200 + randomOffset(), y: 250 };
            } else {
              position = { x: 400 + randomOffset(), y: 400 };
            }
            break;
          case 'participant':
            position = { x: 400, y: 10 };
            break;
          case 'topic':
            position = { x: 700 + randomOffset(), y: 200 + randomOffset() };
            break;
          case 'action_item':
            position = { x: 800 + randomOffset(), y: 400 };
            break;
          case 'insight':
            position = { x: 600 + randomOffset(), y: 300 + randomOffset() };
            break;
          default:
            position = { x: 400 + randomOffset(), y: 300 + randomOffset() };
        }
      }
      
      // Determine node style based on state
      let style: any = {};
      switch (node.state) {
        case 'active':
          style = { border: '2px solid #3B82F6', boxShadow: '0 0 10px #3B82F6' };
          break;
        case 'highlighted':
          style = { border: '2px solid #F59E0B', boxShadow: '0 0 10px #F59E0B' };
          break;
        case 'selected':
          style = { border: '2px solid #10B981', boxShadow: '0 0 10px #10B981' };
          break;
        case 'error':
          style = { border: '2px solid #EF4444', boxShadow: '0 0 10px #EF4444' };
          break;
      }
      
      return {
        id: node.id,
        type: nodeType,
        position,
        data: {
          label: node.label || 'Unknown',
          ...(node.properties || {})
        },
        style
      };
    });
    
    // Convert server edges to ReactFlow edges
    const flowEdges = rawEdges.map((edge: any) => {
      let edgeType = 'default';
      let animated = edge.animated || false;
      let markerEnd = { type: MarkerType.Arrow };
      let style: any = {};
      
      // Map connection types to edge styles
      switch (edge.type) {
        case 'communication':
          edgeType = 'step';
          animated = true;
          style = { stroke: '#3B82F6', strokeWidth: 2 };
          break;
        case 'collaboration':
          edgeType = 'straight';
          style = { stroke: '#10B981', strokeWidth: 2 };
          break;
        case 'dependency':
          edgeType = 'bezier';
          style = { stroke: '#8B5CF6', strokeWidth: 2 };
          break;
        case 'assignment':
          edgeType = 'smoothstep';
          style = { stroke: '#F59E0B', strokeWidth: 2 };
          break;
        case 'relation':
          edgeType = 'default';
          style = { stroke: '#EC4899', strokeWidth: 1 };
          break;
      }
      
      // Adjust edge strength (width) based on connection strength
      if (edge.strength) {
        style.strokeWidth = 1 + Math.floor(edge.strength * 2);
      }
      
      return {
        id: edge.id,
        source: edge.sourceId || edge.source,
        target: edge.targetId || edge.target,
        label: edge.label || '',
        type: edgeType,
        animated,
        markerEnd,
        style
      };
    });
    
    // Update the graph with the new nodes and edges
    if (flowNodes.length > 0 || flowEdges.length > 0) {
      setNodes(flowNodes);
      setEdges(flowEdges);
    } else if (nodes.length === 0 && edges.length === 0) {
      // If we still have no data, add a fallback node
      setNodes([{
        id: 'no-data',
        type: 'default',
        position: { x: 250, y: 150 },
        data: { label: 'No visualization data available' }
      }]);
      setEdges([]);
    }
  }, [setNodes, setEdges, nodes.length, edges.length]);
  
  // Request initial graph data if WebSocket is not available
  useEffect(() => {
    // If WebSocket is not connected after 3 seconds, try to fetch data via HTTP
    const fallbackTimer = setTimeout(() => {
      if (!isConnected && !isLoading) {
        fetchInitialGraphData();
      }
    }, 3000);
    
    return () => clearTimeout(fallbackTimer);
  }, [isConnected, isLoading]);
  
  // Fetch initial graph data via HTTP
  const fetchInitialGraphData = async () => {
    try {
      setIsLoading(true);
      setError(null);
      
      // Use the server API URL for HTTP requests too
      const apiHost = process.env.NEXT_PUBLIC_API_HOST || 'localhost:3000';
      const apiUrl = `http://${apiHost}${API_CONFIG.endpoints.visualizations.graph(sessionId)}`;
      console.log('Fetching graph data from:', apiUrl);
      
      const response = await fetch(apiUrl);
      
      if (!response.ok) {
        throw new Error('Failed to fetch graph data');
      }
      
      const data = await response.json();
      processGraphUpdate(data);
      setHasInitialData(true);
    } catch (err) {
      console.error('Error fetching graph data:', err);
      setError('Failed to load visualization data');
    } finally {
      setIsLoading(false);
    }
  };
  
  // Handle layout
  const onLayout = useCallback(() => {
    // In a real implementation, you would use a layout algorithm here
    // For now, we'll just use the positions already defined
  }, []);
  
  if (isLoading) {
    return (
      <Card className="w-full h-[400px] flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
        <p className="text-gray-500 mt-2">Loading agent visualization...</p>
      </Card>
    );
  }
  
  if (error) {
    return (
      <Card className="w-full">
        <CardContent className="py-8">
          <div className="text-center">
            <p className="text-red-500">{error}</p>
            <p className="text-gray-500 mt-2">
              Try refreshing the page or check the server status.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }
  
  return (
    <Card className="w-full">
      <CardHeader className="pb-0">
        <div className="flex flex-row justify-between items-center">
          <CardTitle>Agent Visualization</CardTitle>
          <Badge variant={isConnected ? "success" : "destructive"}>
            {isConnected ? "Live" : "Disconnected"}
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div style={{ height: 400 }}>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            nodeTypes={nodeTypes}
            fitView
          >
            <Controls />
            <Background />
            <Panel position="top-right">
              <div className="bg-white p-2 rounded shadow-md text-xs">
                <div className="flex items-center"><div className="w-3 h-3 rounded-full bg-blue-500 mr-1" /> Agent</div>
                <div className="flex items-center"><div className="w-3 h-3 rounded-full bg-amber-500 mr-1" /> Task</div>
                <div className="flex items-center"><div className="w-3 h-3 rounded-full bg-emerald-500 mr-1" /> Topic</div>
                <div className="flex items-center"><div className="w-3 h-3 rounded-full bg-purple-500 mr-1" /> Action Item</div>
                <div className="flex items-center"><div className="w-3 h-3 rounded-full bg-pink-500 mr-1" /> Result</div>
              </div>
            </Panel>
          </ReactFlow>
        </div>
      </CardContent>
    </Card>
  );
} 