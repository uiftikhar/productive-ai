# Agent Protocol API Integration

## Overview

This directory contains the implementation of the client-side integration with the Agent Protocol API for meeting analysis. The implementation follows the adapter pattern to maintain backward compatibility with the existing UI components while using the new Agent Protocol API endpoints.

## Components

- **AgentProtocolService**: Direct implementation of the Agent Protocol API endpoints
- **AgentProtocolAdapter**: Adapter that converts between the Agent Protocol API and the legacy API format
- **MeetingAnalysisService**: Service that now uses the AgentProtocolAdapter to maintain the same interface

## Architecture

```
+------------------------+     +------------------------+     +------------------------+
|                        |     |                        |     |                        |
|  UI Components         |---->|  MeetingAnalysisService|---->|  AgentProtocolAdapter |
|  (No changes needed)   |     |  (Updated to use       |     |  (Adapts legacy format|
|                        |     |   the adapter)         |     |   to Agent Protocol)  |
+------------------------+     +------------------------+     +-----------|------------+
                                                                          |
                                                              +-----------|------------+
                                                              |                        |
                                                              |  AgentProtocolService  |
                                                              |  (New API endpoints)   |
                                                              |                        |
                                                              +------------------------+
```

## How it Works

1. **UI Components** continue to use the `MeetingAnalysisService` with the same interface as before
2. The `MeetingAnalysisService` now delegates all calls to the `AgentProtocolAdapter`
3. The `AgentProtocolAdapter` adapts the requests and responses to work with the new Agent Protocol
4. The `AgentProtocolService` communicates directly with the Agent Protocol API endpoints

## API Differences

The main differences between the legacy API and the Agent Protocol API:

1. **Session Creation**: In the legacy API, sessions are created explicitly. In the Agent Protocol, we use meeting IDs directly.
2. **Analysis Flow**: The legacy API separates session creation and analysis. The Agent Protocol combines these in a single step.
3. **Status Checking**: The legacy API uses session IDs for status. The Agent Protocol requires both a meeting ID and an execution ID.
4. **Results Format**: The results format is different between the two APIs and requires mapping.

## Testing

You can test the Agent Protocol integration with:

```shell
node test-api-access.js
```

## Compatibility

This implementation maintains backward compatibility with all existing UI components while leveraging the improved features of the Agent Protocol API.

## Future Improvements

- Implement persistent storage of execution IDs for sessions
- Add support for streaming responses
- Add support for more advanced Agent Protocol features like tool execution 