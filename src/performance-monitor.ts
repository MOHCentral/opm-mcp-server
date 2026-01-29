/**
 * OpenMOHAA MCP Server - Performance Monitor Module
 * Tracks FPS, frame times, memory usage, and other metrics
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import { ScreenCapture } from './screen-capture.js';
import { ConsoleManager } from './console-manager.js';
import { EventEmitter } from 'events';

const execAsync = promisify(exec);

export interface PerformanceMetrics {
  timestamp: number;
  fps: number | null;
  frameTime: number | null;
  memory: MemoryMetrics | null;
  cpu: CpuMetrics | null;
  gpu: GpuMetrics | null;
}

export interface MemoryMetrics {
  rss: number; // Resident Set Size in MB
  vms: number; // Virtual Memory Size in MB
  percent: number;
}

export interface CpuMetrics {
  percent: number;
  cores: number[];
}

export interface GpuMetrics {
  usage: number;
  memory: number;
  temperature: number;
}

export interface BenchmarkResult {
  name: string;
  duration: number;
  avgFps: number;
  minFps: number;
  maxFps: number;
  p1Fps: number; // 1% low
  p01Fps: number; // 0.1% low
  frameTimesMs: number[];
  samples: PerformanceMetrics[];
}

export class PerformanceMonitor extends EventEmitter {
  private screenCapture: ScreenCapture;
  private consoleManager: ConsoleManager;
  private isMonitoring = false;
  private samples: PerformanceMetrics[] = [];
  private maxSamples = 10000;
  private sampleInterval: ReturnType<typeof setInterval> | null = null;
  private pid: number | null = null;

  constructor(screenCapture: ScreenCapture, consoleManager: ConsoleManager) {
    super();
    this.screenCapture = screenCapture;
    this.consoleManager = consoleManager;
  }

  /**
   * Set the game process PID for monitoring
   */
  setPid(pid: number): void {
    this.pid = pid;
  }

  /**
   * Start continuous performance monitoring
   */
  startMonitoring(intervalMs = 1000): void {
    if (this.isMonitoring) {
      return;
    }

    this.isMonitoring = true;
    this.samples = [];

    this.sampleInterval = setInterval(async () => {
      const metrics = await this.collectMetrics();
      this.samples.push(metrics);

      if (this.samples.length > this.maxSamples) {
        this.samples.shift();
      }

      this.emit('metrics', metrics);
    }, intervalMs);
  }

  /**
   * Stop continuous monitoring
   */
  stopMonitoring(): void {
    if (this.sampleInterval) {
      clearInterval(this.sampleInterval);
      this.sampleInterval = null;
    }
    this.isMonitoring = false;
  }

  /**
   * Collect all performance metrics
   */
  async collectMetrics(): Promise<PerformanceMetrics> {
    const [fps, memory, cpu, gpu] = await Promise.all([
      this.getFps(),
      this.getMemoryUsage(),
      this.getCpuUsage(),
      this.getGpuUsage(),
    ]);

    return {
      timestamp: Date.now(),
      fps: fps?.fps ?? null,
      frameTime: fps?.frameTime ?? null,
      memory,
      cpu,
      gpu,
    };
  }

  /**
   * Get FPS from game console
   */
  async getFps(): Promise<{ fps: number; frameTime: number } | null> {
    try {
      // Enable FPS display if not already
      await this.consoleManager.sendCommand('cg_drawfps 1');
      
      // Try to get cl_fps cvar for frame time calculation
      // This is approximate - real FPS may need screen capture OCR
      const result = await this.consoleManager.sendCommand('cg_drawfps');
      const output = typeof result === 'string' ? result : JSON.stringify(result);
      
      // Parse FPS from cvar or use estimation
      const fpsMatch = output.match(/(\d+)/);
      if (fpsMatch) {
        const fps = parseInt(fpsMatch[1]);
        return {
          fps,
          frameTime: 1000 / fps,
        };
      }

      return null;
    } catch {
      return null;
    }
  }

  /**
   * Get memory usage of the game process
   */
  async getMemoryUsage(): Promise<MemoryMetrics | null> {
    if (!this.pid) {
      return null;
    }

    try {
      const { stdout } = await execAsync(`ps -p ${this.pid} -o rss=,vsz=,%mem=`);
      const parts = stdout.trim().split(/\s+/);

      if (parts.length >= 3) {
        return {
          rss: parseInt(parts[0]) / 1024, // Convert KB to MB
          vms: parseInt(parts[1]) / 1024,
          percent: parseFloat(parts[2]),
        };
      }

      return null;
    } catch {
      return null;
    }
  }

  /**
   * Get CPU usage of the game process
   */
  async getCpuUsage(): Promise<CpuMetrics | null> {
    if (!this.pid) {
      return null;
    }

    try {
      const { stdout } = await execAsync(`ps -p ${this.pid} -o %cpu=`);
      const percent = parseFloat(stdout.trim());

      // Get per-core usage
      const { stdout: mpstatOut } = await execAsync('mpstat -P ALL 1 1 2>/dev/null | tail -n +4 | head -n -1');
      const cores: number[] = [];
      
      const lines = mpstatOut.split('\n');
      for (const line of lines) {
        const match = line.match(/\d+\s+(\d+\.\d+)/);
        if (match) {
          cores.push(100 - parseFloat(match[1])); // idle to usage
        }
      }

      return { percent, cores };
    } catch {
      return null;
    }
  }

  /**
   * Get GPU usage (NVIDIA only for now)
   */
  async getGpuUsage(): Promise<GpuMetrics | null> {
    try {
      const { stdout } = await execAsync(
        'nvidia-smi --query-gpu=utilization.gpu,memory.used,temperature.gpu --format=csv,noheader,nounits 2>/dev/null'
      );
      const parts = stdout.trim().split(',').map(s => s.trim());

      if (parts.length >= 3) {
        return {
          usage: parseInt(parts[0]),
          memory: parseInt(parts[1]),
          temperature: parseInt(parts[2]),
        };
      }

      return null;
    } catch {
      return null;
    }
  }

  /**
   * Run a benchmark
   */
  async runBenchmark(name: string, durationMs: number, sampleIntervalMs = 100): Promise<BenchmarkResult> {
    const samples: PerformanceMetrics[] = [];
    const startTime = Date.now();

    while (Date.now() - startTime < durationMs) {
      const metrics = await this.collectMetrics();
      samples.push(metrics);
      await new Promise(resolve => setTimeout(resolve, sampleIntervalMs));
    }

    return this.analyzeBenchmark(name, samples);
  }

  /**
   * Analyze benchmark samples
   */
  private analyzeBenchmark(name: string, samples: PerformanceMetrics[]): BenchmarkResult {
    const fpsSamples = samples
      .filter(s => s.fps !== null)
      .map(s => s.fps as number);

    const frameTimesMs = samples
      .filter(s => s.frameTime !== null)
      .map(s => s.frameTime as number);

    if (fpsSamples.length === 0) {
      return {
        name,
        duration: 0,
        avgFps: 0,
        minFps: 0,
        maxFps: 0,
        p1Fps: 0,
        p01Fps: 0,
        frameTimesMs: [],
        samples,
      };
    }

    const sortedFps = [...fpsSamples].sort((a, b) => a - b);
    const avgFps = fpsSamples.reduce((a, b) => a + b, 0) / fpsSamples.length;
    const minFps = sortedFps[0];
    const maxFps = sortedFps[sortedFps.length - 1];

    // 1% low (99th percentile of frame times = 1% low fps)
    const p1Index = Math.max(0, Math.floor(sortedFps.length * 0.01) - 1);
    const p1Fps = sortedFps[p1Index];

    // 0.1% low
    const p01Index = Math.max(0, Math.floor(sortedFps.length * 0.001) - 1);
    const p01Fps = sortedFps[p01Index];

    return {
      name,
      duration: samples.length > 0 ? samples[samples.length - 1].timestamp - samples[0].timestamp : 0,
      avgFps: Math.round(avgFps * 100) / 100,
      minFps,
      maxFps,
      p1Fps,
      p01Fps,
      frameTimesMs,
      samples,
    };
  }

  /**
   * Get collected samples
   */
  getSamples(): PerformanceMetrics[] {
    return [...this.samples];
  }

  /**
   * Clear collected samples
   */
  clearSamples(): void {
    this.samples = [];
  }

  /**
   * Get statistics from collected samples
   */
  getStatistics(): {
    avgFps: number;
    minFps: number;
    maxFps: number;
    avgMemory: number;
    avgCpu: number;
    sampleCount: number;
  } | null {
    if (this.samples.length === 0) {
      return null;
    }

    const fpsSamples = this.samples.filter(s => s.fps !== null).map(s => s.fps as number);
    const memorySamples = this.samples.filter(s => s.memory !== null).map(s => s.memory!.rss);
    const cpuSamples = this.samples.filter(s => s.cpu !== null).map(s => s.cpu!.percent);

    return {
      avgFps: fpsSamples.length > 0 ? fpsSamples.reduce((a, b) => a + b, 0) / fpsSamples.length : 0,
      minFps: fpsSamples.length > 0 ? Math.min(...fpsSamples) : 0,
      maxFps: fpsSamples.length > 0 ? Math.max(...fpsSamples) : 0,
      avgMemory: memorySamples.length > 0 ? memorySamples.reduce((a, b) => a + b, 0) / memorySamples.length : 0,
      avgCpu: cpuSamples.length > 0 ? cpuSamples.reduce((a, b) => a + b, 0) / cpuSamples.length : 0,
      sampleCount: this.samples.length,
    };
  }

  /**
   * Check for performance issues
   */
  checkPerformanceIssues(): {
    hasIssues: boolean;
    issues: string[];
    recommendations: string[];
  } {
    const stats = this.getStatistics();
    const issues: string[] = [];
    const recommendations: string[] = [];

    if (!stats || stats.sampleCount < 10) {
      return { hasIssues: false, issues: ['Not enough samples'], recommendations: [] };
    }

    // Check FPS
    if (stats.avgFps < 30) {
      issues.push(`Low average FPS: ${stats.avgFps.toFixed(1)}`);
      recommendations.push('Lower graphics settings');
      recommendations.push('Check r_picmip and r_mode settings');
    }

    if (stats.minFps < 15 && stats.avgFps > 30) {
      issues.push(`FPS drops detected: min ${stats.minFps} vs avg ${stats.avgFps.toFixed(1)}`);
      recommendations.push('Check for background processes');
      recommendations.push('Consider limiting max FPS with com_maxfps');
    }

    // Check memory
    if (stats.avgMemory > 2048) {
      issues.push(`High memory usage: ${stats.avgMemory.toFixed(0)} MB`);
      recommendations.push('Restart the game to clear memory');
      recommendations.push('Reduce texture quality');
    }

    // Check CPU
    if (stats.avgCpu > 90) {
      issues.push(`High CPU usage: ${stats.avgCpu.toFixed(1)}%`);
      recommendations.push('Check for CPU bottleneck');
      recommendations.push('Lower physics settings');
    }

    return {
      hasIssues: issues.length > 0,
      issues,
      recommendations,
    };
  }

  /**
   * Export metrics to CSV
   */
  exportToCsv(): string {
    const headers = ['timestamp', 'fps', 'frameTime', 'memoryRss', 'memoryVms', 'memoryPercent', 'cpuPercent', 'gpuUsage', 'gpuMemory', 'gpuTemp'];
    const rows = [headers.join(',')];

    for (const sample of this.samples) {
      const row = [
        sample.timestamp,
        sample.fps ?? '',
        sample.frameTime ?? '',
        sample.memory?.rss ?? '',
        sample.memory?.vms ?? '',
        sample.memory?.percent ?? '',
        sample.cpu?.percent ?? '',
        sample.gpu?.usage ?? '',
        sample.gpu?.memory ?? '',
        sample.gpu?.temperature ?? '',
      ];
      rows.push(row.join(','));
    }

    return rows.join('\n');
  }

  /**
   * Export benchmark result to JSON
   */
  exportBenchmarkToJson(result: BenchmarkResult): string {
    return JSON.stringify(result, null, 2);
  }

  /**
   * Compare two benchmarks
   */
  compareBenchmarks(a: BenchmarkResult, b: BenchmarkResult): {
    fpsChange: number;
    fpsChangePercent: number;
    minFpsChange: number;
    p1FpsChange: number;
    better: 'a' | 'b' | 'same';
  } {
    const fpsChange = b.avgFps - a.avgFps;
    const fpsChangePercent = a.avgFps > 0 ? (fpsChange / a.avgFps) * 100 : 0;
    const minFpsChange = b.minFps - a.minFps;
    const p1FpsChange = b.p1Fps - a.p1Fps;

    let better: 'a' | 'b' | 'same' = 'same';
    if (fpsChangePercent > 5) better = 'b';
    if (fpsChangePercent < -5) better = 'a';

    return { fpsChange, fpsChangePercent, minFpsChange, p1FpsChange, better };
  }
}

export default PerformanceMonitor;
