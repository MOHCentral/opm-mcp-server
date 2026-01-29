/**
 * OpenMOHAA MCP Server - Automation Framework
 * Provides test sequencing, condition waiting, and automated workflows
 */

import { EventEmitter } from 'events';
import type { ProcessLauncher } from './launcher.js';
import type { ConsoleManager } from './console-manager.js';
import type { UIController } from './ui-controller.js';
import type { ScreenCapture } from './screen-capture.js';
import type {
  AutomationStep,
  AutomationScript,
  WaitCondition,
  TestResult,
  StepResult,
  PixelColor,
} from './types.js';

export interface AutomationContext {
  launcher: ProcessLauncher;
  console: ConsoleManager;
  ui: UIController;
  screen: ScreenCapture;
}

export class AutomationFramework extends EventEmitter {
  private context: AutomationContext;
  private running = false;
  private aborted = false;
  private currentScript: AutomationScript | null = null;
  private stepResults: StepResult[] = [];
  private variables: Map<string, unknown> = new Map();

  constructor(context: AutomationContext) {
    super();
    this.context = context;
  }

  /**
   * Run an automation script
   */
  async runScript(script: AutomationScript): Promise<TestResult> {
    this.running = true;
    this.aborted = false;
    this.currentScript = script;
    this.stepResults = [];
    const startTime = Date.now();

    this.emit('scriptStart', { name: script.name });

    try {
      // Run setup steps
      if (script.setup && script.setup.length > 0) {
        this.emit('phase', 'setup');
        for (const step of script.setup) {
          if (this.aborted) break;
          await this.executeStep(step);
        }
      }

      // Run main steps
      if (!this.aborted) {
        this.emit('phase', 'main');
        for (const step of script.steps) {
          if (this.aborted) break;
          await this.executeStep(step);
        }
      }
    } catch (error) {
      this.stepResults.push({
        action: 'error',
        success: false,
        duration: 0,
        error: String(error),
      });
    } finally {
      // Run teardown steps regardless of success
      if (script.teardown && script.teardown.length > 0) {
        this.emit('phase', 'teardown');
        for (const step of script.teardown) {
          try {
            await this.executeStep(step);
          } catch {
            // Continue teardown even on errors
          }
        }
      }
    }

    this.running = false;
    const duration = Date.now() - startTime;
    const passed = this.stepResults.every((r) => r.success);

    const result: TestResult = {
      name: script.name,
      passed,
      duration,
      steps: this.stepResults,
    };

    this.emit('scriptComplete', result);
    return result;
  }

  /**
   * Execute a single automation step
   */
  private async executeStep(step: AutomationStep): Promise<StepResult> {
    const startTime = Date.now();
    this.emit('stepStart', { action: step.action, params: step.params });

    try {
      // Execute the action
      await this.executeAction(step.action, step.params);

      // Wait after step if specified
      if (step.waitAfter) {
        await this.delay(step.waitAfter);
      }

      // Check condition if specified
      if (step.condition) {
        const conditionMet = await this.waitForCondition(step.condition);
        if (!conditionMet) {
          throw new Error(`Condition not met: ${JSON.stringify(step.condition)}`);
        }
      }

      const stepResult: StepResult = {
        action: step.action,
        success: true,
        duration: Date.now() - startTime,
      };

      this.stepResults.push(stepResult);
      this.emit('stepComplete', stepResult);
      return stepResult;
    } catch (error) {
      const stepResult: StepResult = {
        action: step.action,
        success: false,
        duration: Date.now() - startTime,
        error: String(error),
      };

      this.stepResults.push(stepResult);
      this.emit('stepComplete', stepResult);
      throw error;
    }
  }

  /**
   * Execute an action by name
   */
  private async executeAction(action: string, params: Record<string, unknown>): Promise<void> {
    switch (action) {
      // Process control
      case 'launch':
        await this.context.launcher.launch({
          executablePath: params.executablePath as string,
          workingDirectory: params.workingDirectory as string | undefined,
          arguments: params.args as string[] | undefined,
          windowedMode: params.windowed as boolean | undefined,
          resolution:
            params.width && params.height
              ? { width: params.width as number, height: params.height as number }
              : undefined,
        });
        break;

      case 'stop':
        await this.context.launcher.stop();
        break;

      case 'restart':
        await this.context.launcher.restart();
        break;

      case 'kill':
        await this.context.launcher.forceKill();
        break;

      // Console commands
      case 'command':
        await this.context.console.sendCommand(params.command as string);
        break;

      case 'set_cvar':
        await this.context.console.setCvar(params.name as string, params.value as string);
        break;

      case 'get_cvar': {
        const cvar = await this.context.console.getCvar(params.name as string);
        if (params.storeAs) {
          this.variables.set(params.storeAs as string, cvar?.value);
        }
        break;
      }

      case 'load_map':
        await this.context.console.loadMap(params.map as string);
        break;

      case 'exec_config':
        await this.context.console.execConfig(params.path as string);
        break;

      // UI actions
      case 'mouse_move':
        if (params.relative) {
          await this.context.ui.moveMouseRelative(params.x as number, params.y as number);
        } else if (params.window) {
          await this.context.ui.moveMouseToWindow(params.x as number, params.y as number);
        } else {
          await this.context.ui.moveMouse(params.x as number, params.y as number);
        }
        break;

      case 'mouse_click':
        if (params.x !== undefined && params.y !== undefined) {
          await this.context.ui.clickAt(
            params.x as number,
            params.y as number,
            (params.button as 'left' | 'right' | 'middle') || 'left'
          );
        } else {
          await this.context.ui.clickMouse(
            (params.button as 'left' | 'right' | 'middle') || 'left'
          );
        }
        break;

      case 'double_click':
        await this.context.ui.doubleClick(
          (params.button as 'left' | 'right' | 'middle') || 'left'
        );
        break;

      case 'drag':
        await this.context.ui.drag(
          params.startX as number,
          params.startY as number,
          params.endX as number,
          params.endY as number,
          (params.button as 'left' | 'right' | 'middle') || 'left'
        );
        break;

      case 'scroll':
        await this.context.ui.scroll(
          params.direction as 'up' | 'down',
          (params.clicks as number) || 3
        );
        break;

      case 'type':
        await this.context.ui.typeText(params.text as string, params.delay as number);
        break;

      case 'press_key':
        if (params.modifiers) {
          await this.context.ui.pressKeyWithModifiers(
            params.key as string,
            params.modifiers as ('ctrl' | 'alt' | 'shift' | 'super')[]
          );
        } else {
          await this.context.ui.pressKey(params.key as string);
        }
        break;

      case 'key_combo':
        await this.context.ui.sendKeyCombo(params.combo as string);
        break;

      case 'toggle_console':
        await this.context.ui.toggleConsole();
        break;

      case 'focus_window':
        await this.context.ui.focusWindow();
        break;

      // Screen actions
      case 'screenshot': {
        const result = await this.context.screen.saveScreenshot(params.path as string);
        if (!result) {
          throw new Error('Failed to save screenshot');
        }
        break;
      }

      case 'check_pixel': {
        const matches = await this.context.screen.checkPixelColor(
          params.x as number,
          params.y as number,
          params.expected as PixelColor,
          (params.tolerance as number) || 10
        );
        if (!matches) {
          throw new Error(`Pixel color mismatch at ${params.x},${params.y}`);
        }
        break;
      }

      case 'find_image': {
        const match = await this.context.screen.findImage(
          params.template as string,
          params.region as { x: number; y: number; width: number; height: number } | undefined,
          (params.threshold as number) || 0.9
        );
        if (!match.found) {
          throw new Error(`Image not found: ${params.template}`);
        }
        if (params.storeX) {
          this.variables.set(params.storeX as string, match.x);
        }
        if (params.storeY) {
          this.variables.set(params.storeY as string, match.y);
        }
        break;
      }

      // Wait actions
      case 'wait':
        await this.delay((params.ms as number) || 1000);
        break;

      case 'wait_for_console':
        await this.context.launcher.waitForConsolePattern(
          params.pattern as string,
          (params.timeout as number) || 30000
        );
        break;

      case 'wait_for_pixel':
        await this.context.screen.waitForPixelColor(
          params.x as number,
          params.y as number,
          params.expected as PixelColor,
          (params.timeout as number) || 30000,
          (params.tolerance as number) || 10
        );
        break;

      case 'wait_for_image': {
        const imageResult = await this.context.screen.waitForImage(
          params.template as string,
          (params.timeout as number) || 30000,
          (params.threshold as number) || 0.9
        );
        if (!imageResult.found) {
          throw new Error(`Image not found: ${params.template}`);
        }
        break;
      }

      // Assertions
      case 'assert': {
        const value = this.variables.get(params.variable as string);
        if (value !== params.expected) {
          throw new Error(`Assertion failed: ${params.variable} = ${value}, expected ${params.expected}`);
        }
        break;
      }

      case 'assert_running':
        if (!this.context.launcher.isRunning()) {
          throw new Error('Game is not running');
        }
        break;

      case 'assert_not_running':
        if (this.context.launcher.isRunning()) {
          throw new Error('Game is still running');
        }
        break;

      // Variable operations
      case 'set_variable':
        this.variables.set(params.name as string, params.value);
        break;

      case 'log':
        this.emit('log', { message: params.message, data: params.data });
        break;

      default:
        throw new Error(`Unknown action: ${action}`);
    }
  }

  /**
   * Wait for a condition to be met
   */
  async waitForCondition(condition: WaitCondition): Promise<boolean> {
    const startTime = Date.now();
    const timeout = condition.timeout || 30000;

    while (Date.now() - startTime < timeout) {
      const met = await this.checkCondition(condition);
      if (met) {
        return true;
      }
      await this.delay(200);
    }

    return false;
  }

  /**
   * Check if a condition is currently met
   */
  private async checkCondition(condition: WaitCondition): Promise<boolean> {
    switch (condition.type) {
      case 'console_pattern': {
        const output = this.context.launcher.searchConsole(
          condition.params.pattern as string,
          100
        );
        return output.length > 0;
      }

      case 'pixel_color': {
        return await this.context.screen.checkPixelColor(
          condition.params.x as number,
          condition.params.y as number,
          condition.params.expected as PixelColor,
          (condition.params.tolerance as number) || 10
        );
      }

      case 'cvar_value': {
        const cvar = await this.context.console.getCvar(condition.params.name as string);
        return cvar?.value === condition.params.expected;
      }

      case 'window_exists': {
        const window = await this.context.ui.findWindow(condition.params.title as string);
        return window !== null;
      }

      case 'timeout':
        return true;

      default:
        return false;
    }
  }

  /**
   * Abort the current script
   */
  abort(): void {
    this.aborted = true;
    this.emit('abort');
  }

  /**
   * Check if script is running
   */
  isRunning(): boolean {
    return this.running;
  }

  /**
   * Get current step results
   */
  getStepResults(): StepResult[] {
    return [...this.stepResults];
  }

  /**
   * Get variable value
   */
  getVariable(name: string): unknown {
    return this.variables.get(name);
  }

  /**
   * Set variable value
   */
  setVariable(name: string, value: unknown): void {
    this.variables.set(name, value);
  }

  /**
   * Clear all variables
   */
  clearVariables(): void {
    this.variables.clear();
  }

  /**
   * Helper delay function
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Create a common test script for map loading
   */
  static createMapLoadTest(mapName: string, execPath: string): AutomationScript {
    return {
      name: `Load Map: ${mapName}`,
      description: `Test loading map ${mapName}`,
      setup: [
        {
          action: 'launch',
          params: {
            executablePath: execPath,
            windowed: true,
            width: 1280,
            height: 720,
          },
          timeout: 60000,
          condition: {
            type: 'console_pattern',
            params: { pattern: 'Initializing' },
            timeout: 30000,
          },
        },
      ],
      steps: [
        { action: 'wait', params: { ms: 5000 } },
        { action: 'toggle_console', params: {} },
        { action: 'wait', params: { ms: 500 } },
        { action: 'type', params: { text: `map ${mapName}` } },
        { action: 'press_key', params: { key: 'enter' } },
        {
          action: 'wait_for_console',
          params: { pattern: 'Loading|loaded', timeout: 60000 },
        },
        { action: 'screenshot', params: { path: `/tmp/map_${mapName}.png` } },
      ],
      teardown: [
        { action: 'command', params: { command: 'quit' } },
        { action: 'wait', params: { ms: 2000 } },
      ],
    };
  }

  /**
   * Create a console command test
   */
  static createConsoleTest(commands: string[], execPath: string): AutomationScript {
    const steps: AutomationStep[] = [
      { action: 'wait', params: { ms: 5000 } },
      { action: 'toggle_console', params: {} },
      { action: 'wait', params: { ms: 500 } },
    ];

    for (const cmd of commands) {
      steps.push({ action: 'type', params: { text: cmd } });
      steps.push({ action: 'press_key', params: { key: 'enter' } });
      steps.push({ action: 'wait', params: { ms: 500 } });
    }

    return {
      name: 'Console Commands Test',
      description: `Test ${commands.length} console commands`,
      setup: [
        {
          action: 'launch',
          params: {
            executablePath: execPath,
            windowed: true,
          },
          timeout: 60000,
        },
      ],
      steps,
      teardown: [
        { action: 'command', params: { command: 'quit' } },
      ],
    };
  }
}

export default AutomationFramework;
