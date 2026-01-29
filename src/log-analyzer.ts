/**
 * OpenMOHAA MCP Server - Log Analyzer Module
 * Parses and analyzes game log files for errors, events, and statistics
 */

import { existsSync, readFileSync, readdirSync, statSync, watchFile, unwatchFile } from 'fs';
import { join, basename } from 'path';
import { EventEmitter } from 'events';

export interface LogEntry {
  timestamp: Date | null;
  type: 'info' | 'warning' | 'error' | 'chat' | 'kill' | 'connect' | 'disconnect' | 'command' | 'other';
  message: string;
  raw: string;
  lineNumber: number;
}

export interface LogStats {
  totalLines: number;
  errors: number;
  warnings: number;
  kills: number;
  connects: number;
  disconnects: number;
  chatMessages: number;
  commands: number;
  timeSpan: { start: Date | null; end: Date | null };
}

export interface KillEvent {
  timestamp: Date | null;
  killer: string;
  victim: string;
  weapon: string;
  meansOfDeath: string;
}

export interface PlayerSession {
  name: string;
  ip?: string;
  connectTime: Date | null;
  disconnectTime: Date | null;
  duration: number;
  kills: number;
  deaths: number;
}

export class LogAnalyzer extends EventEmitter {
  private logDir: string;
  private watchedFiles: Set<string> = new Set();
  private filePositions: Map<string, number> = new Map();

  constructor(logDir: string) {
    super();
    this.logDir = logDir;
  }

  /**
   * Set log directory
   */
  setLogDir(logDir: string): void {
    this.logDir = logDir;
  }

  /**
   * List available log files
   */
  listLogs(): { name: string; path: string; size: number; modified: Date }[] {
    const logs: { name: string; path: string; size: number; modified: Date }[] = [];

    if (!existsSync(this.logDir)) {
      return logs;
    }

    const files = readdirSync(this.logDir);
    for (const file of files) {
      if (file.endsWith('.log') || file.includes('qconsole') || file.includes('games.log')) {
        const filePath = join(this.logDir, file);
        const stats = statSync(filePath);
        
        logs.push({
          name: file,
          path: filePath,
          size: stats.size,
          modified: stats.mtime,
        });
      }
    }

    return logs.sort((a, b) => b.modified.getTime() - a.modified.getTime());
  }

  /**
   * Read and parse a log file
   */
  parseLog(filePath: string): LogEntry[] {
    if (!existsSync(filePath)) {
      return [];
    }

    const content = readFileSync(filePath, 'utf-8');
    const lines = content.split('\n');
    const entries: LogEntry[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      entries.push(this.parseLine(line, i + 1));
    }

    return entries;
  }

  /**
   * Parse a single log line
   */
  private parseLine(line: string, lineNumber: number): LogEntry {
    const entry: LogEntry = {
      timestamp: null,
      type: 'other',
      message: line,
      raw: line,
      lineNumber,
    };

    // Try to extract timestamp (common formats)
    const timestampMatch = line.match(/^\[?(\d{4}[-/]\d{2}[-/]\d{2}[T\s]\d{2}:\d{2}:\d{2})\]?/);
    if (timestampMatch) {
      entry.timestamp = new Date(timestampMatch[1]);
      entry.message = line.substring(timestampMatch[0].length).trim();
    }

    // Alternative timestamp format (HH:MM:SS)
    const timeOnlyMatch = line.match(/^(\d{2}:\d{2}:\d{2})\s+/);
    if (timeOnlyMatch && !entry.timestamp) {
      const today = new Date();
      const [hours, minutes, seconds] = timeOnlyMatch[1].split(':').map(Number);
      entry.timestamp = new Date(today.getFullYear(), today.getMonth(), today.getDate(), hours, minutes, seconds);
      entry.message = line.substring(timeOnlyMatch[0].length).trim();
    }

    // Categorize the line
    const lowerLine = line.toLowerCase();

    if (lowerLine.includes('error') || lowerLine.includes('failed') || lowerLine.includes('fatal')) {
      entry.type = 'error';
    } else if (lowerLine.includes('warning') || lowerLine.includes('warn')) {
      entry.type = 'warning';
    } else if (this.isKillLine(line)) {
      entry.type = 'kill';
    } else if (lowerLine.includes('connect') && lowerLine.includes('client')) {
      entry.type = 'connect';
    } else if (lowerLine.includes('disconnect')) {
      entry.type = 'disconnect';
    } else if (lowerLine.includes(' say ') || lowerLine.includes('chat:') || lowerLine.includes('^7:')) {
      entry.type = 'chat';
    } else if (line.startsWith('ClientCommand:') || line.startsWith('rcon:') || line.startsWith('Cmd_')) {
      entry.type = 'command';
    } else if (lowerLine.includes('info') || lowerLine.includes('loaded') || lowerLine.includes('initialized')) {
      entry.type = 'info';
    }

    return entry;
  }

  /**
   * Check if line represents a kill event
   */
  private isKillLine(line: string): boolean {
    // Common kill patterns
    const killPatterns = [
      /killed\s+.*\s+by/i,
      /was killed by/i,
      /MOD_/,
      /\d+\s+\d+\s+\d+:\s*Kill:/,
    ];

    return killPatterns.some(pattern => pattern.test(line));
  }

  /**
   * Parse kill events from log
   */
  parseKills(filePath: string): KillEvent[] {
    const entries = this.parseLog(filePath);
    const kills: KillEvent[] = [];

    for (const entry of entries) {
      if (entry.type !== 'kill') continue;

      const kill = this.parseKillLine(entry);
      if (kill) {
        kills.push(kill);
      }
    }

    return kills;
  }

  /**
   * Parse a kill line into structured data
   */
  private parseKillLine(entry: LogEntry): KillEvent | null {
    // Pattern: "Player1 killed Player2 by MOD_WEAPON"
    const pattern1 = entry.raw.match(/^(.+?)\s+killed\s+(.+?)\s+by\s+(MOD_\w+)/i);
    if (pattern1) {
      return {
        timestamp: entry.timestamp,
        killer: pattern1[1].trim(),
        victim: pattern1[2].trim(),
        weapon: '',
        meansOfDeath: pattern1[3],
      };
    }

    // Pattern: "Kill: 3 2 7: Player1 killed Player2 by MOD_WEAPON"
    const pattern2 = entry.raw.match(/Kill:\s*\d+\s+\d+\s+\d+:\s*(.+?)\s+killed\s+(.+?)\s+by\s+(MOD_\w+)/i);
    if (pattern2) {
      return {
        timestamp: entry.timestamp,
        killer: pattern2[1].trim(),
        victim: pattern2[2].trim(),
        weapon: '',
        meansOfDeath: pattern2[3],
      };
    }

    return null;
  }

  /**
   * Get log statistics
   */
  getStats(filePath: string): LogStats {
    const entries = this.parseLog(filePath);

    const stats: LogStats = {
      totalLines: entries.length,
      errors: 0,
      warnings: 0,
      kills: 0,
      connects: 0,
      disconnects: 0,
      chatMessages: 0,
      commands: 0,
      timeSpan: { start: null, end: null },
    };

    for (const entry of entries) {
      switch (entry.type) {
        case 'error': stats.errors++; break;
        case 'warning': stats.warnings++; break;
        case 'kill': stats.kills++; break;
        case 'connect': stats.connects++; break;
        case 'disconnect': stats.disconnects++; break;
        case 'chat': stats.chatMessages++; break;
        case 'command': stats.commands++; break;
      }

      if (entry.timestamp) {
        if (!stats.timeSpan.start || entry.timestamp < stats.timeSpan.start) {
          stats.timeSpan.start = entry.timestamp;
        }
        if (!stats.timeSpan.end || entry.timestamp > stats.timeSpan.end) {
          stats.timeSpan.end = entry.timestamp;
        }
      }
    }

    return stats;
  }

  /**
   * Search logs for pattern
   */
  search(filePath: string, pattern: string | RegExp, options?: {
    type?: LogEntry['type'];
    limit?: number;
    caseSensitive?: boolean;
  }): LogEntry[] {
    const entries = this.parseLog(filePath);
    const results: LogEntry[] = [];
    const limit = options?.limit || 100;

    const regex = typeof pattern === 'string'
      ? new RegExp(pattern, options?.caseSensitive ? '' : 'i')
      : pattern;

    for (const entry of entries) {
      if (results.length >= limit) break;

      if (options?.type && entry.type !== options.type) continue;

      if (regex.test(entry.raw)) {
        results.push(entry);
      }
    }

    return results;
  }

  /**
   * Get errors from log
   */
  getErrors(filePath: string, limit = 50): LogEntry[] {
    return this.parseLog(filePath)
      .filter(e => e.type === 'error')
      .slice(-limit);
  }

  /**
   * Get warnings from log
   */
  getWarnings(filePath: string, limit = 50): LogEntry[] {
    return this.parseLog(filePath)
      .filter(e => e.type === 'warning')
      .slice(-limit);
  }

  /**
   * Get chat messages from log
   */
  getChat(filePath: string, limit = 100): LogEntry[] {
    return this.parseLog(filePath)
      .filter(e => e.type === 'chat')
      .slice(-limit);
  }

  /**
   * Analyze player sessions
   */
  analyzePlayerSessions(filePath: string): PlayerSession[] {
    const entries = this.parseLog(filePath);
    const sessions: Map<string, PlayerSession> = new Map();
    const kills = this.parseKills(filePath);

    // Process connects and disconnects
    for (const entry of entries) {
      if (entry.type === 'connect') {
        const nameMatch = entry.raw.match(/Client\s+\d+\s+connected:\s*(.+)/i);
        if (nameMatch) {
          const name = this.stripColorCodes(nameMatch[1].trim());
          sessions.set(name, {
            name,
            connectTime: entry.timestamp,
            disconnectTime: null,
            duration: 0,
            kills: 0,
            deaths: 0,
          });
        }
      }

      if (entry.type === 'disconnect') {
        const nameMatch = entry.raw.match(/(.+?)\s+disconnected/i);
        if (nameMatch) {
          const name = this.stripColorCodes(nameMatch[1].trim());
          const session = sessions.get(name);
          if (session) {
            session.disconnectTime = entry.timestamp;
            if (session.connectTime && session.disconnectTime) {
              session.duration = session.disconnectTime.getTime() - session.connectTime.getTime();
            }
          }
        }
      }
    }

    // Count kills/deaths
    for (const kill of kills) {
      const killerName = this.stripColorCodes(kill.killer);
      const victimName = this.stripColorCodes(kill.victim);

      const killerSession = sessions.get(killerName);
      if (killerSession) {
        killerSession.kills++;
      }

      const victimSession = sessions.get(victimName);
      if (victimSession) {
        victimSession.deaths++;
      }
    }

    return Array.from(sessions.values());
  }

  /**
   * Strip Quake color codes
   */
  private stripColorCodes(text: string): string {
    return text.replace(/\^\d/g, '');
  }

  /**
   * Watch log file for new entries
   */
  watchLog(filePath: string): void {
    if (this.watchedFiles.has(filePath)) {
      return;
    }

    if (!existsSync(filePath)) {
      throw new Error(`Log file not found: ${filePath}`);
    }

    // Store initial position
    const stats = statSync(filePath);
    this.filePositions.set(filePath, stats.size);
    this.watchedFiles.add(filePath);

    watchFile(filePath, { interval: 1000 }, () => {
      this.processNewLines(filePath);
    });
  }

  /**
   * Stop watching a log file
   */
  unwatchLog(filePath: string): void {
    if (this.watchedFiles.has(filePath)) {
      unwatchFile(filePath);
      this.watchedFiles.delete(filePath);
      this.filePositions.delete(filePath);
    }
  }

  /**
   * Stop watching all log files
   */
  unwatchAll(): void {
    for (const filePath of this.watchedFiles) {
      unwatchFile(filePath);
    }
    this.watchedFiles.clear();
    this.filePositions.clear();
  }

  /**
   * Process new lines in a watched file
   */
  private processNewLines(filePath: string): void {
    const lastPosition = this.filePositions.get(filePath) || 0;
    const stats = statSync(filePath);

    if (stats.size <= lastPosition) {
      // File was truncated, reset position
      this.filePositions.set(filePath, 0);
      return;
    }

    // Read new content
    const fd = require('fs').openSync(filePath, 'r');
    const buffer = Buffer.alloc(stats.size - lastPosition);
    require('fs').readSync(fd, buffer, 0, buffer.length, lastPosition);
    require('fs').closeSync(fd);

    this.filePositions.set(filePath, stats.size);

    // Parse and emit new entries
    const newContent = buffer.toString('utf-8');
    const lines = newContent.split('\n');
    
    for (const line of lines) {
      if (!line.trim()) continue;
      
      const entry = this.parseLine(line, 0);
      this.emit('entry', { filePath, entry });

      // Emit specific events
      if (entry.type === 'error') {
        this.emit('error', { filePath, entry });
      } else if (entry.type === 'kill') {
        this.emit('kill', { filePath, entry, kill: this.parseKillLine(entry) });
      } else if (entry.type === 'connect') {
        this.emit('connect', { filePath, entry });
      } else if (entry.type === 'disconnect') {
        this.emit('disconnect', { filePath, entry });
      }
    }
  }

  /**
   * Get tail of log (last N lines)
   */
  tail(filePath: string, lines = 50): string[] {
    if (!existsSync(filePath)) {
      return [];
    }

    const content = readFileSync(filePath, 'utf-8');
    const allLines = content.split('\n').filter(l => l.trim());
    
    return allLines.slice(-lines);
  }

  /**
   * Find common errors
   */
  findCommonErrors(filePath: string): { error: string; count: number }[] {
    const errors = this.getErrors(filePath, 1000);
    const errorCounts: Map<string, number> = new Map();

    for (const error of errors) {
      // Normalize error message (remove variable parts)
      const normalized = error.message
        .replace(/\d+/g, 'N')
        .replace(/0x[a-fA-F0-9]+/g, '0xADDR')
        .replace(/\/[\w/.]+/g, '/PATH')
        .trim();

      errorCounts.set(normalized, (errorCounts.get(normalized) || 0) + 1);
    }

    return Array.from(errorCounts.entries())
      .map(([error, count]) => ({ error, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 20);
  }

  /**
   * Generate log summary
   */
  generateSummary(filePath: string): string {
    const stats = this.getStats(filePath);
    const commonErrors = this.findCommonErrors(filePath);
    const lines: string[] = [];

    lines.push(`Log Summary: ${basename(filePath)}`);
    lines.push('='.repeat(50));
    lines.push(`Total Lines: ${stats.totalLines}`);
    lines.push(`Errors: ${stats.errors}`);
    lines.push(`Warnings: ${stats.warnings}`);
    lines.push(`Kills: ${stats.kills}`);
    lines.push(`Connects: ${stats.connects}`);
    lines.push(`Disconnects: ${stats.disconnects}`);
    lines.push(`Chat Messages: ${stats.chatMessages}`);
    lines.push('');

    if (stats.timeSpan.start && stats.timeSpan.end) {
      const duration = stats.timeSpan.end.getTime() - stats.timeSpan.start.getTime();
      const hours = Math.floor(duration / 3600000);
      const minutes = Math.floor((duration % 3600000) / 60000);
      lines.push(`Time Span: ${hours}h ${minutes}m`);
      lines.push(`Start: ${stats.timeSpan.start.toISOString()}`);
      lines.push(`End: ${stats.timeSpan.end.toISOString()}`);
    }

    if (commonErrors.length > 0) {
      lines.push('');
      lines.push('Common Errors:');
      for (const { error, count } of commonErrors.slice(0, 5)) {
        lines.push(`  [${count}x] ${error}`);
      }
    }

    return lines.join('\n');
  }
}

export default LogAnalyzer;
