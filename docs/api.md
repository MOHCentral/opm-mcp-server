# OpenMOHAA MCP Server - API Reference

This document provides detailed information about all available MCP tools.

## Environment Variables

Configure these in your MCP client's `env` section:

| Variable | Description |
|----------|-------------|
| `OPENMOHAA_EXEC_PATH` | Default path to OpenMOHAA executable |
| `OPENMOHAA_GAME_DIR` | Default game directory for config/demo/log operations |

## Game Lifecycle Tools

### openmohaa_launch

Launch OpenMOHAA with specified configuration.

**Parameters**:

| Name | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| executablePath | string | No | env var | Full path to executable. Falls back to OPENMOHAA_EXEC_PATH |
| workingDirectory | string | No | exe dir | Working directory for the game |
| args | string[] | No | [] | Additional command line arguments |
| env | object | No | {} | Environment variables |
| windowedMode | boolean | No | true | Run in windowed mode |
| width | number | No | 1280 | Window width |
| height | number | No | 720 | Window height |
| enableConsole | boolean | No | true | Enable developer console |
| enableCheats | boolean | No | true | Enable cheat commands |

**Response**:
```json
{
  "pid": 12345,
  "running": true,
  "exitCode": null,
  "startTime": "2024-01-15T10:30:00Z",
  "lastError": null
}
```

### openmohaa_get_defaults

Get configured default paths from environment variables.

**Parameters**: None

**Response**:
```json
{
  "executablePath": "/path/to/openmohaa",
  "gameDirectory": "/path/to/game",
  "hint": "Set via OPENMOHAA_EXEC_PATH and OPENMOHAA_GAME_DIR env vars in mcp.json"
}
```

### openmohaa_stop

Stop the running game gracefully.

**Parameters**: None

**Response**: "Game stopped successfully"

### openmohaa_restart

Restart the game with the same configuration.

**Parameters**: None

**Response**: Process state object

### openmohaa_kill

Force kill the game process.

**Parameters**: None

**Response**: "Game force killed"

### openmohaa_status

Get current game process status.

**Parameters**: None

**Response**:
```json
{
  "pid": 12345,
  "running": true,
  "exitCode": null,
  "startTime": "2024-01-15T10:30:00Z",
  "lastError": null
}
```

---

## Console Command Tools

### openmohaa_send_command

Send a console command to the game.

**Parameters**:

| Name | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| command | string | Yes | - | Console command to execute |
| waitForResponse | boolean | No | true | Wait for command output |
| timeout | number | No | 5000 | Timeout in milliseconds |

**Response**:
```json
{
  "success": true,
  "output": "Command output here",
  "error": null
}
```

### openmohaa_set_cvar

Set a console variable value.

**Parameters**:

| Name | Type | Required | Description |
|------|------|----------|-------------|
| name | string | Yes | Cvar name |
| value | string | Yes | Value to set |

**Response**: Command result object

### openmohaa_get_cvar

Get a console variable value.

**Parameters**:

| Name | Type | Required | Description |
|------|------|----------|-------------|
| name | string | Yes | Cvar name |

**Response**:
```json
{
  "name": "sv_maxclients",
  "value": "32",
  "defaultValue": "8"
}
```

### openmohaa_exec_config

Execute a config file.

**Parameters**:

| Name | Type | Required | Description |
|------|------|----------|-------------|
| path | string | Yes | Path to config file |

**Response**: Command result object

### openmohaa_load_map

Load a map by name.

**Parameters**:

| Name | Type | Required | Description |
|------|------|----------|-------------|
| mapName | string | Yes | Map name to load |

**Response**: Command result object

### openmohaa_get_console_output

Get recent console output.

**Parameters**:

| Name | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| lines | number | No | 100 | Number of lines to retrieve |
| pattern | string | No | - | Regex pattern to filter |

**Response**: Formatted console output text

---

## Mouse Control Tools

### openmohaa_mouse_move

Move mouse cursor to coordinates.

**Parameters**:

| Name | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| x | number | Yes | - | X coordinate |
| y | number | Yes | - | Y coordinate |
| relative | boolean | No | false | Use relative movement |
| window | boolean | No | false | Coordinates relative to game window |

**Response**: "Mouse moved to x, y"

### openmohaa_mouse_click

Click mouse button.

**Parameters**:

| Name | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| button | string | No | "left" | Button: left, right, middle |
| x | number | No | - | X coordinate (optional) |
| y | number | No | - | Y coordinate (optional) |
| doubleClick | boolean | No | false | Perform double click |

**Response**: "Mouse clicked"

### openmohaa_mouse_drag

Drag mouse from one position to another.

**Parameters**:

| Name | Type | Required | Description |
|------|------|----------|-------------|
| startX | number | Yes | Starting X |
| startY | number | Yes | Starting Y |
| endX | number | Yes | Ending X |
| endY | number | Yes | Ending Y |
| button | string | No | Button to use |

**Response**: "Mouse dragged"

### openmohaa_scroll

Scroll mouse wheel.

**Parameters**:

| Name | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| direction | string | Yes | - | "up" or "down" |
| clicks | number | No | 3 | Number of scroll clicks |

**Response**: "Scrolled direction"

---

## Keyboard Control Tools

### openmohaa_type_text

Type text using keyboard.

**Parameters**:

| Name | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| text | string | Yes | - | Text to type |
| delay | number | No | 12 | Delay between keystrokes (ms) |

**Response**: "Text typed"

### openmohaa_press_key

Press a single key or key with modifiers.

**Parameters**:

| Name | Type | Required | Description |
|------|------|----------|-------------|
| key | string | Yes | Key name (e.g., "enter", "f1", "a") |
| modifiers | string[] | No | Modifier keys: ctrl, alt, shift, super |

**Supported Keys**:
- Letters: a-z
- Numbers: 0-9
- Function keys: f1-f12
- Special: enter, escape, tab, space, backspace
- Navigation: up, down, left, right, home, end, pageup, pagedown
- Symbols: grave (backtick), minus, equal, bracketleft, bracketright

**Response**: "Key pressed: keyname"

### openmohaa_key_combo

Press a key combination.

**Parameters**:

| Name | Type | Required | Description |
|------|------|----------|-------------|
| combo | string | Yes | Key combination (e.g., "ctrl+c") |

**Response**: "Key combo pressed: combo"

---

## Window Control Tools

### openmohaa_focus_window

Focus the game window.

**Parameters**: None

**Response**: "Window focused" or "Failed to focus window"

### openmohaa_find_window

Find game window and get info.

**Parameters**:

| Name | Type | Required | Description |
|------|------|----------|-------------|
| title | string | No | Window title to search for |

**Response**:
```json
{
  "id": "12345678",
  "title": "OpenMOHAA",
  "x": 100,
  "y": 100,
  "width": 1280,
  "height": 720,
  "focused": true
}
```

### openmohaa_toggle_console

Toggle the in-game console.

**Parameters**: None

**Response**: "Console toggled"

---

## Screen Capture Tools

### openmohaa_screenshot

Capture screenshot.

**Parameters**:

| Name | Type | Required | Description |
|------|------|----------|-------------|
| outputPath | string | No | Path to save screenshot |
| region | object | No | Capture specific region |
| format | string | No | "png" or "jpeg" |

**Region Object**:
```json
{
  "x": 0,
  "y": 0,
  "width": 640,
  "height": 480
}
```

**Response**: Screenshot info + image data

### openmohaa_get_pixel

Get pixel color at coordinates.

**Parameters**:

| Name | Type | Required | Description |
|------|------|----------|-------------|
| x | number | Yes | X coordinate |
| y | number | Yes | Y coordinate |

**Response**: "Pixel at (x, y): RGB(r, g, b)"

### openmohaa_check_pixel

Check if pixel matches expected color.

**Parameters**:

| Name | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| x | number | Yes | - | X coordinate |
| y | number | Yes | - | Y coordinate |
| r | number | Yes | - | Expected red (0-255) |
| g | number | Yes | - | Expected green (0-255) |
| b | number | Yes | - | Expected blue (0-255) |
| tolerance | number | No | 10 | Color tolerance |

**Response**: "Pixel matches/does not match expected color"

### openmohaa_find_image

Find image template on screen.

**Parameters**:

| Name | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| templatePath | string | Yes | - | Path to template image |
| threshold | number | No | 0.9 | Match threshold (0-1) |
| region | object | No | - | Search region |

**Response**: Match result with coordinates and confidence

---

## Wait and Condition Tools

### openmohaa_wait

Wait for specified duration.

**Parameters**:

| Name | Type | Required | Description |
|------|------|----------|-------------|
| ms | number | Yes | Duration in milliseconds |

**Response**: "Waited Xms"

### openmohaa_wait_for_console

Wait for text to appear in console.

**Parameters**:

| Name | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| pattern | string | Yes | - | Regex pattern |
| timeout | number | No | 30000 | Timeout (ms) |

**Response**: Pattern found or timeout message

### openmohaa_wait_for_pixel

Wait for pixel to become specific color.

**Parameters**:

| Name | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| x | number | Yes | - | X coordinate |
| y | number | Yes | - | Y coordinate |
| r | number | Yes | - | Expected red |
| g | number | Yes | - | Expected green |
| b | number | Yes | - | Expected blue |
| tolerance | number | No | 10 | Color tolerance |
| timeout | number | No | 30000 | Timeout (ms) |

**Response**: Match result

### openmohaa_wait_for_image

Wait for image to appear on screen.

**Parameters**:

| Name | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| templatePath | string | Yes | - | Path to template |
| threshold | number | No | 0.9 | Match threshold |
| timeout | number | No | 30000 | Timeout (ms) |

**Response**: Match result

---

## Automation Tools

### openmohaa_run_script

Run an automation script.

**Parameters**:

| Name | Type | Required | Description |
|------|------|----------|-------------|
| script | object | Yes | Automation script object |

**Script Structure**:
```json
{
  "name": "Test Name",
  "description": "Optional description",
  "setup": [ /* setup steps */ ],
  "steps": [ /* main steps */ ],
  "teardown": [ /* cleanup steps */ ]
}
```

**Step Structure**:
```json
{
  "action": "action_name",
  "params": { /* action parameters */ },
  "timeout": 30000,
  "waitAfter": 1000,
  "condition": { /* optional wait condition */ }
}
```

**Response**: Test result with pass/fail status and step details

### openmohaa_create_map_test

Create a test script for loading a map.

**Parameters**:

| Name | Type | Required | Description |
|------|------|----------|-------------|
| mapName | string | Yes | Map name to test |
| executablePath | string | Yes | Path to game executable |

**Response**: Generated automation script object

---

## Utility Tools

### openmohaa_check_dependencies

Check if required system tools are available.

**Parameters**: None

**Response**: List of available/missing dependencies

### openmohaa_get_screen_resolution

Get current screen resolution.

**Parameters**: None

**Response**: "Screen resolution: WIDTHxHEIGHT"

### openmohaa_get_display_server

Get display server type.

**Parameters**: None

**Response**: "Display server: x11" or "Display server: wayland"

---

## Build System Tools

### openmohaa_build_check_tools

Check if build tools (cmake, make, g++, gcc, git) are available.

**Parameters**: None

**Response**:
```json
{
  "available": true,
  "missing": [],
  "versions": {
    "cmake": "cmake version 3.22.1",
    "make": "GNU Make 4.3",
    "g++": "g++ (Ubuntu 11.4.0-1ubuntu1~22.04) 11.4.0",
    "gcc": "gcc (Ubuntu 11.4.0-1ubuntu1~22.04) 11.4.0",
    "git": "git version 2.34.1"
  }
}
```

### openmohaa_build_clone

Clone or update the OpenMOHAA repository.

**Parameters**:

| Name | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| targetDir | string | Yes | - | Directory to clone into |
| branch | string | No | "main" | Branch to checkout |

**Response**: Clone/update result

### openmohaa_build_configure

Configure the build with CMake.

**Parameters**:

| Name | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| sourceDir | string | Yes | - | Source code directory |
| buildDir | string | Yes | - | Build output directory |
| buildType | string | No | "Release" | Debug, Release, or RelWithDebInfo |
| cmakeOptions | string[] | No | [] | Additional CMake options |

**Response**: Build result with success, duration, output, errors, warnings

### openmohaa_build_compile

Compile the project.

**Parameters**:

| Name | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| buildDir | string | Yes | - | Build directory |
| jobs | number | No | auto | Number of parallel jobs |
| targets | string[] | No | [] | Specific targets to build |

**Response**: Build result

### openmohaa_build_clean

Clean the build directory.

**Parameters**:

| Name | Type | Required | Description |
|------|------|----------|-------------|
| buildDir | string | Yes | Build directory to clean |

**Response**: Clean result

### openmohaa_build_status

Get current build status.

**Parameters**: None

**Response**:
```json
{
  "isBuilding": true,
  "output": ["[1/10] Building...", "..."]
}
```

### openmohaa_build_cancel

Cancel the current build.

**Parameters**: None

**Response**: "Build cancelled" or "No build in progress"

### openmohaa_build_git_info

Get git information for the repository.

**Parameters**:

| Name | Type | Required | Description |
|------|------|----------|-------------|
| repoDir | string | Yes | Repository directory |

**Response**:
```json
{
  "branch": "main",
  "commit": "abc123...",
  "shortCommit": "abc123",
  "message": "Latest commit message",
  "author": "Developer Name",
  "date": "2024-01-15 10:30:00 +0000",
  "dirty": "false"
}
```

### openmohaa_build_run_tests

Run tests using CTest.

**Parameters**:

| Name | Type | Required | Description |
|------|------|----------|-------------|
| buildDir | string | Yes | Build directory |
| testPattern | string | No | Test pattern to filter |

**Response**: Test result

### openmohaa_build_package

Create a release package.

**Parameters**:

| Name | Type | Required | Description |
|------|------|----------|-------------|
| buildDir | string | Yes | Build directory |
| outputDir | string | Yes | Output directory for package |
| name | string | Yes | Package name |

**Response**: Package result with path

---

## Demo Management Tools

### openmohaa_demo_start_recording

Start recording a demo.

**Parameters**:

| Name | Type | Required | Description |
|------|------|----------|-------------|
| demoName | string | No | Name for the demo file |

**Response**: Recording result

### openmohaa_demo_stop_recording

Stop recording the current demo.

**Parameters**: None

**Response**: Stop result with duration

### openmohaa_demo_play

Play a demo file.

**Parameters**:

| Name | Type | Required | Description |
|------|------|----------|-------------|
| demoName | string | Yes | Name of the demo to play |

**Response**: Play result

### openmohaa_demo_stop

Stop demo playback.

**Parameters**: None

**Response**: Stop result

### openmohaa_demo_list

List all available demos.

**Parameters**: None

**Response**: Array of demo info objects

### openmohaa_demo_delete

Delete a demo file.

**Parameters**:

| Name | Type | Required | Description |
|------|------|----------|-------------|
| demoName | string | Yes | Name of the demo to delete |

**Response**: Delete result

### openmohaa_demo_rename

Rename a demo file.

**Parameters**:

| Name | Type | Required | Description |
|------|------|----------|-------------|
| oldName | string | Yes | Current demo name |
| newName | string | Yes | New demo name |

**Response**: Rename result

### openmohaa_demo_pause

Pause demo playback.

**Parameters**: None

**Response**: Pause result

### openmohaa_demo_resume

Resume demo playback.

**Parameters**: None

**Response**: Resume result

### openmohaa_demo_set_speed

Set demo playback speed.

**Parameters**:

| Name | Type | Required | Description |
|------|------|----------|-------------|
| speed | number | Yes | Playback speed (0.1 to 10) |

**Response**: Speed result

### openmohaa_demo_seek

Seek to a specific time in the demo.

**Parameters**:

| Name | Type | Required | Description |
|------|------|----------|-------------|
| seconds | number | Yes | Time in seconds |

**Response**: Seek result

### openmohaa_demo_cleanup

Clean up old demos.

**Parameters**:

| Name | Type | Required | Description |
|------|------|----------|-------------|
| olderThanDays | number | No | Delete demos older than N days |
| keepCount | number | No | Keep only N most recent demos |
| maxSizeMB | number | No | Maximum total size in MB |

**Response**: Cleanup result with deleted list and freed bytes

### openmohaa_demo_set_dir

Set the demo directory.

**Parameters**:

| Name | Type | Required | Description |
|------|------|----------|-------------|
| dir | string | Yes | Demo directory path |

**Response**: Confirmation message

---

## Config Management Tools

### openmohaa_config_read

Read a config file.

**Parameters**:

| Name | Type | Required | Description |
|------|------|----------|-------------|
| filename | string | Yes | Config filename |

**Response**: Config file content

### openmohaa_config_write

Write a config file.

**Parameters**:

| Name | Type | Required | Description |
|------|------|----------|-------------|
| filename | string | Yes | Config filename |
| content | string | Yes | Config file content |

**Response**: Write result

### openmohaa_config_list

List all config files.

**Parameters**: None

**Response**: Array of config file info

### openmohaa_config_parse

Parse a config file into structured data.

**Parameters**:

| Name | Type | Required | Description |
|------|------|----------|-------------|
| filename | string | Yes | Config filename |

**Response**:
```json
{
  "binds": {"w": "+forward", "s": "+back"},
  "cvars": {"name": "Player", "sensitivity": "5"},
  "aliases": {"quit": "disconnect; quit"},
  "execs": ["autoexec.cfg"],
  "other": []
}
```

### openmohaa_config_get_autoexec

Get or create autoexec.cfg.

**Parameters**: None

**Response**: Autoexec config file

### openmohaa_config_set_cvar

Set a cvar in autoexec.cfg.

**Parameters**:

| Name | Type | Required | Description |
|------|------|----------|-------------|
| name | string | Yes | Cvar name |
| value | string | Yes | Cvar value |

**Response**: Result

### openmohaa_config_set_bind

Set a key binding in autoexec.cfg.

**Parameters**:

| Name | Type | Required | Description |
|------|------|----------|-------------|
| key | string | Yes | Key to bind |
| command | string | Yes | Command to execute |

**Response**: Result

### openmohaa_config_backup

Create a backup of a config file.

**Parameters**:

| Name | Type | Required | Description |
|------|------|----------|-------------|
| filename | string | Yes | Config filename to backup |

**Response**: Backup result with path

### openmohaa_config_restore

Restore a config from backup.

**Parameters**:

| Name | Type | Required | Description |
|------|------|----------|-------------|
| backupFilename | string | Yes | Backup filename |

**Response**: Restore result

### openmohaa_config_validate

Validate a config file syntax.

**Parameters**:

| Name | Type | Required | Description |
|------|------|----------|-------------|
| content | string | Yes | Config file content to validate |

**Response**:
```json
{
  "valid": true,
  "errors": [],
  "warnings": []
}
```

### openmohaa_config_graphics_preset

Apply a graphics preset.

**Parameters**:

| Name | Type | Required | Description |
|------|------|----------|-------------|
| preset | string | Yes | low, medium, high, or ultra |

**Response**: Apply result

### openmohaa_config_set_game_dir

Set the game directory for config management.

**Parameters**:

| Name | Type | Required | Description |
|------|------|----------|-------------|
| gameDir | string | Yes | Game directory path |
| modDir | string | No | Mod directory (default: main) |

**Response**: Confirmation message

---

## Server Management Tools

### openmohaa_server_start

Start a dedicated server.

**Parameters**:

| Name | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| executablePath | string | Yes | - | Path to server executable |
| gameDir | string | No | - | Game directory |
| mod | string | No | - | Mod to load |
| port | number | No | 12203 | Server port |
| maxPlayers | number | No | 16 | Maximum players |
| hostname | string | No | - | Server hostname |
| password | string | No | - | Server password |
| rconPassword | string | No | - | RCON password |
| map | string | No | - | Initial map |
| gametype | string | No | - | Game type |
| dedicated | number | No | 2 | 1=LAN, 2=Internet |

**Response**: Start result with PID

### openmohaa_server_stop

Stop the dedicated server.

**Parameters**: None

**Response**: Stop result

### openmohaa_server_restart

Restart the dedicated server.

**Parameters**: None

**Response**: Restart result

### openmohaa_server_status

Get server status.

**Parameters**: None

**Response**:
```json
{
  "running": true,
  "pid": 12345,
  "uptime": 3600000,
  "players": [],
  "map": "dm/mohdm1",
  "hostname": "My Server",
  "maxPlayers": 16
}
```

### openmohaa_server_rcon

Send an RCON command.

**Parameters**:

| Name | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| command | string | Yes | - | RCON command |
| host | string | No | "localhost" | Server hostname |
| port | number | No | 12203 | Server port |
| password | string | Yes | - | RCON password |

**Response**: RCON response

### openmohaa_server_query

Query server status via UDP.

**Parameters**:

| Name | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| host | string | Yes | - | Server hostname |
| port | number | No | 12203 | Server port |

**Response**: Server status with players

### openmohaa_server_output

Get server console output.

**Parameters**:

| Name | Type | Required | Description |
|------|------|----------|-------------|
| lines | number | No | Number of lines to retrieve |

**Response**: Console output lines

### openmohaa_server_change_map

Change the current map.

**Parameters**:

| Name | Type | Required | Description |
|------|------|----------|-------------|
| mapName | string | Yes | Map name |

**Response**: Result

### openmohaa_server_kick

Kick a player from the server.

**Parameters**:

| Name | Type | Required | Description |
|------|------|----------|-------------|
| playerId | number | Yes | Player ID |
| reason | string | No | Kick reason |

**Response**: Result

### openmohaa_server_say

Send a server message.

**Parameters**:

| Name | Type | Required | Description |
|------|------|----------|-------------|
| message | string | Yes | Message to send |

**Response**: Result

---

## Performance Monitoring Tools

### openmohaa_perf_start

Start performance monitoring.

**Parameters**:

| Name | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| intervalMs | number | No | 1000 | Sample interval in milliseconds |
| pid | number | No | - | Game process PID |

**Response**: "Performance monitoring started"

### openmohaa_perf_stop

Stop performance monitoring.

**Parameters**: None

**Response**: "Performance monitoring stopped"

### openmohaa_perf_collect

Collect current performance metrics.

**Parameters**: None

**Response**:
```json
{
  "timestamp": 1705312200000,
  "fps": 60,
  "frameTime": 16.67,
  "memory": {"rss": 512, "vms": 1024, "percent": 5.2},
  "cpu": {"percent": 25.5, "cores": [30, 20, 25, 27]},
  "gpu": {"usage": 45, "memory": 256, "temperature": 65}
}
```

### openmohaa_perf_stats

Get performance statistics from collected samples.

**Parameters**: None

**Response**:
```json
{
  "avgFps": 58.5,
  "minFps": 45,
  "maxFps": 62,
  "avgMemory": 520,
  "avgCpu": 28.3,
  "sampleCount": 100
}
```

### openmohaa_perf_benchmark

Run a performance benchmark.

**Parameters**:

| Name | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| name | string | Yes | - | Benchmark name |
| durationMs | number | Yes | - | Benchmark duration in milliseconds |
| sampleIntervalMs | number | No | 100 | Sample interval |

**Response**:
```json
{
  "name": "mohdm1_benchmark",
  "duration": 60000,
  "avgFps": 58.5,
  "minFps": 45,
  "maxFps": 62,
  "p1Fps": 48,
  "p01Fps": 45,
  "sampleCount": 600
}
```

### openmohaa_perf_check_issues

Check for performance issues.

**Parameters**: None

**Response**:
```json
{
  "hasIssues": true,
  "issues": ["Low average FPS: 25.3", "High memory usage: 3000 MB"],
  "recommendations": ["Lower graphics settings", "Restart the game"]
}
```

### openmohaa_perf_export_csv

Export performance data to CSV.

**Parameters**: None

**Response**: CSV formatted data

### openmohaa_perf_clear

Clear collected performance samples.

**Parameters**: None

**Response**: "Performance samples cleared"

---

## Log Analysis Tools

### openmohaa_log_list

List available log files.

**Parameters**: None

**Response**: Array of log file info

### openmohaa_log_parse

Parse a log file.

**Parameters**:

| Name | Type | Required | Description |
|------|------|----------|-------------|
| filePath | string | Yes | Path to log file |

**Response**: Array of log entries (last 100)

### openmohaa_log_stats

Get log statistics.

**Parameters**:

| Name | Type | Required | Description |
|------|------|----------|-------------|
| filePath | string | Yes | Path to log file |

**Response**:
```json
{
  "totalLines": 5000,
  "errors": 12,
  "warnings": 45,
  "kills": 234,
  "connects": 56,
  "disconnects": 54,
  "chatMessages": 123,
  "commands": 89,
  "timeSpan": {"start": "2024-01-15T10:00:00Z", "end": "2024-01-15T14:00:00Z"}
}
```

### openmohaa_log_search

Search logs for a pattern.

**Parameters**:

| Name | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| filePath | string | Yes | - | Path to log file |
| pattern | string | Yes | - | Search pattern (regex) |
| type | string | No | - | Filter by entry type |
| limit | number | No | 100 | Maximum results |

**Response**: Array of matching log entries

### openmohaa_log_errors

Get errors from log.

**Parameters**:

| Name | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| filePath | string | Yes | - | Path to log file |
| limit | number | No | 50 | Maximum results |

**Response**: Array of error entries

### openmohaa_log_kills

Parse kill events from log.

**Parameters**:

| Name | Type | Required | Description |
|------|------|----------|-------------|
| filePath | string | Yes | Path to log file |

**Response**: Array of kill events

### openmohaa_log_sessions

Analyze player sessions from log.

**Parameters**:

| Name | Type | Required | Description |
|------|------|----------|-------------|
| filePath | string | Yes | Path to log file |

**Response**: Array of player sessions with stats

### openmohaa_log_tail

Get last N lines of log.

**Parameters**:

| Name | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| filePath | string | Yes | - | Path to log file |
| lines | number | No | 50 | Number of lines |

**Response**: Log lines

### openmohaa_log_watch

Start watching a log file for new entries.

**Parameters**:

| Name | Type | Required | Description |
|------|------|----------|-------------|
| filePath | string | Yes | Path to log file |

**Response**: "Watching log: path"

### openmohaa_log_unwatch

Stop watching a log file.

**Parameters**:

| Name | Type | Required | Description |
|------|------|----------|-------------|
| filePath | string | Yes | Path to log file |

**Response**: "Stopped watching log: path"

### openmohaa_log_summary

Generate a summary of a log file.

**Parameters**:

| Name | Type | Required | Description |
|------|------|----------|-------------|
| filePath | string | Yes | Path to log file |

**Response**: Formatted log summary

### openmohaa_log_set_dir

Set the log directory.

**Parameters**:

| Name | Type | Required | Description |
|------|------|----------|-------------|
| dir | string | Yes | Log directory path |

**Response**: "Log directory set to: path"
