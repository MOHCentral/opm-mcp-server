/**
 * OpenMOHAA MCP Server - Dedicated Server Manager Module
 * Handles dedicated server lifecycle, RCON, and monitoring
 */

import { spawn, ChildProcess, exec } from 'child_process';
import { promisify } from 'util';
import { existsSync, readFileSync, writeFileSync, appendFileSync } from 'fs';
import { join } from 'path';
import { EventEmitter } from 'events';
import * as dgram from 'dgram';

const execAsync = promisify(exec);

export interface ServerConfig {
  executablePath: string;
  gameDir?: string;
  mod?: string;
  port?: number;
  maxPlayers?: number;
  hostname?: string;
  password?: string;
  rconPassword?: string;
  map?: string;
  gametype?: string;
  dedicated?: 1 | 2; // 1 = LAN, 2 = Internet
  additionalArgs?: string[];
}

export interface ServerStatus {
  running: boolean;
  pid: number | null;
  uptime: number | null;
  players: PlayerInfo[];
  map: string | null;
  hostname: string | null;
  maxPlayers: number | null;
}

export interface PlayerInfo {
  id: number;
  name: string;
  score: number;
  ping: number;
  ip?: string;
}

export interface RconResponse {
  success: boolean;
  response: string;
}

export class ServerManager extends EventEmitter {
  private serverProcess: ChildProcess | null = null;
  private config: ServerConfig | null = null;
  private startTime: number | null = null;
  private outputBuffer: string[] = [];
  private maxOutputBufferSize = 1000;

  constructor() {
    super();
  }

  /**
   * Start a dedicated server
   */
  async startServer(config: ServerConfig): Promise<{ success: boolean; pid: number | null; message: string }> {
    if (this.serverProcess) {
      return {
        success: false,
        pid: null,
        message: 'Server is already running',
      };
    }

    if (!existsSync(config.executablePath)) {
      return {
        success: false,
        pid: null,
        message: `Executable not found: ${config.executablePath}`,
      };
    }

    // Build command line arguments
    const args: string[] = [
      '+set', 'dedicated', String(config.dedicated || 2),
    ];

    if (config.gameDir) {
      args.push('+set', 'fs_basepath', config.gameDir);
    }

    if (config.mod) {
      args.push('+set', 'fs_game', config.mod);
    }

    if (config.port) {
      args.push('+set', 'net_port', String(config.port));
    }

    if (config.maxPlayers) {
      args.push('+set', 'sv_maxclients', String(config.maxPlayers));
    }

    if (config.hostname) {
      args.push('+set', 'sv_hostname', config.hostname);
    }

    if (config.password) {
      args.push('+set', 'g_password', config.password);
    }

    if (config.rconPassword) {
      args.push('+set', 'rconpassword', config.rconPassword);
    }

    if (config.gametype) {
      args.push('+set', 'g_gametype', config.gametype);
    }

    if (config.map) {
      args.push('+map', config.map);
    }

    if (config.additionalArgs) {
      args.push(...config.additionalArgs);
    }

    return new Promise((resolve) => {
      this.emit('log', { message: `Starting server: ${config.executablePath} ${args.join(' ')}` });

      this.serverProcess = spawn(config.executablePath, args, {
        cwd: config.gameDir,
        stdio: ['pipe', 'pipe', 'pipe'],
        detached: true,
      });

      this.config = config;
      this.startTime = Date.now();
      this.outputBuffer = [];

      this.serverProcess.stdout?.on('data', (data) => {
        const text = data.toString();
        this.appendOutput(text);
        this.emit('output', text);
        this.parseServerOutput(text);
      });

      this.serverProcess.stderr?.on('data', (data) => {
        const text = data.toString();
        this.appendOutput(text);
        this.emit('error', text);
      });

      this.serverProcess.on('close', (code) => {
        this.emit('close', { code });
        this.serverProcess = null;
        this.startTime = null;
      });

      this.serverProcess.on('error', (err) => {
        this.emit('error', err.message);
        resolve({
          success: false,
          pid: null,
          message: `Failed to start server: ${err.message}`,
        });
      });

      // Give the server a moment to start
      setTimeout(() => {
        if (this.serverProcess && !this.serverProcess.killed) {
          resolve({
            success: true,
            pid: this.serverProcess.pid || null,
            message: 'Server started successfully',
          });
        }
      }, 1000);
    });
  }

  /**
   * Stop the server gracefully
   */
  async stopServer(): Promise<{ success: boolean; message: string }> {
    if (!this.serverProcess) {
      return {
        success: false,
        message: 'Server is not running',
      };
    }

    // Try graceful shutdown via RCON first
    if (this.config?.rconPassword) {
      try {
        await this.sendRcon('quit', 'localhost', this.config.port || 12203, this.config.rconPassword);
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        if (!this.serverProcess || this.serverProcess.killed) {
          return { success: true, message: 'Server stopped gracefully' };
        }
      } catch {
        // Fall through to SIGTERM
      }
    }

    // Send SIGTERM
    this.serverProcess.kill('SIGTERM');

    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        if (this.serverProcess && !this.serverProcess.killed) {
          this.serverProcess.kill('SIGKILL');
        }
        resolve({ success: true, message: 'Server force-killed' });
      }, 5000);

      this.serverProcess?.on('close', () => {
        clearTimeout(timeout);
        resolve({ success: true, message: 'Server stopped' });
      });
    });
  }

  /**
   * Restart the server
   */
  async restartServer(): Promise<{ success: boolean; message: string }> {
    if (!this.config) {
      return { success: false, message: 'No server configuration available' };
    }

    const config = { ...this.config };
    
    await this.stopServer();
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    const result = await this.startServer(config);
    return {
      success: result.success,
      message: result.success ? 'Server restarted' : result.message,
    };
  }

  /**
   * Send an RCON command
   */
  async sendRcon(command: string, host: string, port: number, password: string): Promise<RconResponse> {
    return new Promise((resolve) => {
      const socket = dgram.createSocket('udp4');
      const timeout = setTimeout(() => {
        socket.close();
        resolve({ success: false, response: 'RCON timeout' });
      }, 3000);

      // Q3 RCON packet format
      const rconPacket = Buffer.from(`\xff\xff\xff\xffrcon ${password} ${command}`, 'binary');

      socket.on('message', (msg) => {
        clearTimeout(timeout);
        // Strip the header (4 bytes of 0xff + "print\n")
        let response = msg.toString('utf-8');
        response = response.replace(/^\xff{4}print\n?/, '');
        socket.close();
        resolve({ success: true, response });
      });

      socket.on('error', (err) => {
        clearTimeout(timeout);
        socket.close();
        resolve({ success: false, response: err.message });
      });

      socket.send(rconPacket, port, host, (err) => {
        if (err) {
          clearTimeout(timeout);
          socket.close();
          resolve({ success: false, response: err.message });
        }
      });
    });
  }

  /**
   * Query server status via UDP
   */
  async queryServer(host: string, port: number): Promise<ServerStatus> {
    return new Promise((resolve) => {
      const socket = dgram.createSocket('udp4');
      const timeout = setTimeout(() => {
        socket.close();
        resolve({
          running: false,
          pid: null,
          uptime: null,
          players: [],
          map: null,
          hostname: null,
          maxPlayers: null,
        });
      }, 3000);

      // Q3 getstatus packet
      const statusPacket = Buffer.from('\xff\xff\xff\xffgetstatus', 'binary');

      socket.on('message', (msg) => {
        clearTimeout(timeout);
        socket.close();

        const response = msg.toString('utf-8');
        const status = this.parseStatusResponse(response);
        resolve(status);
      });

      socket.on('error', () => {
        clearTimeout(timeout);
        socket.close();
        resolve({
          running: false,
          pid: null,
          uptime: null,
          players: [],
          map: null,
          hostname: null,
          maxPlayers: null,
        });
      });

      socket.send(statusPacket, port, host);
    });
  }

  /**
   * Parse server status response
   */
  private parseStatusResponse(response: string): ServerStatus {
    const status: ServerStatus = {
      running: true,
      pid: this.serverProcess?.pid || null,
      uptime: this.startTime ? Date.now() - this.startTime : null,
      players: [],
      map: null,
      hostname: null,
      maxPlayers: null,
    };

    const lines = response.split('\n');
    
    // Skip header
    if (lines.length > 1) {
      // Parse server info (key\value pairs)
      const infoLine = lines[1];
      const parts = infoLine.split('\\');
      
      for (let i = 1; i < parts.length - 1; i += 2) {
        const key = parts[i];
        const value = parts[i + 1];

        if (key === 'mapname') status.map = value;
        if (key === 'sv_hostname') status.hostname = value;
        if (key === 'sv_maxclients') status.maxPlayers = parseInt(value);
      }
    }

    // Parse players (starting from line 2)
    for (let i = 2; i < lines.length; i++) {
      const playerMatch = lines[i].match(/^(\d+)\s+(\d+)\s+"(.*)"/);
      if (playerMatch) {
        status.players.push({
          id: i - 2,
          score: parseInt(playerMatch[1]),
          ping: parseInt(playerMatch[2]),
          name: playerMatch[3],
        });
      }
    }

    return status;
  }

  /**
   * Get server status
   */
  getStatus(): ServerStatus {
    return {
      running: this.serverProcess !== null && !this.serverProcess.killed,
      pid: this.serverProcess?.pid || null,
      uptime: this.startTime ? Date.now() - this.startTime : null,
      players: [],
      map: null,
      hostname: this.config?.hostname || null,
      maxPlayers: this.config?.maxPlayers || null,
    };
  }

  /**
   * Get server output buffer
   */
  getOutput(lines?: number): string[] {
    if (lines) {
      return this.outputBuffer.slice(-lines);
    }
    return [...this.outputBuffer];
  }

  /**
   * Append to output buffer
   */
  private appendOutput(text: string): void {
    const lines = text.split('\n').filter(l => l.trim());
    this.outputBuffer.push(...lines);

    // Trim buffer if too large
    if (this.outputBuffer.length > this.maxOutputBufferSize) {
      this.outputBuffer = this.outputBuffer.slice(-this.maxOutputBufferSize);
    }
  }

  /**
   * Parse server output for events
   */
  private parseServerOutput(text: string): void {
    // Player connect
    const connectMatch = text.match(/Client (\d+) connected/);
    if (connectMatch) {
      this.emit('playerConnect', { clientId: parseInt(connectMatch[1]) });
    }

    // Player disconnect
    const disconnectMatch = text.match(/Client (\d+) disconnected/);
    if (disconnectMatch) {
      this.emit('playerDisconnect', { clientId: parseInt(disconnectMatch[1]) });
    }

    // Map change
    const mapMatch = text.match(/^---+\s*(.+\.bsp)/);
    if (mapMatch) {
      this.emit('mapChange', { map: mapMatch[1] });
    }

    // Server ready
    if (text.includes('Server Initialized')) {
      this.emit('ready');
    }
  }

  /**
   * Write server output to log file
   */
  enableLogging(logPath: string): void {
    this.on('output', (text) => {
      const timestamp = new Date().toISOString();
      appendFileSync(logPath, `[${timestamp}] ${text}`);
    });

    this.on('error', (text) => {
      const timestamp = new Date().toISOString();
      appendFileSync(logPath, `[${timestamp}] ERROR: ${text}`);
    });
  }

  /**
   * Execute server command via stdin
   */
  async executeCommand(command: string): Promise<{ success: boolean; message: string }> {
    if (!this.serverProcess || !this.serverProcess.stdin) {
      return { success: false, message: 'Server is not running' };
    }

    return new Promise((resolve) => {
      this.serverProcess!.stdin!.write(command + '\n', (err) => {
        if (err) {
          resolve({ success: false, message: err.message });
        } else {
          resolve({ success: true, message: 'Command sent' });
        }
      });
    });
  }

  /**
   * Change map
   */
  async changeMap(mapName: string): Promise<{ success: boolean; message: string }> {
    if (this.config?.rconPassword) {
      const result = await this.sendRcon(
        `map ${mapName}`,
        'localhost',
        this.config.port || 12203,
        this.config.rconPassword
      );
      return { success: result.success, message: result.response };
    }

    return this.executeCommand(`map ${mapName}`);
  }

  /**
   * Kick a player
   */
  async kickPlayer(playerId: number, reason?: string): Promise<{ success: boolean; message: string }> {
    const command = reason ? `kick ${playerId} "${reason}"` : `kick ${playerId}`;
    
    if (this.config?.rconPassword) {
      const result = await this.sendRcon(
        command,
        'localhost',
        this.config.port || 12203,
        this.config.rconPassword
      );
      return { success: result.success, message: result.response };
    }

    return this.executeCommand(command);
  }

  /**
   * Ban a player by IP
   */
  async banPlayer(ip: string): Promise<{ success: boolean; message: string }> {
    if (this.config?.rconPassword) {
      const result = await this.sendRcon(
        `addip ${ip}`,
        'localhost',
        this.config.port || 12203,
        this.config.rconPassword
      );
      return { success: result.success, message: result.response };
    }

    return this.executeCommand(`addip ${ip}`);
  }

  /**
   * Send a server message
   */
  async say(message: string): Promise<{ success: boolean; message: string }> {
    if (this.config?.rconPassword) {
      const result = await this.sendRcon(
        `say "${message}"`,
        'localhost',
        this.config.port || 12203,
        this.config.rconPassword
      );
      return { success: result.success, message: result.response };
    }

    return this.executeCommand(`say "${message}"`);
  }
}

export default ServerManager;
