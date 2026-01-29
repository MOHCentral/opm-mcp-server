/**
 * OpenMOHAA MCP Server - Build System Module
 * Handles compiling, building, and managing OpenMOHAA source code
 */

import { spawn, exec } from 'child_process';
import { promisify } from 'util';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { EventEmitter } from 'events';

const execAsync = promisify(exec);

export interface BuildConfig {
  sourceDir: string;
  buildDir: string;
  buildType: 'Debug' | 'Release' | 'RelWithDebInfo';
  jobs?: number;
  cmakeOptions?: string[];
  targets?: string[];
}

export interface BuildResult {
  success: boolean;
  duration: number;
  output: string;
  errors: string[];
  warnings: string[];
}

export interface CMakeConfig {
  generator?: string;
  options: Record<string, string | boolean | number>;
}

export class BuildSystem extends EventEmitter {
  private buildProcess: ReturnType<typeof spawn> | null = null;
  private outputBuffer: string[] = [];
  private isBuilding = false;

  constructor() {
    super();
  }

  /**
   * Check if build tools are available
   */
  async checkBuildTools(): Promise<{ available: boolean; missing: string[]; versions: Record<string, string> }> {
    const tools = ['cmake', 'make', 'g++', 'gcc', 'git'];
    const missing: string[] = [];
    const versions: Record<string, string> = {};

    for (const tool of tools) {
      try {
        const { stdout } = await execAsync(`${tool} --version 2>&1 | head -1`);
        versions[tool] = stdout.trim();
      } catch {
        missing.push(tool);
      }
    }

    return { available: missing.length === 0, missing, versions };
  }

  /**
   * Clone or update the OpenMOHAA repository
   */
  async cloneRepository(targetDir: string, branch = 'main'): Promise<{ success: boolean; output: string }> {
    const repoUrl = 'https://github.com/openmoh/openmohaa.git';

    try {
      if (existsSync(join(targetDir, '.git'))) {
        // Update existing repo
        this.emit('log', { message: 'Updating existing repository...' });
        const { stdout, stderr } = await execAsync(`cd "${targetDir}" && git fetch origin && git checkout ${branch} && git pull origin ${branch}`);
        return { success: true, output: stdout + stderr };
      } else {
        // Clone new repo
        this.emit('log', { message: 'Cloning repository...' });
        const { stdout, stderr } = await execAsync(`git clone --branch ${branch} "${repoUrl}" "${targetDir}"`);
        return { success: true, output: stdout + stderr };
      }
    } catch (error) {
      return { success: false, output: String(error) };
    }
  }

  /**
   * Configure the build with CMake
   */
  async configureBuild(config: BuildConfig): Promise<BuildResult> {
    const startTime = Date.now();
    this.outputBuffer = [];

    if (!existsSync(config.sourceDir)) {
      return {
        success: false,
        duration: 0,
        output: '',
        errors: [`Source directory not found: ${config.sourceDir}`],
        warnings: [],
      };
    }

    // Create build directory
    if (!existsSync(config.buildDir)) {
      mkdirSync(config.buildDir, { recursive: true });
    }

    // Build CMake command
    const cmakeArgs = [
      '-S', config.sourceDir,
      '-B', config.buildDir,
      `-DCMAKE_BUILD_TYPE=${config.buildType}`,
      ...(config.cmakeOptions || []),
    ];

    return new Promise((resolve) => {
      this.emit('log', { message: `Running: cmake ${cmakeArgs.join(' ')}` });

      const process = spawn('cmake', cmakeArgs, {
        cwd: config.sourceDir,
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      let output = '';
      const errors: string[] = [];
      const warnings: string[] = [];

      process.stdout?.on('data', (data) => {
        const text = data.toString();
        output += text;
        this.outputBuffer.push(text);
        this.emit('output', text);

        // Parse for warnings
        if (text.includes('Warning') || text.includes('WARNING')) {
          warnings.push(text.trim());
        }
      });

      process.stderr?.on('data', (data) => {
        const text = data.toString();
        output += text;
        this.outputBuffer.push(text);
        this.emit('output', text);

        // Parse for errors
        if (text.includes('Error') || text.includes('ERROR') || text.includes('error:')) {
          errors.push(text.trim());
        }
      });

      process.on('close', (code) => {
        resolve({
          success: code === 0,
          duration: Date.now() - startTime,
          output,
          errors,
          warnings,
        });
      });

      process.on('error', (err) => {
        resolve({
          success: false,
          duration: Date.now() - startTime,
          output,
          errors: [err.message],
          warnings,
        });
      });
    });
  }

  /**
   * Build the project
   */
  async build(config: BuildConfig): Promise<BuildResult> {
    const startTime = Date.now();
    this.outputBuffer = [];
    this.isBuilding = true;

    if (!existsSync(config.buildDir)) {
      return {
        success: false,
        duration: 0,
        output: '',
        errors: [`Build directory not found: ${config.buildDir}. Run configure first.`],
        warnings: [],
      };
    }

    const jobs = config.jobs || (await this.getCpuCount());
    const targets = config.targets?.join(' ') || '';

    return new Promise((resolve) => {
      const buildCmd = `cmake --build "${config.buildDir}" --parallel ${jobs} ${targets ? `--target ${targets}` : ''}`;
      this.emit('log', { message: `Running: ${buildCmd}` });

      this.buildProcess = spawn('cmake', [
        '--build', config.buildDir,
        '--parallel', String(jobs),
        ...(targets ? ['--target', ...config.targets!] : []),
      ], {
        cwd: config.buildDir,
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      let output = '';
      const errors: string[] = [];
      const warnings: string[] = [];

      this.buildProcess.stdout?.on('data', (data) => {
        const text = data.toString();
        output += text;
        this.outputBuffer.push(text);
        this.emit('output', text);

        // Parse progress
        const progressMatch = text.match(/\[(\d+)\/(\d+)\]/);
        if (progressMatch) {
          const [, current, total] = progressMatch;
          this.emit('progress', { current: parseInt(current), total: parseInt(total) });
        }
      });

      this.buildProcess.stderr?.on('data', (data) => {
        const text = data.toString();
        output += text;
        this.outputBuffer.push(text);
        this.emit('output', text);

        // Parse errors and warnings
        if (text.includes('error:')) {
          errors.push(text.trim());
        }
        if (text.includes('warning:')) {
          warnings.push(text.trim());
        }
      });

      this.buildProcess.on('close', (code) => {
        this.isBuilding = false;
        this.buildProcess = null;
        resolve({
          success: code === 0,
          duration: Date.now() - startTime,
          output,
          errors,
          warnings,
        });
      });

      this.buildProcess.on('error', (err) => {
        this.isBuilding = false;
        this.buildProcess = null;
        resolve({
          success: false,
          duration: Date.now() - startTime,
          output,
          errors: [err.message],
          warnings,
        });
      });
    });
  }

  /**
   * Clean the build directory
   */
  async clean(buildDir: string): Promise<{ success: boolean; output: string }> {
    try {
      if (existsSync(buildDir)) {
        const { stdout, stderr } = await execAsync(`cmake --build "${buildDir}" --target clean 2>&1 || rm -rf "${buildDir}"`);
        return { success: true, output: stdout + stderr };
      }
      return { success: true, output: 'Build directory does not exist' };
    } catch (error) {
      return { success: false, output: String(error) };
    }
  }

  /**
   * Cancel the current build
   */
  cancelBuild(): boolean {
    if (this.buildProcess) {
      this.buildProcess.kill('SIGTERM');
      this.isBuilding = false;
      this.buildProcess = null;
      return true;
    }
    return false;
  }

  /**
   * Get build status
   */
  getBuildStatus(): { isBuilding: boolean; output: string[] } {
    return {
      isBuilding: this.isBuilding,
      output: [...this.outputBuffer],
    };
  }

  /**
   * Get CPU count for parallel builds
   */
  private async getCpuCount(): Promise<number> {
    try {
      const { stdout } = await execAsync('nproc');
      return parseInt(stdout.trim()) || 4;
    } catch {
      return 4;
    }
  }

  /**
   * Run tests
   */
  async runTests(buildDir: string, testPattern?: string): Promise<BuildResult> {
    const startTime = Date.now();

    try {
      const ctestArgs = ['--test-dir', buildDir, '--output-on-failure'];
      if (testPattern) {
        ctestArgs.push('-R', testPattern);
      }

      const { stdout, stderr } = await execAsync(`ctest ${ctestArgs.join(' ')}`);
      
      return {
        success: true,
        duration: Date.now() - startTime,
        output: stdout + stderr,
        errors: [],
        warnings: [],
      };
    } catch (error: any) {
      return {
        success: false,
        duration: Date.now() - startTime,
        output: error.stdout + error.stderr,
        errors: ['Tests failed'],
        warnings: [],
      };
    }
  }

  /**
   * Get git information
   */
  async getGitInfo(repoDir: string): Promise<Record<string, string>> {
    const info: Record<string, string> = {};

    try {
      const { stdout: branch } = await execAsync(`cd "${repoDir}" && git rev-parse --abbrev-ref HEAD`);
      info.branch = branch.trim();

      const { stdout: commit } = await execAsync(`cd "${repoDir}" && git rev-parse HEAD`);
      info.commit = commit.trim();

      const { stdout: shortCommit } = await execAsync(`cd "${repoDir}" && git rev-parse --short HEAD`);
      info.shortCommit = shortCommit.trim();

      const { stdout: message } = await execAsync(`cd "${repoDir}" && git log -1 --pretty=%B`);
      info.message = message.trim();

      const { stdout: author } = await execAsync(`cd "${repoDir}" && git log -1 --pretty=%an`);
      info.author = author.trim();

      const { stdout: date } = await execAsync(`cd "${repoDir}" && git log -1 --pretty=%ci`);
      info.date = date.trim();

      const { stdout: status } = await execAsync(`cd "${repoDir}" && git status --porcelain`);
      info.dirty = status.trim().length > 0 ? 'true' : 'false';
    } catch (error) {
      info.error = String(error);
    }

    return info;
  }

  /**
   * Create a release package
   */
  async createPackage(buildDir: string, outputDir: string, name: string): Promise<{ success: boolean; path: string; output: string }> {
    try {
      if (!existsSync(outputDir)) {
        mkdirSync(outputDir, { recursive: true });
      }

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const packageName = `${name}-${timestamp}`;
      const packagePath = join(outputDir, `${packageName}.tar.gz`);

      const { stdout, stderr } = await execAsync(
        `cd "${buildDir}" && tar -czvf "${packagePath}" *.so openmohaa* 2>/dev/null || true`
      );

      return {
        success: existsSync(packagePath),
        path: packagePath,
        output: stdout + stderr,
      };
    } catch (error) {
      return {
        success: false,
        path: '',
        output: String(error),
      };
    }
  }
}

export default BuildSystem;
