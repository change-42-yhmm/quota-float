# Smart Inward Expansion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Quota Float orb expand toward available space on its current monitor and return to its exact pre-expansion position when it collapses.

**Architecture:** Keep monitor geometry in physical pixels and isolate placement math in a pure TypeScript module. The Tauri bridge captures the original orb position, serializes hover transitions, applies size and position changes, and restores the saved position on collapse; a narrowly scoped Tauri capability permits window repositioning.

**Tech Stack:** TypeScript 5.9, Vitest 3, Tauri 2 window API, Rust/Tauri Windows build tooling, PowerShell.

## Global Constraints

- Collapsed size remains exactly `100 x 100` logical pixels.
- Expanded size remains exactly `320 x 320` logical pixels.
- All placement calculations use physical pixels.
- Use the current monitor work area, excluding taskbars and reserved desktop regions.
- Ties favor right/down expansion.
- Collapse restores the exact physical position captured before expansion.
- Rapid hover transitions must be serialized and must not overwrite the saved orb position.
- Do not change visual styling, quota logic, authentication, preferences, tray behavior, or language behavior.
- Add no runtime dependency.
- Preserve browser-preview no-op behavior.

## File Map

- Create `src/lib/windowPlacement.ts`: pure physical-pixel placement calculation.
- Create `src/lib/windowPlacement.test.ts`: corner, clamp, negative-origin, and scaled-geometry unit tests.
- Create `src/lib/bridge.test.ts`: mocked Tauri tests for inward expansion, exact restoration, and serialized transitions.
- Modify `src/lib/bridge.ts:1-61`: saved-position state, transition queue, Tauri geometry reads, resize/reposition behavior.
- Modify `src-tauri/capabilities/default.json:6-12`: grant `core:window:allow-set-position`.

## Execution Prerequisite

This machine currently has Rust but no MSVC `link.exe` or Visual Studio Build Tools. Tasks 1 and 2 need only Node.js. Before Task 3, install the official Visual Studio 2022 C++ build workload:

```powershell
winget install --id Microsoft.VisualStudio.2022.BuildTools --exact --source winget --silent --accept-source-agreements --accept-package-agreements --override "--wait --passive --norestart --add Microsoft.VisualStudio.Workload.VCTools --includeRecommended"
```

Expected: winget reports a successful installation, and this command prints an installation path:

```powershell
& 'C:\Program Files (x86)\Microsoft Visual Studio\Installer\vswhere.exe' -latest -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath
```

Installing Build Tools is a machine-level change. Confirm that action with the user immediately before running the winget command.

---

### Task 1: Physical placement calculator

**Files:**
- Create: `src/lib/windowPlacement.test.ts`
- Create: `src/lib/windowPlacement.ts`

**Interfaces:**
- Consumes: plain physical-pixel rectangles supplied by the bridge.
- Produces: `calculateExpandedPosition(orb: PixelRect, card: PixelSize, workArea: PixelRect): PixelPoint`.

- [ ] **Step 1: Write the failing placement tests**

Create `src/lib/windowPlacement.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { calculateExpandedPosition } from "./windowPlacement";

const workArea = { x: 0, y: 0, width: 1920, height: 1040 };
const card = { width: 320, height: 320 };

describe("calculateExpandedPosition", () => {
  it.each([
    ["top-left", { x: 20, y: 20, width: 100, height: 100 }, { x: 20, y: 20 }],
    ["top-right", { x: 1800, y: 20, width: 100, height: 100 }, { x: 1580, y: 20 }],
    ["bottom-left", { x: 20, y: 920, width: 100, height: 100 }, { x: 20, y: 700 }],
    ["bottom-right", { x: 1800, y: 920, width: 100, height: 100 }, { x: 1580, y: 700 }],
  ])("expands inward from %s", (_name, orb, expected) => {
    expect(calculateExpandedPosition(orb, card, workArea)).toEqual(expected);
  });

  it("favors right and down when available space is tied", () => {
    const orb = { x: 910, y: 470, width: 100, height: 100 };
    expect(calculateExpandedPosition(orb, card, workArea)).toEqual({ x: 910, y: 470 });
  });

  it("clamps the card inside a taskbar-reduced work area", () => {
    const orb = { x: 1750, y: 850, width: 100, height: 100 };
    const reduced = { x: 0, y: 0, width: 1920, height: 960 };
    expect(calculateExpandedPosition(orb, card, reduced)).toEqual({ x: 1530, y: 630 });
  });

  it("supports monitors with negative coordinates", () => {
    const orb = { x: -1800, y: 920, width: 100, height: 100 };
    const leftMonitor = { x: -1920, y: 0, width: 1920, height: 1040 };
    expect(calculateExpandedPosition(orb, card, leftMonitor)).toEqual({ x: -1800, y: 700 });
  });

  it.each([
    ["125%", { x: 3500, y: 900, width: 125, height: 125 }, { width: 400, height: 400 }, { x: 3225, y: 625 }],
    ["150%", { x: 2500, y: 1200, width: 150, height: 150 }, { width: 480, height: 480 }, { x: 2500, y: 870 }],
    ["200%", { x: 3000, y: 1200, width: 200, height: 200 }, { width: 640, height: 640 }, { x: 3000, y: 760 }],
  ])("uses physical sizes produced at %s display scaling", (_scale, scaledOrb, scaledCard, expected) => {
    const scaledWorkArea = { x: 1920, y: 0, width: 2560, height: 1400 };
    expect(calculateExpandedPosition(scaledOrb, scaledCard, scaledWorkArea)).toEqual(expected);
  });

  it("aligns to the work-area origin when the card cannot fit", () => {
    const orb = { x: 80, y: 40, width: 100, height: 100 };
    const tinyWorkArea = { x: 50, y: 25, width: 250, height: 200 };
    expect(calculateExpandedPosition(orb, card, tinyWorkArea)).toEqual({ x: 50, y: 25 });
  });
});
```

- [ ] **Step 2: Run the test and verify the expected failure**

Run:

```powershell
npx vitest run src/lib/windowPlacement.test.ts
```

Expected: FAIL because `./windowPlacement` does not exist.

- [ ] **Step 3: Implement the minimal pure calculator**

Create `src/lib/windowPlacement.ts`:

```ts
export interface PixelPoint {
  x: number;
  y: number;
}

export interface PixelSize {
  width: number;
  height: number;
}

export interface PixelRect extends PixelPoint, PixelSize {}

function clampAxis(target: number, origin: number, areaSize: number, itemSize: number): number {
  if (areaSize <= itemSize) return origin;
  return Math.min(Math.max(target, origin), origin + areaSize - itemSize);
}

export function calculateExpandedPosition(
  orb: PixelRect,
  card: PixelSize,
  workArea: PixelRect,
): PixelPoint {
  const leftSpace = orb.x - workArea.x;
  const rightSpace = workArea.x + workArea.width - (orb.x + orb.width);
  const topSpace = orb.y - workArea.y;
  const bottomSpace = workArea.y + workArea.height - (orb.y + orb.height);

  const targetX = rightSpace >= leftSpace
    ? orb.x
    : orb.x - (card.width - orb.width);
  const targetY = bottomSpace >= topSpace
    ? orb.y
    : orb.y - (card.height - orb.height);

  return {
    x: clampAxis(targetX, workArea.x, workArea.width, card.width),
    y: clampAxis(targetY, workArea.y, workArea.height, card.height),
  };
}
```

- [ ] **Step 4: Run the focused test and the existing frontend suite**

Run:

```powershell
npx vitest run src/lib/windowPlacement.test.ts
npm test
```

Expected: the focused file passes all 11 cases; the full suite passes with no failures.

- [ ] **Step 5: Commit the calculator**

```powershell
git add src/lib/windowPlacement.ts src/lib/windowPlacement.test.ts
git commit -m "feat: calculate inward widget placement"
```

---

### Task 2: Tauri window transition integration

**Files:**
- Create: `src/lib/bridge.test.ts`
- Modify: `src/lib/bridge.ts:1-61`
- Modify: `src-tauri/capabilities/default.json:6-12`

**Interfaces:**
- Consumes: `calculateExpandedPosition` from Task 1 and Tauri `Window` geometry methods.
- Produces: unchanged public API `setWidgetExpanded(expanded: boolean): Promise<void>` with inward placement, exact restoration, and serialized transitions.

- [ ] **Step 1: Write failing bridge tests with a mocked Tauri window**

Create `src/lib/bridge.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const windowApi = vi.hoisted(() => {
  const calls: string[] = [];
  const windowMock = {
    outerPosition: vi.fn(),
    outerSize: vi.fn(),
    scaleFactor: vi.fn(),
    setSize: vi.fn(async (size: { width: number; height: number }) => {
      calls.push(`size:${size.width}x${size.height}`);
    }),
    setPosition: vi.fn(async (position: { x: number; y: number }) => {
      calls.push(`position:${position.x},${position.y}`);
    }),
    startDragging: vi.fn(),
  };
  return { calls, currentMonitor: vi.fn(), windowMock };
});

vi.mock("@tauri-apps/api/window", () => ({
  currentMonitor: windowApi.currentMonitor,
  getCurrentWindow: () => windowApi.windowMock,
  LogicalSize: class LogicalSize {
    constructor(public width: number, public height: number) {}
  },
  PhysicalPosition: class PhysicalPosition {
    constructor(public x: number, public y: number) {}
  },
}));

async function loadBridge() {
  vi.resetModules();
  return import("./bridge");
}

beforeEach(() => {
  vi.clearAllMocks();
  windowApi.calls.length = 0;
  vi.stubGlobal("window", { __TAURI_INTERNALS__: {} });
  windowApi.windowMock.outerPosition.mockResolvedValue({ x: 1700, y: 900 });
  windowApi.windowMock.outerSize.mockResolvedValue({ width: 100, height: 100 });
  windowApi.windowMock.scaleFactor.mockResolvedValue(1);
  windowApi.currentMonitor.mockResolvedValue({
    workArea: {
      position: { x: 0, y: 0 },
      size: { width: 1920, height: 1040 },
    },
  });
});

describe("setWidgetExpanded", () => {
  it("expands a bottom-right orb toward the monitor interior", async () => {
    const { setWidgetExpanded } = await loadBridge();
    await setWidgetExpanded(true);
    expect(windowApi.windowMock.setPosition).toHaveBeenCalledWith(
      expect.objectContaining({ x: 1480, y: 680 }),
    );
  });

  it("restores the exact pre-expansion position on collapse", async () => {
    const { setWidgetExpanded } = await loadBridge();
    await setWidgetExpanded(true);
    await setWidgetExpanded(false);
    expect(windowApi.windowMock.setPosition).toHaveBeenLastCalledWith(
      expect.objectContaining({ x: 1700, y: 900 }),
    );
  });

  it("serializes rapid expand and collapse requests", async () => {
    const { setWidgetExpanded } = await loadBridge();
    await Promise.all([setWidgetExpanded(true), setWidgetExpanded(false)]);
    expect(windowApi.calls).toEqual([
      "size:320x320",
      "position:1480,680",
      "size:100x100",
      "position:1700,900",
    ]);
  });

  it("falls back to resize when monitor geometry is unavailable", async () => {
    windowApi.currentMonitor.mockResolvedValue(null);
    const { setWidgetExpanded } = await loadBridge();
    await setWidgetExpanded(true);
    expect(windowApi.calls).toEqual(["size:320x320"]);
    await setWidgetExpanded(false);
    expect(windowApi.calls).toEqual([
      "size:320x320",
      "size:100x100",
      "position:1700,900",
    ]);
  });

  it("retains the saved orb position when expansion positioning fails", async () => {
    windowApi.windowMock.setPosition.mockRejectedValueOnce(new Error("position failed"));
    const { setWidgetExpanded } = await loadBridge();
    await expect(setWidgetExpanded(true)).rejects.toThrow("position failed");
    await setWidgetExpanded(false);
    expect(windowApi.windowMock.setPosition).toHaveBeenLastCalledWith(
      expect.objectContaining({ x: 1700, y: 900 }),
    );
  });

  it("keeps browser preview as a no-op", async () => {
    vi.stubGlobal("window", {});
    const { setWidgetExpanded } = await loadBridge();
    await setWidgetExpanded(true);
    expect(windowApi.windowMock.setSize).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the bridge tests and verify they fail for the current behavior**

Run:

```powershell
npx vitest run src/lib/bridge.test.ts
```

Expected: FAIL because the current bridge changes only size and never calls `setPosition`.

- [ ] **Step 3: Add transition state and inward placement to the bridge**

Add this import after the existing type import in `src/lib/bridge.ts`:

```ts
import { calculateExpandedPosition } from "./windowPlacement";
```

Add this state below `mockSnapshot`:

```ts
const COLLAPSED_SIZE = 100;
const EXPANDED_SIZE = 320;

interface SavedPhysicalPosition {
  x: number;
  y: number;
}

let savedOrbPosition: SavedPhysicalPosition | null = null;
let widgetTransition: Promise<void> = Promise.resolve();

function enqueueWidgetTransition(operation: () => Promise<void>): Promise<void> {
  const next = widgetTransition.then(operation, operation);
  widgetTransition = next.catch(() => undefined);
  return next;
}
```

Replace the existing `setWidgetExpanded` implementation with:

```ts
async function applyWidgetExpanded(expanded: boolean): Promise<void> {
  const {
    currentMonitor,
    getCurrentWindow,
    LogicalSize,
    PhysicalPosition,
  } = await import("@tauri-apps/api/window");
  const currentWindow = getCurrentWindow();
  const logicalSize = expanded ? EXPANDED_SIZE : COLLAPSED_SIZE;

  if (!expanded) {
    await currentWindow.setSize(new LogicalSize(logicalSize, logicalSize));
    if (savedOrbPosition) {
      const restore = savedOrbPosition;
      await currentWindow.setPosition(new PhysicalPosition(restore.x, restore.y));
      savedOrbPosition = null;
    }
    return;
  }

  if (savedOrbPosition) {
    await currentWindow.setSize(new LogicalSize(logicalSize, logicalSize));
    return;
  }

  let originalPosition: SavedPhysicalPosition;
  try {
    const position = await currentWindow.outerPosition();
    originalPosition = { x: position.x, y: position.y };
  } catch {
    await currentWindow.setSize(new LogicalSize(logicalSize, logicalSize));
    return;
  }
  savedOrbPosition = originalPosition;

  let geometry: {
    monitor: Awaited<ReturnType<typeof currentMonitor>>;
    orbSize: { width: number; height: number };
    scaleFactor: number;
  };
  try {
    const [orbSize, scaleFactor, monitor] = await Promise.all([
      currentWindow.outerSize(),
      currentWindow.scaleFactor(),
      currentMonitor(),
    ]);
    geometry = { monitor, orbSize, scaleFactor };
  } catch {
    await currentWindow.setSize(new LogicalSize(logicalSize, logicalSize));
    return;
  }

  await currentWindow.setSize(new LogicalSize(logicalSize, logicalSize));
  if (!geometry.monitor) return;

  const target = calculateExpandedPosition(
    {
      x: originalPosition.x,
      y: originalPosition.y,
      width: geometry.orbSize.width,
      height: geometry.orbSize.height,
    },
    {
      width: Math.round(EXPANDED_SIZE * geometry.scaleFactor),
      height: Math.round(EXPANDED_SIZE * geometry.scaleFactor),
    },
    {
      x: geometry.monitor.workArea.position.x,
      y: geometry.monitor.workArea.position.y,
      width: geometry.monitor.workArea.size.width,
      height: geometry.monitor.workArea.size.height,
    },
  );
  await currentWindow.setPosition(new PhysicalPosition(target.x, target.y));
}

export function setWidgetExpanded(expanded: boolean): Promise<void> {
  if (!isTauri()) return Promise.resolve();
  return enqueueWidgetTransition(() => applyWidgetExpanded(expanded));
}
```

- [ ] **Step 4: Grant only the required Tauri permission**

In `src-tauri/capabilities/default.json`, add the new permission immediately after `allow-outer-position`:

```json
"core:window:allow-outer-position",
"core:window:allow-set-position",
"core:window:allow-set-size",
```

- [ ] **Step 5: Run focused tests, full tests, and the frontend build**

Run:

```powershell
npx vitest run src/lib/windowPlacement.test.ts src/lib/bridge.test.ts
npm test
npm run build
git diff --check
```

Expected: all tests pass, the TypeScript/Vite build exits 0, and `git diff --check` prints nothing.

- [ ] **Step 6: Commit the bridge integration**

```powershell
git add src/lib/bridge.ts src/lib/bridge.test.ts src-tauri/capabilities/default.json
git commit -m "feat: expand quota widget toward available space"
```

---

### Task 3: Native verification and local deployment

**Files:**
- Build output: `src-tauri/target/release/quota-float.exe`
- Backup: `C:\Users\Keith\AppData\Local\Quota Float\quota-float.exe.v0.1.3.bak`
- Replace: `C:\Users\Keith\AppData\Local\Quota Float\quota-float.exe`

**Interfaces:**
- Consumes: committed implementation from Tasks 1 and 2 and the installed Quota Float v0.1.3 application.
- Produces: a locally built and verified executable running in the existing installation, with a one-file rollback backup.

- [ ] **Step 1: Install dependencies and run all portable checks**

```powershell
npm ci
npm test
npm run build
git diff --check
git status --short --branch
```

Expected: npm reports no install failure; all tests and build pass; diff check is silent; the branch is clean and ahead only by the planned commits.

- [ ] **Step 2: Enter the MSVC environment and run Rust tests**

```powershell
$vswhere = 'C:\Program Files (x86)\Microsoft Visual Studio\Installer\vswhere.exe'
$vsRoot = & $vswhere -latest -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath
$vsDevCmd = Join-Path $vsRoot 'Common7\Tools\VsDevCmd.bat'
cmd.exe /d /s /c "`"$vsDevCmd`" -arch=x64 -host_arch=x64 && cargo test --manifest-path src-tauri\Cargo.toml --locked"
```

Expected: Rust unit tests finish with `test result: ok` and zero failures.

- [ ] **Step 3: Build the modified Windows executable without creating a new installer**

```powershell
cmd.exe /d /s /c "`"$vsDevCmd`" -arch=x64 -host_arch=x64 && npm run tauri -- build --no-bundle"
```

Expected: exit code 0 and `src-tauri/target/release/quota-float.exe` exists.

- [ ] **Step 4: Verify the build before touching the installed copy**

```powershell
$built = Join-Path (Get-Location) 'src-tauri\target\release\quota-float.exe'
if (-not (Test-Path -LiteralPath $built -PathType Leaf)) { throw 'Built executable missing.' }
$builtItem = Get-Item -LiteralPath $built
Write-Output "BUILT_VERSION=$($builtItem.VersionInfo.FileVersion)"
Write-Output "BUILT_SHA256=$((Get-FileHash -Algorithm SHA256 -LiteralPath $built).Hash)"
```

Expected: `BUILT_VERSION=0.1.3` and a non-empty SHA-256 value.

- [ ] **Step 5: Back up and replace the installed executable**

```powershell
$installed = 'C:\Users\Keith\AppData\Local\Quota Float\quota-float.exe'
$backup = 'C:\Users\Keith\AppData\Local\Quota Float\quota-float.exe.v0.1.3.bak'
Get-Process -Name 'quota-float' -ErrorAction SilentlyContinue | Stop-Process
if (-not (Test-Path -LiteralPath $backup)) {
  Copy-Item -LiteralPath $installed -Destination $backup
}
Copy-Item -LiteralPath $built -Destination $installed -Force
Start-Process -FilePath $installed
Start-Sleep -Seconds 8
```

Expected: the original executable exists at the backup path and the modified application starts.

- [ ] **Step 6: Verify runtime state and perform manual acceptance checks**

```powershell
$process = Get-Process -Name 'quota-float' -ErrorAction Stop | Select-Object -First 1
[pscustomobject]@{
  ProcessRunning = $true
  Responding = $process.Responding
  WindowPresent = $process.MainWindowHandle -ne 0
  WindowTitle = $process.MainWindowTitle
  ExecutableHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $process.Path).Hash
} | Format-List
```

Expected: `Responding=True`, `WindowPresent=True`, and `WindowTitle=Quota Float`.

Then manually verify all five behaviors:

1. Near each monitor corner, the card expands toward the monitor interior.
2. The expanded card remains within the monitor work area.
3. Collapse returns the orb to its exact original location.
4. Ten repeated hover cycles cause no visible drift.
5. Rapid pointer entry and exit leave the widget in the final requested state.

If launch or acceptance fails, restore the original immediately:

```powershell
Get-Process -Name 'quota-float' -ErrorAction SilentlyContinue | Stop-Process
Copy-Item -LiteralPath $backup -Destination $installed -Force
Start-Process -FilePath $installed
```

Expected: the original v0.1.3 application runs again.

---

## Completion Gate

Do not report completion until all of the following are true:

- placement tests pass
- bridge transition tests pass
- existing frontend tests pass
- frontend production build passes
- Rust tests pass in the MSVC environment
- native Tauri executable builds successfully
- installed modified executable is responsive
- manual corner, exact-restore, no-drift, and rapid-hover checks pass
- the original installed executable remains available at the rollback path
