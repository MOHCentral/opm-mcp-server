/**
 * OpenMOHAA MCP Server - Process Launcher Module
 * Handles game lifecycle: launch, monitor, restart, kill
 */

import { spawn, ChildProcess } from 'child_process';
import { existsSync, accessSync, constants } from 'fs';
import { dirname } from 'path';
import { EventEmitter } from 'events';
import treeKill from 'tree-kill';
import type { GameConfig, ProcessState, ConsoleOutput, LogLevel } from './types.js';

export class ProcessLauncher extends EventEmitter {
  private process: ChildProcess | null = null;
  private config: GameConfig | null = null;
  private state: ProcessState = {
    pid: null,
    running: false,
    exitCode: null,
    startTime: null,
    lastError: null,
  };
  private consoleBuffer: ConsoleOutput[] = [];
  private maxBufferLines = 10000;
  private restartAttempts = 0;
  private maxRestartAttempts = 3;
  private autoRestart = false;

  constructor() {
    super();
  }

  /**
   * Validate that the executable exists and is runnable
   */
  private validateExecutable(path: string): void {
    if (!existsSync(path)) {
      throw new Error(`Executable not found: ${path}`);
    }
    try {
      accessSync(path, constants.X_OK);
    } catch {
      throw new Error(`Executable is not executable: ${path}`);
    }
  }

  /**
   * Build the command line arguments for launching OpenMOHAA
   */
  private buildArguments(config: GameConfig): string[] {
    const args: string[] = [...(config.arguments || [])];

    // Set game directory if specified
    if (config.gameDirectory) {
      args.push('+set', 'fs_game', config.gameDirectory);
    }

    // Enable console
    if (config.enableConsole !== false) {
      args.push('+set', 'con_enable', '1');
    }

    // Enable cheats for testing
    if (config.enableCheats) {
      args.push('+set', 'sv_cheats', '1');
    }

    // Windowed mode
    if (config.windowedMode) {
      args.push('+set', 'r_fullscreen', '0');
    }

    // Resolution
    if (config.resolution) {
      args.push('+set', 'r_customwidth', config.resolution.width.toString());
      args.push('+set', 'r_customheight', config.resolution.height.toString());
      args.push('+set', 'r_mode', '-1');
    }

    return args;
  }

  /**
   * Launch OpenMOHAA with the given configuration
   */
  async launch(config: GameConfig): Promise<ProcessState> {
    // Validate executable
    this.validateExecutable(config.executablePath);

    // Stop existing process if running
    if (this.state.running) {
      await this.stop();
    }

    this.config = config;
    const args = this.buildArguments(config);
    const cwd = config.workingDirectory || dirname(config.executablePath);

    this.log('info', `Launching OpenMOHAA: ${config.executablePath}`);
    this.log('debug', `Arguments: ${args.join(' ')}`);
    this.log('debug', `Working directory: ${cwd}`);

    // Build environment
    const env = {
      ...process.env,
      ...config.environmentVariables,
    };

    // Spawn the process
    this.process = spawn(config.executablePath, args, {
      cwd,
      env,
      stdio: ['pipe', 'pipe', 'pipe'],
      detached: false,
    });

    this.state = {
      pid: this.process.pid || null,
      running: true,
      exitCode: null,
      startTime: new Date(),
      lastError: null,
    };

    // Handle stdout
    this.process.stdout?.on('data', (data: Buffer) => {
      const text = data.toString();
      this.handleOutput(text, 'stdout');
    });

    // Handle stderr
    this.process.stderr?.on('data', (data: Buffer) => {
      const text = data.toString();
      this.handleOutput(text, 'stderr');
    });

    // Handle process exit
    this.process.on('exit', (code, signal) => {
      this.log('info', `Process exited with code ${code}, signal ${signal}`);
      this.state.running = false;
      this.state.exitCode = code;
      this.emit('exit', { code, signal });

      if (this.autoRestart && this.restartAttempts < this.maxRestartAttempts) {
        this.restartAttempts++;
        this.log('info', `Auto-restarting (attempt ${this.restartAttempts})`);
        setTimeout(() => this.launch(this.config!), 2000);
      }
    });

    // Handle errors
    this.process.on('error', (err) => {
      this.log('error', `Process error: ${err.message}`);
      this.state.lastError = err.message;
      this.state.running = false;
      this.emit('error', err);
    });

    // Wait for startup confirmation
    await this.waitForStartup();

    this.log('info', `Game launched successfully, PID: ${this.state.pid}`);
    this.emit('started', this.state);

    return this.state;
  }

  /**
   * Wait for the game to finish starting up
   */
  private async waitForStartup(timeout = 30000): Promise<void> {
    return new Promise((resolve, reject) => {
      const startTime = Date.now();

      const checkStartup = () => {
        // Check if process is still running
        if (!this.state.running) {
          reject(new Error('Process exited during startup'));
          return;
        }

        // Look for startup indicators in console output
        const recentOutput = this.consoleBuffer.slice(-100);
        const startupComplete = recentOutput.some(
          (line) =>
            line.text.includes('Initializing') ||
            line.text.includes('Loading') ||
            line.text.includes('---') ||
            // Give some time for the window to appear
            Date.now() - startTime > 5000
        );

        if (startupComplete) {
          resolve();
          return;
        }

        if (Date.now() - startTime > timeout) {
          // Timeout but process is running, consider it started
          resolve();
          return;
        }

        setTimeout(checkStartup, 500);
      };

      checkStartup();
    });
  }

  /**
   * Handle output from the game process
   */
  private handleOutput(text: string, type: 'stdout' | 'stderr'): void {
    const lines = text.split('\n').filter((line) => line.trim());

    for (const line of lines) {
      const output: ConsoleOutput = {
        timestamp: new Date(),
        text: line,
        type,
      };

      this.consoleBuffer.push(output);

      // Trim buffer if too large
      if (this.consoleBuffer.length > this.maxBufferLines) {
        this.consoleBuffer = this.consoleBuffer.slice(-this.maxBufferLines / 2);
      }

      this.emit('output', output);

      // Detect specific events
      this.detectEvents(line);
    }
  }

  /**
   * Detect specific game events from console output
   */
  private detectEvents(line: string): void {
    // Map loaded
    if (line.includes('Map loaded:') || line.includes('Loading map')) {
      this.emit('mapLoaded', line);
    }

    // Error detection
    if (line.includes('ERROR') || line.includes('Error')) {
      this.emit('gameError', line);
    }

    // Warning detection
    if (line.includes('WARNING') || line.includes('Warning')) {
      this.emit('gameWarning', line);
    }

    // Crash detection
    if (line.includes('CRASH') || line.includes('Segmentation fault')) {
      this.emit('crash', line);
    }

    // Connection events
    if (line.includes('Connected to')) {
      this.emit('connected', line);
    }

    if (line.includes('Disconnected')) {
      this.emit('disconnected', line);
    }
  }

  /**
   * Stop the game process
   */
  async stop(): Promise<void> {
    if (!this.process || !this.state.running) {
      return;
    }

    this.log('info', 'Stopping game process...');

    return new Promise((resolve) => {
      const pid = this.process!.pid;
      if (!pid) {
        resolve();
        return;
      }

      // First try graceful shutdown
      this.process!.kill('SIGTERM');

      // Wait for graceful exit
      const timeout = setTimeout(() => {
        this.log('warn', 'Graceful shutdown failed, force killing...');
        treeKill(pid, 'SIGKILL', (err) => {
          if (err) {
            this.log('error', `Failed to kill process: ${err.message}`);
          }
          this.state.running = false;
          this.process = null;
          resolve();
        });
      }, 5000);

      this.process!.once('exit', () => {
        clearTimeout(timeout);
        this.state.running = false;
        this.process = null;
        this.log('info', 'Game process stopped');
        resolve();
      });
    });
  }

  /**
   * Force kill the game process
   */
  async forceKill(): Promise<void> {
    if (!this.process?.pid) {
      return;
    }

    return new Promise((resolve) => {
      treeKill(this.process!.pid!, 'SIGKILL', (err) => {
        if (err) {
          this.log('error', `Failed to force kill: ${err.message}`);
        }
        this.state.running = false;
        this.process = null;
        resolve();
      });
    });
  }

  /**
   * Restart the game
   */
  async restart(): Promise<ProcessState> {
    if (!this.config) {
      throw new Error('No configuration available for restart');
    }

    await this.stop();
    await new Promise((resolve) => setTimeout(resolve, 1000));
    return this.launch(this.config);
  }

  /**
   * Send input to the game's stdin
   */
  sendInput(text: string): boolean {
    if (!this.process?.stdin) {
      return false;
    }

    try {
      this.process.stdin.write(text + '\n');
      return true;
    } catch (err) {
      this.log('error', `Failed to send input: ${err}`);
      return false;
    }
  }

  /**
   * Get the current process state
   */
  getState(): ProcessState {
    return { ...this.state };
  }

  /**
   * Get console output buffer
   */
  getConsoleBuffer(lines?: number): ConsoleOutput[] {
    if (lines) {
      return this.consoleBuffer.slice(-lines);
    }
    return [...this.consoleBuffer];
  }

  /**
   * Clear the console buffer
   */
  clearConsoleBuffer(): void {
    this.consoleBuffer = [];
  }

  /**
   * Check if the game is running
   */
  isRunning(): boolean {
    return this.state.running;
  }

  /**
   * Get process ID
   */
  getPid(): number | null {
    return this.state.pid;
  }

  /**
   * Set auto-restart behavior
   */
  setAutoRestart(enabled: boolean, maxAttempts = 3): void {
    this.autoRestart = enabled;
    this.maxRestartAttempts = maxAttempts;
    this.restartAttempts = 0;
  }

  /**
   * Search console output for a pattern
   */
  searchConsole(pattern: string | RegExp, limit?: number): ConsoleOutput[] {
    const regex = typeof pattern === 'string' ? new RegExp(pattern, 'i') : pattern;
    const results: ConsoleOutput[] = [];
    const buffer = limit ? this.consoleBuffer.slice(-limit) : this.consoleBuffer;

    for (const line of buffer) {
      if (regex.test(line.text)) {
        results.push(line);
      }
    }

    return results;
  }

  /**
   * Wait for a specific pattern in console output
   */
  async waitForConsolePattern(pattern: string | RegExp, timeout = 30000): Promise<ConsoleOutput | null> {
    const regex = typeof pattern === 'string' ? new RegExp(pattern, 'i') : pattern;

    return new Promise((resolve) => {
      const startTime = Date.now();

      const handler = (output: ConsoleOutput) => {
        if (regex.test(output.text)) {
          this.off('output', handler);
          resolve(output);
        }
      };

      this.on('output', handler);

      // Check existing buffer
      for (const line of this.consoleBuffer.slice(-100)) {
        if (regex.test(line.text)) {
          this.off('output', handler);
          resolve(line);
          return;
        }
      }

      // Timeout handler
      setTimeout(() => {
        this.off('output', handler);
        if (Date.now() - startTime >= timeout) {
          resolve(null);
        }
      }, timeout);
    });
  }

  /**
   * Internal logging
   */
  private log(level: LogLevel, message: string): void {
    this.emit('log', { level, message, timestamp: new Date() });
  }
}

export default ProcessLauncher;
