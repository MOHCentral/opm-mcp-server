/**
 * Script Validator - Validates Morpheus scripts using mfuse_exec
 */

import { spawn } from 'child_process';
import { existsSync, writeFileSync, unlinkSync, mkdirSync } from 'fs';
import { dirname, basename, join } from 'path';

export interface ScriptDiagnostic {
  severity: 'error' | 'warning';
  line: number;
  column: number;
  message: string;
  file: string;
}

export interface ValidationResult {
  success: boolean;
  diagnostics: ScriptDiagnostic[];
  rawOutput: string;
  duration: number;
}

export class ScriptValidator {
  private mfuseExecPath: string;
  private commandsListPath: string;

  constructor(mfuseExecPath: string = '', commandsListPath: string = '') {
    this.mfuseExecPath = mfuseExecPath;
    this.commandsListPath = commandsListPath;
  }

  setMfuseExecPath(path: string): void {
    this.mfuseExecPath = path;
  }

  getMfuseExecPath(): string {
    return this.mfuseExecPath;
  }

  setCommandsListPath(path: string): void {
    this.commandsListPath = path;
  }

  getCommandsListPath(): string {
    return this.commandsListPath;
  }

  /**
   * Check if mfuse_exec is available
   */
  isAvailable(): boolean {
    return !!this.mfuseExecPath && existsSync(this.mfuseExecPath);
  }

  /**
   * Validate a script file
   */
  async validateFile(scriptPath: string): Promise<ValidationResult> {
    const startTime = Date.now();

    if (!this.isAvailable()) {
      return {
        success: false,
        diagnostics: [{
          severity: 'error',
          line: 0,
          column: 0,
          message: `mfuse_exec not found at: ${this.mfuseExecPath || '(not configured)'}`,
          file: scriptPath,
        }],
        rawOutput: '',
        duration: Date.now() - startTime,
      };
    }

    if (!existsSync(scriptPath)) {
      return {
        success: false,
        diagnostics: [{
          severity: 'error',
          line: 0,
          column: 0,
          message: `Script file not found: ${scriptPath}`,
          file: scriptPath,
        }],
        rawOutput: '',
        duration: Date.now() - startTime,
      };
    }

    const fileDir = dirname(scriptPath);
    const fileName = basename(scriptPath);

    const args = ['-d', fileDir, '-s', fileName];
    if (this.commandsListPath && existsSync(this.commandsListPath)) {
      args.push('-e', this.commandsListPath);
    }

    return this.runValidation(args, fileName, startTime);
  }

  /**
   * Validate script content (creates a temp file)
   */
  async validateContent(content: string, scriptDir: string, scriptName: string = 'temp_script.scr'): Promise<ValidationResult> {
    const startTime = Date.now();

    if (!this.isAvailable()) {
      return {
        success: false,
        diagnostics: [{
          severity: 'error',
          line: 0,
          column: 0,
          message: `mfuse_exec not found at: ${this.mfuseExecPath || '(not configured)'}`,
          file: scriptName,
        }],
        rawOutput: '',
        duration: Date.now() - startTime,
      };
    }

    // Ensure directory exists
    if (!existsSync(scriptDir)) {
      mkdirSync(scriptDir, { recursive: true });
    }

    const tempFileName = `.tmp_${scriptName}`;
    const tempFilePath = join(scriptDir, tempFileName);

    try {
      writeFileSync(tempFilePath, content);
    } catch (err) {
      return {
        success: false,
        diagnostics: [{
          severity: 'error',
          line: 0,
          column: 0,
          message: `Failed to write temp file: ${err}`,
          file: scriptName,
        }],
        rawOutput: '',
        duration: Date.now() - startTime,
      };
    }

    const args = ['-d', scriptDir, '-s', tempFileName];
    if (this.commandsListPath && existsSync(this.commandsListPath)) {
      args.push('-e', this.commandsListPath);
    }

    try {
      const result = await this.runValidation(args, scriptName, startTime);
      // Clean up temp file
      try {
        unlinkSync(tempFilePath);
      } catch {
        // Ignore cleanup errors
      }
      return result;
    } catch (err) {
      // Clean up on error
      try {
        unlinkSync(tempFilePath);
      } catch {
        // Ignore
      }
      throw err;
    }
  }

  private runValidation(args: string[], originalFileName: string, startTime: number): Promise<ValidationResult> {
    return new Promise((resolve) => {
      const diagnostics: ScriptDiagnostic[] = [];
      let output = '';

      const mfuseProcess = spawn(this.mfuseExecPath, args);

      mfuseProcess.stdout.on('data', (data) => {
        output += data.toString();
      });

      mfuseProcess.stderr.on('data', (data) => {
        output += data.toString();
      });

      mfuseProcess.on('close', (exitCode) => {
        // Parse output
        const lines = output.split('\n');
        let currentFile = '';
        let currentLine = 0;
        let currentSeverity: 'error' | 'warning' | null = null;

        for (let i = 0; i < lines.length; i++) {
          const line = lines[i].trim();

          // Match location line: E: (filename, line): or W: (filename, line):
          const locMatch = line.match(/^([EW]): \((.*), (\d+)\):$/);
          if (locMatch) {
            const type = locMatch[1];
            currentFile = locMatch[2];
            currentLine = parseInt(locMatch[3]);
            currentSeverity = type === 'E' ? 'error' : 'warning';
            continue;
          }

          // Match message line containing ^~^~^
          if (line.includes('^~^~^')) {
            const parts = line.split('^~^~^');
            if (parts.length > 1) {
              let message = parts[1].trim();
              // Clean up prefixes
              message = message.replace(/^Script (Warning|file compile error|execution failed)\s*:\s*/, '').trim();
              message = message.replace(/^Couldn't parse '.*'\s*:\s*/, '').trim();

              if (currentSeverity !== null) {
                // Only add if it matches current file (handling .tmp_ prefix)
                const normalizedCurrentFile = currentFile.replace(/^\.tmp_/, '');
                if (normalizedCurrentFile === originalFileName || 
                    currentFile === originalFileName ||
                    currentFile.endsWith(originalFileName)) {
                  diagnostics.push({
                    severity: currentSeverity,
                    line: currentLine,
                    column: 0,
                    message: message,
                    file: originalFileName,
                  });
                }
                currentSeverity = null;
              }
            }
          }

          // Also match simpler error formats
          // E: Script execution failed: ...
          const simpleErrorMatch = line.match(/^E: Script execution failed: (.*)$/);
          if (simpleErrorMatch) {
            diagnostics.push({
              severity: 'error',
              line: 0,
              column: 0,
              message: simpleErrorMatch[1],
              file: originalFileName,
            });
          }
        }

        const success = diagnostics.filter(d => d.severity === 'error').length === 0;

        resolve({
          success,
          diagnostics,
          rawOutput: output,
          duration: Date.now() - startTime,
        });
      });

      mfuseProcess.on('error', (err) => {
        resolve({
          success: false,
          diagnostics: [{
            severity: 'error',
            line: 0,
            column: 0,
            message: `Failed to run mfuse_exec: ${err.message}`,
            file: originalFileName,
          }],
          rawOutput: '',
          duration: Date.now() - startTime,
        });
      });
    });
  }

  /**
   * Validate multiple files
   */
  async validateFiles(scriptPaths: string[]): Promise<Map<string, ValidationResult>> {
    const results = new Map<string, ValidationResult>();
    
    for (const scriptPath of scriptPaths) {
      const result = await this.validateFile(scriptPath);
      results.set(scriptPath, result);
    }

    return results;
  }

  /**
   * Get validator status
   */
  getStatus(): {
    available: boolean;
    mfuseExecPath: string;
    commandsListPath: string;
    mfuseExecExists: boolean;
    commandsListExists: boolean;
  } {
    return {
      available: this.isAvailable(),
      mfuseExecPath: this.mfuseExecPath,
      commandsListPath: this.commandsListPath,
      mfuseExecExists: !!this.mfuseExecPath && existsSync(this.mfuseExecPath),
      commandsListExists: !!this.commandsListPath && existsSync(this.commandsListPath),
    };
  }
}
