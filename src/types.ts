/**
 * OpenMOHAA MCP Server - Type Definitions
 */

export interface GameConfig {
  executablePath: string;
  workingDirectory?: string;
  arguments?: string[];
  environmentVariables?: Record<string, string>;
  gameDirectory?: string;
  enableConsole?: boolean;
  enableCheats?: boolean;
  windowedMode?: boolean;
  resolution?: { width: number; height: number };
}

export interface ProcessState {
  pid: number | null;
  running: boolean;
  exitCode: number | null;
  startTime: Date | null;
  lastError: string | null;
}

export interface ConsoleOutput {
  timestamp: Date;
  text: string;
  type: 'stdout' | 'stderr' | 'console';
}

export interface ConsoleBuffer {
  lines: ConsoleOutput[];
  maxLines: number;
}

export interface CvarInfo {
  name: string;
  value: string;
  defaultValue?: string;
  flags?: string[];
  description?: string;
}

export interface MousePosition {
  x: number;
  y: number;
}

export interface ScreenRegion {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PixelColor {
  r: number;
  g: number;
  b: number;
}

export interface WindowInfo {
  id: string;
  title: string;
  x: number;
  y: number;
  width: number;
  height: number;
  focused: boolean;
}

export interface AutomationStep {
  action: string;
  params: Record<string, unknown>;
  timeout?: number;
  waitAfter?: number;
  condition?: WaitCondition;
}

export interface WaitCondition {
  type: 'console_pattern' | 'pixel_color' | 'cvar_value' | 'timeout' | 'window_exists';
  params: Record<string, unknown>;
  timeout: number;
}

export interface TestResult {
  name: string;
  passed: boolean;
  duration: number;
  error?: string;
  steps: StepResult[];
}

export interface StepResult {
  action: string;
  success: boolean;
  duration: number;
  error?: string;
}

export interface AutomationScript {
  name: string;
  description?: string;
  steps: AutomationStep[];
  setup?: AutomationStep[];
  teardown?: AutomationStep[];
}

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogEntry {
  level: LogLevel;
  timestamp: Date;
  message: string;
  context?: Record<string, unknown>;
}

export interface GameState {
  mapLoaded: boolean;
  currentMap: string | null;
  inMenu: boolean;
  consoleOpen: boolean;
  connected: boolean;
  playerCount?: number;
}

export interface CommandResult {
  success: boolean;
  output: string;
  error?: string;
}

// MCP Tool input/output types
export interface LaunchGameInput {
  executablePath: string;
  workingDirectory?: string;
  args?: string[];
  env?: Record<string, string>;
  windowedMode?: boolean;
  width?: number;
  height?: number;
  enableConsole?: boolean;
  enableCheats?: boolean;
}

export interface SendCommandInput {
  command: string;
  waitForResponse?: boolean;
  timeout?: number;
}

export interface SetCvarInput {
  name: string;
  value: string;
}

export interface GetCvarInput {
  name: string;
}

export interface MouseMoveInput {
  x: number;
  y: number;
  relative?: boolean;
}

export interface MouseClickInput {
  button?: 'left' | 'right' | 'middle';
  x?: number;
  y?: number;
  doubleClick?: boolean;
}

export interface TypeKeysInput {
  text: string;
  delay?: number;
}

export interface PressKeyInput {
  key: string;
  modifiers?: ('ctrl' | 'alt' | 'shift' | 'super')[];
}

export interface CaptureScreenInput {
  region?: ScreenRegion;
  format?: 'png' | 'jpeg';
  quality?: number;
}

export interface GetPixelInput {
  x: number;
  y: number;
}

export interface FindImageInput {
  templatePath: string;
  threshold?: number;
  region?: ScreenRegion;
}

export interface WaitForConditionInput {
  condition: WaitCondition;
}

export interface RunScriptInput {
  script: AutomationScript;
}

export interface RunConfigInput {
  configPath: string;
}
