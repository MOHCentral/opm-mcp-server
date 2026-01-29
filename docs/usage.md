# OpenMOHAA MCP Server - Usage Guide

This guide shows how to use the OpenMOHAA MCP server for common tasks.

## Getting Started

### Prerequisites

1. Install system dependencies:
```bash
sudo apt install xdotool imagemagick xprop xwininfo
```

2. Install Node.js dependencies:
```bash
cd opm-mcp
npm install
npm run build
```

3. Configure your MCP client to use the server.

### Testing the Setup

Use the dependency check tool:
```
Check if OpenMOHAA MCP dependencies are installed
```

Expected response: "All dependencies are available"

---

## Basic Game Control

### Launching the Game

```
Launch OpenMOHAA from /home/user/games/openmohaa/openmohaa.x86_64 in windowed mode
```

The server will:
1. Validate the executable exists
2. Start the process with console enabled
3. Wait for startup confirmation
4. Return the process state

### Stopping the Game

Graceful stop:
```
Stop the OpenMOHAA game
```

Force kill (if unresponsive):
```
Force kill the OpenMOHAA process
```

### Checking Status

```
Get the status of OpenMOHAA
```

---

## Console Commands

### Sending Commands

```
Send the command "map dm/mohdm1" to OpenMOHAA
```

```
Send command "god" to enable god mode
```

### Working with Cvars

Get a cvar:
```
Get the value of cvar sv_maxclients in OpenMOHAA
```

Set a cvar:
```
Set cvar r_fullscreen to 0 in OpenMOHAA
```

### Reading Console Output

```
Get the last 50 lines of OpenMOHAA console output
```

```
Search OpenMOHAA console output for "error" pattern
```

### Loading Maps

```
Load map dm/mohdm1 in OpenMOHAA
```

---

## Input Simulation

### Mouse Control

Move mouse:
```
Move mouse to coordinates 640, 360
```

Click:
```
Click at position 400, 300 in OpenMOHAA
```

Right click:
```
Right click the mouse in OpenMOHAA
```

Scroll:
```
Scroll mouse up in OpenMOHAA
```

### Keyboard Input

Type text:
```
Type "connect 192.168.1.100" in OpenMOHAA
```

Press a key:
```
Press the Enter key in OpenMOHAA
```

Key combination:
```
Press Ctrl+S in OpenMOHAA
```

### Console Interaction

Open and use console:
```
1. Toggle the console in OpenMOHAA
2. Type "map dm/mohdm1"
3. Press Enter
4. Toggle console closed
```

---

## Screen Capture

### Taking Screenshots

Simple screenshot:
```
Take a screenshot of OpenMOHAA
```

Save to file:
```
Take a screenshot of OpenMOHAA and save to /tmp/screenshot.png
```

Capture region:
```
Take a screenshot of region 0,0 to 640x480 in OpenMOHAA
```

### Pixel Analysis

Get pixel color:
```
Get the color of the pixel at 100, 100 in OpenMOHAA
```

Check pixel color:
```
Check if pixel at 100,100 is red (255,0,0) in OpenMOHAA
```

---

## Waiting for Conditions

### Wait for Console Text

```
Wait for "Map loaded" to appear in OpenMOHAA console (timeout 60 seconds)
```

### Wait for Visual State

```
Wait for pixel at 100,100 to become white (255,255,255) in OpenMOHAA
```

### Simple Delay

```
Wait 5 seconds in OpenMOHAA
```

---

## Automation Scripts

### Running a Test Script

```
Run this automation script in OpenMOHAA:
{
  "name": "Map Load Test",
  "steps": [
    { "action": "command", "params": { "command": "map dm/mohdm1" } },
    { "action": "wait_for_console", "params": { "pattern": "loaded" } },
    { "action": "screenshot", "params": { "path": "/tmp/maptest.png" } }
  ]
}
```

### Creating a Map Test

```
Create a test script for loading map dm/mohdm2 with executable /home/user/openmohaa/openmohaa
```

---

## Common Workflows

### Workflow 1: Launch and Load Map

```
1. Launch OpenMOHAA from /path/to/openmohaa in windowed mode at 1280x720
2. Wait 10 seconds for startup
3. Send command "map dm/mohdm1"
4. Wait for "loaded" in console
5. Take a screenshot
```

### Workflow 2: Test Console Commands

```
1. Launch OpenMOHAA
2. Toggle console
3. Type "god"
4. Press Enter
5. Wait 1 second
6. Type "give all"
7. Press Enter
8. Toggle console closed
9. Take a screenshot
```

### Workflow 3: Menu Navigation

```
1. Launch OpenMOHAA
2. Wait 5 seconds
3. Click at 640, 400 (Start Game button)
4. Wait 2 seconds
5. Click at 640, 300 (Multiplayer option)
6. Take screenshot
```

### Workflow 4: Automated Testing

```
Run this test in OpenMOHAA:
{
  "name": "Full Game Test",
  "setup": [
    {
      "action": "launch",
      "params": {
        "executablePath": "/path/to/openmohaa",
        "windowed": true,
        "width": 1280,
        "height": 720
      }
    },
    { "action": "wait", "params": { "ms": 10000 } }
  ],
  "steps": [
    { "action": "toggle_console", "params": {} },
    { "action": "wait", "params": { "ms": 500 } },
    { "action": "type", "params": { "text": "map dm/mohdm1" } },
    { "action": "press_key", "params": { "key": "enter" } },
    { 
      "action": "wait_for_console", 
      "params": { "pattern": "loaded", "timeout": 60000 }
    },
    { "action": "toggle_console", "params": {} },
    { "action": "wait", "params": { "ms": 2000 } },
    { "action": "screenshot", "params": { "path": "/tmp/test_map.png" } },
    { "action": "toggle_console", "params": {} },
    { "action": "type", "params": { "text": "god" } },
    { "action": "press_key", "params": { "key": "enter" } },
    { "action": "type", "params": { "text": "give all" } },
    { "action": "press_key", "params": { "key": "enter" } },
    { "action": "toggle_console", "params": {} },
    { "action": "screenshot", "params": { "path": "/tmp/test_cheats.png" } }
  ],
  "teardown": [
    { "action": "command", "params": { "command": "quit" } },
    { "action": "wait", "params": { "ms": 3000 } }
  ]
}
```

---

## Tips and Best Practices

### Game Startup
- Always wait several seconds after launch before sending commands
- The game needs time to initialize before console is ready
- Use `wait_for_console` with initialization patterns

### Console Commands
- Toggle console before typing commands via keyboard
- Use `send_command` for reliable command execution
- Some commands may require cheats enabled

### Input Timing
- Add small delays between rapid inputs
- Keyboard typing is not instant
- Mouse movement should precede clicks

### Screenshot Timing
- Wait for visual state to stabilize
- Capture after animations complete
- Use conditions to ensure correct state

### Error Handling
- Check game status before sending commands
- Use timeouts on wait conditions
- Handle missing window gracefully

### Testing
- Use setup/teardown for clean test state
- Organize related steps together
- Take screenshots at key points for debugging
