# OpenMOHAA MCP Server - Architecture

## Overview

The OpenMOHAA MCP Server is a TypeScript-based Model Context Protocol server that provides comprehensive automation and control capabilities for the OpenMOHAA game on Linux.

## Design Principles

1. **Modularity**: Each component handles a specific domain (process, console, UI, screen)
2. **Event-Driven**: Components emit events for real-time monitoring
3. **Fault Tolerance**: Graceful error handling and recovery
4. **Platform Awareness**: Detects X11/Wayland and adapts accordingly

## Component Architecture

```
+-------------------+
|   MCP Server      |
|   (index.ts)      |
+--------+----------+
         |
         v
+--------+----------+     +------------------+
| ProcessLauncher   |<--->| ConsoleManager   |
| (launcher.ts)     |     | (console-mgr.ts) |
+--------+----------+     +--------+---------+
         |                         |
         v                         v
+--------+----------+     +--------+---------+
| UIController      |     | ScreenCapture    |
| (ui-controller.ts)|     | (screen-capt.ts) |
+-------------------+     +------------------+
         |                         |
         +-----------+-------------+
                     |
                     v
         +-----------+-----------+
         | AutomationFramework   |
         | (automation.ts)       |
         +-----------------------+
```

## Component Details

### ProcessLauncher (launcher.ts)

**Responsibility**: Game process lifecycle management

**Key Features**:
- Process spawning with environment control
- stdout/stderr capture and buffering
- Process health monitoring
- Graceful shutdown and force kill
- Auto-restart capability

**Events Emitted**:
- `started`: Game launched successfully
- `exit`: Game process exited
- `error`: Process error occurred
- `output`: Console output received
- `mapLoaded`: Map loading detected
- `crash`: Crash detected

**IPC Methods**:
- stdin pipe for direct input
- Output stream parsing

### ConsoleManager (console-manager.ts)

**Responsibility**: Game console interaction

**Key Features**:
- Command sending via stdin
- Cvar read/write with caching
- Config file execution
- Output pattern matching
- Command response parsing

**Console Injection Methods**:
1. **stdin pipe**: Direct input to process stdin
2. **Key simulation**: Fallback using UI controller
3. **FIFO pipe**: Future enhancement option

**Cvar Cache**:
- Reduces repeated queries
- Updated on output parsing
- Manual refresh available

### UIController (ui-controller.ts)

**Responsibility**: Input simulation and window management

**Key Features**:
- Mouse movement (absolute, relative, window-relative)
- Mouse clicks (left, right, middle, double)
- Keyboard input (type, press, hold, release)
- Key combinations and modifiers
- Window focus and management

**Platform Support**:
- **X11**: Uses xdotool (primary)
- **Wayland**: Uses ydotool (fallback)

**Key Mapping**:
- Standard keys to xdotool keysyms
- Special character handling
- Modifier key support

### ScreenCapture (screen-capture.ts)

**Responsibility**: Visual state capture and analysis

**Key Features**:
- Full screen capture
- Window-specific capture
- Region capture
- Pixel color sampling
- Template image matching

**Tools Used**:
- **ImageMagick import**: Screenshot capture
- **ImageMagick convert**: Image processing
- **ImageMagick compare**: Template matching

**Image Matching**:
- Uses RMSE (Root Mean Square Error) metric
- Configurable confidence threshold
- Returns match coordinates

### AutomationFramework (automation.ts)

**Responsibility**: Test orchestration and scripting

**Script Structure**:
```typescript
interface AutomationScript {
  name: string;
  description?: string;
  setup?: AutomationStep[];     // Pre-test setup
  steps: AutomationStep[];       // Main test steps
  teardown?: AutomationStep[];   // Cleanup (always runs)
}
```

**Supported Actions**:
- Process control (launch, stop, restart)
- Console commands
- Mouse/keyboard input
- Screen assertions
- Wait conditions

**Condition Types**:
- `console_pattern`: Wait for text in output
- `pixel_color`: Wait for pixel to match color
- `cvar_value`: Wait for cvar to have value
- `window_exists`: Wait for window
- `timeout`: Simple delay

## Data Flow

### Command Execution Flow

```
1. MCP Client sends tool call
2. Server routes to appropriate component
3. Component executes action
4. Result returned as MCP response
```

### Console Command Flow

```
1. ConsoleManager.sendCommand(cmd)
2. Try stdin injection
3. If fails, emit needKeySimulation event
4. Wait for response in output buffer
5. Parse and return result
```

### Screen Capture Flow

```
1. Find game window (xdotool search)
2. Capture using ImageMagick import
3. Process/analyze as needed
4. Return data/path/base64
```

## Error Handling

### Process Errors
- Captured via `error` event
- State updated to reflect failure
- Optional auto-restart

### Tool Errors
- Wrapped in try/catch
- Return isError: true in response
- Error message in content

### Dependency Errors
- Checked on startup
- Warning logged
- Graceful degradation

## Performance Considerations

### Console Buffer
- Max 10,000 lines
- Trimmed to 5,000 when exceeded
- Pattern search uses regex

### Screenshot Caching
- Temp files in /tmp/openmohaa-mcp/
- Cleanup method available
- Auto-cleanup recommended

### Input Timing
- Configurable delays between inputs
- Default 12ms between keystrokes
- Allows for game response time

## Security Considerations

### Process Isolation
- No elevated privileges required
- Works with user permissions
- No network exposure (stdio transport)

### Input Validation
- Executable path validation
- Config file existence checks
- Command sanitization

## Future Enhancements

1. **Memory Reading**: Direct game state access
2. **FIFO Console**: Alternative command injection
3. **OCR Support**: Text recognition on screen
4. **Recording/Playback**: Action macro recording
5. **Network Protocol**: HTTP/WebSocket transport
