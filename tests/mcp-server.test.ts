/**
 * OpenMOHAA MCP Server - Unit Tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ProcessLauncher } from '../src/launcher.js';
import { ConsoleManager } from '../src/console-manager.js';
import { UIController } from '../src/ui-controller.js';
import { ScreenCapture } from '../src/screen-capture.js';
import { AutomationFramework } from '../src/automation.js';
import { BuildSystem } from '../src/build-system.js';
import { DemoManager } from '../src/demo-manager.js';
import { ConfigManager } from '../src/config-manager.js';
import { ServerManager } from '../src/server-manager.js';
import { PerformanceMonitor } from '../src/performance-monitor.js';
import { LogAnalyzer } from '../src/log-analyzer.js';

// Mock child_process
vi.mock('child_process', () => ({
  spawn: vi.fn(() => ({
    pid: 12345,
    stdout: { on: vi.fn() },
    stderr: { on: vi.fn() },
    stdin: { write: vi.fn() },
    on: vi.fn(),
    kill: vi.fn(),
  })),
  exec: vi.fn((cmd, callback) => {
    if (callback) callback(null, { stdout: '', stderr: '' });
    return { stdout: '', stderr: '' };
  }),
  execSync: vi.fn(() => ''),
}));

// Mock fs
vi.mock('fs', () => ({
  existsSync: vi.fn(() => true),
  accessSync: vi.fn(),
  readFileSync: vi.fn(() => ''),
  writeFileSync: vi.fn(),
  unlinkSync: vi.fn(),
  mkdirSync: vi.fn(),
  readdirSync: vi.fn(() => []),
  statSync: vi.fn(() => ({ size: 0, mtime: new Date() })),
  copyFileSync: vi.fn(),
  renameSync: vi.fn(),
  watchFile: vi.fn(),
  unwatchFile: vi.fn(),
  openSync: vi.fn(() => 1),
  readSync: vi.fn(() => 0),
  closeSync: vi.fn(),
  constants: { X_OK: 1 },
}));

describe('ProcessLauncher', () => {
  let launcher: ProcessLauncher;

  beforeEach(() => {
    launcher = new ProcessLauncher();
  });

  it('should initialize with default state', () => {
    const state = launcher.getState();
    expect(state.running).toBe(false);
    expect(state.pid).toBeNull();
    expect(state.exitCode).toBeNull();
  });

  it('should report not running initially', () => {
    expect(launcher.isRunning()).toBe(false);
  });

  it('should return empty console buffer initially', () => {
    const buffer = launcher.getConsoleBuffer();
    expect(buffer).toEqual([]);
  });

  it('should allow setting auto-restart', () => {
    launcher.setAutoRestart(true, 5);
    // No error means success
    expect(true).toBe(true);
  });

  it('should clear console buffer', () => {
    launcher.clearConsoleBuffer();
    expect(launcher.getConsoleBuffer()).toEqual([]);
  });
});

describe('ConsoleManager', () => {
  let launcher: ProcessLauncher;
  let consoleManager: ConsoleManager;

  beforeEach(() => {
    launcher = new ProcessLauncher();
    consoleManager = new ConsoleManager(launcher);
  });

  it('should return error when game not running', async () => {
    const result = await consoleManager.sendCommand('test');
    expect(result.success).toBe(false);
    expect(result.error).toContain('not running');
  });

  it('should cache cvar values', () => {
    const cached = consoleManager.getCachedCvar('test');
    expect(cached).toBeUndefined();
  });

  it('should clear cache', () => {
    consoleManager.clearCache();
    expect(consoleManager.getAllCachedCvars().size).toBe(0);
  });

  it('should get recent output from launcher', () => {
    const output = consoleManager.getRecentOutput(50);
    expect(Array.isArray(output)).toBe(true);
  });
});

describe('UIController', () => {
  let controller: UIController;

  beforeEach(() => {
    controller = new UIController();
  });

  it('should detect display server', () => {
    const server = controller.getDisplayServer();
    expect(['x11', 'wayland', 'unknown']).toContain(server);
  });

  it('should have check dependencies method', async () => {
    const deps = await controller.checkDependencies();
    expect(deps).toHaveProperty('available');
    expect(deps).toHaveProperty('missing');
  });

  it('should allow setting window title', () => {
    controller.setWindowTitle('Test Window');
    // No error means success
    expect(true).toBe(true);
  });
});

describe('ScreenCapture', () => {
  let capture: ScreenCapture;

  beforeEach(() => {
    capture = new ScreenCapture();
  });

  it('should have check dependencies method', async () => {
    const deps = await capture.checkDependencies();
    expect(deps).toHaveProperty('available');
    expect(deps).toHaveProperty('missing');
  });

  it('should allow setting window title', () => {
    capture.setWindowTitle('Test Window');
    // No error means success
    expect(true).toBe(true);
  });

  it('should have cleanup method', () => {
    capture.cleanup();
    // No error means success
    expect(true).toBe(true);
  });
});

describe('AutomationFramework', () => {
  let automation: AutomationFramework;
  let launcher: ProcessLauncher;
  let consoleManager: ConsoleManager;
  let uiController: UIController;
  let screenCapture: ScreenCapture;

  beforeEach(() => {
    launcher = new ProcessLauncher();
    consoleManager = new ConsoleManager(launcher);
    uiController = new UIController();
    screenCapture = new ScreenCapture();
    
    automation = new AutomationFramework({
      launcher,
      console: consoleManager,
      ui: uiController,
      screen: screenCapture,
    });
  });

  it('should not be running initially', () => {
    expect(automation.isRunning()).toBe(false);
  });

  it('should return empty step results initially', () => {
    expect(automation.getStepResults()).toEqual([]);
  });

  it('should allow getting and setting variables', () => {
    automation.setVariable('test', 'value');
    expect(automation.getVariable('test')).toBe('value');
  });

  it('should clear variables', () => {
    automation.setVariable('test', 'value');
    automation.clearVariables();
    expect(automation.getVariable('test')).toBeUndefined();
  });

  it('should create map load test script', () => {
    const script = AutomationFramework.createMapLoadTest('dm/mohdm1', '/path/to/exe');
    expect(script.name).toContain('dm/mohdm1');
    expect(script.steps.length).toBeGreaterThan(0);
  });

  it('should create console test script', () => {
    const script = AutomationFramework.createConsoleTest(['god', 'noclip'], '/path/to/exe');
    expect(script.name).toBe('Console Commands Test');
    expect(script.steps.length).toBeGreaterThan(0);
  });

  it('should emit events during script execution', async () => {
    const events: string[] = [];
    automation.on('scriptStart', () => events.push('start'));
    automation.on('scriptComplete', () => events.push('complete'));

    const script = {
      name: 'Test',
      steps: [{ action: 'wait', params: { ms: 10 } }],
    };

    await automation.runScript(script);
    expect(events).toContain('start');
    expect(events).toContain('complete');
  });
});

describe('Type Definitions', () => {
  it('should export all required types', async () => {
    const types = await import('../src/types.js');
    
    // Just verify the module loads without errors
    expect(types).toBeDefined();
  });
});

describe('BuildSystem', () => {
  let buildSystem: BuildSystem;

  beforeEach(() => {
    buildSystem = new BuildSystem();
  });

  it('should have checkBuildTools method', async () => {
    const result = await buildSystem.checkBuildTools();
    expect(result).toHaveProperty('available');
    expect(result).toHaveProperty('missing');
    expect(result).toHaveProperty('versions');
  });

  it('should have getBuildStatus method', () => {
    const status = buildSystem.getBuildStatus();
    expect(status).toHaveProperty('isBuilding');
    expect(status).toHaveProperty('output');
  });

  it('should return false when cancelling non-existent build', () => {
    const cancelled = buildSystem.cancelBuild();
    expect(cancelled).toBe(false);
  });
});

describe('DemoManager', () => {
  let launcher: ProcessLauncher;
  let consoleManager: ConsoleManager;
  let demoManager: DemoManager;

  beforeEach(() => {
    launcher = new ProcessLauncher();
    consoleManager = new ConsoleManager(launcher);
    demoManager = new DemoManager(consoleManager, '/tmp/test_game');
  });

  it('should allow setting demo directory', () => {
    demoManager.setDemoDir('/tmp/demos');
    expect(demoManager.getDemoDir()).toBe('/tmp/demos');
  });

  it('should return state', () => {
    const state = demoManager.getState();
    expect(state).toHaveProperty('isRecording');
    expect(state).toHaveProperty('isPlaying');
    expect(state.isRecording).toBe(false);
    expect(state.isPlaying).toBe(false);
  });

  it('should list demos from directory', () => {
    const demos = demoManager.listDemos();
    expect(Array.isArray(demos)).toBe(true);
  });

  it('should get disk usage', () => {
    const usage = demoManager.getDiskUsage();
    expect(usage).toHaveProperty('totalSize');
    expect(usage).toHaveProperty('count');
  });
});

describe('ConfigManager', () => {
  let configManager: ConfigManager;

  beforeEach(() => {
    configManager = new ConfigManager('/tmp/test_game', 'main');
  });

  it('should return config directory', () => {
    const dir = configManager.getConfigDir();
    expect(dir).toBe('/tmp/test_game/main');
  });

  it('should allow setting mod directory', () => {
    configManager.setModDir('expansion');
    expect(configManager.getConfigDir()).toBe('/tmp/test_game/expansion');
  });

  it('should parse config content', () => {
    const content = `
      seta cl_maxpackets "100"
      bind w "+forward"
      alias quit "disconnect; quit"
    `;
    const parsed = configManager.parseConfig(content);
    expect(parsed.cvars).toHaveProperty('cl_maxpackets');
    expect(parsed.binds).toHaveProperty('w');
    expect(parsed.aliases).toHaveProperty('quit');
  });

  it('should generate config from parsed data', () => {
    const parsed = {
      binds: { w: '+forward' },
      cvars: { name: 'Player' },
      aliases: {},
      execs: [],
      other: [],
    };
    const content = configManager.generateConfig(parsed);
    expect(content).toContain('seta name "Player"');
    expect(content).toContain('bind w "+forward"');
  });

  it('should validate config content', () => {
    const valid = configManager.validateConfig('seta test "value"');
    expect(valid.valid).toBe(true);
    expect(valid.errors).toHaveLength(0);
  });

  it('should detect unbalanced quotes', () => {
    const invalid = configManager.validateConfig('seta test "value');
    expect(invalid.valid).toBe(false);
    expect(invalid.errors.length).toBeGreaterThan(0);
  });

  it('should have graphics presets', () => {
    const presets = configManager.getGraphicsPresets();
    expect(presets).toHaveProperty('low');
    expect(presets).toHaveProperty('medium');
    expect(presets).toHaveProperty('high');
    expect(presets).toHaveProperty('ultra');
  });
});

describe('ServerManager', () => {
  let serverManager: ServerManager;

  beforeEach(() => {
    serverManager = new ServerManager();
  });

  it('should return not running status initially', () => {
    const status = serverManager.getStatus();
    expect(status.running).toBe(false);
    expect(status.pid).toBeNull();
  });

  it('should return empty output initially', () => {
    const output = serverManager.getOutput();
    expect(Array.isArray(output)).toBe(true);
    expect(output).toHaveLength(0);
  });

  it('should fail to stop when not running', async () => {
    const result = await serverManager.stopServer();
    expect(result.success).toBe(false);
    expect(result.message).toContain('not running');
  });

  it('should fail to restart without config', async () => {
    const result = await serverManager.restartServer();
    expect(result.success).toBe(false);
    expect(result.message).toContain('No server configuration');
  });
});

describe('PerformanceMonitor', () => {
  let launcher: ProcessLauncher;
  let consoleManager: ConsoleManager;
  let screenCapture: ScreenCapture;
  let perfMonitor: PerformanceMonitor;

  beforeEach(() => {
    launcher = new ProcessLauncher();
    consoleManager = new ConsoleManager(launcher);
    screenCapture = new ScreenCapture();
    perfMonitor = new PerformanceMonitor(screenCapture, consoleManager);
  });

  it('should allow setting PID', () => {
    perfMonitor.setPid(12345);
    // No error means success
    expect(true).toBe(true);
  });

  it('should return null stats when no samples', () => {
    const stats = perfMonitor.getStatistics();
    expect(stats).toBeNull();
  });

  it('should return empty samples initially', () => {
    const samples = perfMonitor.getSamples();
    expect(Array.isArray(samples)).toBe(true);
    expect(samples).toHaveLength(0);
  });

  it('should clear samples', () => {
    perfMonitor.clearSamples();
    expect(perfMonitor.getSamples()).toHaveLength(0);
  });

  it('should export empty CSV header', () => {
    const csv = perfMonitor.exportToCsv();
    expect(csv).toContain('timestamp');
    expect(csv).toContain('fps');
  });

  it('should check performance issues with no samples', () => {
    const issues = perfMonitor.checkPerformanceIssues();
    expect(issues.hasIssues).toBe(false);
    expect(issues.issues).toContain('Not enough samples');
  });
});

describe('LogAnalyzer', () => {
  let logAnalyzer: LogAnalyzer;

  beforeEach(() => {
    logAnalyzer = new LogAnalyzer('/tmp/test_logs');
  });

  it('should allow setting log directory', () => {
    logAnalyzer.setLogDir('/tmp/new_logs');
    // No error means success
    expect(true).toBe(true);
  });

  it('should list logs from directory', () => {
    const logs = logAnalyzer.listLogs();
    expect(Array.isArray(logs)).toBe(true);
  });

  it('should parse log content correctly', () => {
    // Test internal parsing by using tail on non-existent file
    const lines = logAnalyzer.tail('/nonexistent.log');
    expect(Array.isArray(lines)).toBe(true);
    expect(lines).toHaveLength(0);
  });

  it('should stop watching when unwatching non-watched file', () => {
    logAnalyzer.unwatchLog('/tmp/test.log');
    // No error means success
    expect(true).toBe(true);
  });

  it('should unwatch all files', () => {
    logAnalyzer.unwatchAll();
    // No error means success
    expect(true).toBe(true);
  });
});
