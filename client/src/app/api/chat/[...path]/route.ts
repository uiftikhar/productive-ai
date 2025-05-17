import { NextRequest, NextResponse } from 'next/server';

const API_URL = process.env.API_URL || 'http://localhost:3001';

/**
 * API route handler for forwarding chat requests to the server
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { path: string[] } }
) {
  const path = params.path.join('/');
  const { searchParams } = new URL(request.url);
  
  // Construct the URL with query parameters
  let url = `${API_URL}/api/chat/${path}`;
  if (searchParams.toString()) {
    url += `?${searchParams.toString()}`;
  }
  
  try {
    // Forward the request to the server
    const response = await fetch(url, {
      headers: {
        'Content-Type': 'application/json',
        ...Object.fromEntries(request.headers),
      },
      credentials: 'include',
    });
    
    // Get the response data
    const data = await response.json();
    
    // Return the response
    return NextResponse.json(data, {
      status: response.status,
    });
  } catch (error) {
    console.error('Error forwarding request to server:', error);
    return NextResponse.json(
      { error: 'Failed to communicate with the server' },
      { status: 500 }
    );
  }
}

/**
 * API route handler for forwarding POST requests to the server
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { path: string[] } }
) {
  const path = params.path.join('/');
  
  try {
    // Get the request body
    const body = await request.json();
    
    // Forward the request to the server
    const response = await fetch(`${API_URL}/api/chat/${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...Object.fromEntries(request.headers),
      },
      body: JSON.stringify(body),
      credentials: 'include',
    });
    
    // Get the response data
    const data = await response.json();
    
    // Return the response
    return NextResponse.json(data, {
      status: response.status,
    });
  } catch (error) {
    console.error('Error forwarding request to server:', error);
    return NextResponse.json(
      { error: 'Failed to communicate with the server' },
      { status: 500 }
    );
  }
} 