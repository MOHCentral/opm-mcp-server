# OpenMOHAA MCP Server

A complete Model Context Protocol (MCP) server for automating, testing, and controlling OpenMOHAA on Linux.

## Features

- **Game Lifecycle Control**: Launch, stop, restart, and kill OpenMOHAA
- **Console Interaction**: Send commands, read output, manage cvars
- **UI Automation**: Mouse movement, clicks, keyboard input
- **Screen Capture**: Screenshots, pixel sampling, image matching
- **Test Automation**: Run scripted test sequences with conditions and assertions
- **Build System**: Clone, configure, compile, and package OpenMOHAA from source
- **Demo Management**: Record, play, pause, seek, and manage demo files
- **Config Management**: Read, write, parse, backup, and validate config files
- **Server Management**: Start, stop, query, and control dedicated servers via RCON
- **Performance Monitoring**: Track FPS, memory, CPU/GPU usage, run benchmarks
- **Log Analysis**: Parse, search, and analyze game and server logs

## Requirements

### System Requirements

- Linux (Ubuntu, Arch, or compatible)
- Node.js 18+
- X11 or Wayland display server

### Dependencies

Install required system packages:

```bash
# Ubuntu/Debian
sudo apt install xdotool imagemagick x11-utils scrot

# Arch Linux
sudo pacman -S xdotool imagemagick xorg-xprop xorg-xwininfo scrot

# For Wayland support (optional)
sudo apt install ydotool grim
```

## Installation

```bash
# Clone or copy the repository
cd opm-mcp

# Install dependencies
npm install

# Build the project
npm run build
```

## Configuration

Add to your MCP client configuration (e.g., VS Code mcp.json):

```json
{
  "servers": {
    "openmohaa": {
      "type": "stdio",
      "command": "node",
      "args": ["/path/to/opm-mcp/dist/index.js"],
      "env": {
        "OPENMOHAA_EXEC_PATH": "/path/to/openmohaa",
        "OPENMOHAA_GAME_DIR": "/path/to/game/directory"
      }
    }
  }
}
```

### Environment Variables

| Variable | Description |
|----------|-------------|
| `OPENMOHAA_EXEC_PATH` | Default path to OpenMOHAA executable. Used by `openmohaa_launch` if no path provided. |
| `OPENMOHAA_GAME_DIR` | Default game directory for config/demo/log operations. |

You can check configured defaults with `openmohaa_get_defaults`.

## Usage

### Basic Game Control

```
Launch OpenMOHAA
```

(Uses `OPENMOHAA_EXEC_PATH` from env, or pass path explicitly)

```
Send command "map dm/mohdm1" to the game
```

```
Take a screenshot of the game window
```

### Available Tools

#### Game Lifecycle
- `openmohaa_launch` - Launch the game (uses OPENMOHAA_EXEC_PATH if no path given)
- `openmohaa_stop` - Stop gracefully
- `openmohaa_restart` - Restart the game
- `openmohaa_kill` - Force kill
- `openmohaa_status` - Get process status
- `openmohaa_get_defaults` - Get configured default paths

#### Console Commands
- `openmohaa_send_command` - Send any console command
- `openmohaa_set_cvar` - Set a console variable
- `openmohaa_get_cvar` - Get a console variable
- `openmohaa_exec_config` - Execute a config file
- `openmohaa_load_map` - Load a map
- `openmohaa_get_console_output` - Read console output

#### Mouse Control
- `openmohaa_mouse_move` - Move mouse cursor
- `openmohaa_mouse_click` - Click mouse button
- `openmohaa_mouse_drag` - Drag mouse
- `openmohaa_scroll` - Scroll mouse wheel

#### Keyboard Control
- `openmohaa_type_text` - Type text
- `openmohaa_press_key` - Press a key
- `openmohaa_key_combo` - Press key combination

#### Window Control
- `openmohaa_focus_window` - Focus game window
- `openmohaa_find_window` - Find window info
- `openmohaa_toggle_console` - Toggle in-game console

#### Screen Capture
- `openmohaa_screenshot` - Capture screenshot
- `openmohaa_get_pixel` - Get pixel color
- `openmohaa_check_pixel` - Verify pixel color
- `openmohaa_find_image` - Find image on screen

#### Wait and Conditions
- `openmohaa_wait` - Wait for duration
- `openmohaa_wait_for_console` - Wait for console text
- `openmohaa_wait_for_pixel` - Wait for pixel color
- `openmohaa_wait_for_image` - Wait for image

#### Automation
- `openmohaa_run_script` - Run automation script
- `openmohaa_create_map_test` - Create map load test

#### Utilities
- `openmohaa_check_dependencies` - Check system dependencies
- `openmohaa_get_screen_resolution` - Get screen resolution
- `openmohaa_get_display_server` - Get display server type

#### Build System
- `openmohaa_build_check_tools` - Check if build tools are available
- `openmohaa_build_clone` - Clone or update repository
- `openmohaa_build_configure` - Configure with CMake
- `openmohaa_build_compile` - Build the project
- `openmohaa_build_clean` - Clean build directory
- `openmohaa_build_status` - Get build status
- `openmohaa_build_cancel` - Cancel current build
- `openmohaa_build_git_info` - Get git information
- `openmohaa_build_run_tests` - Run CTest tests
- `openmohaa_build_package` - Create release package

#### Demo Management
- `openmohaa_demo_start_recording` - Start recording
- `openmohaa_demo_stop_recording` - Stop recording
- `openmohaa_demo_play` - Play a demo
- `openmohaa_demo_stop` - Stop playback
- `openmohaa_demo_list` - List all demos
- `openmohaa_demo_delete` - Delete a demo
- `openmohaa_demo_rename` - Rename a demo
- `openmohaa_demo_pause` - Pause playback
- `openmohaa_demo_resume` - Resume playback
- `openmohaa_demo_set_speed` - Set playback speed
- `openmohaa_demo_seek` - Seek to time
- `openmohaa_demo_cleanup` - Clean up old demos
- `openmohaa_demo_set_dir` - Set demo directory

#### Config Management
- `openmohaa_config_read` - Read config file
- `openmohaa_config_write` - Write config file
- `openmohaa_config_list` - List config files
- `openmohaa_config_parse` - Parse config to structured data
- `openmohaa_config_get_autoexec` - Get autoexec.cfg
- `openmohaa_config_set_cvar` - Set cvar in autoexec
- `openmohaa_config_set_bind` - Set keybind in autoexec
- `openmohaa_config_backup` - Backup config
- `openmohaa_config_restore` - Restore from backup
- `openmohaa_config_validate` - Validate config syntax
- `openmohaa_config_graphics_preset` - Apply graphics preset
- `openmohaa_config_set_game_dir` - Set game directory

#### Server Management
- `openmohaa_server_start` - Start dedicated server
- `openmohaa_server_stop` - Stop server
- `openmohaa_server_restart` - Restart server
- `openmohaa_server_status` - Get server status
- `openmohaa_server_rcon` - Send RCON command
- `openmohaa_server_query` - Query server via UDP
- `openmohaa_server_output` - Get server output
- `openmohaa_server_change_map` - Change map
- `openmohaa_server_kick` - Kick player
- `openmohaa_server_say` - Send server message

#### Performance Monitoring
- `openmohaa_perf_start` - Start monitoring
- `openmohaa_perf_stop` - Stop monitoring
- `openmohaa_perf_collect` - Collect metrics
- `openmohaa_perf_stats` - Get statistics
- `openmohaa_perf_benchmark` - Run benchmark
- `openmohaa_perf_check_issues` - Check for issues
- `openmohaa_perf_export_csv` - Export to CSV
- `openmohaa_perf_clear` - Clear samples

#### Log Analysis
- `openmohaa_log_list` - List log files
- `openmohaa_log_parse` - Parse log file
- `openmohaa_log_stats` - Get log statistics
- `openmohaa_log_search` - Search logs
- `openmohaa_log_errors` - Get errors
- `openmohaa_log_kills` - Parse kill events
- `openmohaa_log_sessions` - Analyze player sessions
- `openmohaa_log_tail` - Get last N lines
- `openmohaa_log_watch` - Watch for new entries
- `openmohaa_log_unwatch` - Stop watching
- `openmohaa_log_summary` - Generate summary
- `openmohaa_log_set_dir` - Set log directory

## Automation Scripts

Create automated test sequences:

```json
{
  "name": "Load Map Test",
  "description": "Test map loading",
  "setup": [
    {
      "action": "launch",
      "params": {
        "executablePath": "/path/to/openmohaa",
        "windowed": true,
        "width": 1280,
        "height": 720
      }
    }
  ],
  "steps": [
    { "action": "wait", "params": { "ms": 5000 } },
    { "action": "toggle_console", "params": {} },
    { "action": "type", "params": { "text": "map dm/mohdm1" } },
    { "action": "press_key", "params": { "key": "enter" } },
    { 
      "action": "wait_for_console", 
      "params": { "pattern": "loaded", "timeout": 60000 } 
    },
    { "action": "screenshot", "params": { "path": "/tmp/map_test.png" } }
  ],
  "teardown": [
    { "action": "command", "params": { "command": "quit" } }
  ]
}
```

## Development

```bash
# Run in development mode
npm run dev

# Type check
npm run typecheck

# Run tests
npm test
```

## Architecture

```
src/
  index.ts            # MCP server entry point (100 tools)
  types.ts            # Type definitions
  launcher.ts         # Process control module
  console-manager.ts  # Console interaction
  ui-controller.ts    # Mouse/keyboard automation
  screen-capture.ts   # Screenshot and image matching
  automation.ts       # Test automation framework
  build-system.ts     # Build system integration
  demo-manager.ts     # Demo recording/playback
  config-manager.ts   # Config file management
  server-manager.ts   # Dedicated server control
  performance-monitor.ts # Performance tracking
  log-analyzer.ts     # Log parsing and analysis
```

## Troubleshooting

### Missing Dependencies

Run `openmohaa_check_dependencies` to see what system tools are missing.

### Window Not Found

- Ensure the game is running
- Check window title matches (default: "OpenMOHAA")
- Try running on X11 instead of Wayland for better compatibility

### Console Commands Not Working

- Ensure console is enabled (`+set con_enable 1`)
- Try using the console toggle before sending commands

## License

MIT
