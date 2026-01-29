/**
 * OpenMOHAA MCP Server - UI Controller Module
 * Handles mouse movement, clicks, keyboard input, and window management
 * Uses xdotool for X11 and supports Wayland via ydotool fallback
 */

import { exec, execSync, spawn } from 'child_process';
import { promisify } from 'util';
import { EventEmitter } from 'events';
import type { MousePosition, WindowInfo, ScreenRegion, PixelColor } from './types.js';

const execAsync = promisify(exec);

export class UIController extends EventEmitter {
  private windowId: string | null = null;
  private windowTitle = 'OpenMOHAA';
  private isWayland: boolean;
  private displayServer: 'x11' | 'wayland' | 'unknown';

  constructor() {
    super();
    this.displayServer = this.detectDisplayServer();
    this.isWayland = this.displayServer === 'wayland';
  }

  /**
   * Detect the current display server (X11 or Wayland)
   */
  private detectDisplayServer(): 'x11' | 'wayland' | 'unknown' {
    const xdgSession = process.env.XDG_SESSION_TYPE?.toLowerCase();
    const waylandDisplay = process.env.WAYLAND_DISPLAY;
    const display = process.env.DISPLAY;

    if (xdgSession === 'wayland' || waylandDisplay) {
      return 'wayland';
    }
    if (xdgSession === 'x11' || display) {
      return 'x11';
    }
    return 'unknown';
  }

  /**
   * Check if required tools are available
   */
  async checkDependencies(): Promise<{ available: boolean; missing: string[] }> {
    const tools = ['xdotool', 'xwininfo', 'xprop'];
    if (this.isWayland) {
      tools.push('ydotool');
    }

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
   * Find the OpenMOHAA window
   */
  async findWindow(title?: string): Promise<WindowInfo | null> {
    const searchTitle = title || this.windowTitle;

    try {
      const { stdout } = await execAsync(`xdotool search --name "${searchTitle}" 2>/dev/null | head -1`);
      const windowId = stdout.trim();

      if (!windowId) {
        return null;
      }

      this.windowId = windowId;

      // Get window geometry
      const { stdout: geoStdout } = await execAsync(`xdotool getwindowgeometry ${windowId}`);
      const posMatch = geoStdout.match(/Position:\s*(\d+),(\d+)/);
      const sizeMatch = geoStdout.match(/Geometry:\s*(\d+)x(\d+)/);

      // Check if focused
      const { stdout: focusStdout } = await execAsync('xdotool getactivewindow');
      const focused = focusStdout.trim() === windowId;

      return {
        id: windowId,
        title: searchTitle,
        x: posMatch ? parseInt(posMatch[1]) : 0,
        y: posMatch ? parseInt(posMatch[2]) : 0,
        width: sizeMatch ? parseInt(sizeMatch[1]) : 0,
        height: sizeMatch ? parseInt(sizeMatch[2]) : 0,
        focused,
      };
    } catch {
      return null;
    }
  }

  /**
   * Focus the game window
   */
  async focusWindow(): Promise<boolean> {
    if (!this.windowId) {
      const window = await this.findWindow();
      if (!window) {
        return false;
      }
    }

    try {
      await execAsync(`xdotool windowactivate ${this.windowId}`);
      await this.delay(100);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Minimize the game window
   */
  async minimizeWindow(): Promise<boolean> {
    if (!this.windowId) {
      return false;
    }

    try {
      await execAsync(`xdotool windowminimize ${this.windowId}`);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Restore/unminimize the game window
   */
  async restoreWindow(): Promise<boolean> {
    return this.focusWindow();
  }

  /**
   * Move mouse to absolute coordinates
   */
  async moveMouse(x: number, y: number): Promise<void> {
    if (this.isWayland) {
      await execAsync(`ydotool mousemove --absolute -x ${x} -y ${y}`);
    } else {
      await execAsync(`xdotool mousemove ${x} ${y}`);
    }
  }

  /**
   * Move mouse relative to current position
   */
  async moveMouseRelative(dx: number, dy: number): Promise<void> {
    if (this.isWayland) {
      await execAsync(`ydotool mousemove -x ${dx} -y ${dy}`);
    } else {
      await execAsync(`xdotool mousemove_relative ${dx} ${dy}`);
    }
  }

  /**
   * Move mouse to coordinates within the game window
   */
  async moveMouseToWindow(x: number, y: number): Promise<void> {
    if (!this.windowId) {
      await this.findWindow();
    }

    if (this.windowId) {
      await execAsync(`xdotool mousemove --window ${this.windowId} ${x} ${y}`);
    } else {
      await this.moveMouse(x, y);
    }
  }

  /**
   * Get current mouse position
   */
  async getMousePosition(): Promise<MousePosition> {
    try {
      const { stdout } = await execAsync('xdotool getmouselocation');
      const xMatch = stdout.match(/x:(\d+)/);
      const yMatch = stdout.match(/y:(\d+)/);

      return {
        x: xMatch ? parseInt(xMatch[1]) : 0,
        y: yMatch ? parseInt(yMatch[1]) : 0,
      };
    } catch {
      return { x: 0, y: 0 };
    }
  }

  /**
   * Click mouse button
   */
  async clickMouse(button: 'left' | 'right' | 'middle' = 'left'): Promise<void> {
    const buttonMap = { left: 1, middle: 2, right: 3 };
    const buttonNum = buttonMap[button];

    if (this.isWayland) {
      const buttonCodes = { left: 0x110, middle: 0x112, right: 0x111 };
      await execAsync(`ydotool click ${buttonCodes[button]}`);
    } else {
      await execAsync(`xdotool click ${buttonNum}`);
    }
  }

  /**
   * Double click
   */
  async doubleClick(button: 'left' | 'right' | 'middle' = 'left'): Promise<void> {
    const buttonMap = { left: 1, middle: 2, right: 3 };
    const buttonNum = buttonMap[button];

    await execAsync(`xdotool click --repeat 2 --delay 50 ${buttonNum}`);
  }

  /**
   * Click at specific coordinates
   */
  async clickAt(x: number, y: number, button: 'left' | 'right' | 'middle' = 'left'): Promise<void> {
    await this.moveMouse(x, y);
    await this.delay(50);
    await this.clickMouse(button);
  }

  /**
   * Click at coordinates within the game window
   */
  async clickAtWindow(x: number, y: number, button: 'left' | 'right' | 'middle' = 'left'): Promise<void> {
    await this.moveMouseToWindow(x, y);
    await this.delay(50);
    await this.clickMouse(button);
  }

  /**
   * Press and hold mouse button
   */
  async mouseDown(button: 'left' | 'right' | 'middle' = 'left'): Promise<void> {
    const buttonMap = { left: 1, middle: 2, right: 3 };
    await execAsync(`xdotool mousedown ${buttonMap[button]}`);
  }

  /**
   * Release mouse button
   */
  async mouseUp(button: 'left' | 'right' | 'middle' = 'left'): Promise<void> {
    const buttonMap = { left: 1, middle: 2, right: 3 };
    await execAsync(`xdotool mouseup ${buttonMap[button]}`);
  }

  /**
   * Drag mouse from one position to another
   */
  async drag(
    startX: number,
    startY: number,
    endX: number,
    endY: number,
    button: 'left' | 'right' | 'middle' = 'left'
  ): Promise<void> {
    await this.moveMouse(startX, startY);
    await this.delay(50);
    await this.mouseDown(button);
    await this.delay(50);
    await this.moveMouse(endX, endY);
    await this.delay(50);
    await this.mouseUp(button);
  }

  /**
   * Scroll mouse wheel
   */
  async scroll(direction: 'up' | 'down', clicks = 3): Promise<void> {
    const button = direction === 'up' ? 4 : 5;
    await execAsync(`xdotool click --repeat ${clicks} ${button}`);
  }

  /**
   * Type text using keyboard
   */
  async typeText(text: string, delay = 12): Promise<void> {
    if (this.isWayland) {
      await execAsync(`ydotool type --delay ${delay} "${text.replace(/"/g, '\\"')}"`);
    } else {
      // Escape special characters for xdotool
      const escapedText = text.replace(/'/g, "'\\''");
      await execAsync(`xdotool type --delay ${delay} '${escapedText}'`);
    }
  }

  /**
   * Press a single key
   */
  async pressKey(key: string): Promise<void> {
    const xdotoolKey = this.mapKey(key);

    if (this.isWayland) {
      const keycode = this.getKeycode(key);
      await execAsync(`ydotool key ${keycode}`);
    } else {
      await execAsync(`xdotool key ${xdotoolKey}`);
    }
  }

  /**
   * Press key with modifiers
   */
  async pressKeyWithModifiers(
    key: string,
    modifiers: ('ctrl' | 'alt' | 'shift' | 'super')[]
  ): Promise<void> {
    const modifierMap: Record<string, string> = {
      ctrl: 'ctrl',
      alt: 'alt',
      shift: 'shift',
      super: 'super',
    };

    const keyCombo = [...modifiers.map((m) => modifierMap[m]), this.mapKey(key)].join('+');
    await execAsync(`xdotool key ${keyCombo}`);
  }

  /**
   * Hold key down
   */
  async keyDown(key: string): Promise<void> {
    await execAsync(`xdotool keydown ${this.mapKey(key)}`);
  }

  /**
   * Release key
   */
  async keyUp(key: string): Promise<void> {
    await execAsync(`xdotool keyup ${this.mapKey(key)}`);
  }

  /**
   * Press and release key sequence
   */
  async pressKeys(keys: string[], delay = 50): Promise<void> {
    for (const key of keys) {
      await this.pressKey(key);
      await this.delay(delay);
    }
  }

  /**
   * Send key combination (e.g., "ctrl+c")
   */
  async sendKeyCombo(combo: string): Promise<void> {
    await execAsync(`xdotool key ${combo}`);
  }

  /**
   * Toggle game console (typically backtick key)
   */
  async toggleConsole(): Promise<void> {
    await this.focusWindow();
    await this.delay(100);
    await this.pressKey('grave'); // backtick
  }

  /**
   * Send text to console (opens console, types, presses enter)
   */
  async sendToConsole(command: string): Promise<void> {
    await this.focusWindow();
    await this.delay(100);

    // Toggle console open
    await this.pressKey('grave');
    await this.delay(200);

    // Type command
    await this.typeText(command);
    await this.delay(50);

    // Press enter
    await this.pressKey('Return');
    await this.delay(100);

    // Close console
    await this.pressKey('grave');
  }

  /**
   * Map common key names to xdotool key names
   */
  private mapKey(key: string): string {
    const keyMap: Record<string, string> = {
      enter: 'Return',
      return: 'Return',
      esc: 'Escape',
      escape: 'Escape',
      tab: 'Tab',
      space: 'space',
      backspace: 'BackSpace',
      delete: 'Delete',
      insert: 'Insert',
      home: 'Home',
      end: 'End',
      pageup: 'Page_Up',
      pagedown: 'Page_Down',
      up: 'Up',
      down: 'Down',
      left: 'Left',
      right: 'Right',
      f1: 'F1',
      f2: 'F2',
      f3: 'F3',
      f4: 'F4',
      f5: 'F5',
      f6: 'F6',
      f7: 'F7',
      f8: 'F8',
      f9: 'F9',
      f10: 'F10',
      f11: 'F11',
      f12: 'F12',
      '`': 'grave',
      backtick: 'grave',
      grave: 'grave',
      '~': 'asciitilde',
      '-': 'minus',
      '=': 'equal',
      '[': 'bracketleft',
      ']': 'bracketright',
      '\\': 'backslash',
      ';': 'semicolon',
      "'": 'apostrophe',
      ',': 'comma',
      '.': 'period',
      '/': 'slash',
      capslock: 'Caps_Lock',
      numlock: 'Num_Lock',
      scrolllock: 'Scroll_Lock',
      pause: 'Pause',
      printscreen: 'Print',
    };

    return keyMap[key.toLowerCase()] || key;
  }

  /**
   * Get keycode for ydotool (Wayland)
   */
  private getKeycode(key: string): string {
    // Basic keycode mapping for ydotool
    const keycodeMap: Record<string, string> = {
      enter: '28:1 28:0',
      escape: '1:1 1:0',
      space: '57:1 57:0',
      tab: '15:1 15:0',
      backspace: '14:1 14:0',
      grave: '41:1 41:0',
    };

    return keycodeMap[key.toLowerCase()] || `${key}:1 ${key}:0`;
  }

  /**
   * Helper delay function
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Set the window title to search for
   */
  setWindowTitle(title: string): void {
    this.windowTitle = title;
    this.windowId = null;
  }

  /**
   * Get display server type
   */
  getDisplayServer(): 'x11' | 'wayland' | 'unknown' {
    return this.displayServer;
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

  /**
   * Get window region for coordinate calculations
   */
  async getWindowRegion(): Promise<ScreenRegion | null> {
    const window = await this.findWindow();
    if (!window) {
      return null;
    }

    return {
      x: window.x,
      y: window.y,
      width: window.width,
      height: window.height,
    };
  }

  /**
   * Convert relative window coordinates to screen coordinates
   */
  async windowToScreen(windowX: number, windowY: number): Promise<MousePosition | null> {
    const region = await this.getWindowRegion();
    if (!region) {
      return null;
    }

    return {
      x: region.x + windowX,
      y: region.y + windowY,
    };
  }

  /**
   * Convert screen coordinates to relative window coordinates
   */
  async screenToWindow(screenX: number, screenY: number): Promise<MousePosition | null> {
    const region = await this.getWindowRegion();
    if (!region) {
      return null;
    }

    return {
      x: screenX - region.x,
      y: screenY - region.y,
    };
  }
}

export default UIController;
