#!/usr/bin/env node
/**
 * OpenMOHAA MCP Server
 * A complete Model Context Protocol server for automating and testing OpenMOHAA
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
  Tool,
} from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';

import { ProcessLauncher } from './launcher.js';
import { ConsoleManager } from './console-manager.js';
import { UIController } from './ui-controller.js';
import { ScreenCapture } from './screen-capture.js';
import { AutomationFramework } from './automation.js';
import { BuildSystem } from './build-system.js';
import { DemoManager } from './demo-manager.js';
import { ConfigManager } from './config-manager.js';
import { ServerManager } from './server-manager.js';
import { PerformanceMonitor } from './performance-monitor.js';
import { LogAnalyzer } from './log-analyzer.js';
import type { AutomationScript, PixelColor, ScreenRegion } from './types.js';

// Environment variable defaults
const DEFAULT_EXEC_PATH = process.env.OPENMOHAA_EXEC_PATH || '';
const DEFAULT_GAME_DIR = process.env.OPENMOHAA_GAME_DIR || '';

// Initialize components
const launcher = new ProcessLauncher();
const consoleManager = new ConsoleManager(launcher);
const uiController = new UIController();
const screenCapture = new ScreenCapture();
const automation = new AutomationFramework({
  launcher,
  console: consoleManager,
  ui: uiController,
  screen: screenCapture,
});
const buildSystem = new BuildSystem();
const demoManager = new DemoManager(consoleManager, '.');
const configManager = new ConfigManager('.');
const serverManager = new ServerManager();
const performanceMonitor = new PerformanceMonitor(screenCapture, consoleManager);
const logAnalyzer = new LogAnalyzer('.');

// Event logging
launcher.on('log', (entry) => {
  console.error(`[${entry.level}] ${entry.message}`);
});

launcher.on('output', (output) => {
  // Can be used for real-time console monitoring
});

// Define all MCP tools
const tools: Tool[] = [
  // === Game Lifecycle Tools ===
  {
    name: 'openmohaa_launch',
    description: 'Launch OpenMOHAA game. Uses OPENMOHAA_EXEC_PATH env var as default if executablePath not provided.',
    inputSchema: {
      type: 'object',
      properties: {
        executablePath: {
          type: 'string',
          description: 'Full path to the OpenMOHAA executable. Falls back to OPENMOHAA_EXEC_PATH env var.',
        },
        workingDirectory: {
          type: 'string',
          description: 'Working directory for the game (defaults to executable directory)',
        },
        args: {
          type: 'array',
          items: { type: 'string' },
          description: 'Additional command line arguments',
        },
        env: {
          type: 'object',
          description: 'Environment variables to set',
        },
        windowedMode: {
          type: 'boolean',
          description: 'Run in windowed mode instead of fullscreen',
          default: true,
        },
        width: {
          type: 'number',
          description: 'Window width in pixels',
          default: 1280,
        },
        height: {
          type: 'number',
          description: 'Window height in pixels',
          default: 720,
        },
        enableConsole: {
          type: 'boolean',
          description: 'Enable developer console',
          default: true,
        },
        enableCheats: {
          type: 'boolean',
          description: 'Enable cheat commands',
          default: true,
        },
      },
      required: [],
    },
  },
  {
    name: 'openmohaa_stop',
    description: 'Stop the running OpenMOHAA game gracefully',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'openmohaa_get_defaults',
    description: 'Get configured default paths from environment variables',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'openmohaa_restart',
    description: 'Restart the game with the same configuration',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'openmohaa_kill',
    description: 'Force kill the game process',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'openmohaa_status',
    description: 'Get the current status of the game process',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },

  // === Console Command Tools ===
  {
    name: 'openmohaa_send_command',
    description: 'Send a console command to the game',
    inputSchema: {
      type: 'object',
      properties: {
        command: {
          type: 'string',
          description: 'The console command to execute',
        },
        waitForResponse: {
          type: 'boolean',
          description: 'Wait for command response',
          default: true,
        },
        timeout: {
          type: 'number',
          description: 'Timeout in milliseconds',
          default: 5000,
        },
      },
      required: ['command'],
    },
  },
  {
    name: 'openmohaa_set_cvar',
    description: 'Set a console variable (cvar) value',
    inputSchema: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: 'The cvar name',
        },
        value: {
          type: 'string',
          description: 'The value to set',
        },
      },
      required: ['name', 'value'],
    },
  },
  {
    name: 'openmohaa_get_cvar',
    description: 'Get a console variable (cvar) value',
    inputSchema: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: 'The cvar name',
        },
      },
      required: ['name'],
    },
  },
  {
    name: 'openmohaa_exec_config',
    description: 'Execute a config file',
    inputSchema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Path to the config file',
        },
      },
      required: ['path'],
    },
  },
  {
    name: 'openmohaa_load_map',
    description: 'Load a map by name',
    inputSchema: {
      type: 'object',
      properties: {
        mapName: {
          type: 'string',
          description: 'The map name to load',
        },
      },
      required: ['mapName'],
    },
  },
  {
    name: 'openmohaa_get_console_output',
    description: 'Get recent console output',
    inputSchema: {
      type: 'object',
      properties: {
        lines: {
          type: 'number',
          description: 'Number of lines to retrieve',
          default: 100,
        },
        pattern: {
          type: 'string',
          description: 'Optional regex pattern to filter output',
        },
      },
    },
  },

  // === Mouse Control Tools ===
  {
    name: 'openmohaa_mouse_move',
    description: 'Move the mouse cursor to specified coordinates',
    inputSchema: {
      type: 'object',
      properties: {
        x: {
          type: 'number',
          description: 'X coordinate',
        },
        y: {
          type: 'number',
          description: 'Y coordinate',
        },
        relative: {
          type: 'boolean',
          description: 'Use relative movement',
          default: false,
        },
        window: {
          type: 'boolean',
          description: 'Coordinates relative to game window',
          default: false,
        },
      },
      required: ['x', 'y'],
    },
  },
  {
    name: 'openmohaa_mouse_click',
    description: 'Click the mouse at current or specified position',
    inputSchema: {
      type: 'object',
      properties: {
        button: {
          type: 'string',
          enum: ['left', 'right', 'middle'],
          description: 'Mouse button to click',
          default: 'left',
        },
        x: {
          type: 'number',
          description: 'X coordinate (optional)',
        },
        y: {
          type: 'number',
          description: 'Y coordinate (optional)',
        },
        doubleClick: {
          type: 'boolean',
          description: 'Perform double click',
          default: false,
        },
      },
    },
  },
  {
    name: 'openmohaa_mouse_drag',
    description: 'Drag the mouse from one position to another',
    inputSchema: {
      type: 'object',
      properties: {
        startX: { type: 'number', description: 'Starting X coordinate' },
        startY: { type: 'number', description: 'Starting Y coordinate' },
        endX: { type: 'number', description: 'Ending X coordinate' },
        endY: { type: 'number', description: 'Ending Y coordinate' },
        button: {
          type: 'string',
          enum: ['left', 'right', 'middle'],
          default: 'left',
        },
      },
      required: ['startX', 'startY', 'endX', 'endY'],
    },
  },
  {
    name: 'openmohaa_scroll',
    description: 'Scroll the mouse wheel',
    inputSchema: {
      type: 'object',
      properties: {
        direction: {
          type: 'string',
          enum: ['up', 'down'],
          description: 'Scroll direction',
        },
        clicks: {
          type: 'number',
          description: 'Number of scroll clicks',
          default: 3,
        },
      },
      required: ['direction'],
    },
  },

  // === Keyboard Control Tools ===
  {
    name: 'openmohaa_type_text',
    description: 'Type text using the keyboard',
    inputSchema: {
      type: 'object',
      properties: {
        text: {
          type: 'string',
          description: 'Text to type',
        },
        delay: {
          type: 'number',
          description: 'Delay between keystrokes in ms',
          default: 12,
        },
      },
      required: ['text'],
    },
  },
  {
    name: 'openmohaa_press_key',
    description: 'Press a single key or key combination',
    inputSchema: {
      type: 'object',
      properties: {
        key: {
          type: 'string',
          description: 'Key to press (e.g., "enter", "escape", "f1", "a")',
        },
        modifiers: {
          type: 'array',
          items: {
            type: 'string',
            enum: ['ctrl', 'alt', 'shift', 'super'],
          },
          description: 'Modifier keys to hold',
        },
      },
      required: ['key'],
    },
  },
  {
    name: 'openmohaa_key_combo',
    description: 'Press a key combination (e.g., "ctrl+c")',
    inputSchema: {
      type: 'object',
      properties: {
        combo: {
          type: 'string',
          description: 'Key combination string',
        },
      },
      required: ['combo'],
    },
  },

  // === Window Control Tools ===
  {
    name: 'openmohaa_focus_window',
    description: 'Focus the game window',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'openmohaa_find_window',
    description: 'Find the game window and get its info',
    inputSchema: {
      type: 'object',
      properties: {
        title: {
          type: 'string',
          description: 'Window title to search for',
        },
      },
    },
  },
  {
    name: 'openmohaa_toggle_console',
    description: 'Toggle the in-game console open or closed',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },

  // === Screen Capture Tools ===
  {
    name: 'openmohaa_screenshot',
    description: 'Capture a screenshot of the game window or screen',
    inputSchema: {
      type: 'object',
      properties: {
        outputPath: {
          type: 'string',
          description: 'Path to save the screenshot (optional)',
        },
        region: {
          type: 'object',
          properties: {
            x: { type: 'number' },
            y: { type: 'number' },
            width: { type: 'number' },
            height: { type: 'number' },
          },
          description: 'Capture specific region',
        },
        format: {
          type: 'string',
          enum: ['png', 'jpeg'],
          default: 'png',
        },
      },
    },
  },
  {
    name: 'openmohaa_get_pixel',
    description: 'Get the color of a pixel at specified coordinates',
    inputSchema: {
      type: 'object',
      properties: {
        x: { type: 'number', description: 'X coordinate' },
        y: { type: 'number', description: 'Y coordinate' },
      },
      required: ['x', 'y'],
    },
  },
  {
    name: 'openmohaa_check_pixel',
    description: 'Check if a pixel matches an expected color',
    inputSchema: {
      type: 'object',
      properties: {
        x: { type: 'number', description: 'X coordinate' },
        y: { type: 'number', description: 'Y coordinate' },
        r: { type: 'number', description: 'Expected red value (0-255)' },
        g: { type: 'number', description: 'Expected green value (0-255)' },
        b: { type: 'number', description: 'Expected blue value (0-255)' },
        tolerance: {
          type: 'number',
          description: 'Color tolerance',
          default: 10,
        },
      },
      required: ['x', 'y', 'r', 'g', 'b'],
    },
  },
  {
    name: 'openmohaa_find_image',
    description: 'Find an image template on screen',
    inputSchema: {
      type: 'object',
      properties: {
        templatePath: {
          type: 'string',
          description: 'Path to the template image',
        },
        threshold: {
          type: 'number',
          description: 'Matching threshold (0-1)',
          default: 0.9,
        },
        region: {
          type: 'object',
          properties: {
            x: { type: 'number' },
            y: { type: 'number' },
            width: { type: 'number' },
            height: { type: 'number' },
          },
          description: 'Search region',
        },
      },
      required: ['templatePath'],
    },
  },

  // === Wait and Condition Tools ===
  {
    name: 'openmohaa_wait',
    description: 'Wait for a specified duration',
    inputSchema: {
      type: 'object',
      properties: {
        ms: {
          type: 'number',
          description: 'Duration in milliseconds',
        },
      },
      required: ['ms'],
    },
  },
  {
    name: 'openmohaa_wait_for_console',
    description: 'Wait for specific text to appear in console output',
    inputSchema: {
      type: 'object',
      properties: {
        pattern: {
          type: 'string',
          description: 'Regex pattern to wait for',
        },
        timeout: {
          type: 'number',
          description: 'Timeout in milliseconds',
          default: 30000,
        },
      },
      required: ['pattern'],
    },
  },
  {
    name: 'openmohaa_wait_for_pixel',
    description: 'Wait for a pixel to become a specific color',
    inputSchema: {
      type: 'object',
      properties: {
        x: { type: 'number' },
        y: { type: 'number' },
        r: { type: 'number' },
        g: { type: 'number' },
        b: { type: 'number' },
        tolerance: { type: 'number', default: 10 },
        timeout: { type: 'number', default: 30000 },
      },
      required: ['x', 'y', 'r', 'g', 'b'],
    },
  },
  {
    name: 'openmohaa_wait_for_image',
    description: 'Wait for an image template to appear on screen',
    inputSchema: {
      type: 'object',
      properties: {
        templatePath: { type: 'string' },
        threshold: { type: 'number', default: 0.9 },
        timeout: { type: 'number', default: 30000 },
      },
      required: ['templatePath'],
    },
  },

  // === Automation Tools ===
  {
    name: 'openmohaa_run_script',
    description: 'Run an automation script with multiple steps. Pass script as JSON string with name, steps array, optional setup/teardown arrays.',
    inputSchema: {
      type: 'object',
      properties: {
        scriptJson: {
          type: 'string',
          description: 'Automation script as JSON string. Must have "name" (string) and "steps" (array of step objects). Optional: "description", "setup", "teardown".',
        },
      },
      required: ['scriptJson'],
    },
  },
  {
    name: 'openmohaa_create_map_test',
    description: 'Create a test script for loading a map',
    inputSchema: {
      type: 'object',
      properties: {
        mapName: { type: 'string', description: 'Map name to test' },
        executablePath: { type: 'string', description: 'Path to game executable' },
      },
      required: ['mapName', 'executablePath'],
    },
  },

  // === Utility Tools ===
  {
    name: 'openmohaa_check_dependencies',
    description: 'Check if required system tools are available',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'openmohaa_get_screen_resolution',
    description: 'Get the current screen resolution',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'openmohaa_get_display_server',
    description: 'Get the current display server type (X11 or Wayland)',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },

  // === Build System Tools ===
  {
    name: 'openmohaa_build_check_tools',
    description: 'Check if build tools (cmake, make, g++, gcc, git) are available',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'openmohaa_build_clone',
    description: 'Clone or update the OpenMOHAA repository',
    inputSchema: {
      type: 'object',
      properties: {
        targetDir: { type: 'string', description: 'Directory to clone into' },
        branch: { type: 'string', description: 'Branch to checkout', default: 'main' },
      },
      required: ['targetDir'],
    },
  },
  {
    name: 'openmohaa_build_configure',
    description: 'Configure the build with CMake',
    inputSchema: {
      type: 'object',
      properties: {
        sourceDir: { type: 'string', description: 'Source code directory' },
        buildDir: { type: 'string', description: 'Build output directory' },
        buildType: { type: 'string', enum: ['Debug', 'Release', 'RelWithDebInfo'], default: 'Release' },
        cmakeOptions: { type: 'array', items: { type: 'string' }, description: 'Additional CMake options' },
      },
      required: ['sourceDir', 'buildDir'],
    },
  },
  {
    name: 'openmohaa_build_compile',
    description: 'Compile the project',
    inputSchema: {
      type: 'object',
      properties: {
        buildDir: { type: 'string', description: 'Build directory' },
        jobs: { type: 'number', description: 'Number of parallel jobs' },
        targets: { type: 'array', items: { type: 'string' }, description: 'Specific targets to build' },
      },
      required: ['buildDir'],
    },
  },
  {
    name: 'openmohaa_build_clean',
    description: 'Clean the build directory',
    inputSchema: {
      type: 'object',
      properties: {
        buildDir: { type: 'string', description: 'Build directory to clean' },
      },
      required: ['buildDir'],
    },
  },
  {
    name: 'openmohaa_build_status',
    description: 'Get current build status',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'openmohaa_build_cancel',
    description: 'Cancel the current build',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'openmohaa_build_git_info',
    description: 'Get git information for the repository',
    inputSchema: {
      type: 'object',
      properties: {
        repoDir: { type: 'string', description: 'Repository directory' },
      },
      required: ['repoDir'],
    },
  },
  {
    name: 'openmohaa_build_run_tests',
    description: 'Run tests using CTest',
    inputSchema: {
      type: 'object',
      properties: {
        buildDir: { type: 'string', description: 'Build directory' },
        testPattern: { type: 'string', description: 'Test pattern to filter' },
      },
      required: ['buildDir'],
    },
  },
  {
    name: 'openmohaa_build_package',
    description: 'Create a release package',
    inputSchema: {
      type: 'object',
      properties: {
        buildDir: { type: 'string', description: 'Build directory' },
        outputDir: { type: 'string', description: 'Output directory for package' },
        name: { type: 'string', description: 'Package name' },
      },
      required: ['buildDir', 'outputDir', 'name'],
    },
  },

  // === Demo Management Tools ===
  {
    name: 'openmohaa_demo_start_recording',
    description: 'Start recording a demo',
    inputSchema: {
      type: 'object',
      properties: {
        demoName: { type: 'string', description: 'Name for the demo file' },
      },
    },
  },
  {
    name: 'openmohaa_demo_stop_recording',
    description: 'Stop recording the current demo',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'openmohaa_demo_play',
    description: 'Play a demo file',
    inputSchema: {
      type: 'object',
      properties: {
        demoName: { type: 'string', description: 'Name of the demo to play' },
      },
      required: ['demoName'],
    },
  },
  {
    name: 'openmohaa_demo_stop',
    description: 'Stop demo playback',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'openmohaa_demo_list',
    description: 'List all available demos',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'openmohaa_demo_delete',
    description: 'Delete a demo file',
    inputSchema: {
      type: 'object',
      properties: {
        demoName: { type: 'string', description: 'Name of the demo to delete' },
      },
      required: ['demoName'],
    },
  },
  {
    name: 'openmohaa_demo_rename',
    description: 'Rename a demo file',
    inputSchema: {
      type: 'object',
      properties: {
        oldName: { type: 'string', description: 'Current demo name' },
        newName: { type: 'string', description: 'New demo name' },
      },
      required: ['oldName', 'newName'],
    },
  },
  {
    name: 'openmohaa_demo_pause',
    description: 'Pause demo playback',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'openmohaa_demo_resume',
    description: 'Resume demo playback',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'openmohaa_demo_set_speed',
    description: 'Set demo playback speed',
    inputSchema: {
      type: 'object',
      properties: {
        speed: { type: 'number', description: 'Playback speed (0.1 to 10)' },
      },
      required: ['speed'],
    },
  },
  {
    name: 'openmohaa_demo_seek',
    description: 'Seek to a specific time in the demo',
    inputSchema: {
      type: 'object',
      properties: {
        seconds: { type: 'number', description: 'Time in seconds' },
      },
      required: ['seconds'],
    },
  },
  {
    name: 'openmohaa_demo_cleanup',
    description: 'Clean up old demos',
    inputSchema: {
      type: 'object',
      properties: {
        olderThanDays: { type: 'number', description: 'Delete demos older than N days' },
        keepCount: { type: 'number', description: 'Keep only N most recent demos' },
        maxSizeMB: { type: 'number', description: 'Maximum total size in MB' },
      },
    },
  },
  {
    name: 'openmohaa_demo_set_dir',
    description: 'Set the demo directory',
    inputSchema: {
      type: 'object',
      properties: {
        dir: { type: 'string', description: 'Demo directory path' },
      },
      required: ['dir'],
    },
  },

  // === Config Management Tools ===
  {
    name: 'openmohaa_config_read',
    description: 'Read a config file',
    inputSchema: {
      type: 'object',
      properties: {
        filename: { type: 'string', description: 'Config filename' },
      },
      required: ['filename'],
    },
  },
  {
    name: 'openmohaa_config_write',
    description: 'Write a config file',
    inputSchema: {
      type: 'object',
      properties: {
        filename: { type: 'string', description: 'Config filename' },
        content: { type: 'string', description: 'Config file content' },
      },
      required: ['filename', 'content'],
    },
  },
  {
    name: 'openmohaa_config_list',
    description: 'List all config files',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'openmohaa_config_parse',
    description: 'Parse a config file into structured data',
    inputSchema: {
      type: 'object',
      properties: {
        filename: { type: 'string', description: 'Config filename' },
      },
      required: ['filename'],
    },
  },
  {
    name: 'openmohaa_config_get_autoexec',
    description: 'Get or create autoexec.cfg',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'openmohaa_config_set_cvar',
    description: 'Set a cvar in autoexec.cfg',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Cvar name' },
        value: { type: 'string', description: 'Cvar value' },
      },
      required: ['name', 'value'],
    },
  },
  {
    name: 'openmohaa_config_set_bind',
    description: 'Set a key binding in autoexec.cfg',
    inputSchema: {
      type: 'object',
      properties: {
        key: { type: 'string', description: 'Key to bind' },
        command: { type: 'string', description: 'Command to execute' },
      },
      required: ['key', 'command'],
    },
  },
  {
    name: 'openmohaa_config_backup',
    description: 'Create a backup of a config file',
    inputSchema: {
      type: 'object',
      properties: {
        filename: { type: 'string', description: 'Config filename to backup' },
      },
      required: ['filename'],
    },
  },
  {
    name: 'openmohaa_config_restore',
    description: 'Restore a config from backup',
    inputSchema: {
      type: 'object',
      properties: {
        backupFilename: { type: 'string', description: 'Backup filename' },
      },
      required: ['backupFilename'],
    },
  },
  {
    name: 'openmohaa_config_validate',
    description: 'Validate a config file syntax',
    inputSchema: {
      type: 'object',
      properties: {
        content: { type: 'string', description: 'Config file content to validate' },
      },
      required: ['content'],
    },
  },
  {
    name: 'openmohaa_config_graphics_preset',
    description: 'Apply a graphics preset',
    inputSchema: {
      type: 'object',
      properties: {
        preset: { type: 'string', enum: ['low', 'medium', 'high', 'ultra'], description: 'Graphics preset' },
      },
      required: ['preset'],
    },
  },
  {
    name: 'openmohaa_config_set_game_dir',
    description: 'Set the game directory for config management',
    inputSchema: {
      type: 'object',
      properties: {
        gameDir: { type: 'string', description: 'Game directory path' },
        modDir: { type: 'string', description: 'Mod directory (default: main)' },
      },
      required: ['gameDir'],
    },
  },

  // === Server Management Tools ===
  {
    name: 'openmohaa_server_start',
    description: 'Start a dedicated server',
    inputSchema: {
      type: 'object',
      properties: {
        executablePath: { type: 'string', description: 'Path to server executable' },
        gameDir: { type: 'string', description: 'Game directory' },
        mod: { type: 'string', description: 'Mod to load' },
        port: { type: 'number', description: 'Server port', default: 12203 },
        maxPlayers: { type: 'number', description: 'Maximum players', default: 16 },
        hostname: { type: 'string', description: 'Server hostname' },
        password: { type: 'string', description: 'Server password' },
        rconPassword: { type: 'string', description: 'RCON password' },
        map: { type: 'string', description: 'Initial map' },
        gametype: { type: 'string', description: 'Game type' },
        dedicated: { type: 'number', enum: [1, 2], description: '1=LAN, 2=Internet', default: 2 },
      },
      required: ['executablePath'],
    },
  },
  {
    name: 'openmohaa_server_stop',
    description: 'Stop the dedicated server',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'openmohaa_server_restart',
    description: 'Restart the dedicated server',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'openmohaa_server_status',
    description: 'Get server status',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'openmohaa_server_rcon',
    description: 'Send an RCON command',
    inputSchema: {
      type: 'object',
      properties: {
        command: { type: 'string', description: 'RCON command' },
        host: { type: 'string', description: 'Server hostname', default: 'localhost' },
        port: { type: 'number', description: 'Server port', default: 12203 },
        password: { type: 'string', description: 'RCON password' },
      },
      required: ['command', 'password'],
    },
  },
  {
    name: 'openmohaa_server_query',
    description: 'Query server status via UDP',
    inputSchema: {
      type: 'object',
      properties: {
        host: { type: 'string', description: 'Server hostname' },
        port: { type: 'number', description: 'Server port', default: 12203 },
      },
      required: ['host'],
    },
  },
  {
    name: 'openmohaa_server_output',
    description: 'Get server console output',
    inputSchema: {
      type: 'object',
      properties: {
        lines: { type: 'number', description: 'Number of lines to retrieve' },
      },
    },
  },
  {
    name: 'openmohaa_server_change_map',
    description: 'Change the current map',
    inputSchema: {
      type: 'object',
      properties: {
        mapName: { type: 'string', description: 'Map name' },
      },
      required: ['mapName'],
    },
  },
  {
    name: 'openmohaa_server_kick',
    description: 'Kick a player from the server',
    inputSchema: {
      type: 'object',
      properties: {
        playerId: { type: 'number', description: 'Player ID' },
        reason: { type: 'string', description: 'Kick reason' },
      },
      required: ['playerId'],
    },
  },
  {
    name: 'openmohaa_server_say',
    description: 'Send a server message',
    inputSchema: {
      type: 'object',
      properties: {
        message: { type: 'string', description: 'Message to send' },
      },
      required: ['message'],
    },
  },

  // === Performance Monitoring Tools ===
  {
    name: 'openmohaa_perf_start',
    description: 'Start performance monitoring',
    inputSchema: {
      type: 'object',
      properties: {
        intervalMs: { type: 'number', description: 'Sample interval in milliseconds', default: 1000 },
        pid: { type: 'number', description: 'Game process PID' },
      },
    },
  },
  {
    name: 'openmohaa_perf_stop',
    description: 'Stop performance monitoring',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'openmohaa_perf_collect',
    description: 'Collect current performance metrics',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'openmohaa_perf_stats',
    description: 'Get performance statistics from collected samples',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'openmohaa_perf_benchmark',
    description: 'Run a performance benchmark',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Benchmark name' },
        durationMs: { type: 'number', description: 'Benchmark duration in milliseconds' },
        sampleIntervalMs: { type: 'number', description: 'Sample interval', default: 100 },
      },
      required: ['name', 'durationMs'],
    },
  },
  {
    name: 'openmohaa_perf_check_issues',
    description: 'Check for performance issues',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'openmohaa_perf_export_csv',
    description: 'Export performance data to CSV',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'openmohaa_perf_clear',
    description: 'Clear collected performance samples',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },

  // === Log Analysis Tools ===
  {
    name: 'openmohaa_log_list',
    description: 'List available log files',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'openmohaa_log_parse',
    description: 'Parse a log file',
    inputSchema: {
      type: 'object',
      properties: {
        filePath: { type: 'string', description: 'Path to log file' },
      },
      required: ['filePath'],
    },
  },
  {
    name: 'openmohaa_log_stats',
    description: 'Get log statistics',
    inputSchema: {
      type: 'object',
      properties: {
        filePath: { type: 'string', description: 'Path to log file' },
      },
      required: ['filePath'],
    },
  },
  {
    name: 'openmohaa_log_search',
    description: 'Search logs for a pattern',
    inputSchema: {
      type: 'object',
      properties: {
        filePath: { type: 'string', description: 'Path to log file' },
        pattern: { type: 'string', description: 'Search pattern (regex)' },
        type: { type: 'string', enum: ['info', 'warning', 'error', 'chat', 'kill', 'connect', 'disconnect', 'command', 'other'], description: 'Filter by entry type' },
        limit: { type: 'number', description: 'Maximum results', default: 100 },
      },
      required: ['filePath', 'pattern'],
    },
  },
  {
    name: 'openmohaa_log_errors',
    description: 'Get errors from log',
    inputSchema: {
      type: 'object',
      properties: {
        filePath: { type: 'string', description: 'Path to log file' },
        limit: { type: 'number', description: 'Maximum results', default: 50 },
      },
      required: ['filePath'],
    },
  },
  {
    name: 'openmohaa_log_kills',
    description: 'Parse kill events from log',
    inputSchema: {
      type: 'object',
      properties: {
        filePath: { type: 'string', description: 'Path to log file' },
      },
      required: ['filePath'],
    },
  },
  {
    name: 'openmohaa_log_sessions',
    description: 'Analyze player sessions from log',
    inputSchema: {
      type: 'object',
      properties: {
        filePath: { type: 'string', description: 'Path to log file' },
      },
      required: ['filePath'],
    },
  },
  {
    name: 'openmohaa_log_tail',
    description: 'Get last N lines of log',
    inputSchema: {
      type: 'object',
      properties: {
        filePath: { type: 'string', description: 'Path to log file' },
        lines: { type: 'number', description: 'Number of lines', default: 50 },
      },
      required: ['filePath'],
    },
  },
  {
    name: 'openmohaa_log_watch',
    description: 'Start watching a log file for new entries',
    inputSchema: {
      type: 'object',
      properties: {
        filePath: { type: 'string', description: 'Path to log file' },
      },
      required: ['filePath'],
    },
  },
  {
    name: 'openmohaa_log_unwatch',
    description: 'Stop watching a log file',
    inputSchema: {
      type: 'object',
      properties: {
        filePath: { type: 'string', description: 'Path to log file' },
      },
      required: ['filePath'],
    },
  },
  {
    name: 'openmohaa_log_summary',
    description: 'Generate a summary of a log file',
    inputSchema: {
      type: 'object',
      properties: {
        filePath: { type: 'string', description: 'Path to log file' },
      },
      required: ['filePath'],
    },
  },
  {
    name: 'openmohaa_log_set_dir',
    description: 'Set the log directory',
    inputSchema: {
      type: 'object',
      properties: {
        dir: { type: 'string', description: 'Log directory path' },
      },
      required: ['dir'],
    },
  },
];

// Create the MCP server
const server = new Server(
  {
    name: 'openmohaa-mcp',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
      resources: {},
    },
  }
);

// Handle tool listing
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return { tools };
});

// Handle tool execution
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: rawArgs } = request.params;
  const args = rawArgs || {};

  try {
    switch (name) {
      // === Game Lifecycle ===
      case 'openmohaa_launch': {
        const execPath = (args.executablePath as string) || DEFAULT_EXEC_PATH;
        if (!execPath) {
          return {
            content: [{ type: 'text', text: 'Error: No executable path provided and OPENMOHAA_EXEC_PATH env var not set' }],
            isError: true,
          };
        }
        const result = await launcher.launch({
          executablePath: execPath,
          workingDirectory: args.workingDirectory as string | undefined,
          arguments: args.args as string[] | undefined,
          environmentVariables: args.env as Record<string, string> | undefined,
          windowedMode: args.windowedMode as boolean | undefined,
          resolution:
            args.width && args.height
              ? { width: args.width as number, height: args.height as number }
              : undefined,
          enableConsole: args.enableConsole as boolean | undefined,
          enableCheats: args.enableCheats as boolean | undefined,
        });
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      case 'openmohaa_stop': {
        await launcher.stop();
        return {
          content: [{ type: 'text', text: 'Game stopped successfully' }],
        };
      }

      case 'openmohaa_get_defaults': {
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              executablePath: DEFAULT_EXEC_PATH || '(not set)',
              gameDirectory: DEFAULT_GAME_DIR || '(not set)',
              hint: 'Set via OPENMOHAA_EXEC_PATH and OPENMOHAA_GAME_DIR env vars in mcp.json',
            }, null, 2),
          }],
        };
      }

      case 'openmohaa_restart': {
        const result = await launcher.restart();
        return {
          content: [
            { type: 'text', text: JSON.stringify(result, null, 2) },
          ],
        };
      }

      case 'openmohaa_kill': {
        await launcher.forceKill();
        return {
          content: [{ type: 'text', text: 'Game force killed' }],
        };
      }

      case 'openmohaa_status': {
        const state = launcher.getState();
        return {
          content: [
            { type: 'text', text: JSON.stringify(state, null, 2) },
          ],
        };
      }

      // === Console Commands ===
      case 'openmohaa_send_command': {
        const result = await consoleManager.sendCommand(
          args.command as string,
          args.waitForResponse as boolean ?? true
        );
        return {
          content: [
            { type: 'text', text: JSON.stringify(result, null, 2) },
          ],
        };
      }

      case 'openmohaa_set_cvar': {
        const result = await consoleManager.setCvar(
          args.name as string,
          args.value as string
        );
        return {
          content: [
            { type: 'text', text: JSON.stringify(result, null, 2) },
          ],
        };
      }

      case 'openmohaa_get_cvar': {
        const result = await consoleManager.getCvar(args.name as string);
        return {
          content: [
            {
              type: 'text',
              text: result ? JSON.stringify(result, null, 2) : 'Cvar not found',
            },
          ],
        };
      }

      case 'openmohaa_exec_config': {
        const result = await consoleManager.execConfig(args.path as string);
        return {
          content: [
            { type: 'text', text: JSON.stringify(result, null, 2) },
          ],
        };
      }

      case 'openmohaa_load_map': {
        const result = await consoleManager.loadMap(args.mapName as string);
        return {
          content: [
            { type: 'text', text: JSON.stringify(result, null, 2) },
          ],
        };
      }

      case 'openmohaa_get_console_output': {
        const lines = args.lines as number ?? 100;
        let output = consoleManager.getRecentOutput(lines);
        
        if (args.pattern) {
          output = output.filter((o) =>
            new RegExp(args.pattern as string, 'i').test(o.text)
          );
        }
        
        return {
          content: [
            {
              type: 'text',
              text: output.map((o) => `[${o.type}] ${o.text}`).join('\n'),
            },
          ],
        };
      }

      // === Mouse Control ===
      case 'openmohaa_mouse_move': {
        if (args.relative) {
          await uiController.moveMouseRelative(args.x as number, args.y as number);
        } else if (args.window) {
          await uiController.moveMouseToWindow(args.x as number, args.y as number);
        } else {
          await uiController.moveMouse(args.x as number, args.y as number);
        }
        return {
          content: [{ type: 'text', text: `Mouse moved to ${args.x}, ${args.y}` }],
        };
      }

      case 'openmohaa_mouse_click': {
        const button = (args.button as 'left' | 'right' | 'middle') || 'left';
        
        if (args.x !== undefined && args.y !== undefined) {
          await uiController.clickAt(args.x as number, args.y as number, button);
        } else if (args.doubleClick) {
          await uiController.doubleClick(button);
        } else {
          await uiController.clickMouse(button);
        }
        
        return {
          content: [{ type: 'text', text: 'Mouse clicked' }],
        };
      }

      case 'openmohaa_mouse_drag': {
        await uiController.drag(
          args.startX as number,
          args.startY as number,
          args.endX as number,
          args.endY as number,
          (args.button as 'left' | 'right' | 'middle') || 'left'
        );
        return {
          content: [{ type: 'text', text: 'Mouse dragged' }],
        };
      }

      case 'openmohaa_scroll': {
        await uiController.scroll(
          args.direction as 'up' | 'down',
          (args.clicks as number) || 3
        );
        return {
          content: [{ type: 'text', text: `Scrolled ${args.direction}` }],
        };
      }

      // === Keyboard Control ===
      case 'openmohaa_type_text': {
        await uiController.typeText(
          args.text as string,
          (args.delay as number) || 12
        );
        return {
          content: [{ type: 'text', text: 'Text typed' }],
        };
      }

      case 'openmohaa_press_key': {
        if (args.modifiers) {
          await uiController.pressKeyWithModifiers(
            args.key as string,
            args.modifiers as ('ctrl' | 'alt' | 'shift' | 'super')[]
          );
        } else {
          await uiController.pressKey(args.key as string);
        }
        return {
          content: [{ type: 'text', text: `Key pressed: ${args.key}` }],
        };
      }

      case 'openmohaa_key_combo': {
        await uiController.sendKeyCombo(args.combo as string);
        return {
          content: [{ type: 'text', text: `Key combo pressed: ${args.combo}` }],
        };
      }

      // === Window Control ===
      case 'openmohaa_focus_window': {
        const success = await uiController.focusWindow();
        return {
          content: [
            {
              type: 'text',
              text: success ? 'Window focused' : 'Failed to focus window',
            },
          ],
        };
      }

      case 'openmohaa_find_window': {
        const window = await uiController.findWindow(args.title as string);
        return {
          content: [
            {
              type: 'text',
              text: window ? JSON.stringify(window, null, 2) : 'Window not found',
            },
          ],
        };
      }

      case 'openmohaa_toggle_console': {
        await uiController.toggleConsole();
        return {
          content: [{ type: 'text', text: 'Console toggled' }],
        };
      }

      // === Screen Capture ===
      case 'openmohaa_screenshot': {
        let result;
        if (args.region) {
          result = await screenCapture.captureRegion(
            args.region as ScreenRegion,
            (args.format as 'png' | 'jpeg') || 'png'
          );
        } else {
          result = await screenCapture.captureWindow(
            (args.format as 'png' | 'jpeg') || 'png'
          );
          if (!result.success) {
            result = await screenCapture.captureScreen(
              (args.format as 'png' | 'jpeg') || 'png'
            );
          }
        }

        if (args.outputPath && result.success && result.data) {
          await screenCapture.saveScreenshot(args.outputPath as string);
        }

        return {
          content: [
            {
              type: 'text',
              text: result.success
                ? `Screenshot captured: ${result.width}x${result.height}, saved to ${result.path}`
                : `Failed: ${result.error}`,
            },
            ...(result.base64
              ? [
                  {
                    type: 'image' as const,
                    data: result.base64,
                    mimeType: args.format === 'jpeg' ? 'image/jpeg' : 'image/png',
                  },
                ]
              : []),
          ],
        };
      }

      case 'openmohaa_get_pixel': {
        const color = await screenCapture.getPixelColor(
          args.x as number,
          args.y as number
        );
        return {
          content: [
            {
              type: 'text',
              text: color
                ? `Pixel at (${args.x}, ${args.y}): RGB(${color.r}, ${color.g}, ${color.b})`
                : 'Failed to get pixel color',
            },
          ],
        };
      }

      case 'openmohaa_check_pixel': {
        const matches = await screenCapture.checkPixelColor(
          args.x as number,
          args.y as number,
          { r: args.r as number, g: args.g as number, b: args.b as number },
          (args.tolerance as number) || 10
        );
        return {
          content: [
            {
              type: 'text',
              text: matches
                ? 'Pixel matches expected color'
                : 'Pixel does not match expected color',
            },
          ],
        };
      }

      case 'openmohaa_find_image': {
        const match = await screenCapture.findImage(
          args.templatePath as string,
          args.region as ScreenRegion | undefined,
          (args.threshold as number) || 0.9
        );
        return {
          content: [
            {
              type: 'text',
              text: match.found
                ? `Image found at (${match.x}, ${match.y}) with confidence ${match.confidence}`
                : 'Image not found',
            },
          ],
        };
      }

      // === Wait and Conditions ===
      case 'openmohaa_wait': {
        await new Promise((resolve) => setTimeout(resolve, args.ms as number));
        return {
          content: [{ type: 'text', text: `Waited ${args.ms}ms` }],
        };
      }

      case 'openmohaa_wait_for_console': {
        const output = await launcher.waitForConsolePattern(
          args.pattern as string,
          (args.timeout as number) || 30000
        );
        return {
          content: [
            {
              type: 'text',
              text: output
                ? `Pattern found: ${output.text}`
                : 'Pattern not found within timeout',
            },
          ],
        };
      }

      case 'openmohaa_wait_for_pixel': {
        const found = await screenCapture.waitForPixelColor(
          args.x as number,
          args.y as number,
          { r: args.r as number, g: args.g as number, b: args.b as number },
          (args.timeout as number) || 30000,
          (args.tolerance as number) || 10
        );
        return {
          content: [
            {
              type: 'text',
              text: found
                ? 'Pixel color matched'
                : 'Pixel color did not match within timeout',
            },
          ],
        };
      }

      case 'openmohaa_wait_for_image': {
        const match = await screenCapture.waitForImage(
          args.templatePath as string,
          (args.timeout as number) || 30000,
          (args.threshold as number) || 0.9
        );
        return {
          content: [
            {
              type: 'text',
              text: match.found
                ? `Image found at (${match.x}, ${match.y})`
                : 'Image not found within timeout',
            },
          ],
        };
      }

      // === Automation ===
      case 'openmohaa_run_script': {
        const script = JSON.parse(args.scriptJson as string) as AutomationScript;
        const result = await automation.runScript(script);
        return {
          content: [
            { type: 'text', text: JSON.stringify(result, null, 2) },
          ],
        };
      }

      case 'openmohaa_create_map_test': {
        const script = AutomationFramework.createMapLoadTest(
          args.mapName as string,
          args.executablePath as string
        );
        return {
          content: [
            { type: 'text', text: JSON.stringify(script, null, 2) },
          ],
        };
      }

      // === Utilities ===
      case 'openmohaa_check_dependencies': {
        const uiDeps = await uiController.checkDependencies();
        const screenDeps = await screenCapture.checkDependencies();
        
        const allMissing = [...uiDeps.missing, ...screenDeps.missing];
        
        return {
          content: [
            {
              type: 'text',
              text: allMissing.length === 0
                ? 'All dependencies are available'
                : `Missing dependencies: ${allMissing.join(', ')}\n\nInstall with:\nsudo apt install xdotool imagemagick`,
            },
          ],
        };
      }

      case 'openmohaa_get_screen_resolution': {
        const resolution = await screenCapture.getScreenResolution();
        return {
          content: [
            {
              type: 'text',
              text: `Screen resolution: ${resolution.width}x${resolution.height}`,
            },
          ],
        };
      }

      case 'openmohaa_get_display_server': {
        const displayServer = uiController.getDisplayServer();
        return {
          content: [
            { type: 'text', text: `Display server: ${displayServer}` },
          ],
        };
      }

      // === Build System ===
      case 'openmohaa_build_check_tools': {
        const result = await buildSystem.checkBuildTools();
        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        };
      }

      case 'openmohaa_build_clone': {
        const result = await buildSystem.cloneRepository(
          args.targetDir as string,
          args.branch as string || 'main'
        );
        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        };
      }

      case 'openmohaa_build_configure': {
        const result = await buildSystem.configureBuild({
          sourceDir: args.sourceDir as string,
          buildDir: args.buildDir as string,
          buildType: (args.buildType as 'Debug' | 'Release' | 'RelWithDebInfo') || 'Release',
          cmakeOptions: args.cmakeOptions as string[] | undefined,
        });
        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        };
      }

      case 'openmohaa_build_compile': {
        const result = await buildSystem.build({
          sourceDir: '',
          buildDir: args.buildDir as string,
          buildType: 'Release',
          jobs: args.jobs as number | undefined,
          targets: args.targets as string[] | undefined,
        });
        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        };
      }

      case 'openmohaa_build_clean': {
        const result = await buildSystem.clean(args.buildDir as string);
        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        };
      }

      case 'openmohaa_build_status': {
        const status = buildSystem.getBuildStatus();
        return {
          content: [{ type: 'text', text: JSON.stringify(status, null, 2) }],
        };
      }

      case 'openmohaa_build_cancel': {
        const cancelled = buildSystem.cancelBuild();
        return {
          content: [{ type: 'text', text: cancelled ? 'Build cancelled' : 'No build in progress' }],
        };
      }

      case 'openmohaa_build_git_info': {
        const info = await buildSystem.getGitInfo(args.repoDir as string);
        return {
          content: [{ type: 'text', text: JSON.stringify(info, null, 2) }],
        };
      }

      case 'openmohaa_build_run_tests': {
        const result = await buildSystem.runTests(
          args.buildDir as string,
          args.testPattern as string | undefined
        );
        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        };
      }

      case 'openmohaa_build_package': {
        const result = await buildSystem.createPackage(
          args.buildDir as string,
          args.outputDir as string,
          args.name as string
        );
        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        };
      }

      // === Demo Management ===
      case 'openmohaa_demo_start_recording': {
        const result = await demoManager.startRecording(args.demoName as string | undefined);
        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        };
      }

      case 'openmohaa_demo_stop_recording': {
        const result = await demoManager.stopRecording();
        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        };
      }

      case 'openmohaa_demo_play': {
        const result = await demoManager.playDemo(args.demoName as string);
        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        };
      }

      case 'openmohaa_demo_stop': {
        const result = await demoManager.stopPlayback();
        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        };
      }

      case 'openmohaa_demo_list': {
        const demos = demoManager.listDemos();
        return {
          content: [{ type: 'text', text: JSON.stringify(demos, null, 2) }],
        };
      }

      case 'openmohaa_demo_delete': {
        const result = demoManager.deleteDemo(args.demoName as string);
        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        };
      }

      case 'openmohaa_demo_rename': {
        const result = demoManager.renameDemo(args.oldName as string, args.newName as string);
        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        };
      }

      case 'openmohaa_demo_pause': {
        const result = await demoManager.pauseDemo();
        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        };
      }

      case 'openmohaa_demo_resume': {
        const result = await demoManager.resumeDemo();
        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        };
      }

      case 'openmohaa_demo_set_speed': {
        const result = await demoManager.setPlaybackSpeed(args.speed as number);
        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        };
      }

      case 'openmohaa_demo_seek': {
        const result = await demoManager.seekDemo(args.seconds as number);
        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        };
      }

      case 'openmohaa_demo_cleanup': {
        const result = demoManager.cleanupDemos({
          olderThanDays: args.olderThanDays as number | undefined,
          keepCount: args.keepCount as number | undefined,
          maxSizeMB: args.maxSizeMB as number | undefined,
        });
        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        };
      }

      case 'openmohaa_demo_set_dir': {
        demoManager.setDemoDir(args.dir as string);
        return {
          content: [{ type: 'text', text: `Demo directory set to: ${args.dir}` }],
        };
      }

      // === Config Management ===
      case 'openmohaa_config_read': {
        const config = configManager.readConfig(args.filename as string);
        return {
          content: [{ type: 'text', text: config ? JSON.stringify(config, null, 2) : 'Config not found' }],
        };
      }

      case 'openmohaa_config_write': {
        const result = configManager.writeConfig(args.filename as string, args.content as string);
        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        };
      }

      case 'openmohaa_config_list': {
        const configs = configManager.listConfigs();
        return {
          content: [{ type: 'text', text: JSON.stringify(configs, null, 2) }],
        };
      }

      case 'openmohaa_config_parse': {
        const config = configManager.readConfig(args.filename as string);
        if (!config) {
          return { content: [{ type: 'text', text: 'Config not found' }] };
        }
        const parsed = configManager.parseConfig(config.content);
        return {
          content: [{ type: 'text', text: JSON.stringify(parsed, null, 2) }],
        };
      }

      case 'openmohaa_config_get_autoexec': {
        const autoexec = configManager.getAutoexec();
        return {
          content: [{ type: 'text', text: JSON.stringify(autoexec, null, 2) }],
        };
      }

      case 'openmohaa_config_set_cvar': {
        const result = configManager.setCvarInAutoexec(args.name as string, args.value as string);
        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        };
      }

      case 'openmohaa_config_set_bind': {
        const result = configManager.setBindInAutoexec(args.key as string, args.command as string);
        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        };
      }

      case 'openmohaa_config_backup': {
        const result = configManager.backupConfig(args.filename as string);
        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        };
      }

      case 'openmohaa_config_restore': {
        const result = configManager.restoreConfig(args.backupFilename as string);
        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        };
      }

      case 'openmohaa_config_validate': {
        const result = configManager.validateConfig(args.content as string);
        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        };
      }

      case 'openmohaa_config_graphics_preset': {
        const result = configManager.applyGraphicsPreset(args.preset as 'low' | 'medium' | 'high' | 'ultra');
        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        };
      }

      case 'openmohaa_config_set_game_dir': {
        configManager.setModDir(args.modDir as string || 'main');
        return {
          content: [{ type: 'text', text: `Game directory set to: ${args.gameDir}/${args.modDir || 'main'}` }],
        };
      }

      // === Server Management ===
      case 'openmohaa_server_start': {
        const result = await serverManager.startServer({
          executablePath: args.executablePath as string,
          gameDir: args.gameDir as string | undefined,
          mod: args.mod as string | undefined,
          port: args.port as number | undefined,
          maxPlayers: args.maxPlayers as number | undefined,
          hostname: args.hostname as string | undefined,
          password: args.password as string | undefined,
          rconPassword: args.rconPassword as string | undefined,
          map: args.map as string | undefined,
          gametype: args.gametype as string | undefined,
          dedicated: args.dedicated as 1 | 2 | undefined,
        });
        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        };
      }

      case 'openmohaa_server_stop': {
        const result = await serverManager.stopServer();
        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        };
      }

      case 'openmohaa_server_restart': {
        const result = await serverManager.restartServer();
        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        };
      }

      case 'openmohaa_server_status': {
        const status = serverManager.getStatus();
        return {
          content: [{ type: 'text', text: JSON.stringify(status, null, 2) }],
        };
      }

      case 'openmohaa_server_rcon': {
        const result = await serverManager.sendRcon(
          args.command as string,
          args.host as string || 'localhost',
          args.port as number || 12203,
          args.password as string
        );
        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        };
      }

      case 'openmohaa_server_query': {
        const status = await serverManager.queryServer(
          args.host as string,
          args.port as number || 12203
        );
        return {
          content: [{ type: 'text', text: JSON.stringify(status, null, 2) }],
        };
      }

      case 'openmohaa_server_output': {
        const output = serverManager.getOutput(args.lines as number | undefined);
        return {
          content: [{ type: 'text', text: output.join('\n') }],
        };
      }

      case 'openmohaa_server_change_map': {
        const result = await serverManager.changeMap(args.mapName as string);
        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        };
      }

      case 'openmohaa_server_kick': {
        const result = await serverManager.kickPlayer(
          args.playerId as number,
          args.reason as string | undefined
        );
        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        };
      }

      case 'openmohaa_server_say': {
        const result = await serverManager.say(args.message as string);
        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        };
      }

      // === Performance Monitoring ===
      case 'openmohaa_perf_start': {
        if (args.pid) {
          performanceMonitor.setPid(args.pid as number);
        }
        performanceMonitor.startMonitoring(args.intervalMs as number || 1000);
        return {
          content: [{ type: 'text', text: 'Performance monitoring started' }],
        };
      }

      case 'openmohaa_perf_stop': {
        performanceMonitor.stopMonitoring();
        return {
          content: [{ type: 'text', text: 'Performance monitoring stopped' }],
        };
      }

      case 'openmohaa_perf_collect': {
        const metrics = await performanceMonitor.collectMetrics();
        return {
          content: [{ type: 'text', text: JSON.stringify(metrics, null, 2) }],
        };
      }

      case 'openmohaa_perf_stats': {
        const stats = performanceMonitor.getStatistics();
        return {
          content: [{ type: 'text', text: stats ? JSON.stringify(stats, null, 2) : 'No samples collected' }],
        };
      }

      case 'openmohaa_perf_benchmark': {
        const result = await performanceMonitor.runBenchmark(
          args.name as string,
          args.durationMs as number,
          args.sampleIntervalMs as number || 100
        );
        return {
          content: [{ type: 'text', text: JSON.stringify({
            name: result.name,
            duration: result.duration,
            avgFps: result.avgFps,
            minFps: result.minFps,
            maxFps: result.maxFps,
            p1Fps: result.p1Fps,
            p01Fps: result.p01Fps,
            sampleCount: result.samples.length,
          }, null, 2) }],
        };
      }

      case 'openmohaa_perf_check_issues': {
        const issues = performanceMonitor.checkPerformanceIssues();
        return {
          content: [{ type: 'text', text: JSON.stringify(issues, null, 2) }],
        };
      }

      case 'openmohaa_perf_export_csv': {
        const csv = performanceMonitor.exportToCsv();
        return {
          content: [{ type: 'text', text: csv }],
        };
      }

      case 'openmohaa_perf_clear': {
        performanceMonitor.clearSamples();
        return {
          content: [{ type: 'text', text: 'Performance samples cleared' }],
        };
      }

      // === Log Analysis ===
      case 'openmohaa_log_list': {
        const logs = logAnalyzer.listLogs();
        return {
          content: [{ type: 'text', text: JSON.stringify(logs, null, 2) }],
        };
      }

      case 'openmohaa_log_parse': {
        const entries = logAnalyzer.parseLog(args.filePath as string);
        return {
          content: [{ type: 'text', text: JSON.stringify(entries.slice(-100), null, 2) }],
        };
      }

      case 'openmohaa_log_stats': {
        const stats = logAnalyzer.getStats(args.filePath as string);
        return {
          content: [{ type: 'text', text: JSON.stringify(stats, null, 2) }],
        };
      }

      case 'openmohaa_log_search': {
        const results = logAnalyzer.search(
          args.filePath as string,
          args.pattern as string,
          {
            type: args.type as any,
            limit: args.limit as number || 100,
          }
        );
        return {
          content: [{ type: 'text', text: JSON.stringify(results, null, 2) }],
        };
      }

      case 'openmohaa_log_errors': {
        const errors = logAnalyzer.getErrors(args.filePath as string, args.limit as number || 50);
        return {
          content: [{ type: 'text', text: JSON.stringify(errors, null, 2) }],
        };
      }

      case 'openmohaa_log_kills': {
        const kills = logAnalyzer.parseKills(args.filePath as string);
        return {
          content: [{ type: 'text', text: JSON.stringify(kills, null, 2) }],
        };
      }

      case 'openmohaa_log_sessions': {
        const sessions = logAnalyzer.analyzePlayerSessions(args.filePath as string);
        return {
          content: [{ type: 'text', text: JSON.stringify(sessions, null, 2) }],
        };
      }

      case 'openmohaa_log_tail': {
        const lines = logAnalyzer.tail(args.filePath as string, args.lines as number || 50);
        return {
          content: [{ type: 'text', text: lines.join('\n') }],
        };
      }

      case 'openmohaa_log_watch': {
        logAnalyzer.watchLog(args.filePath as string);
        return {
          content: [{ type: 'text', text: `Watching log: ${args.filePath}` }],
        };
      }

      case 'openmohaa_log_unwatch': {
        logAnalyzer.unwatchLog(args.filePath as string);
        return {
          content: [{ type: 'text', text: `Stopped watching log: ${args.filePath}` }],
        };
      }

      case 'openmohaa_log_summary': {
        const summary = logAnalyzer.generateSummary(args.filePath as string);
        return {
          content: [{ type: 'text', text: summary }],
        };
      }

      case 'openmohaa_log_set_dir': {
        logAnalyzer.setLogDir(args.dir as string);
        return {
          content: [{ type: 'text', text: `Log directory set to: ${args.dir}` }],
        };
      }

      default:
        return {
          content: [{ type: 'text', text: `Unknown tool: ${name}` }],
          isError: true,
        };
    }
  } catch (error) {
    return {
      content: [
        {
          type: 'text',
          text: `Error executing ${name}: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
      isError: true,
    };
  }
});

// Handle resource listing
server.setRequestHandler(ListResourcesRequestSchema, async () => {
  return {
    resources: [
      {
        uri: 'openmohaa://console/output',
        name: 'Console Output',
        description: 'Live console output from OpenMOHAA',
        mimeType: 'text/plain',
      },
      {
        uri: 'openmohaa://game/status',
        name: 'Game Status',
        description: 'Current game process status',
        mimeType: 'application/json',
      },
    ],
  };
});

// Handle resource reading
server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
  const { uri } = request.params;

  switch (uri) {
    case 'openmohaa://console/output': {
      const output = consoleManager.getRecentOutput(100);
      return {
        contents: [
          {
            uri,
            mimeType: 'text/plain',
            text: output.map((o) => `[${o.type}] ${o.text}`).join('\n'),
          },
        ],
      };
    }

    case 'openmohaa://game/status': {
      const state = launcher.getState();
      return {
        contents: [
          {
            uri,
            mimeType: 'application/json',
            text: JSON.stringify(state, null, 2),
          },
        ],
      };
    }

    default:
      throw new Error(`Unknown resource: ${uri}`);
  }
});

// Main entry point
async function main() {
  console.error('Starting OpenMOHAA MCP Server...');
  
  // Check dependencies on startup
  const uiDeps = await uiController.checkDependencies();
  const screenDeps = await screenCapture.checkDependencies();
  
  if (uiDeps.missing.length > 0 || screenDeps.missing.length > 0) {
    const missing = [...new Set([...uiDeps.missing, ...screenDeps.missing])];
    console.error(`Warning: Missing dependencies: ${missing.join(', ')}`);
    console.error('Some features may not work. Install with: sudo apt install xdotool imagemagick');
  }

  const transport = new StdioServerTransport();
  await server.connect(transport);
  
  console.error('OpenMOHAA MCP Server running on stdio');
}

main().catch((error) => {
  console.error('Failed to start server:', error);
  process.exit(1);
});
