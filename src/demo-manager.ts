/**
 * OpenMOHAA MCP Server - Demo Manager Module
 * Handles demo recording, playback, and analysis
 */

import { existsSync, readdirSync, statSync, unlinkSync, renameSync, readFileSync } from 'fs';
import { join, basename, extname } from 'path';
import { ConsoleManager } from './console-manager.js';

export interface DemoInfo {
  name: string;
  path: string;
  size: number;
  modified: Date;
  duration?: number;
  map?: string;
  gametype?: string;
}

export interface DemoState {
  isRecording: boolean;
  isPlaying: boolean;
  currentDemo: string | null;
  recordStartTime: number | null;
}

export class DemoManager {
  private consoleManager: ConsoleManager;
  private demoDir: string;
  private state: DemoState = {
    isRecording: false,
    isPlaying: false,
    currentDemo: null,
    recordStartTime: null,
  };

  constructor(consoleManager: ConsoleManager, gameDir: string) {
    this.consoleManager = consoleManager;
    // Default demo location
    this.demoDir = join(gameDir, 'main', 'demos');
  }

  /**
   * Set the demo directory
   */
  setDemoDir(dir: string): void {
    this.demoDir = dir;
  }

  /**
   * Get the demo directory
   */
  getDemoDir(): string {
    return this.demoDir;
  }

  /**
   * Start recording a demo
   */
  async startRecording(demoName?: string): Promise<{ success: boolean; demoName: string; message: string }> {
    if (this.state.isRecording) {
      return {
        success: false,
        demoName: '',
        message: 'Already recording a demo',
      };
    }

    if (this.state.isPlaying) {
      return {
        success: false,
        demoName: '',
        message: 'Cannot record while playing a demo',
      };
    }

    const name = demoName || `demo_${Date.now()}`;
    
    try {
      await this.consoleManager.sendCommand(`record ${name}`);
      
      this.state.isRecording = true;
      this.state.currentDemo = name;
      this.state.recordStartTime = Date.now();

      return {
        success: true,
        demoName: name,
        message: `Recording started: ${name}`,
      };
    } catch (error) {
      return {
        success: false,
        demoName: '',
        message: `Failed to start recording: ${error}`,
      };
    }
  }

  /**
   * Stop recording the current demo
   */
  async stopRecording(): Promise<{ success: boolean; duration: number; message: string }> {
    if (!this.state.isRecording) {
      return {
        success: false,
        duration: 0,
        message: 'Not currently recording',
      };
    }

    const duration = this.state.recordStartTime 
      ? Math.floor((Date.now() - this.state.recordStartTime) / 1000) 
      : 0;

    try {
      await this.consoleManager.sendCommand('stoprecord');
      
      this.state.isRecording = false;
      this.state.currentDemo = null;
      this.state.recordStartTime = null;

      return {
        success: true,
        duration,
        message: `Recording stopped after ${duration} seconds`,
      };
    } catch (error) {
      return {
        success: false,
        duration: 0,
        message: `Failed to stop recording: ${error}`,
      };
    }
  }

  /**
   * Play a demo file
   */
  async playDemo(demoName: string): Promise<{ success: boolean; message: string }> {
    if (this.state.isRecording) {
      return {
        success: false,
        message: 'Cannot play demo while recording',
      };
    }

    // Remove extension if provided
    const name = demoName.replace(/\.dm_\d+$/, '');

    try {
      await this.consoleManager.sendCommand(`demo ${name}`);
      
      this.state.isPlaying = true;
      this.state.currentDemo = name;

      return {
        success: true,
        message: `Playing demo: ${name}`,
      };
    } catch (error) {
      return {
        success: false,
        message: `Failed to play demo: ${error}`,
      };
    }
  }

  /**
   * Stop demo playback
   */
  async stopPlayback(): Promise<{ success: boolean; message: string }> {
    if (!this.state.isPlaying) {
      return {
        success: false,
        message: 'No demo is playing',
      };
    }

    try {
      await this.consoleManager.sendCommand('disconnect');
      
      this.state.isPlaying = false;
      this.state.currentDemo = null;

      return {
        success: true,
        message: 'Demo playback stopped',
      };
    } catch (error) {
      return {
        success: false,
        message: `Failed to stop playback: ${error}`,
      };
    }
  }

  /**
   * List all demos in the demo directory
   */
  listDemos(): DemoInfo[] {
    const demos: DemoInfo[] = [];

    if (!existsSync(this.demoDir)) {
      return demos;
    }

    const files = readdirSync(this.demoDir);
    for (const file of files) {
      if (file.match(/\.dm_\d+$/)) {
        const filePath = join(this.demoDir, file);
        const stats = statSync(filePath);

        demos.push({
          name: file.replace(/\.dm_\d+$/, ''),
          path: filePath,
          size: stats.size,
          modified: stats.mtime,
        });
      }
    }

    // Sort by modification date, newest first
    demos.sort((a, b) => b.modified.getTime() - a.modified.getTime());

    return demos;
  }

  /**
   * Delete a demo file
   */
  deleteDemo(demoName: string): { success: boolean; message: string } {
    const demos = this.listDemos();
    const demo = demos.find(d => d.name === demoName || d.path === demoName);

    if (!demo) {
      return {
        success: false,
        message: `Demo not found: ${demoName}`,
      };
    }

    try {
      unlinkSync(demo.path);
      return {
        success: true,
        message: `Deleted demo: ${demo.name}`,
      };
    } catch (error) {
      return {
        success: false,
        message: `Failed to delete demo: ${error}`,
      };
    }
  }

  /**
   * Rename a demo file
   */
  renameDemo(oldName: string, newName: string): { success: boolean; message: string } {
    const demos = this.listDemos();
    const demo = demos.find(d => d.name === oldName);

    if (!demo) {
      return {
        success: false,
        message: `Demo not found: ${oldName}`,
      };
    }

    const ext = extname(demo.path);
    const newPath = join(this.demoDir, `${newName}${ext}`);

    try {
      renameSync(demo.path, newPath);
      return {
        success: true,
        message: `Renamed demo: ${oldName} -> ${newName}`,
      };
    } catch (error) {
      return {
        success: false,
        message: `Failed to rename demo: ${error}`,
      };
    }
  }

  /**
   * Get current demo state
   */
  getState(): DemoState {
    return { ...this.state };
  }

  /**
   * Demo time control - pause
   */
  async pauseDemo(): Promise<{ success: boolean; message: string }> {
    if (!this.state.isPlaying) {
      return { success: false, message: 'No demo is playing' };
    }

    try {
      await this.consoleManager.sendCommand('cl_freezedemo 1');
      return { success: true, message: 'Demo paused' };
    } catch (error) {
      return { success: false, message: `Failed to pause: ${error}` };
    }
  }

  /**
   * Demo time control - resume
   */
  async resumeDemo(): Promise<{ success: boolean; message: string }> {
    if (!this.state.isPlaying) {
      return { success: false, message: 'No demo is playing' };
    }

    try {
      await this.consoleManager.sendCommand('cl_freezedemo 0');
      return { success: true, message: 'Demo resumed' };
    } catch (error) {
      return { success: false, message: `Failed to resume: ${error}` };
    }
  }

  /**
   * Demo time control - set speed
   */
  async setPlaybackSpeed(speed: number): Promise<{ success: boolean; message: string }> {
    if (!this.state.isPlaying) {
      return { success: false, message: 'No demo is playing' };
    }

    if (speed < 0.1 || speed > 10) {
      return { success: false, message: 'Speed must be between 0.1 and 10' };
    }

    try {
      await this.consoleManager.sendCommand(`timescale ${speed}`);
      return { success: true, message: `Playback speed set to ${speed}x` };
    } catch (error) {
      return { success: false, message: `Failed to set speed: ${error}` };
    }
  }

  /**
   * Demo time control - jump to time
   */
  async seekDemo(seconds: number): Promise<{ success: boolean; message: string }> {
    if (!this.state.isPlaying) {
      return { success: false, message: 'No demo is playing' };
    }

    try {
      // Convert to milliseconds for the seek command
      await this.consoleManager.sendCommand(`cl_demoseek ${Math.floor(seconds * 1000)}`);
      return { success: true, message: `Seeked to ${seconds} seconds` };
    } catch (error) {
      return { success: false, message: `Failed to seek: ${error}` };
    }
  }

  /**
   * Get demo disk usage
   */
  getDiskUsage(): { totalSize: number; count: number; largest: DemoInfo | null } {
    const demos = this.listDemos();
    let totalSize = 0;
    let largest: DemoInfo | null = null;

    for (const demo of demos) {
      totalSize += demo.size;
      if (!largest || demo.size > largest.size) {
        largest = demo;
      }
    }

    return {
      totalSize,
      count: demos.length,
      largest,
    };
  }

  /**
   * Clean up old demos
   */
  cleanupDemos(options: { 
    olderThanDays?: number; 
    keepCount?: number;
    maxSizeMB?: number;
  }): { deleted: string[]; freedBytes: number } {
    const demos = this.listDemos();
    const deleted: string[] = [];
    let freedBytes = 0;

    const now = Date.now();
    let demosToCheck = [...demos];

    // Filter by age
    if (options.olderThanDays) {
      const maxAge = options.olderThanDays * 24 * 60 * 60 * 1000;
      const cutoff = now - maxAge;
      
      for (const demo of demosToCheck) {
        if (demo.modified.getTime() < cutoff) {
          try {
            unlinkSync(demo.path);
            deleted.push(demo.name);
            freedBytes += demo.size;
          } catch {
            // Ignore deletion errors
          }
        }
      }

      demosToCheck = demosToCheck.filter(d => !deleted.includes(d.name));
    }

    // Keep only N most recent
    if (options.keepCount && demosToCheck.length > options.keepCount) {
      const toDelete = demosToCheck.slice(options.keepCount);
      
      for (const demo of toDelete) {
        try {
          unlinkSync(demo.path);
          deleted.push(demo.name);
          freedBytes += demo.size;
        } catch {
          // Ignore deletion errors
        }
      }
    }

    // Enforce max total size
    if (options.maxSizeMB) {
      const maxSize = options.maxSizeMB * 1024 * 1024;
      let currentSize = demosToCheck.reduce((sum, d) => sum + d.size, 0);
      
      // Delete oldest until under limit
      const sorted = [...demosToCheck].sort((a, b) => a.modified.getTime() - b.modified.getTime());
      
      for (const demo of sorted) {
        if (currentSize <= maxSize) break;
        if (deleted.includes(demo.name)) continue;
        
        try {
          unlinkSync(demo.path);
          deleted.push(demo.name);
          freedBytes += demo.size;
          currentSize -= demo.size;
        } catch {
          // Ignore deletion errors
        }
      }
    }

    return { deleted, freedBytes };
  }
}

export default DemoManager;
