/**
 * OpenMOHAA MCP Server - Screen Capture Module
 * Handles screenshots, pixel sampling, and image matching
 */

import { exec, execSync } from 'child_process';
import { promisify } from 'util';
import { writeFileSync, readFileSync, existsSync, unlinkSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { tmpdir } from 'os';
import { EventEmitter } from 'events';
import type { ScreenRegion, PixelColor, WindowInfo } from './types.js';

const execAsync = promisify(exec);

export interface ImageMatchResult {
  found: boolean;
  x: number;
  y: number;
  confidence: number;
}

export interface CaptureResult {
  success: boolean;
  path?: string;
  data?: Buffer;
  base64?: string;
  width?: number;
  height?: number;
  error?: string;
}

export class ScreenCapture extends EventEmitter {
  private tempDir: string;
  private windowId: string | null = null;
  private windowTitle = 'OpenMOHAA';

  constructor() {
    super();
    this.tempDir = join(tmpdir(), 'openmohaa-mcp');
    this.ensureTempDir();
  }

  /**
   * Ensure temp directory exists
   */
  private ensureTempDir(): void {
    if (!existsSync(this.tempDir)) {
      mkdirSync(this.tempDir, { recursive: true });
    }
  }

  /**
   * Check if required tools are available
   */
  async checkDependencies(): Promise<{ available: boolean; missing: string[] }> {
    const tools = ['import', 'convert', 'identify']; // ImageMagick tools
    const missing: string[] = [];

    for (const tool of tools) {
      try {
        execSync(`which ${tool}`, { stdio: 'pipe' });
      } catch {
        missing.push(tool);
      }
    }

    return { available: missing.length === 0, missing };
  }

  /**
   * Find the game window
   */
  private async findWindow(): Promise<string | null> {
    try {
      const { stdout } = await execAsync(
        `xdotool search --name "${this.windowTitle}" 2>/dev/null | head -1`
      );
      const windowId = stdout.trim();
      if (windowId) {
        this.windowId = windowId;
        return windowId;
      }
    } catch {
      // Window not found
    }
    return null;
  }

  /**
   * Capture the entire screen
   */
  async captureScreen(format: 'png' | 'jpeg' = 'png', quality = 90): Promise<CaptureResult> {
    const filename = `screenshot_${Date.now()}.${format}`;
    const filepath = join(this.tempDir, filename);

    try {
      // Use import from ImageMagick
      if (format === 'jpeg') {
        await execAsync(`import -window root -quality ${quality} ${filepath}`);
      } else {
        await execAsync(`import -window root ${filepath}`);
      }

      const data = readFileSync(filepath);
      const dimensions = await this.getImageDimensions(filepath);

      return {
        success: true,
        path: filepath,
        data,
        base64: data.toString('base64'),
        width: dimensions.width,
        height: dimensions.height,
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to capture screen: ${error}`,
      };
    }
  }

  /**
   * Capture the game window
   */
  async captureWindow(format: 'png' | 'jpeg' = 'png', quality = 90): Promise<CaptureResult> {
    let windowId = this.windowId;
    if (!windowId) {
      windowId = await this.findWindow();
    }

    if (!windowId) {
      return {
        success: false,
        error: 'Game window not found',
      };
    }

    const filename = `window_${Date.now()}.${format}`;
    const filepath = join(this.tempDir, filename);

    try {
      // Capture specific window
      if (format === 'jpeg') {
        await execAsync(`import -window ${windowId} -quality ${quality} ${filepath}`);
      } else {
        await execAsync(`import -window ${windowId} ${filepath}`);
      }

      const data = readFileSync(filepath);
      const dimensions = await this.getImageDimensions(filepath);

      return {
        success: true,
        path: filepath,
        data,
        base64: data.toString('base64'),
        width: dimensions.width,
        height: dimensions.height,
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to capture window: ${error}`,
      };
    }
  }

  /**
   * Capture a specific region of the screen
   */
  async captureRegion(
    region: ScreenRegion,
    format: 'png' | 'jpeg' = 'png',
    quality = 90
  ): Promise<CaptureResult> {
    const filename = `region_${Date.now()}.${format}`;
    const filepath = join(this.tempDir, filename);
    const geometry = `${region.width}x${region.height}+${region.x}+${region.y}`;

    try {
      if (format === 'jpeg') {
        await execAsync(`import -window root -crop ${geometry} -quality ${quality} ${filepath}`);
      } else {
        await execAsync(`import -window root -crop ${geometry} ${filepath}`);
      }

      const data = readFileSync(filepath);

      return {
        success: true,
        path: filepath,
        data,
        base64: data.toString('base64'),
        width: region.width,
        height: region.height,
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to capture region: ${error}`,
      };
    }
  }

  /**
   * Get pixel color at coordinates
   */
  async getPixelColor(x: number, y: number): Promise<PixelColor | null> {
    try {
      // Capture 1x1 region and get color
      const tempFile = join(this.tempDir, `pixel_${Date.now()}.png`);
      await execAsync(`import -window root -crop 1x1+${x}+${y} ${tempFile}`);

      // Get pixel color using ImageMagick
      const { stdout } = await execAsync(
        `convert ${tempFile} -format "%[pixel:p{0,0}]" info:`
      );

      // Parse color string (formats: "srgb(r,g,b)" or "rgb(r,g,b)")
      const colorMatch = stdout.match(/(?:s?rgb|sRGB)\((\d+),(\d+),(\d+)\)/i);
      if (colorMatch) {
        const color = {
          r: parseInt(colorMatch[1]),
          g: parseInt(colorMatch[2]),
          b: parseInt(colorMatch[3]),
        };

        // Cleanup temp file
        try {
          unlinkSync(tempFile);
        } catch {
          // Ignore cleanup errors
        }

        return color;
      }

      // Try hex format
      const hexMatch = stdout.match(/#([0-9A-Fa-f]{2})([0-9A-Fa-f]{2})([0-9A-Fa-f]{2})/);
      if (hexMatch) {
        const color = {
          r: parseInt(hexMatch[1], 16),
          g: parseInt(hexMatch[2], 16),
          b: parseInt(hexMatch[3], 16),
        };

        try {
          unlinkSync(tempFile);
        } catch {
          // Ignore cleanup errors
        }

        return color;
      }

      return null;
    } catch (error) {
      return null;
    }
  }

  /**
   * Get multiple pixel colors
   */
  async getPixels(positions: Array<{ x: number; y: number }>): Promise<Map<string, PixelColor | null>> {
    const results = new Map<string, PixelColor | null>();

    for (const pos of positions) {
      const key = `${pos.x},${pos.y}`;
      const color = await this.getPixelColor(pos.x, pos.y);
      results.set(key, color);
    }

    return results;
  }

  /**
   * Check if pixel matches expected color (with tolerance)
   */
  async checkPixelColor(
    x: number,
    y: number,
    expected: PixelColor,
    tolerance = 10
  ): Promise<boolean> {
    const actual = await this.getPixelColor(x, y);
    if (!actual) {
      return false;
    }

    const dr = Math.abs(actual.r - expected.r);
    const dg = Math.abs(actual.g - expected.g);
    const db = Math.abs(actual.b - expected.b);

    return dr <= tolerance && dg <= tolerance && db <= tolerance;
  }

  /**
   * Wait for pixel color at position
   */
  async waitForPixelColor(
    x: number,
    y: number,
    expected: PixelColor,
    timeout = 30000,
    tolerance = 10
  ): Promise<boolean> {
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      const matches = await this.checkPixelColor(x, y, expected, tolerance);
      if (matches) {
        return true;
      }
      await new Promise((resolve) => setTimeout(resolve, 200));
    }

    return false;
  }

  /**
   * Find image on screen using template matching
   * Requires OpenCV or ImageMagick compare
   */
  async findImage(
    templatePath: string,
    region?: ScreenRegion,
    threshold = 0.9
  ): Promise<ImageMatchResult> {
    if (!existsSync(templatePath)) {
      return { found: false, x: 0, y: 0, confidence: 0 };
    }

    try {
      // Capture current screen or region
      let capture: CaptureResult;
      if (region) {
        capture = await this.captureRegion(region);
      } else {
        capture = await this.captureWindow();
        if (!capture.success) {
          capture = await this.captureScreen();
        }
      }

      if (!capture.success || !capture.path) {
        return { found: false, x: 0, y: 0, confidence: 0 };
      }

      // Use ImageMagick compare for template matching
      // This is a simplified version; for production, consider using OpenCV
      const resultPath = join(this.tempDir, `match_${Date.now()}.png`);

      try {
        // Use subimage-search to find template
        const { stdout } = await execAsync(
          `compare -subimage-search -metric RMSE "${capture.path}" "${templatePath}" "${resultPath}" 2>&1 || true`
        );

        // Parse the result - format: "distance @ x,y"
        const match = stdout.match(/(\d+(?:\.\d+)?)\s*@\s*(\d+),(\d+)/);
        if (match) {
          const distance = parseFloat(match[1]);
          const x = parseInt(match[2]);
          const y = parseInt(match[3]);

          // Convert RMSE distance to confidence (lower is better)
          const maxRMSE = 65535; // Max for 16-bit
          const confidence = 1 - distance / maxRMSE;

          // Cleanup
          try {
            unlinkSync(resultPath);
            unlinkSync(capture.path);
          } catch {
            // Ignore cleanup errors
          }

          return {
            found: confidence >= threshold,
            x: region ? region.x + x : x,
            y: region ? region.y + y : y,
            confidence,
          };
        }
      } catch {
        // compare command might fail
      }

      return { found: false, x: 0, y: 0, confidence: 0 };
    } catch (error) {
      return { found: false, x: 0, y: 0, confidence: 0 };
    }
  }

  /**
   * Wait for image to appear on screen
   */
  async waitForImage(
    templatePath: string,
    timeout = 30000,
    threshold = 0.9
  ): Promise<ImageMatchResult> {
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      const result = await this.findImage(templatePath, undefined, threshold);
      if (result.found) {
        return result;
      }
      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    return { found: false, x: 0, y: 0, confidence: 0 };
  }

  /**
   * Get image dimensions
   */
  private async getImageDimensions(
    imagePath: string
  ): Promise<{ width: number; height: number }> {
    try {
      const { stdout } = await execAsync(`identify -format "%wx%h" "${imagePath}"`);
      const [width, height] = stdout.trim().split('x').map(Number);
      return { width, height };
    } catch {
      return { width: 0, height: 0 };
    }
  }

  /**
   * Save screenshot to file
   */
  async saveScreenshot(outputPath: string, region?: ScreenRegion): Promise<boolean> {
    try {
      let capture: CaptureResult;
      if (region) {
        capture = await this.captureRegion(region);
      } else {
        capture = await this.captureWindow();
        if (!capture.success) {
          capture = await this.captureScreen();
        }
      }

      if (capture.success && capture.data) {
        const dir = dirname(outputPath);
        if (!existsSync(dir)) {
          mkdirSync(dir, { recursive: true });
        }
        writeFileSync(outputPath, capture.data);
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }

  /**
   * Take screenshot and return as base64
   */
  async screenshotBase64(format: 'png' | 'jpeg' = 'png'): Promise<string | null> {
    const capture = await this.captureWindow();
    if (!capture.success) {
      const screenCapture = await this.captureScreen();
      if (screenCapture.success) {
        return screenCapture.base64 || null;
      }
      return null;
    }
    return capture.base64 || null;
  }

  /**
   * Set window title to capture
   */
  setWindowTitle(title: string): void {
    this.windowTitle = title;
    this.windowId = null;
  }

  /**
   * Clean up temp files
   */
  cleanup(): void {
    try {
      const files = execSync(`ls ${this.tempDir}/*.png ${this.tempDir}/*.jpg 2>/dev/null || true`)
        .toString()
        .trim()
        .split('\n')
        .filter((f) => f);

      for (const file of files) {
        try {
          unlinkSync(file);
        } catch {
          // Ignore errors
        }
      }
    } catch {
      // Ignore errors
    }
  }

  /**
   * Get screen resolution
   */
  async getScreenResolution(): Promise<{ width: number; height: number }> {
    try {
      const { stdout } = await execAsync("xdpyinfo | grep dimensions | awk '{print $2}'");
      const [width, height] = stdout.trim().split('x').map(Number);
      return { width, height };
    } catch {
      return { width: 1920, height: 1080 };
    }
  }
}

export default ScreenCapture;
