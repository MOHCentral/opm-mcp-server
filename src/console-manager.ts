/**
 * OpenMOHAA MCP Server - Console Manager Module
 * Handles console commands, cvars, and output parsing
 */

import { EventEmitter } from 'events';
import { existsSync, readFileSync } from 'fs';
import type { ProcessLauncher } from './launcher.js';
import type { CvarInfo, CommandResult, ConsoleOutput } from './types.js';

export class ConsoleManager extends EventEmitter {
  private launcher: ProcessLauncher;
  private cvarCache: Map<string, CvarInfo> = new Map();
  private commandQueue: Array<{ command: string; resolve: (result: CommandResult) => void }> = [];
  private processingCommand = false;
  private commandTimeout = 5000;

  // Key bindings for console toggle
  private consoleKey = '`'; // Default console key
  private consoleOpen = false;

  constructor(launcher: ProcessLauncher) {
    super();
    this.launcher = launcher;

    // Listen for console output
    this.launcher.on('output', (output: ConsoleOutput) => {
      this.parseOutput(output);
    });
  }

  /**
   * Send a command to the game console
   * Uses multiple methods: stdin, FIFO, or key simulation
   */
  async sendCommand(command: string, waitForResponse = true): Promise<CommandResult> {
    if (!this.launcher.isRunning()) {
      return {
        success: false,
        output: '',
        error: 'Game is not running',
      };
    }

    return new Promise((resolve) => {
      // Add marker for tracking response
      const marker = `__CMD_${Date.now()}_${Math.random().toString(36).slice(2)}__`;
      const markedCommand = command;

      // Try stdin first
      const stdinSuccess = this.launcher.sendInput(markedCommand);

      if (!stdinSuccess) {
        // Fall back to key simulation (will be handled by UI controller)
        this.emit('needKeySimulation', { command: markedCommand, marker });
      }

      if (!waitForResponse) {
        resolve({ success: true, output: '', error: undefined });
        return;
      }

      // Wait for response
      const startTime = Date.now();
      const outputBuffer: string[] = [];
      let commandOutputStarted = false;

      const outputHandler = (output: ConsoleOutput) => {
        // Collect output after command is sent
        if (commandOutputStarted || output.text.includes(command.split(' ')[0])) {
          commandOutputStarted = true;
          outputBuffer.push(output.text);
        }
      };

      this.launcher.on('output', outputHandler);

      // Timeout handler
      const timeout = setTimeout(() => {
        this.launcher.off('output', outputHandler);
        resolve({
          success: true,
          output: outputBuffer.join('\n'),
          error: outputBuffer.length === 0 ? 'No response received' : undefined,
        });
      }, this.commandTimeout);

      // Check for command completion (new prompt or specific patterns)
      const checkComplete = () => {
        const lastLine = outputBuffer[outputBuffer.length - 1] || '';
        if (
          lastLine.includes('>') ||
          lastLine.includes(']') ||
          Date.now() - startTime > this.commandTimeout
        ) {
          clearTimeout(timeout);
          this.launcher.off('output', outputHandler);
          resolve({
            success: true,
            output: outputBuffer.join('\n'),
          });
        } else {
          setTimeout(checkComplete, 100);
        }
      };

      setTimeout(checkComplete, 500);
    });
  }

  /**
   * Set a console variable (cvar)
   */
  async setCvar(name: string, value: string): Promise<CommandResult> {
    const command = `set ${name} "${value}"`;
    const result = await this.sendCommand(command);

    if (result.success) {
      // Update cache
      this.cvarCache.set(name, {
        name,
        value,
      });
    }

    return result;
  }

  /**
   * Get a console variable value
   */
  async getCvar(name: string): Promise<CvarInfo | null> {
    // Send the cvar name alone to get its value
    const result = await this.sendCommand(name);

    if (!result.success) {
      return null;
    }

    // Parse the output to extract value
    // Typical output: "cvarname" is:"value" default:"defaultvalue"
    const output = result.output;
    const valueMatch = output.match(/is:\s*"([^"]*)"/i) || output.match(/=\s*"([^"]*)"/);
    const defaultMatch = output.match(/default:\s*"([^"]*)"/i);

    if (valueMatch) {
      const info: CvarInfo = {
        name,
        value: valueMatch[1],
        defaultValue: defaultMatch ? defaultMatch[1] : undefined,
      };
      this.cvarCache.set(name, info);
      return info;
    }

    // Try parsing as simple output
    const lines = output.split('\n').filter((l) => l.trim());
    if (lines.length > 0) {
      const info: CvarInfo = {
        name,
        value: lines[0].trim(),
      };
      this.cvarCache.set(name, info);
      return info;
    }

    return null;
  }

  /**
   * Get cached cvar value (faster but may be stale)
   */
  getCachedCvar(name: string): CvarInfo | undefined {
    return this.cvarCache.get(name);
  }

  /**
   * Execute a config file
   */
  async execConfig(configPath: string): Promise<CommandResult> {
    // Check if file exists
    if (!existsSync(configPath)) {
      return {
        success: false,
        output: '',
        error: `Config file not found: ${configPath}`,
      };
    }

    return this.sendCommand(`exec "${configPath}"`);
  }

  /**
   * Run a batch of commands from a config file
   */
  async runConfigFile(configPath: string): Promise<CommandResult[]> {
    if (!existsSync(configPath)) {
      throw new Error(`Config file not found: ${configPath}`);
    }

    const content = readFileSync(configPath, 'utf-8');
    const commands = content
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('//') && !line.startsWith('#'));

    const results: CommandResult[] = [];
    for (const command of commands) {
      const result = await this.sendCommand(command);
      results.push(result);
    }

    return results;
  }

  /**
   * Send multiple commands in sequence
   */
  async sendCommands(commands: string[], delayMs = 100): Promise<CommandResult[]> {
    const results: CommandResult[] = [];

    for (const command of commands) {
      const result = await this.sendCommand(command);
      results.push(result);

      if (delayMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }

    return results;
  }

  /**
   * Toggle the console open/closed
   */
  toggleConsole(): void {
    this.emit('needKeySimulation', { key: this.consoleKey });
    this.consoleOpen = !this.consoleOpen;
  }

  /**
   * Open the console (if not already open)
   */
  openConsole(): void {
    if (!this.consoleOpen) {
      this.toggleConsole();
    }
  }

  /**
   * Close the console (if open)
   */
  closeConsole(): void {
    if (this.consoleOpen) {
      this.toggleConsole();
    }
  }

  /**
   * Parse console output for events and cvar updates
   */
  private parseOutput(output: ConsoleOutput): void {
    const text = output.text;

    // Detect map changes
    if (text.includes('Loading map') || text.includes('----')) {
      const mapMatch = text.match(/Loading map[:\s]+(\w+)/i);
      if (mapMatch) {
        this.emit('mapChange', mapMatch[1]);
      }
    }

    // Detect cvar changes
    const cvarMatch = text.match(/^(\w+)\s+(?:is:|changed to|=)\s*"?([^"]*)"?/);
    if (cvarMatch) {
      const [, name, value] = cvarMatch;
      this.cvarCache.set(name, { name, value });
      this.emit('cvarChange', { name, value });
    }

    // Detect errors
    if (text.match(/error|failed|fatal/i)) {
      this.emit('consoleError', text);
    }

    // Detect warnings
    if (text.match(/warning|warn/i)) {
      this.emit('consoleWarning', text);
    }
  }

  /**
   * Get recent console output
   */
  getRecentOutput(lines = 100): ConsoleOutput[] {
    return this.launcher.getConsoleBuffer(lines);
  }

  /**
   * Search console output
   */
  searchOutput(pattern: string | RegExp, limit?: number): ConsoleOutput[] {
    return this.launcher.searchConsole(pattern, limit);
  }

  /**
   * Wait for specific text in console
   */
  async waitForText(pattern: string | RegExp, timeout = 30000): Promise<ConsoleOutput | null> {
    return this.launcher.waitForConsolePattern(pattern, timeout);
  }

  /**
   * Common game commands
   */

  async loadMap(mapName: string): Promise<CommandResult> {
    return this.sendCommand(`map ${mapName}`);
  }

  async disconnect(): Promise<CommandResult> {
    return this.sendCommand('disconnect');
  }

  async quit(): Promise<CommandResult> {
    return this.sendCommand('quit');
  }

  async godMode(enable = true): Promise<CommandResult> {
    return this.sendCommand(enable ? 'god' : 'notarget');
  }

  async noclip(enable = true): Promise<CommandResult> {
    return this.sendCommand(enable ? 'noclip' : 'noclip');
  }

  async giveWeapon(weapon: string): Promise<CommandResult> {
    return this.sendCommand(`give ${weapon}`);
  }

  async giveAll(): Promise<CommandResult> {
    return this.sendCommand('give all');
  }

  async setHealth(health: number): Promise<CommandResult> {
    return this.sendCommand(`set health ${health}`);
  }

  async teleport(x: number, y: number, z: number): Promise<CommandResult> {
    return this.sendCommand(`setpos ${x} ${y} ${z}`);
  }

  async bind(key: string, action: string): Promise<CommandResult> {
    return this.sendCommand(`bind ${key} "${action}"`);
  }

  async unbind(key: string): Promise<CommandResult> {
    return this.sendCommand(`unbind ${key}`);
  }

  async screenshot(): Promise<CommandResult> {
    return this.sendCommand('screenshot');
  }

  async record(demoName: string): Promise<CommandResult> {
    return this.sendCommand(`record ${demoName}`);
  }

  async stopRecord(): Promise<CommandResult> {
    return this.sendCommand('stoprecord');
  }

  async playDemo(demoName: string): Promise<CommandResult> {
    return this.sendCommand(`demo ${demoName}`);
  }

  /**
   * Server commands
   */

  async status(): Promise<CommandResult> {
    return this.sendCommand('status');
  }

  async connect(address: string, port = 12203): Promise<CommandResult> {
    return this.sendCommand(`connect ${address}:${port}`);
  }

  async rcon(password: string, command: string): Promise<CommandResult> {
    return this.sendCommand(`rcon ${password} ${command}`);
  }

  async kickPlayer(player: string): Promise<CommandResult> {
    return this.sendCommand(`kick ${player}`);
  }

  async banPlayer(player: string): Promise<CommandResult> {
    return this.sendCommand(`ban ${player}`);
  }

  async say(message: string): Promise<CommandResult> {
    return this.sendCommand(`say "${message}"`);
  }

  async sayTeam(message: string): Promise<CommandResult> {
    return this.sendCommand(`say_team "${message}"`);
  }

  /**
   * Set command timeout
   */
  setCommandTimeout(timeoutMs: number): void {
    this.commandTimeout = timeoutMs;
  }

  /**
   * Clear cvar cache
   */
  clearCache(): void {
    this.cvarCache.clear();
  }

  /**
   * Get all cached cvars
   */
  getAllCachedCvars(): Map<string, CvarInfo> {
    return new Map(this.cvarCache);
  }
}

export default ConsoleManager;
