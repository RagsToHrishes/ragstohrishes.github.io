import React, { useEffect, useRef, useState } from 'react';

type StructureKind = 'coal' | 'generator' | 'battery' | 'lab' | 'factory';
type ItemType = 'coal' | 'cell';
type TaskType = 'fuel-generator' | 'charge-battery' | 'power-lab' | 'power-factory';

type Task = {
  type: TaskType;
  sourceId: number;
  targetId: number;
  phase: 'pickup' | 'deliver';
};

type BaseStructure = {
  id: number;
  kind: StructureKind;
  x: number;
  y: number;
  size: number;
  placedByUser: boolean;
  pulse: number;
};

type CoalPatch = BaseStructure & {
  kind: 'coal';
  stock: number;
};

type GeneratorNode = BaseStructure & {
  kind: 'generator';
  fuel: number;
  outputCells: number;
  production: number;
};

type BatteryNode = BaseStructure & {
  kind: 'battery';
  charge: number;
  capacity: number;
};

type LabNode = BaseStructure & {
  kind: 'lab';
  energy: number;
};

type FactoryNode = BaseStructure & {
  kind: 'factory';
  charge: number;
  buildProgress: number;
};

type Structure = CoalPatch | GeneratorNode | BatteryNode | LabNode | FactoryNode;

type Worker = {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  angle: number;
  carrying: ItemType | null;
  task: Task | null;
  wanderSeed: number;
  wobble: number;
  route: RoutePoint[];
  routeIndex: number;
  routeKey: string | null;
  routeVersion: number;
  routeRefreshAt: number;
  malfunctionTimer: number;
  idleTargetId: number | null;
  idleTargetTimer: number;
};

type Ripple = {
  x: number;
  y: number;
  life: number;
  color: string;
};

type BurstParticle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  size: number;
  color: string;
};

type World = {
  width: number;
  height: number;
  nextId: number;
  structures: Structure[];
  workers: Worker[];
  ripples: Ripple[];
  particles: BurstParticle[];
};

type Metrics = {
  status: string;
  powerPct: number;
  cellsPct: number;
  workers: number;
  workerCap: number;
  malfunctioning: number;
  factoryPct: number;
  factoryCharge: number;
  factoryProgress: number;
};

type SwarmFocusKey = 'fuel' | 'cells' | 'labs' | 'factory' | 'crew';

type SwarmStrategy = {
  key: SwarmFocusKey;
  label: string;
  desiredWorkers: number;
};

type GraphHistory = {
  power: number[];
  cells: number[];
  workers: number[];
  factory: number[];
};

type ObstacleRect = {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
};

type FixedMapLayout = {
  obstacles: ObstacleRect[];
  panelRects: ObstacleRect[];
  hallwayY: number[];
  leftLaneX: number;
  centerLaneX: number;
  rightLaneX: number;
};

type RoutePoint = {
  x: number;
  y: number;
};

type NavigationGrid = {
  cellSize: number;
  cols: number;
  rows: number;
  blocked: Uint8Array;
  version: number;
};

type StructureCollections = {
  coal: CoalPatch[];
  generator: GeneratorNode[];
  battery: BatteryNode[];
  lab: LabNode[];
  factory: FactoryNode[];
};

type StructureIndex = {
  byId: Map<number, Structure>;
  byKind: StructureCollections;
};

type ClaimCounts = {
  toGenerator: Map<number, number>;
  fromGenerator: Map<number, number>;
  toBattery: Map<number, number>;
  fromBattery: Map<number, number>;
  toLab: Map<number, number>;
  toFactory: Map<number, number>;
};

type PathfindingScratch = {
  gScore: Float64Array;
  fScore: Float64Array;
  cameFrom: Int32Array;
  seen: Uint32Array;
  closed: Uint32Array;
  mark: number;
};

type WorkerSpatialGrid = {
  cells: Map<string, Set<number>>;
  cols: number[];
  rows: number[];
};

const COLORS = {
  paper: '#F5F5F5',
  lime: '#B9E937',
  green: '#00B906',
  danger: '#D9480F',
  dangerLight: '#FF8C42',
  dangerDark: '#8F1D14',
  ink: '#424242',
  softInk: 'rgba(66, 66, 66, 0.22)',
};

const WORKER_RADIUS = 5;
const WORKER_MIN_SEPARATION = WORKER_RADIUS * 2 + 4;
const LOCAL_AVOIDANCE_RADIUS = 26;
const LOCAL_AVOIDANCE_LOOKAHEAD = 0.16;
const LOCAL_AVOIDANCE_MAX_NEIGHBORS = 18;
const STRUCTURE_PADDING = 22;
const OBSTACLE_REPULSION_RANGE = 34;
const MAX_GENERATOR_OUTPUT = 5;
const WORKER_CAP = 100;
const WORKER_TARGET_BASE = 60;
const WORKER_TARGET_SWING = 10;
const FACTORY_CHARGE_PER_CELL = 28;
const FACTORY_POWER_DRAIN = 7.4;
const FACTORY_BUILD_RATE = 9.2;
const WORKER_MALFUNCTION_RATE = 0.0095;
const WORKER_FAILURE_RATE = 0.0017;
const HISTORY_LENGTH = 24;
const NAVIGATION_CELL_SIZE = 10;
const FLOCKING_RADIUS = 72;
const FLOCKING_CELL_SIZE = FLOCKING_RADIUS;
const PATH_NEIGHBOR_STEPS = [
  { dc: 1, dr: 0, cost: 1 },
  { dc: -1, dr: 0, cost: 1 },
  { dc: 0, dr: 1, cost: 1 },
  { dc: 0, dr: -1, cost: 1 },
  { dc: 1, dr: 1, cost: Math.SQRT2 },
  { dc: -1, dr: 1, cost: Math.SQRT2 },
  { dc: 1, dr: -1, cost: Math.SQRT2 },
  { dc: -1, dr: -1, cost: Math.SQRT2 },
] as const;

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function distance(ax: number, ay: number, bx: number, by: number) {
  return Math.hypot(ax - bx, ay - by);
}

function hexToRgba(hex: string, alpha: number) {
  const value = hex.replace('#', '');
  const normalized = value.length === 3
    ? value
        .split('')
        .map((part) => part + part)
        .join('')
    : value;
  const red = Number.parseInt(normalized.slice(0, 2), 16);
  const green = Number.parseInt(normalized.slice(2, 4), 16);
  const blue = Number.parseInt(normalized.slice(4, 6), 16);
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

function createRect(left: number, top: number, width: number, height: number): ObstacleRect {
  return {
    left,
    top,
    right: left + width,
    bottom: top + height,
    width,
    height,
  };
}

function measureElementRect(element: Element | null): ObstacleRect | null {
  if (!(element instanceof HTMLElement)) {
    return null;
  }

  const rect = element.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) {
    return null;
  }

  return createRect(rect.left, rect.top, rect.width, rect.height);
}

function measureElementRects(selector: string): ObstacleRect[] {
  return Array.from(document.querySelectorAll(selector))
    .map((element) => measureElementRect(element))
    .filter((rect): rect is ObstacleRect => rect !== null);
}

function buildFixedMapLayout(width: number, height: number): FixedMapLayout {
  const viewportWidth = Math.max(width, 360);
  const viewportHeight = Math.max(height, 560);
  const hallwayToChromeGap = 42;
  const hallwayToPanelGap = 24;

  const headerRect = measureElementRect(document.querySelector('.site-nav'));
  const footerRect = measureElementRect(document.querySelector('.site-footer'));
  const headerObstacles = measureElementRects('[data-sim-obstacle="header"]');
  const footerObstacles = measureElementRects('[data-sim-obstacle="footer"]');

  let panelRects = Array.from(document.querySelectorAll<HTMLElement>('.panel-shell'))
    .map((element) => measureElementRect(element))
    .filter((rect): rect is ObstacleRect => rect !== null)
    .sort((first, second) => first.top - second.top);

  if (panelRects.length === 0) {
    const fallbackWidth = Math.min(viewportWidth - 40, 920);
    const fallbackLeft = (viewportWidth - fallbackWidth) * 0.5;
    const fallbackHallwayHeight = clamp(viewportHeight * 0.09, 52, 88);
    const fallbackHeight = Math.max(220, viewportHeight - fallbackHallwayHeight * 2);
    panelRects = [
      createRect(
        fallbackLeft,
        fallbackHallwayHeight,
        fallbackWidth,
        fallbackHeight,
      ),
    ];
  }

  const topPanelRect = panelRects[0];
  const bottomPanelRect = panelRects[panelRects.length - 1];
  const topHallwayMin = headerRect ? headerRect.bottom + hallwayToChromeGap : 64;
  const topHallwayMax = topPanelRect ? topPanelRect.top - hallwayToPanelGap : viewportHeight * 0.24;
  const bottomHallwayMin = bottomPanelRect ? bottomPanelRect.bottom + hallwayToPanelGap : viewportHeight * 0.76;
  const bottomHallwayMax = footerRect ? footerRect.top - hallwayToChromeGap : viewportHeight - 64;

  const hallwayY = [
    clamp(
      topHallwayMin <= topHallwayMax
        ? (topHallwayMin + topHallwayMax) * 0.5
        : topHallwayMin,
      56,
      viewportHeight - 56,
    ),
    clamp(
      bottomHallwayMin <= bottomHallwayMax
        ? (bottomHallwayMin + bottomHallwayMax) * 0.5
        : bottomHallwayMax,
      56,
      viewportHeight - 56,
    ),
  ].filter((lane, index, lanes) => (
    index === 0 || Math.abs(lane - lanes[index - 1]) > 24
  ));

  const leftEdge = Math.min(...panelRects.map((rect) => rect.left));
  const rightEdge = Math.max(...panelRects.map((rect) => rect.right));
  const obstacles = [
    ...panelRects,
    ...headerObstacles,
    ...footerObstacles,
  ];

  return {
    obstacles,
    panelRects,
    hallwayY,
    leftLaneX: clamp(leftEdge * 0.5, 40, viewportWidth - 40),
    centerLaneX: clamp(viewportWidth * 0.5, 56, viewportWidth - 56),
    rightLaneX: clamp(
      rightEdge + (viewportWidth - rightEdge) * 0.5,
      40,
      viewportWidth - 40,
    ),
  };
}

function nearlyEqual(first: number, second: number, tolerance = 1) {
  return Math.abs(first - second) <= tolerance;
}

function rectListsMatch(previous: ObstacleRect[], next: ObstacleRect[], tolerance = 1) {
  if (previous.length !== next.length) {
    return false;
  }

  return previous.every((rect, index) => {
    const nextRect = next[index];
    return Boolean(nextRect) &&
      nearlyEqual(rect.left, nextRect.left, tolerance) &&
      nearlyEqual(rect.top, nextRect.top, tolerance) &&
      nearlyEqual(rect.width, nextRect.width, tolerance) &&
      nearlyEqual(rect.height, nextRect.height, tolerance);
  });
}

function layoutsMatch(previous: FixedMapLayout | null, next: FixedMapLayout, tolerance = 1) {
  if (!previous) {
    return false;
  }

  if (
    !nearlyEqual(previous.leftLaneX, next.leftLaneX, tolerance) ||
    !nearlyEqual(previous.centerLaneX, next.centerLaneX, tolerance) ||
    !nearlyEqual(previous.rightLaneX, next.rightLaneX, tolerance)
  ) {
    return false;
  }

  if (previous.hallwayY.length !== next.hallwayY.length) {
    return false;
  }

  if (!previous.hallwayY.every((lane, index) => nearlyEqual(lane, next.hallwayY[index] ?? lane, tolerance))) {
    return false;
  }

  return rectListsMatch(previous.obstacles, next.obstacles, tolerance) &&
    rectListsMatch(previous.panelRects, next.panelRects, tolerance);
}

function createStructureIndex(structures: Structure[]): StructureIndex {
  const byId = new Map<number, Structure>();
  const byKind: StructureCollections = {
    coal: [],
    generator: [],
    battery: [],
    lab: [],
    factory: [],
  };

  structures.forEach((node) => {
    byId.set(node.id, node);

    switch (node.kind) {
      case 'coal':
        byKind.coal.push(node);
        break;
      case 'generator':
        byKind.generator.push(node);
        break;
      case 'battery':
        byKind.battery.push(node);
        break;
      case 'lab':
        byKind.lab.push(node);
        break;
      case 'factory':
        byKind.factory.push(node);
        break;
      default:
        break;
    }
  });

  return { byId, byKind };
}

function createClaimCounts(): ClaimCounts {
  return {
    toGenerator: new Map<number, number>(),
    fromGenerator: new Map<number, number>(),
    toBattery: new Map<number, number>(),
    fromBattery: new Map<number, number>(),
    toLab: new Map<number, number>(),
    toFactory: new Map<number, number>(),
  };
}

function adjustClaimCount(counter: Map<number, number>, id: number, delta: number) {
  const nextValue = (counter.get(id) || 0) + delta;
  if (nextValue <= 0) {
    counter.delete(id);
    return;
  }

  counter.set(id, nextValue);
}

function applyTaskClaimDelta(claims: ClaimCounts, task: Task, delta: number) {
  switch (task.type) {
    case 'fuel-generator':
      adjustClaimCount(claims.toGenerator, task.targetId, delta);
      break;
    case 'charge-battery':
      adjustClaimCount(claims.fromGenerator, task.sourceId, delta);
      adjustClaimCount(claims.toBattery, task.targetId, delta);
      break;
    case 'power-lab':
      adjustClaimCount(claims.fromBattery, task.sourceId, delta);
      adjustClaimCount(claims.toLab, task.targetId, delta);
      break;
    case 'power-factory':
      adjustClaimCount(claims.fromBattery, task.sourceId, delta);
      adjustClaimCount(claims.toFactory, task.targetId, delta);
      break;
    default:
      break;
  }
}

function createWorker(id: number, x: number, y: number): Worker {
  return {
    id,
    x,
    y,
    vx: (Math.random() - 0.5) * 14,
    vy: (Math.random() - 0.5) * 14,
    angle: Math.random() * Math.PI * 2,
    carrying: null,
    task: null,
    wanderSeed: Math.random() * Math.PI * 2,
    wobble: Math.random() * 1000,
    route: [],
    routeIndex: 0,
    routeKey: null,
    routeVersion: 0,
    routeRefreshAt: 0,
    malfunctionTimer: 0,
    idleTargetId: null,
    idleTargetTimer: 0,
  };
}

function pushHistoryValue(series: number[], value: number) {
  const next = [...series, clamp(value, 0, 100)];
  return next.length > HISTORY_LENGTH ? next.slice(-HISTORY_LENGTH) : next;
}

function buildSparklinePath(values: number[], width = 112, height = 28) {
  const series = values.length > 0 ? values : [0];
  if (series.length === 1) {
    const y = height - (series[0] / 100) * height;
    return `M 0 ${y.toFixed(2)} L ${width} ${y.toFixed(2)}`;
  }

  return series
    .map((value, index) => {
      const x = (index / (series.length - 1)) * width;
      const y = height - (value / 100) * height;
      return `${index === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(' ');
}

type MiniGraphProps = {
  label: string;
  value: string;
  detail: string;
  values: number[];
  color: string;
};

function MiniGraph({ label, value, detail, values, color }: MiniGraphProps) {
  return (
    <article className="sim-hotbar__graph">
      <div className="sim-hotbar__graph-header">
        <p className="sim-hotbar__graph-label">{label}</p>
        <p className="sim-hotbar__graph-value">{value}</p>
      </div>
      <svg className="sim-hotbar__graph-svg" viewBox="0 0 112 28" preserveAspectRatio="none" aria-hidden="true">
        <path
          d={buildSparklinePath(values)}
          fill="none"
          stroke={color}
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <p className="sim-hotbar__graph-detail">{detail}</p>
    </article>
  );
}

function deriveMetrics(world: World, statusOverride?: string): Metrics {
  const coalPatches = world.structures.filter((node) => node.kind === 'coal').length;
  const generators = world.structures.filter((node) => node.kind === 'generator') as GeneratorNode[];
  const batteries = world.structures.filter((node) => node.kind === 'battery') as BatteryNode[];
  const labs = world.structures.filter((node) => node.kind === 'lab') as LabNode[];
  const factories = world.structures.filter((node) => node.kind === 'factory') as FactoryNode[];
  const totalFuel = generators.reduce((sum, node) => sum + node.fuel, 0);
  const totalCells =
    generators.reduce((sum, node) => sum + node.outputCells, 0) +
    batteries.reduce((sum, node) => sum + node.charge, 0);
  const totalLabEnergy = labs.reduce((sum, node) => sum + node.energy, 0);
  const totalFactoryCharge = factories.reduce((sum, node) => sum + node.charge, 0);
  const totalFactoryProgress = factories.reduce((sum, node) => sum + node.buildProgress, 0);
  const malfunctioning = world.workers.filter((worker) => worker.malfunctionTimer > 0).length;
  const cellCapacity =
    generators.length * MAX_GENERATOR_OUTPUT +
    batteries.reduce((sum, node) => sum + node.capacity, 0);
  const cellsPct = cellCapacity > 0 ? (totalCells / cellCapacity) * 100 : 0;
  const fuelPct = generators.length > 0 ? (totalFuel / (generators.length * 100)) * 100 : 0;
  const labPct = labs.length > 0 ? (totalLabEnergy / (labs.length * 100)) * 100 : 0;
  const powerPct = fuelPct * 0.35 + cellsPct * 0.4 + labPct * 0.25;
  const averageFactoryCharge = factories.length > 0 ? totalFactoryCharge / factories.length : 0;
  const averageFactoryProgress = factories.length > 0 ? totalFactoryProgress / factories.length : 0;
  const factoryPct = averageFactoryCharge * 0.55 + averageFactoryProgress * 0.45;

  let status = 'Booting grid';
  if (coalPatches && generators.length && batteries.length && labs.length && factories.length) {
    status = 'Grid nominal';
    if (totalFuel < generators.length * 28) {
      status = 'Fuel low';
    } else if (totalCells < Math.max(2, batteries.length * 2)) {
      status = 'Balancing load';
    } else if (world.workers.length < WORKER_CAP && averageFactoryCharge < 16) {
      status = 'Factory starved';
    } else if (malfunctioning > Math.max(2, Math.round(world.workers.length * 0.14))) {
      status = 'Crew faults';
    } else if (totalLabEnergy < labs.length * 35) {
      status = 'Labs are draining';
    }
  } else if (coalPatches && generators.length && batteries.length) {
    status = 'Bring factory online';
  } else if (coalPatches && generators.length) {
    status = 'Add storage';
  } else if (coalPatches) {
    status = 'Waiting on generators';
  }

  if (statusOverride) {
    status = statusOverride;
  }

  return {
    status,
    powerPct: Math.round(powerPct),
    cellsPct: Math.round(cellsPct),
    workers: world.workers.length,
    workerCap: WORKER_CAP,
    malfunctioning,
    factoryPct: Math.round(factoryPct),
    factoryCharge: Math.round(averageFactoryCharge),
    factoryProgress: Math.round(averageFactoryProgress),
  };
}

export default function PowerGridBackground() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const structureIndexRef = useRef<StructureIndex>(createStructureIndex([]));
  const obstacleRectsRef = useRef<ObstacleRect[]>([]);
  const mapLayoutRef = useRef<FixedMapLayout | null>(null);
  const navigationGridRef = useRef<NavigationGrid | null>(null);
  const navigationVersionRef = useRef(0);
  const pathCacheRef = useRef(new Map<string, RoutePoint[]>());
  const pathfindingScratchRef = useRef<PathfindingScratch | null>(null);
  const worldRef = useRef<World>({
    width: 0,
    height: 0,
    nextId: 1,
    structures: [],
    workers: [],
    ripples: [],
    particles: [],
  });

  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const [isMenuMinimized, setIsMenuMinimized] = useState(false);
  const [metrics, setMetrics] = useState<Metrics>({
    status: 'Booting grid',
    powerPct: 0,
    cellsPct: 0,
    workers: 0,
    workerCap: WORKER_CAP,
    malfunctioning: 0,
    factoryPct: 0,
    factoryCharge: 0,
    factoryProgress: 0,
  });
  const [graphHistory, setGraphHistory] = useState<GraphHistory>({
    power: [],
    cells: [],
    workers: [],
    factory: [],
  });

  useEffect(() => {
    if (!isHelpOpen) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setIsHelpOpen(false);
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isHelpOpen]);

  useEffect(() => {
    if (isMenuMinimized && isHelpOpen) {
      setIsHelpOpen(false);
    }
  }, [isHelpOpen, isMenuMinimized]);

  useEffect(() => {
    const canvas = canvasRef.current!;
    if (!canvas) {
      return;
    }

    const ctx = canvas.getContext('2d', { alpha: true })!;
    if (!ctx) {
      return;
    }

    let animationFrame = 0;
    let previousTime = performance.now();
    let lastRenderTime = 0;
    let statsTimer = 0;
    let simulationTime = 0;
    let activeWorkerTrafficField: Float32Array | null = null;
    let backgroundSceneCanvas: HTMLCanvasElement | null = null;
    let gridCacheCanvas: HTMLCanvasElement | null = null;
    const navigatorWithHints = navigator as Navigator & {
      connection?: { saveData?: boolean };
      deviceMemory?: number;
    };
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const lowPowerDevice =
      prefersReducedMotion ||
      navigatorWithHints.connection?.saveData === true ||
      (navigatorWithHints.deviceMemory ?? 8) <= 4 ||
      (navigator.hardwareConcurrency ?? 8) <= 4;
    const compactViewport = window.innerWidth <= 900;
    const performanceProfile = {
      lowPower: lowPowerDevice || compactViewport,
      simplifiedVisuals: lowPowerDevice,
      frameIntervalMs: lowPowerDevice ? 1000 / 30 : compactViewport ? 1000 / 40 : 0,
      flockingNeighborStride: lowPowerDevice ? 2 : 1,
      maxFlockingNeighbors: lowPowerDevice ? 18 : 32,
      maxDpr: lowPowerDevice ? 1 : compactViewport ? 1.25 : 1.75,
    };

    const dpr = Math.max(1, Math.min(performanceProfile.maxDpr, window.devicePixelRatio || 1));

    function getLoadCycleValue() {
      const primary = Math.sin(simulationTime * 0.18) * 0.18;
      const secondary = Math.sin(simulationTime * 0.47 + 1.4) * 0.1;
      return clamp(0.52 + primary + secondary, 0.2, 0.88);
    }

    function getDesiredWorkerCount() {
      const target =
        WORKER_TARGET_BASE +
        Math.sin(simulationTime * 0.16 + 0.4) * WORKER_TARGET_SWING +
        (getLoadCycleValue() - 0.5) * 8;
      return clamp(Math.round(target), 42, 72);
    }

    function getStrategicDesiredWorkerCount(
      world: World,
      generators: GeneratorNode[],
      batteries: BatteryNode[],
      labs: LabNode[],
      factories: FactoryNode[],
    ) {
      const baseTarget = getDesiredWorkerCount();
      const averageFuel =
        generators.length > 0
          ? generators.reduce((sum, node) => sum + node.fuel, 0) / generators.length
          : 0;
      const averageLabEnergy =
        labs.length > 0
          ? labs.reduce((sum, node) => sum + node.energy, 0) / labs.length
          : 0;
      const averageFactoryCharge =
        factories.length > 0
          ? factories.reduce((sum, node) => sum + node.charge, 0) / factories.length
          : 0;
      const malfunctioning = world.workers.filter((worker) => worker.malfunctionTimer > 0).length;
      const totalCellCapacity =
        generators.length * MAX_GENERATOR_OUTPUT +
        batteries.reduce((sum, node) => sum + node.capacity, 0);
      const storedCells =
        generators.reduce((sum, node) => sum + node.outputCells, 0) +
        batteries.reduce((sum, node) => sum + node.charge, 0);
      const cellsPct = totalCellCapacity > 0 ? (storedCells / totalCellCapacity) * 100 : 0;

      let target = baseTarget;
      target += Math.round(clamp((52 - averageFuel) / 52, 0, 1) * 12);
      target += Math.round(clamp((44 - averageFactoryCharge) / 44, 0, 1) * 4);
      target += Math.round(clamp((48 - cellsPct) / 48, 0, 1) * 3);
      target += Math.round(clamp((55 - averageLabEnergy) / 55, 0, 1) * 3);

      if (malfunctioning > Math.max(2, Math.round(world.workers.length * 0.1))) {
        target += 4;
      }

      return clamp(target, 42, 84);
    }

    const STRATEGY_KEYS: SwarmFocusKey[] = ['fuel', 'cells', 'labs', 'factory', 'crew'];
    let currentStrategy: SwarmStrategy = {
      key: 'fuel',
      label: 'Booting grid',
      desiredWorkers: getDesiredWorkerCount(),
    };
    let strategyHoldTimer = 0;
    const strategyCooldowns: Record<SwarmFocusKey, number> = {
      fuel: 0,
      cells: 0,
      labs: 0,
      factory: 0,
      crew: 0,
    };

    function getSwarmFocusLabel(key: SwarmFocusKey) {
      switch (key) {
        case 'fuel':
          return 'Fuel push';
        case 'cells':
          return 'Reserve balancing';
        case 'labs':
          return 'Lab support';
        case 'factory':
          return 'Factory ramp';
        case 'crew':
          return 'Crew recovery';
        default:
          return 'Grid nominal';
      }
    }

    function getSwarmFocusOscillation(key: SwarmFocusKey) {
      const phaseOffsets: Record<SwarmFocusKey, number> = {
        fuel: 0,
        cells: 1.35,
        labs: 2.7,
        factory: 4.05,
        crew: 5.4,
      };
      return (Math.sin(simulationTime * 0.72 + phaseOffsets[key]) + 1) * 0.11;
    }

    function getSwarmFocusWorkerBonus(key: SwarmFocusKey) {
      switch (key) {
        case 'fuel':
          return 6;
        case 'cells':
          return 2;
        case 'labs':
          return 1;
        case 'factory':
          return 8;
        case 'crew':
          return 10;
        default:
          return 0;
      }
    }

    function updateSwarmStrategy(dt: number) {
      strategyHoldTimer += dt;
      STRATEGY_KEYS.forEach((key) => {
        strategyCooldowns[key] = Math.max(0, strategyCooldowns[key] - dt);
      });

      const world = worldRef.current;
      const coalPatches = getNodes('coal') as CoalPatch[];
      const generators = getNodes('generator') as GeneratorNode[];
      const batteries = getNodes('battery') as BatteryNode[];
      const labs = getNodes('lab') as LabNode[];
      const factories = getNodes('factory') as FactoryNode[];
      const metricsSnapshot = deriveMetrics(world);
      const systemReady =
        coalPatches.length > 0 &&
        generators.length > 0 &&
        batteries.length > 0 &&
        labs.length > 0 &&
        factories.length > 0;

      if (!systemReady) {
        currentStrategy = {
          ...currentStrategy,
          label: metricsSnapshot.status,
          desiredWorkers: getDesiredWorkerCount(),
        };
        return;
      }

      const baseDesiredWorkers = getStrategicDesiredWorkerCount(
        world,
        generators,
        batteries,
        labs,
        factories,
      );
      const totalFuel = generators.reduce((sum, node) => sum + node.fuel, 0);
      const averageFuel = generators.length > 0 ? totalFuel / generators.length : 0;
      const totalCellCapacity =
        generators.length * MAX_GENERATOR_OUTPUT +
        batteries.reduce((sum, node) => sum + node.capacity, 0);
      const storedCells =
        generators.reduce((sum, node) => sum + node.outputCells, 0) +
        batteries.reduce((sum, node) => sum + node.charge, 0);
      const cellsPct = totalCellCapacity > 0 ? (storedCells / totalCellCapacity) * 100 : 0;
      const averageLabEnergy =
        labs.length > 0
          ? labs.reduce((sum, node) => sum + node.energy, 0) / labs.length
          : 0;
      const averageFactoryCharge =
        factories.length > 0
          ? factories.reduce((sum, node) => sum + node.charge, 0) / factories.length
          : 0;
      const malfunctioning = world.workers.filter((worker) => worker.malfunctionTimer > 0).length;
      const crewNeed = clamp(
        (baseDesiredWorkers - world.workers.length) / Math.max(1, baseDesiredWorkers),
        0,
        1,
      );
      const fuelNeed = clamp((68 - averageFuel) / 68, 0, 1);
      const cellNeed = clamp((62 - cellsPct) / 62, 0, 1);
      const labNeed = clamp((74 - averageLabEnergy) / 74, 0, 1);
      const factoryNeed = clamp(
        crewNeed * 0.58 + clamp((64 - averageFactoryCharge) / 64, 0, 1) * 0.42,
        0,
        1,
      );
      const crewFaultNeed = clamp(
        malfunctioning / Math.max(1, Math.round(Math.max(6, world.workers.length * 0.14))),
        0,
        1,
      );

      const rawScores: Record<SwarmFocusKey, number> = {
        fuel: fuelNeed * 1.55 + crewNeed * 0.22 + factoryNeed * 0.12 + getSwarmFocusOscillation('fuel'),
        cells: cellNeed * 1.4 + labNeed * 0.12 + getSwarmFocusOscillation('cells'),
        labs: labNeed * 1.42 + cellNeed * 0.15 + getSwarmFocusOscillation('labs'),
        factory: factoryNeed * 1.35 + fuelNeed * 0.35 + getSwarmFocusOscillation('factory'),
        crew: crewFaultNeed * 1.5 + crewNeed * 0.95 + fuelNeed * 0.18 + getSwarmFocusOscillation('crew'),
      };
      const effectiveScores = STRATEGY_KEYS.reduce((scores, key) => {
        scores[key] = rawScores[key] - strategyCooldowns[key] * 0.18;
        return scores;
      }, {} as Record<SwarmFocusKey, number>);
      const orderedKeys = [...STRATEGY_KEYS].sort(
        (first, second) => effectiveScores[second] - effectiveScores[first],
      );
      const currentEffective = effectiveScores[currentStrategy.key];
      const leader = orderedKeys[0];
      let nextKey = currentStrategy.key;

      if (leader !== currentStrategy.key && effectiveScores[leader] > currentEffective + 0.24) {
        nextKey = leader;
      } else if (strategyHoldTimer > 5.5) {
        const rotatingTarget = orderedKeys.find((key) => (
          key !== currentStrategy.key &&
          rawScores[key] > 0.18 &&
          effectiveScores[key] > currentEffective - 0.18
        ));

        if (rotatingTarget) {
          nextKey = rotatingTarget;
        }
      }

      if (strategyHoldTimer > 8.5) {
        const forcedTarget = orderedKeys.find((key) => (
          key !== currentStrategy.key &&
          rawScores[key] > 0.14
        ));

        if (forcedTarget) {
          nextKey = forcedTarget;
        }
      }

      if (nextKey !== currentStrategy.key) {
        strategyCooldowns[currentStrategy.key] = 4.5;
        currentStrategy = {
          ...currentStrategy,
          key: nextKey,
        };
        strategyHoldTimer = 0;
      }

      currentStrategy = {
        key: currentStrategy.key,
        label: getSwarmFocusLabel(currentStrategy.key),
        desiredWorkers: clamp(
          baseDesiredWorkers + getSwarmFocusWorkerBonus(currentStrategy.key),
          42,
          88,
        ),
      };
    }

    function clearWorkerRoute(worker: Worker) {
      worker.route = [];
      worker.routeIndex = 0;
      worker.routeKey = null;
      worker.routeVersion = 0;
      worker.routeRefreshAt = 0;
    }

    function clearAllWorkerRoutes() {
      worldRef.current.workers.forEach((worker) => {
        clearWorkerRoute(worker);
      });
    }

    function publishMetrics(world: World) {
      const nextMetrics = deriveMetrics(world, currentStrategy.label);
      setMetrics(nextMetrics);
      setGraphHistory((previous) => ({
        power: pushHistoryValue(previous.power, nextMetrics.powerPct),
        cells: pushHistoryValue(previous.cells, nextMetrics.cellsPct),
        workers: pushHistoryValue(
          previous.workers,
          nextMetrics.workerCap > 0 ? (nextMetrics.workers / nextMetrics.workerCap) * 100 : 0,
        ),
        factory: pushHistoryValue(previous.factory, nextMetrics.factoryPct),
      }));
    }

    function buildNavigationGrid(
      width: number,
      height: number,
      obstacles: ObstacleRect[],
      version: number,
    ): NavigationGrid {
      const cellSize = NAVIGATION_CELL_SIZE;
      const cols = Math.max(1, Math.ceil(width / cellSize));
      const rows = Math.max(1, Math.ceil(height / cellSize));
      const blocked = new Uint8Array(cols * rows);
      const padding = WORKER_RADIUS;

      obstacles.forEach((rect) => {
        const minCol = clamp(Math.floor((rect.left - padding) / cellSize), 0, cols - 1);
        const maxCol = clamp(Math.floor((rect.right + padding) / cellSize), 0, cols - 1);
        const minRow = clamp(Math.floor((rect.top - padding) / cellSize), 0, rows - 1);
        const maxRow = clamp(Math.floor((rect.bottom + padding) / cellSize), 0, rows - 1);

        for (let row = minRow; row <= maxRow; row += 1) {
          for (let col = minCol; col <= maxCol; col += 1) {
            blocked[row * cols + col] = 1;
          }
        }
      });

      return { cellSize, cols, rows, blocked, version };
    }

    function getCellIndex(grid: NavigationGrid, col: number, row: number) {
      return row * grid.cols + col;
    }

    function isCellBlocked(grid: NavigationGrid, col: number, row: number) {
      if (col < 0 || col >= grid.cols || row < 0 || row >= grid.rows) {
        return true;
      }

      return grid.blocked[getCellIndex(grid, col, row)];
    }

    function pointToCell(grid: NavigationGrid, x: number, y: number) {
      return {
        col: clamp(Math.floor(x / grid.cellSize), 0, grid.cols - 1),
        row: clamp(Math.floor(y / grid.cellSize), 0, grid.rows - 1),
      };
    }

    function cellToPoint(grid: NavigationGrid, col: number, row: number): RoutePoint {
      return {
        x: clamp(col * grid.cellSize + grid.cellSize * 0.5, 12, worldRef.current.width - 12),
        y: clamp(row * grid.cellSize + grid.cellSize * 0.5, 12, worldRef.current.height - 12),
      };
    }

    function findNearestOpenCell(grid: NavigationGrid, startCol: number, startRow: number) {
      if (!isCellBlocked(grid, startCol, startRow)) {
        return { col: startCol, row: startRow };
      }

      for (let radius = 1; radius <= Math.max(grid.cols, grid.rows); radius += 1) {
        for (let row = Math.max(0, startRow - radius); row <= Math.min(grid.rows - 1, startRow + radius); row += 1) {
          for (let col = Math.max(0, startCol - radius); col <= Math.min(grid.cols - 1, startCol + radius); col += 1) {
            const onBorder =
              row === startRow - radius ||
              row === startRow + radius ||
              col === startCol - radius ||
              col === startCol + radius;

            if (!onBorder || isCellBlocked(grid, col, row)) {
              continue;
            }

            return { col, row };
          }
        }
      }

      return null;
    }

    function getPathfindingScratch(totalCells: number): PathfindingScratch {
      let scratch = pathfindingScratchRef.current;

      if (!scratch || scratch.gScore.length < totalCells) {
        scratch = {
          gScore: new Float64Array(totalCells),
          fScore: new Float64Array(totalCells),
          cameFrom: new Int32Array(totalCells),
          seen: new Uint32Array(totalCells),
          closed: new Uint32Array(totalCells),
          mark: 0,
        };
        pathfindingScratchRef.current = scratch;
      }

      if (!scratch) {
        throw new Error('Unable to initialize pathfinding scratch buffers.');
      }

      if (scratch.mark >= 0xFFFFFFFE) {
        scratch.seen.fill(0);
        scratch.closed.fill(0);
        scratch.mark = 1;
      } else {
        scratch.mark += 1;
      }

      return scratch;
    }

    function refreshMapLayout(width: number, height: number) {
      const layout = buildFixedMapLayout(width, height);
      const layoutChanged = !layoutsMatch(mapLayoutRef.current, layout);
      const nextCols = Math.max(1, Math.ceil(width / NAVIGATION_CELL_SIZE));
      const nextRows = Math.max(1, Math.ceil(height / NAVIGATION_CELL_SIZE));
      const gridSizeChanged =
        !navigationGridRef.current ||
        navigationGridRef.current.cols !== nextCols ||
        navigationGridRef.current.rows !== nextRows;

      mapLayoutRef.current = layout;
      obstacleRectsRef.current = layout.obstacles;

      if (layoutChanged || gridSizeChanged) {
        navigationVersionRef.current += 1;
        navigationGridRef.current = buildNavigationGrid(
          width,
          height,
          layout.obstacles,
          navigationVersionRef.current,
        );
        pathCacheRef.current.clear();
        backgroundSceneCanvas = null;
      }

      return layout;
    }

    function planPath(startX: number, startY: number, endX: number, endY: number): RoutePoint[] {
      const grid = navigationGridRef.current;
      if (!grid) {
        return [{ x: endX, y: endY }];
      }

      const startCell = pointToCell(grid, startX, startY);
      const goalCell = pointToCell(grid, endX, endY);
      const start = findNearestOpenCell(grid, startCell.col, startCell.row);
      const goal = findNearestOpenCell(grid, goalCell.col, goalCell.row);

      if (!start || !goal) {
        return [{ x: endX, y: endY }];
      }

      const useTrafficAwareRouting = activeWorkerTrafficField !== null;
      const cacheKey = `${grid.version}:${start.col},${start.row}:${goal.col},${goal.row}`;
      if (!useTrafficAwareRouting) {
        const cachedPath = pathCacheRef.current.get(cacheKey);
        if (cachedPath) {
          return [...cachedPath, { x: endX, y: endY }];
        }
      }

      const totalCells = grid.cols * grid.rows;
      const scratch = getPathfindingScratch(totalCells);
      const { gScore, fScore, cameFrom, seen, closed, mark } = scratch;
      const openHeapIndices: number[] = [];
      const openHeapScores: number[] = [];

      function pushOpenCell(index: number, score: number) {
        let cursor = openHeapIndices.length;
        openHeapIndices.push(index);
        openHeapScores.push(score);

        while (cursor > 0) {
          const parent = (cursor - 1) >> 1;
          if (openHeapScores[parent] <= score) {
            break;
          }

          openHeapIndices[cursor] = openHeapIndices[parent];
          openHeapScores[cursor] = openHeapScores[parent];
          cursor = parent;
        }

        openHeapIndices[cursor] = index;
        openHeapScores[cursor] = score;
      }

      function popOpenCell() {
        if (openHeapIndices.length === 0) {
          return null;
        }

        const index = openHeapIndices[0];
        const score = openHeapScores[0];
        const lastIndex = openHeapIndices.pop()!;
        const lastScore = openHeapScores.pop()!;

        if (openHeapIndices.length > 0) {
          let cursor = 0;

          while (true) {
            const left = cursor * 2 + 1;
            if (left >= openHeapIndices.length) {
              break;
            }

            const right = left + 1;
            const child =
              right < openHeapIndices.length && openHeapScores[right] < openHeapScores[left]
                ? right
                : left;

            if (openHeapScores[child] >= lastScore) {
              break;
            }

            openHeapIndices[cursor] = openHeapIndices[child];
            openHeapScores[cursor] = openHeapScores[child];
            cursor = child;
          }

          openHeapIndices[cursor] = lastIndex;
          openHeapScores[cursor] = lastScore;
        }

        return { index, score };
      }

      const startIndex = getCellIndex(grid, start.col, start.row);
      const goalIndex = getCellIndex(grid, goal.col, goal.row);
      gScore[startIndex] = 0;
      fScore[startIndex] = Math.hypot(goal.col - start.col, goal.row - start.row);
      cameFrom[startIndex] = -1;
      seen[startIndex] = mark;
      closed[startIndex] = 0;
      pushOpenCell(startIndex, fScore[startIndex]);

      while (openHeapIndices.length > 0) {
        const currentCell = popOpenCell();
        if (!currentCell) {
          break;
        }

        const currentIndex = currentCell.index;
        if (
          seen[currentIndex] !== mark ||
          closed[currentIndex] === mark ||
          currentCell.score > fScore[currentIndex]
        ) {
          continue;
        }

        if (currentIndex === goalIndex) {
          const pathCells: RoutePoint[] = [];
          let traceIndex = currentIndex;

          while (traceIndex !== -1) {
            const col = traceIndex % grid.cols;
            const row = Math.floor(traceIndex / grid.cols);
            pathCells.push(cellToPoint(grid, col, row));
            traceIndex = cameFrom[traceIndex];
          }

          pathCells.reverse();
          if (pathCells.length > 0) {
            pathCells.shift();
          }

          if (!useTrafficAwareRouting) {
            pathCacheRef.current.set(cacheKey, pathCells);
          }
          return [...pathCells, { x: endX, y: endY }];
        }

        closed[currentIndex] = mark;

        const currentCol = currentIndex % grid.cols;
        const currentRow = Math.floor(currentIndex / grid.cols);

        PATH_NEIGHBOR_STEPS.forEach(({ dc, dr, cost }) => {
          const nextCol = currentCol + dc;
          const nextRow = currentRow + dr;

          if (isCellBlocked(grid, nextCol, nextRow)) {
            return;
          }

          if (
            dc !== 0 &&
            dr !== 0 &&
            (isCellBlocked(grid, currentCol + dc, currentRow) ||
              isCellBlocked(grid, currentCol, currentRow + dr))
          ) {
            return;
          }

          const neighborIndex = getCellIndex(grid, nextCol, nextRow);
          if (closed[neighborIndex] === mark) {
            return;
          }

          const trafficPenalty =
            useTrafficAwareRouting && neighborIndex !== goalIndex
          ? (activeWorkerTrafficField?.[neighborIndex] ?? 0) * 2.8
              : 0;
          const tentativeScore = gScore[currentIndex] + cost + trafficPenalty;

          if (seen[neighborIndex] === mark && tentativeScore >= gScore[neighborIndex]) {
            return;
          }

          cameFrom[neighborIndex] = currentIndex;
          gScore[neighborIndex] = tentativeScore;
          fScore[neighborIndex] =
            tentativeScore + Math.hypot(goal.col - nextCol, goal.row - nextRow);
          seen[neighborIndex] = mark;
          pushOpenCell(neighborIndex, fScore[neighborIndex]);
        });
      }

      return [{ x: endX, y: endY }];
    }

    function ensureWorkerRoute(worker: Worker, target: Structure, approachPoint?: RoutePoint) {
      const routeDestination = approachPoint ?? { x: target.x, y: target.y };
      const routeCellCol = Math.round(routeDestination.x / NAVIGATION_CELL_SIZE);
      const routeCellRow = Math.round(routeDestination.y / NAVIGATION_CELL_SIZE);
      const nextRouteKey = worker.task
        ? `${worker.task.type}:${worker.task.phase}:${worker.task.sourceId}:${worker.task.targetId}:${routeCellCol}:${routeCellRow}`
        : null;
      ensureRoute(worker, nextRouteKey, routeDestination.x, routeDestination.y);
    }

    function ensureRoute(
      worker: Worker,
      routeKey: string | null,
      targetX: number,
      targetY: number,
    ) {
      const currentRouteVersion = navigationVersionRef.current;
      const nextWaypoint = worker.route[worker.routeIndex];
      const navigationGrid = navigationGridRef.current;
      const nextWaypointCell =
        navigationGrid && nextWaypoint
          ? pointToCell(navigationGrid, nextWaypoint.x, nextWaypoint.y)
          : null;
      const shouldRefreshForTraffic =
        activeWorkerTrafficField !== null &&
        navigationGrid !== null &&
        nextWaypointCell !== null &&
        simulationTime - worker.routeRefreshAt > 0.45 &&
        activeWorkerTrafficField[
          getCellIndex(navigationGrid, nextWaypointCell.col, nextWaypointCell.row)
        ] > 0.75;

      if (!routeKey) {
        clearWorkerRoute(worker);
        return;
      }

      if (
        worker.routeKey === routeKey &&
        worker.route.length > 0 &&
        worker.routeVersion === currentRouteVersion &&
        !shouldRefreshForTraffic
      ) {
        return;
      }

      worker.route = planPath(worker.x, worker.y, targetX, targetY);
      worker.routeIndex = 0;
      worker.routeKey = routeKey;
      worker.routeVersion = currentRouteVersion;
      worker.routeRefreshAt = simulationTime;
    }

    function advanceWorkerRoute(worker: Worker, targetX: number, targetY: number) {
      while (worker.routeIndex < worker.route.length - 1) {
        const waypoint = worker.route[worker.routeIndex];
        if (!waypoint || distance(worker.x, worker.y, waypoint.x, waypoint.y) > 18) {
          break;
        }

        worker.routeIndex += 1;
      }

      return worker.route[worker.routeIndex] ?? { x: targetX, y: targetY };
    }

    function chooseIdleTarget(worker: Worker) {
      const structures = worldRef.current.structures;
      if (structures.length === 0) {
        worker.idleTargetId = null;
        return null;
      }

      const minimumTravel = Math.min(worldRef.current.width, worldRef.current.height) * 0.16;
      const candidates = structures.filter((node) => (
        node.id !== worker.idleTargetId &&
        distance(worker.x, worker.y, node.x, node.y) >= minimumTravel
      ));
      const pool = candidates.length > 0
        ? candidates
        : structures.filter((node) => node.id !== worker.idleTargetId);

      const targetPool = pool.length > 0 ? pool : structures;
      const weightedIndex = Math.floor(
        ((Math.sin(worker.wanderSeed + worker.wobble * 0.001) + 1) * 0.5) * targetPool.length,
      );
      const nextTarget = targetPool[clamp(weightedIndex, 0, targetPool.length - 1)];
      worker.idleTargetId = nextTarget?.id ?? null;
      worker.idleTargetTimer = 2.2 + ((Math.cos(worker.wobble * 0.002 + worker.wanderSeed) + 1) * 0.5) * 2.4;
      clearWorkerRoute(worker);
      return nextTarget ?? null;
    }

    function pushPointOutOfObstacles(
      point: { x: number; y: number },
      padding: number,
    ) {
      let moved = false;

      for (let pass = 0; pass < 2; pass += 1) {
        obstacleRectsRef.current.forEach((rect) => {
          const left = rect.left - padding;
          const right = rect.right + padding;
          const top = rect.top - padding;
          const bottom = rect.bottom + padding;

          if (
            point.x <= left ||
            point.x >= right ||
            point.y <= top ||
            point.y >= bottom
          ) {
            return;
          }

          const adjustments = [
            { distance: Math.abs(point.x - left), apply: () => { point.x = left; } },
            { distance: Math.abs(right - point.x), apply: () => { point.x = right; } },
            { distance: Math.abs(point.y - top), apply: () => { point.y = top; } },
            { distance: Math.abs(bottom - point.y), apply: () => { point.y = bottom; } },
          ];

          adjustments.sort((first, second) => first.distance - second.distance);
          adjustments[0]?.apply();
          moved = true;
        });
      }

      return moved;
    }

    function constrainPointToMap(
      point: { x: number; y: number },
      padding: number,
    ) {
      const world = worldRef.current;
      const previousX = point.x;
      const previousY = point.y;
      point.x = clamp(point.x, padding, world.width - padding);
      point.y = clamp(point.y, padding, world.height - padding);
      const movedByObstacle = pushPointOutOfObstacles(point, padding);
      point.x = clamp(point.x, padding, world.width - padding);
      point.y = clamp(point.y, padding, world.height - padding);
      return movedByObstacle || previousX !== point.x || previousY !== point.y;
    }

    function syncWorldToCurrentLayout() {
      const world = worldRef.current;
      if (world.width <= 0 || world.height <= 0) {
        return;
      }

      const previousNavigationVersion = navigationVersionRef.current;
      refreshMapLayout(world.width, world.height);

      if (navigationVersionRef.current === previousNavigationVersion) {
        return;
      }

      backgroundSceneCanvas = null;
      world.structures.forEach((node) => {
        constrainPointToMap(node, STRUCTURE_PADDING);
      });

      world.workers.forEach((worker) => {
        if (constrainPointToMap(worker, WORKER_RADIUS)) {
          worker.vx *= 0.72;
          worker.vy *= 0.72;
        }
      });

      clearAllWorkerRoutes();
      publishMetrics(world);
    }

    function applyObstacleAvoidance(worker: Worker, dt: number) {
      obstacleRectsRef.current.forEach((rect) => {
        const left = rect.left - WORKER_RADIUS;
        const right = rect.right + WORKER_RADIUS;
        const top = rect.top - WORKER_RADIUS;
        const bottom = rect.bottom + WORKER_RADIUS;
        const nearestX = clamp(worker.x, left, right);
        const nearestY = clamp(worker.y, top, bottom);
        const dx = worker.x - nearestX;
        const dy = worker.y - nearestY;
        const dist = Math.hypot(dx, dy);

        if (dist > OBSTACLE_REPULSION_RANGE) {
          return;
        }

        const safeDist = dist || 0.001;
        const force = (OBSTACLE_REPULSION_RANGE - safeDist) / OBSTACLE_REPULSION_RANGE;
        worker.vx += (dx / safeDist) * force * 220 * dt;
        worker.vy += (dy / safeDist) * force * 220 * dt;
      });
    }

    function clipToMap() {
      clipContextToMap(ctx);
    }

    function clipContextToMap(targetCtx: CanvasRenderingContext2D) {
      const world = worldRef.current;
      targetCtx.beginPath();
      targetCtx.rect(0, 0, world.width, world.height);
      obstacleRectsRef.current.forEach((rect) => {
        targetCtx.rect(rect.left, rect.top, rect.width, rect.height);
      });
      targetCtx.clip('evenodd');
    }

    function nextId() {
      const id = worldRef.current.nextId;
      worldRef.current.nextId += 1;
      return id;
    }

    function refreshStructureIndex() {
      structureIndexRef.current = createStructureIndex(worldRef.current.structures);
    }

    function getNodes<T extends StructureKind>(kind: T): StructureCollections[T] {
      return structureIndexRef.current.byKind[kind];
    }

    function findNode(id: number) {
      return structureIndexRef.current.byId.get(id);
    }

    function addRipple(x: number, y: number, color: string) {
      worldRef.current.ripples.push({ x, y, life: 1, color });
    }

    function createStructure(
      kind: StructureKind,
      x: number,
      y: number,
      placedByUser: boolean,
    ): Structure {
      const base = {
        id: nextId(),
        kind,
        x,
        y,
        size: kind === 'coal' || kind === 'factory' ? 18 : 16,
        placedByUser,
        pulse: 0,
      };

      if (kind === 'coal') {
        return {
          ...base,
          kind,
          stock: 999,
        };
      }

      if (kind === 'generator') {
        return {
          ...base,
          kind,
          fuel: 58,
          outputCells: 1,
          production: 0.4,
        };
      }

      if (kind === 'battery') {
        return {
          ...base,
          kind,
          charge: 3,
          capacity: 8,
        };
      }

      if (kind === 'factory') {
        return {
          ...base,
          kind,
          charge: 36,
          buildProgress: 18,
        };
      }

      return {
        ...base,
        kind,
        energy: 56,
      };
    }

    function spawnWorkerNearFactory(factory: FactoryNode) {
      const angle = Math.random() * Math.PI * 2;
      const distanceFromFactory = 28 + Math.random() * 18;
      const worker = createWorker(
        nextId(),
        factory.x + Math.cos(angle) * distanceFromFactory,
        factory.y + Math.sin(angle) * distanceFromFactory,
      );
      constrainPointToMap(worker, WORKER_RADIUS);
      worldRef.current.workers.push(worker);
      addRipple(factory.x, factory.y, COLORS.green);
    }

    function triggerWorkerMalfunction(worker: Worker) {
      if (worker.malfunctionTimer > 0) {
        return;
      }

      worker.malfunctionTimer = 2.8 + Math.random() * 3.4;
      worker.task = null;
      worker.carrying = null;
      clearWorkerRoute(worker);
      addRipple(worker.x, worker.y, COLORS.danger);
    }

    function spawnExplosion(x: number, y: number, palette?: string[]) {
      const colors = palette && palette.length > 0
        ? palette
        : [COLORS.lime, COLORS.green, COLORS.ink];
      for (let index = 0; index < 10; index += 1) {
        const angle = (index / 10) * Math.PI * 2 + Math.random() * 0.4;
        const speed = 42 + Math.random() * 52;
        worldRef.current.particles.push({
          x,
          y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          life: 1,
          size: 2 + Math.random() * 2.2,
          color: colors[index % colors.length],
        });
      }
    }

    function removeWorkerWithBurst(worker: Worker) {
      addRipple(worker.x, worker.y, COLORS.danger);
      addRipple(worker.x + 4, worker.y - 4, COLORS.dangerLight);
      addRipple(worker.x - 4, worker.y + 4, COLORS.dangerDark);
      spawnExplosion(worker.x, worker.y, ['#FFB347', COLORS.dangerLight, COLORS.danger, COLORS.dangerDark]);
    }

    function getDefaultLanes(width: number, height: number) {
      const layout = refreshMapLayout(width, height);
      return {
        leftLaneX: layout.leftLaneX,
        rightLaneX: layout.rightLaneX,
        centerLaneX: layout.centerLaneX,
        yPositions: layout.hallwayY,
        panelRects: layout.panelRects,
      };
    }

    function buildInitialStructures(
      lanes: ReturnType<typeof getDefaultLanes>,
      width: number,
      height: number,
    ) {
      const hallwayY = lanes.yPositions.length > 0
        ? lanes.yPositions
        : [clamp(height * 0.5, 96, height - 96)];
      const topHallwayOffset = -18;
      const bottomHallwayOffset = 30;

      if (hallwayY.length >= 2) {
        const topHallway = hallwayY[0];
        const bottomHallway = hallwayY[hallwayY.length - 1];
        const placements: Array<{ kind: StructureKind; x: number; y: number }> = [
          {
            kind: 'coal',
            x: clamp(lanes.leftLaneX, STRUCTURE_PADDING, width - STRUCTURE_PADDING),
            y: clamp(topHallway + topHallwayOffset, STRUCTURE_PADDING, height - STRUCTURE_PADDING),
          },
          {
            kind: 'generator',
            x: clamp(lanes.rightLaneX, STRUCTURE_PADDING, width - STRUCTURE_PADDING),
            y: clamp(topHallway + topHallwayOffset, STRUCTURE_PADDING, height - STRUCTURE_PADDING),
          },
          {
            kind: 'battery',
            x: clamp(lanes.leftLaneX, STRUCTURE_PADDING, width - STRUCTURE_PADDING),
            y: clamp(bottomHallway + bottomHallwayOffset, STRUCTURE_PADDING, height - STRUCTURE_PADDING),
          },
          {
            kind: 'lab',
            x: clamp(lanes.rightLaneX, STRUCTURE_PADDING, width - STRUCTURE_PADDING),
            y: clamp(bottomHallway + bottomHallwayOffset, STRUCTURE_PADDING, height - STRUCTURE_PADDING),
          },
          {
            kind: 'factory',
            x: clamp(lanes.centerLaneX, STRUCTURE_PADDING, width - STRUCTURE_PADDING),
            y: clamp(topHallway + topHallwayOffset, STRUCTURE_PADDING, height - STRUCTURE_PADDING),
          },
          {
            kind: 'factory',
            x: clamp(lanes.centerLaneX, STRUCTURE_PADDING, width - STRUCTURE_PADDING),
            y: clamp(bottomHallway + bottomHallwayOffset, STRUCTURE_PADDING, height - STRUCTURE_PADDING),
          },
        ];

        return placements.map(({ kind, x, y }) => createStructure(kind, x, y, false));
      }

      if (hallwayY.length === 1) {
        const centerOffset = clamp(
          (lanes.rightLaneX - lanes.leftLaneX) * 0.18,
          60,
          110,
        );
        const placements: Array<{ kind: StructureKind; x: number; y: number }> = [
          { kind: 'coal', x: lanes.leftLaneX, y: hallwayY[0] },
          {
            kind: 'generator',
            x: clamp(lanes.centerLaneX - centerOffset, STRUCTURE_PADDING, width - STRUCTURE_PADDING),
            y: hallwayY[0],
          },
          {
            kind: 'battery',
            x: clamp(lanes.centerLaneX + centerOffset, STRUCTURE_PADDING, width - STRUCTURE_PADDING),
            y: hallwayY[0],
          },
          { kind: 'lab', x: lanes.rightLaneX, y: hallwayY[0] },
          { kind: 'factory', x: lanes.centerLaneX, y: clamp(height * 0.25, 96, height - 96) },
        ];

        return placements.map(({ kind, x, y }) => createStructure(kind, x, y, false));
      }

      if (hallwayY.length === 2) {
        const placements: Array<{ kind: StructureKind; x: number; y: number }> = [
          { kind: 'coal', x: lanes.leftLaneX, y: hallwayY[0] },
          { kind: 'generator', x: lanes.rightLaneX, y: hallwayY[0] },
          { kind: 'battery', x: lanes.leftLaneX, y: hallwayY[1] },
          { kind: 'lab', x: lanes.rightLaneX, y: hallwayY[1] },
          { kind: 'factory', x: lanes.centerLaneX, y: clamp((hallwayY[0] + hallwayY[1]) * 0.5, 96, height - 96) },
        ];

        return placements.map(({ kind, x, y }) => createStructure(kind, x, y, false));
      }

      const placements: Array<{ kind: StructureKind; x: number; y: number }> = [
        { kind: 'coal', x: lanes.leftLaneX, y: hallwayY[0] },
        { kind: 'generator', x: lanes.rightLaneX, y: hallwayY[0] },
        { kind: 'coal', x: lanes.rightLaneX, y: hallwayY[1] },
        { kind: 'generator', x: lanes.leftLaneX, y: hallwayY[1] },
        { kind: 'battery', x: lanes.leftLaneX, y: hallwayY[2] },
        { kind: 'lab', x: lanes.rightLaneX, y: hallwayY[2] },
        { kind: 'factory', x: lanes.centerLaneX, y: hallwayY[1] },
      ];

      if (hallwayY[3] !== undefined) {
        placements.push(
          { kind: 'battery', x: lanes.rightLaneX, y: hallwayY[3] },
          { kind: 'lab', x: lanes.leftLaneX, y: hallwayY[3] },
        );
      }

      return placements.map(({ kind, x, y }) => createStructure(kind, x, y, false));
    }

    function resetWorld(keepSize = true) {
      const world = worldRef.current;
      const width = keepSize ? world.width : window.innerWidth;
      const height = keepSize ? world.height : window.innerHeight;
      const lanes = getDefaultLanes(width, height);
      const hallwayY = lanes.yPositions.length > 0
        ? lanes.yPositions
        : [clamp(height * 0.5, 96, height - 96)];

      world.nextId = 1;
      world.width = width;
      world.height = height;
      world.structures = buildInitialStructures(lanes, width, height);
      world.workers = [];
      world.ripples = [];
      world.particles = [];
      refreshStructureIndex();
      backgroundSceneCanvas = null;
      gridCacheCanvas = null;

      world.structures.forEach((node) => {
        constrainPointToMap(node, STRUCTURE_PADDING);
      });

      const workerAnchors = world.structures.map((node) => ({
        x: node.x,
        y: node.y,
      }));

      if (hallwayY.length > 1) {
        workerAnchors.push({
          x: lanes.centerLaneX,
          y: clamp((hallwayY[0] + hallwayY[hallwayY.length - 1]) * 0.5, 96, height - 96),
        });
      }

      const workersPerAnchor = 12;
      const workerCount = workerAnchors.length * workersPerAnchor;
      for (let index = 0; index < workerCount; index += 1) {
        const anchor = workerAnchors[index % workerAnchors.length];
        const angle = (Math.floor(index / workerAnchors.length) / workersPerAnchor) * Math.PI * 2;
        world.workers.push(
          createWorker(
            nextId(),
            anchor.x + Math.cos(angle) * 48,
            anchor.y + Math.sin(angle) * 36,
          ),
        );
      }

      world.workers.forEach((worker) => {
        constrainPointToMap(worker, WORKER_RADIUS);
      });

      publishMetrics(world);
    }

    function resizeWorld() {
      const world = worldRef.current;
      const previousWidth = world.width || window.innerWidth;
      const previousHeight = world.height || window.innerHeight;
      const nextWidth = window.innerWidth;
      const nextHeight = window.innerHeight;

      world.width = nextWidth;
      world.height = nextHeight;

      canvas.width = Math.floor(nextWidth * dpr);
      canvas.height = Math.floor(nextHeight * dpr);
      canvas.style.width = `${nextWidth}px`;
      canvas.style.height = `${nextHeight}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.imageSmoothingEnabled = false;
      backgroundSceneCanvas = null;
      gridCacheCanvas = null;
      refreshMapLayout(nextWidth, nextHeight);

      if (world.structures.length === 0) {
        resetWorld(true);
        return;
      }

      const scaleX = nextWidth / previousWidth;
      const scaleY = nextHeight / previousHeight;

      world.structures.forEach((node) => {
        node.x = clamp(node.x * scaleX, 36, nextWidth - 36);
        node.y = clamp(node.y * scaleY, 36, nextHeight - 36);
      });

      world.workers.forEach((worker) => {
        worker.x = clamp(worker.x * scaleX, 18, nextWidth - 18);
        worker.y = clamp(worker.y * scaleY, 18, nextHeight - 18);
      });

      world.ripples.forEach((ripple) => {
        ripple.x *= scaleX;
        ripple.y *= scaleY;
      });

      world.particles.forEach((particle) => {
        particle.x *= scaleX;
        particle.y *= scaleY;
        particle.vx *= scaleX;
        particle.vy *= scaleY;
      });

      world.structures.forEach((node) => {
        constrainPointToMap(node, STRUCTURE_PADDING);
      });
      world.workers.forEach((worker) => {
        constrainPointToMap(worker, WORKER_RADIUS);
      });
      clearAllWorkerRoutes();
      publishMetrics(world);
    }

    function getClaimCounts() {
      const claims = createClaimCounts();

      worldRef.current.workers.forEach((worker) => {
        if (!worker.task) {
          return;
        }

        applyTaskClaimDelta(claims, worker.task, 1);
      });

      return claims;
    }

    function getTaskPriorityProfile(
      world: World,
      generators: GeneratorNode[],
      batteries: BatteryNode[],
      labs: LabNode[],
      factories: FactoryNode[],
      desiredWorkers: number,
    ) {
      const totalFuel = generators.reduce((sum, node) => sum + node.fuel, 0);
      const totalCells =
        generators.reduce((sum, node) => sum + node.outputCells, 0) +
        batteries.reduce((sum, node) => sum + node.charge, 0);
      const totalLabEnergy = labs.reduce((sum, node) => sum + node.energy, 0);
      const totalFactoryCharge = factories.reduce((sum, node) => sum + node.charge, 0);
      const averageFuel = generators.length > 0 ? totalFuel / generators.length : 0;
      const totalCellCapacity =
        generators.length * MAX_GENERATOR_OUTPUT +
        batteries.reduce((sum, node) => sum + node.capacity, 0);
      const cellsPct = totalCellCapacity > 0 ? (totalCells / totalCellCapacity) * 100 : 0;
      const averageLabEnergy = labs.length > 0 ? totalLabEnergy / labs.length : 0;
      const averageFactoryCharge = factories.length > 0 ? totalFactoryCharge / factories.length : 0;
      const crewNeed = clamp(
        (desiredWorkers - world.workers.length) / Math.max(1, desiredWorkers),
        0,
        1,
      );
      const fuelNeed = clamp((66 - averageFuel) / 66, 0, 1);
      const cellNeed = clamp((58 - cellsPct) / 58, 0, 1);
      const labNeed = clamp((72 - averageLabEnergy) / 72, 0, 1);
      const factoryNeed = clamp(
        crewNeed * 0.6 + clamp((65 - averageFactoryCharge) / 65, 0, 1) * 0.4,
        0,
        1,
      );
      const weights: Record<TaskType, number> = {
        'fuel-generator': 0.9 + fuelNeed * 1.4,
        'charge-battery': 0.9 + cellNeed * 1.3,
        'power-lab': 0.9 + labNeed * 1.35,
        'power-factory': 0.85 + factoryNeed * 1.45,
      };

      if (currentStrategy.key === 'fuel') {
        weights['fuel-generator'] *= 2.25;
        weights['charge-battery'] *= 0.94;
        weights['power-lab'] *= 0.72;
        weights['power-factory'] *= 1.35;
      } else if (currentStrategy.key === 'cells') {
        weights['charge-battery'] *= 2.05;
        weights['fuel-generator'] *= 1.2;
        weights['power-lab'] *= 0.84;
        weights['power-factory'] *= 0.92;
      } else if (currentStrategy.key === 'labs') {
        weights['power-lab'] *= 2.1;
        weights['charge-battery'] *= 1.18;
        weights['power-factory'] *= 0.92;
      } else if (currentStrategy.key === 'factory') {
        weights['power-factory'] *= 2.2;
        weights['power-lab'] *= 0.84;
        weights['fuel-generator'] *= 1.08;
      } else if (currentStrategy.key === 'crew') {
        weights['power-factory'] *= 1.95;
        weights['fuel-generator'] *= 1.28;
        weights['charge-battery'] *= 0.95;
        weights['power-lab'] *= 0.82;
      }

      return {
        desiredWorkers,
        status: currentStrategy.label,
        weights,
      };
    }

    function buildStructureCrowdingMap(workers: Worker[], structures: Structure[]) {
      const crowding = new Map<number, number>();

      workers.forEach((worker) => {
        let nearest: Structure | null = null;
        let nearestDistance = Number.POSITIVE_INFINITY;

        structures.forEach((node) => {
          const nodeDistance = distance(worker.x, worker.y, node.x, node.y);
          if (nodeDistance > node.size + 68 || nodeDistance >= nearestDistance) {
            return;
          }

          nearest = node;
          nearestDistance = nodeDistance;
        });

        if (!nearest) {
          return;
        }

        const nearestNode = nearest as Structure;
        crowding.set(nearestNode.id, (crowding.get(nearestNode.id) || 0) + 1);
      });

      return crowding;
    }

    function getStructureCrowdingPenalty(
      structureId: number,
      crowding: Map<number, number>,
      incomingClaims = 0,
    ) {
      const load = (crowding.get(structureId) || 0) + incomingClaims;
      if (load <= 2) {
        return 0;
      }

      const excess = load - 2;
      return excess * excess * 22 + load * 7;
    }

    function assignTask(
      worker: Worker,
      claims: ClaimCounts,
      structureCrowding: Map<number, number>,
    ) {
      const world = worldRef.current;
      const coalPatches = getNodes('coal') as CoalPatch[];
      const generators = getNodes('generator') as GeneratorNode[];
      const batteries = getNodes('battery') as BatteryNode[];
      const labs = getNodes('lab') as LabNode[];
      const factories = getNodes('factory') as FactoryNode[];
      const desiredWorkers = currentStrategy.desiredWorkers;
      const priority = getTaskPriorityProfile(
        world,
        generators,
        batteries,
        labs,
        factories,
        desiredWorkers,
      );

      let chosen: { score: number; task: Task } | null = null;

      generators.forEach((generator) => {
        const pendingFuel = claims.toGenerator.get(generator.id) || 0;
        const openFuelSlots = Math.max(0, Math.ceil((82 - generator.fuel) / 24) - pendingFuel);
        if (openFuelSlots <= 0 || coalPatches.length === 0) {
          return;
        }

        const source = coalPatches.reduce((best, node) => {
          if (!best) {
            return node;
          }
          return distance(worker.x, worker.y, node.x, node.y) <
            distance(worker.x, worker.y, best.x, best.y)
            ? node
            : best;
        }, coalPatches[0]);

        const urgency = (100 - generator.fuel) / 100;
        const travelPenalty =
          distance(worker.x, worker.y, source.x, source.y) * 0.35 +
          distance(source.x, source.y, generator.x, generator.y) * 0.45;
        const sourceCrowdingPenalty =
          getStructureCrowdingPenalty(source.id, structureCrowding) * 0.42;
        const targetCrowdingPenalty =
          getStructureCrowdingPenalty(generator.id, structureCrowding, pendingFuel);
        const score =
          urgency * 260 * priority.weights['fuel-generator'] -
          travelPenalty -
          sourceCrowdingPenalty -
          targetCrowdingPenalty;

        if (!chosen || score > chosen.score) {
          chosen = {
            score,
            task: {
              type: 'fuel-generator',
              sourceId: source.id,
              targetId: generator.id,
              phase: 'pickup',
            },
          };
        }
      });

      generators.forEach((generator) => {
        const availableCells = generator.outputCells - (claims.fromGenerator.get(generator.id) || 0);
        if (availableCells <= 0 || batteries.length === 0) {
          return;
        }

        batteries.forEach((battery) => {
          const freeSlots = battery.capacity - battery.charge - (claims.toBattery.get(battery.id) || 0);
          if (freeSlots <= 0) {
            return;
          }

          const urgency = (battery.capacity - battery.charge) / battery.capacity;
          const travelPenalty =
            distance(worker.x, worker.y, generator.x, generator.y) * 0.35 +
            distance(generator.x, generator.y, battery.x, battery.y) * 0.45;
          const sourceCrowdingPenalty =
            getStructureCrowdingPenalty(generator.id, structureCrowding, claims.fromGenerator.get(generator.id) || 0) * 0.5;
          const targetCrowdingPenalty =
            getStructureCrowdingPenalty(battery.id, structureCrowding, claims.toBattery.get(battery.id) || 0);
          const score =
            urgency * 200 * priority.weights['charge-battery'] -
            travelPenalty -
            sourceCrowdingPenalty -
            targetCrowdingPenalty;

          if (!chosen || score > chosen.score) {
            chosen = {
              score,
              task: {
                type: 'charge-battery',
                sourceId: generator.id,
                targetId: battery.id,
                phase: 'pickup',
              },
            };
          }
        });
      });

      batteries.forEach((battery) => {
        const availableCells = battery.charge - (claims.fromBattery.get(battery.id) || 0);
        if (availableCells <= 0 || labs.length === 0) {
          return;
        }

        labs.forEach((lab) => {
          const demandSlots = Math.max(0, Math.ceil((96 - lab.energy) / 26) - (claims.toLab.get(lab.id) || 0));
          if (demandSlots <= 0) {
            return;
          }

          const urgency = (100 - lab.energy) / 100;
          const travelPenalty =
            distance(worker.x, worker.y, battery.x, battery.y) * 0.35 +
            distance(battery.x, battery.y, lab.x, lab.y) * 0.45;
          const sourceCrowdingPenalty =
            getStructureCrowdingPenalty(battery.id, structureCrowding, claims.fromBattery.get(battery.id) || 0) * 0.52;
          const targetCrowdingPenalty =
            getStructureCrowdingPenalty(lab.id, structureCrowding, claims.toLab.get(lab.id) || 0);
          const score =
            urgency * 240 * priority.weights['power-lab'] -
            travelPenalty -
            sourceCrowdingPenalty -
            targetCrowdingPenalty;

          if (!chosen || score > chosen.score) {
            chosen = {
              score,
              task: {
                type: 'power-lab',
                sourceId: battery.id,
                targetId: lab.id,
                phase: 'pickup',
              },
            };
          }
        });
      });

      batteries.forEach((battery) => {
        const availableCells = battery.charge - (claims.fromBattery.get(battery.id) || 0);
        if (
          availableCells <= 0 ||
          factories.length === 0 ||
          world.workers.length >= priority.desiredWorkers + 6
        ) {
          return;
        }

        factories.forEach((factory) => {
          const incomingPower = claims.toFactory.get(factory.id) || 0;
          const demandSlots = Math.max(0, Math.ceil((88 - factory.charge) / FACTORY_CHARGE_PER_CELL) - incomingPower);
          if (demandSlots <= 0) {
            return;
          }

          const workerDemand = clamp(
            (priority.desiredWorkers - world.workers.length) / priority.desiredWorkers,
            0,
            1,
          );
          const urgency = workerDemand * 0.75 + ((100 - factory.charge) / 100) * 0.25;
          const travelPenalty =
            distance(worker.x, worker.y, battery.x, battery.y) * 0.35 +
            distance(battery.x, battery.y, factory.x, factory.y) * 0.45;
          const sourceCrowdingPenalty =
            getStructureCrowdingPenalty(battery.id, structureCrowding, claims.fromBattery.get(battery.id) || 0) * 0.5;
          const targetCrowdingPenalty =
            getStructureCrowdingPenalty(factory.id, structureCrowding, incomingPower);
          const score =
            urgency * 215 * priority.weights['power-factory'] -
            travelPenalty -
            sourceCrowdingPenalty -
            targetCrowdingPenalty;

          if (!chosen || score > chosen.score) {
            chosen = {
              score,
              task: {
                type: 'power-factory',
                sourceId: battery.id,
                targetId: factory.id,
                phase: 'pickup',
              },
            };
          }
        });
      });

      const selectedTask = (chosen as { score: number; task: Task } | null)?.task ?? null;
      worker.task = selectedTask;
      if (selectedTask) {
        applyTaskClaimDelta(claims, selectedTask, 1);
      }
      clearWorkerRoute(worker);
    }

    function steerTo(worker: Worker, targetX: number, targetY: number, speed: number, dt: number) {
      const dx = targetX - worker.x;
      const dy = targetY - worker.y;
      const length = Math.hypot(dx, dy) || 1;
      const desiredX = (dx / length) * speed;
      const desiredY = (dy / length) * speed;

      worker.vx += (desiredX - worker.vx) * Math.min(1, dt * 2.4);
      worker.vy += (desiredY - worker.vy) * Math.min(1, dt * 2.4);
    }

    function getWorkerSpatialCellKey(col: number, row: number) {
      return `${col},${row}`;
    }

    function buildWorkerSpatialGrid(workers: Worker[]): WorkerSpatialGrid {
      const cells = new Map<string, Set<number>>();
      const cols = new Array<number>(workers.length);
      const rows = new Array<number>(workers.length);

      for (let index = 0; index < workers.length; index += 1) {
        const worker = workers[index];
        const col = Math.floor(worker.x / FLOCKING_CELL_SIZE);
        const row = Math.floor(worker.y / FLOCKING_CELL_SIZE);
        const key = getWorkerSpatialCellKey(col, row);
        let bucket = cells.get(key);

        if (!bucket) {
          bucket = new Set<number>();
          cells.set(key, bucket);
        }

        bucket.add(index);
        cols[index] = col;
        rows[index] = row;
      }

      return { cells, cols, rows };
    }

    function updateWorkerSpatialGridPosition(
      grid: WorkerSpatialGrid,
      workerIndex: number,
      worker: Worker,
    ) {
      const nextCol = Math.floor(worker.x / FLOCKING_CELL_SIZE);
      const nextRow = Math.floor(worker.y / FLOCKING_CELL_SIZE);
      const previousCol = grid.cols[workerIndex];
      const previousRow = grid.rows[workerIndex];

      if (nextCol === previousCol && nextRow === previousRow) {
        return;
      }

      const previousKey = getWorkerSpatialCellKey(previousCol, previousRow);
      const previousBucket = grid.cells.get(previousKey);
      previousBucket?.delete(workerIndex);
      if (previousBucket && previousBucket.size === 0) {
        grid.cells.delete(previousKey);
      }

      const nextKey = getWorkerSpatialCellKey(nextCol, nextRow);
      let nextBucket = grid.cells.get(nextKey);
      if (!nextBucket) {
        nextBucket = new Set<number>();
        grid.cells.set(nextKey, nextBucket);
      }

      nextBucket.add(workerIndex);
      grid.cols[workerIndex] = nextCol;
      grid.rows[workerIndex] = nextRow;
    }

    function buildWorkerTrafficField(workers: Worker[]): Float32Array | null {
      const grid = navigationGridRef.current;
      if (!grid) {
        return null;
      }

      const field = new Float32Array(grid.cols * grid.rows);

      for (let index = 0; index < workers.length; index += 1) {
        const worker = workers[index];
        const { col, row } = pointToCell(grid, worker.x, worker.y);

        for (let dr = -1; dr <= 1; dr += 1) {
          for (let dc = -1; dc <= 1; dc += 1) {
            const nextCol = col + dc;
            const nextRow = row + dr;
            if (isCellBlocked(grid, nextCol, nextRow)) {
              continue;
            }

            const distanceWeight = dc === 0 && dr === 0 ? 1.35 : 0.55;
            field[getCellIndex(grid, nextCol, nextRow)] += distanceWeight;
          }
        }
      }

      return field;
    }

    function resolveWorkerCrowding(
      workers: Worker[],
      deadWorkerIds: Set<number>,
      passes = 3,
    ) {
      for (let pass = 0; pass < passes; pass += 1) {
        const workerSpatialGrid = buildWorkerSpatialGrid(workers);

        for (let workerIndex = 0; workerIndex < workers.length; workerIndex += 1) {
          const worker = workers[workerIndex];
          if (deadWorkerIds.has(worker.id)) {
            continue;
          }

          const workerCol = workerSpatialGrid.cols[workerIndex];
          const workerRow = workerSpatialGrid.rows[workerIndex];

          for (let row = workerRow - 1; row <= workerRow + 1; row += 1) {
            for (let col = workerCol - 1; col <= workerCol + 1; col += 1) {
              const bucket = workerSpatialGrid.cells.get(getWorkerSpatialCellKey(col, row));
              if (!bucket) {
                continue;
              }

              bucket.forEach((otherIndex) => {
                if (otherIndex <= workerIndex) {
                  return;
                }

                const other = workers[otherIndex];
                if (deadWorkerIds.has(other.id)) {
                  return;
                }

                const dx = other.x - worker.x;
                const dy = other.y - worker.y;
                const dist = Math.hypot(dx, dy);

                if (dist >= WORKER_MIN_SEPARATION) {
                  return;
                }

                const safeDist = dist || 0.001;
                const overlap = WORKER_MIN_SEPARATION - safeDist;
                const nx = dx / safeDist;
                const ny = dy / safeDist;
                const pushX = nx * overlap * 0.5;
                const pushY = ny * overlap * 0.5;

                worker.x -= pushX;
                worker.y -= pushY;
                other.x += pushX;
                other.y += pushY;

                worker.vx -= nx * overlap * 2.4;
                worker.vy -= ny * overlap * 2.4;
                other.vx += nx * overlap * 2.4;
                other.vy += ny * overlap * 2.4;

                constrainPointToMap(worker, WORKER_RADIUS);
                constrainPointToMap(other, WORKER_RADIUS);
              });
            }
          }
        }
      }
    }

    function applyFlocking(
      worker: Worker,
      dt: number,
      workerSpatialGrid: WorkerSpatialGrid,
      workerIndex: number,
    ) {
      const world = worldRef.current;
      let separationX = 0;
      let separationY = 0;
      let alignmentX = 0;
      let alignmentY = 0;
      let cohesionX = 0;
      let cohesionY = 0;
      let neighbors = 0;
      const stride = performanceProfile.flockingNeighborStride;
      const strideOffset = worker.id % stride;
      const candidateIndices: number[] = [];
      const workerCol = workerSpatialGrid.cols[workerIndex];
      const workerRow = workerSpatialGrid.rows[workerIndex];

      for (let row = workerRow - 1; row <= workerRow + 1; row += 1) {
        for (let col = workerCol - 1; col <= workerCol + 1; col += 1) {
          const bucket = workerSpatialGrid.cells.get(getWorkerSpatialCellKey(col, row));
          if (!bucket) {
            continue;
          }

          bucket.forEach((index) => {
            candidateIndices.push(index);
          });
        }
      }

      candidateIndices.sort((first, second) => first - second);

      for (let candidateIndex = 0; candidateIndex < candidateIndices.length; candidateIndex += 1) {
        const index = candidateIndices[candidateIndex];
        const other = world.workers[index];
        if (other.id === worker.id) {
          continue;
        }

        if (stride > 1 && index % stride !== strideOffset) {
          continue;
        }

        const dx = worker.x - other.x;
        const dy = worker.y - other.y;
        const dist = Math.hypot(dx, dy);

        if (dist <= 0 || dist > FLOCKING_RADIUS) {
          continue;
        }

        neighbors += 1;
        const distanceWeight = 1 - dist / FLOCKING_RADIUS;
        separationX += (dx / dist) * (0.8 + distanceWeight * 1.6);
        separationY += (dy / dist) * (0.8 + distanceWeight * 1.6);
        alignmentX += other.vx;
        alignmentY += other.vy;
        cohesionX += other.x;
        cohesionY += other.y;
        if (neighbors >= performanceProfile.maxFlockingNeighbors) {
          break;
        }
      }

      if (neighbors > 0) {
        alignmentX /= neighbors;
        alignmentY /= neighbors;
        cohesionX = cohesionX / neighbors - worker.x;
        cohesionY = cohesionY / neighbors - worker.y;

        worker.vx += separationX * 0.85 * dt;
        worker.vy += separationY * 0.85 * dt;
        worker.vx += (alignmentX - worker.vx) * 0.18 * dt;
        worker.vy += (alignmentY - worker.vy) * 0.18 * dt;
        worker.vx += cohesionX * 0.012 * dt;
        worker.vy += cohesionY * 0.012 * dt;
      }
    }

    function applyLocalWorkerAvoidance(
      worker: Worker,
      dt: number,
      workerSpatialGrid: WorkerSpatialGrid,
      workerIndex: number,
    ) {
      const world = worldRef.current;
      const workerCol = workerSpatialGrid.cols[workerIndex];
      const workerRow = workerSpatialGrid.rows[workerIndex];
      let avoidX = 0;
      let avoidY = 0;
      let neighborsChecked = 0;

      const projectedWorkerX = worker.x + worker.vx * LOCAL_AVOIDANCE_LOOKAHEAD;
      const projectedWorkerY = worker.y + worker.vy * LOCAL_AVOIDANCE_LOOKAHEAD;
      const minGap = WORKER_MIN_SEPARATION + 2;

      for (let row = workerRow - 1; row <= workerRow + 1; row += 1) {
        for (let col = workerCol - 1; col <= workerCol + 1; col += 1) {
          const bucket = workerSpatialGrid.cells.get(getWorkerSpatialCellKey(col, row));
          if (!bucket) {
            continue;
          }

          bucket.forEach((index) => {
            if (index === workerIndex || neighborsChecked >= LOCAL_AVOIDANCE_MAX_NEIGHBORS) {
              return;
            }

            const other = world.workers[index];
            const projectedOtherX = other.x + other.vx * LOCAL_AVOIDANCE_LOOKAHEAD;
            const projectedOtherY = other.y + other.vy * LOCAL_AVOIDANCE_LOOKAHEAD;
            let dx = projectedWorkerX - projectedOtherX;
            let dy = projectedWorkerY - projectedOtherY;
            let dist = Math.hypot(dx, dy);
            if (dist <= 0.0001) {
              // Deterministic fallback avoids unstable jitter at identical positions.
              const fallbackAngle = (worker.id - other.id) * 2.399963229728653;
              dx = Math.cos(fallbackAngle);
              dy = Math.sin(fallbackAngle);
              dist = 1;
            }

            if (dist > LOCAL_AVOIDANCE_RADIUS) {
              return;
            }

            neighborsChecked += 1;
            const closeness = 1 - dist / LOCAL_AVOIDANCE_RADIUS;
            const closeness2 = closeness * closeness;
            const nx = dx / dist;
            const ny = dy / dist;
            const side = worker.id < other.id ? 1 : -1;

            avoidX += nx * (130 * closeness2);
            avoidY += ny * (130 * closeness2);

            if (dist < minGap) {
              const overlap = minGap - dist;
              avoidX += nx * overlap * 36;
              avoidY += ny * overlap * 36;
            }

            // Side-slip term reduces head-on deadlocks when paths intersect.
            avoidX += -ny * side * (18 * closeness2);
            avoidY += nx * side * (18 * closeness2);
          });

          if (neighborsChecked >= LOCAL_AVOIDANCE_MAX_NEIGHBORS) {
            break;
          }
        }

        if (neighborsChecked >= LOCAL_AVOIDANCE_MAX_NEIGHBORS) {
          break;
        }
      }

      if (neighborsChecked === 0) {
        return;
      }

      const force = Math.hypot(avoidX, avoidY);
      if (force > 0) {
        const maxForce = 210;
        const scale = force > maxForce ? maxForce / force : 1;
        worker.vx += avoidX * scale * dt;
        worker.vy += avoidY * scale * dt;
      }
    }

    function getTaskApproachPoint(worker: Worker, target: Structure): RoutePoint {
      const world = worldRef.current;
      const phaseOffset = worker.task?.phase === 'deliver' ? Math.PI * 0.37 : 0;
      const angle = worker.id * 2.399963229728653 + target.id * 0.61 + phaseOffset;
      const radius = target.size + (worker.carrying ? 22 : 18) + (worker.id % 3) * 2;

      return {
        x: clamp(
          target.x + Math.cos(angle) * radius,
          WORKER_RADIUS + 6,
          world.width - WORKER_RADIUS - 6,
        ),
        y: clamp(
          target.y + Math.sin(angle) * radius,
          WORKER_RADIUS + 6,
          world.height - WORKER_RADIUS - 6,
        ),
      };
    }

    function updateWorkerTask(worker: Worker, target: Structure, dt: number) {
      const speed = worker.carrying ? 121 : 132;
      const approachPoint = getTaskApproachPoint(worker, target);
      ensureWorkerRoute(worker, target, approachPoint);
      const nextWaypoint = advanceWorkerRoute(worker, approachPoint.x, approachPoint.y);
      steerTo(worker, nextWaypoint.x, nextWaypoint.y, speed, dt);

      const nearTarget = distance(worker.x, worker.y, target.x, target.y) <= target.size + 12;
      const nearApproach = distance(worker.x, worker.y, approachPoint.x, approachPoint.y) <= 14;
      if (!nearTarget && !nearApproach) {
        return;
      }

      if (!worker.task) {
        return;
      }

      if (worker.task.phase === 'pickup') {
        if (worker.task.type === 'fuel-generator') {
          worker.carrying = 'coal';
          worker.task.phase = 'deliver';
          clearWorkerRoute(worker);
          addRipple(target.x, target.y, COLORS.lime);
          return;
        }

        if (worker.task.type === 'charge-battery' && target.kind === 'generator' && target.outputCells > 0) {
          target.outputCells -= 1;
          worker.carrying = 'cell';
          worker.task.phase = 'deliver';
          clearWorkerRoute(worker);
          addRipple(target.x, target.y, COLORS.green);
          return;
        }

        if (worker.task.type === 'power-lab' && target.kind === 'battery' && target.charge > 0) {
          target.charge -= 1;
          worker.carrying = 'cell';
          worker.task.phase = 'deliver';
          clearWorkerRoute(worker);
          addRipple(target.x, target.y, COLORS.green);
          return;
        }

        if (worker.task.type === 'power-factory' && target.kind === 'battery' && target.charge > 0) {
          target.charge -= 1;
          worker.carrying = 'cell';
          worker.task.phase = 'deliver';
          clearWorkerRoute(worker);
          addRipple(target.x, target.y, COLORS.green);
          return;
        }

        worker.task = null;
        worker.carrying = null;
        clearWorkerRoute(worker);
        return;
      }

      if (worker.task.type === 'fuel-generator' && target.kind === 'generator' && worker.carrying === 'coal') {
        target.fuel = clamp(target.fuel + 26, 0, 100);
        target.pulse = 1;
      }

      if (worker.task.type === 'charge-battery' && target.kind === 'battery' && worker.carrying === 'cell') {
        target.charge = clamp(target.charge + 1, 0, target.capacity);
        target.pulse = 1;
      }

      if (worker.task.type === 'power-lab' && target.kind === 'lab' && worker.carrying === 'cell') {
        target.energy = clamp(target.energy + 26, 0, 100);
        target.pulse = 1;
      }

      if (worker.task.type === 'power-factory' && target.kind === 'factory' && worker.carrying === 'cell') {
        target.charge = clamp(target.charge + FACTORY_CHARGE_PER_CELL, 0, 100);
        target.pulse = 1;
      }

      addRipple(target.x, target.y, COLORS.green);
      worker.task = null;
      worker.carrying = null;
      clearWorkerRoute(worker);
    }

    function updateStructures(dt: number) {
      const generators = getNodes('generator') as GeneratorNode[];
      const labs = getNodes('lab') as LabNode[];
      const factories = getNodes('factory') as FactoryNode[];
      const loadFactor = getLoadCycleValue();
      const desiredWorkers = currentStrategy.desiredWorkers;

      generators.forEach((node) => {
        node.pulse = Math.max(0, node.pulse - dt * 1.6);
        if (node.fuel > 0) {
          node.production += dt * (0.36 + loadFactor * 0.44);
          node.fuel = clamp(node.fuel - dt * (2.6 + loadFactor * 2.8), 0, 100);
          if (node.production >= 1 && node.outputCells < MAX_GENERATOR_OUTPUT) {
            node.production -= 1;
            node.outputCells += 1;
            addRipple(node.x, node.y, COLORS.lime);
          }
        } else {
          node.production = Math.max(0, node.production - dt * 0.4);
        }
      });

      labs.forEach((node) => {
        node.pulse = Math.max(0, node.pulse - dt * 1.2);
        node.energy = clamp(node.energy - dt * (2.8 + loadFactor * 4.9), 0, 100);
        if (node.energy > 16) {
          node.pulse = Math.max(node.pulse, 0.18);
        }
      });

      factories.forEach((node) => {
        node.pulse = Math.max(0, node.pulse - dt * 1.3);
        if (worldRef.current.workers.length >= desiredWorkers + 4) {
          node.buildProgress = Math.max(0, node.buildProgress - dt * 2.2);
          return;
        }

        if (node.charge <= 0) {
          node.charge = 0;
          return;
        }

        const buildDemand = clamp((desiredWorkers - worldRef.current.workers.length) / desiredWorkers, 0.08, 1);
        node.charge = clamp(node.charge - dt * FACTORY_POWER_DRAIN * buildDemand, 0, 100);
        node.buildProgress = clamp(node.buildProgress + dt * FACTORY_BUILD_RATE * buildDemand, 0, 100);
        node.pulse = Math.max(node.pulse, 0.2);

        if (node.buildProgress >= 100 && worldRef.current.workers.length < WORKER_CAP) {
          node.buildProgress = Math.max(0, node.buildProgress - 100);
          spawnWorkerNearFactory(node);
          node.pulse = 1;
        }
      });

      worldRef.current.ripples = worldRef.current.ripples.filter((ripple) => ripple.life > 0.02);
      worldRef.current.ripples.forEach((ripple) => {
        ripple.life -= dt * 1.5;
      });

      worldRef.current.particles = worldRef.current.particles.filter((particle) => particle.life > 0.02);
      worldRef.current.particles.forEach((particle) => {
        particle.life -= dt * 2.2;
        particle.x += particle.vx * dt;
        particle.y += particle.vy * dt;
        particle.vx *= 0.96;
        particle.vy *= 0.96;
      });

      worldRef.current.structures.forEach((node) => {
        constrainPointToMap(node, STRUCTURE_PADDING);
      });
    }

    function updateWorkers(dt: number) {
      const world = worldRef.current;
      const deadWorkerIds = new Set<number>();
      const desiredWorkers = currentStrategy.desiredWorkers;
      const loadFactor = getLoadCycleValue();
      activeWorkerTrafficField = buildWorkerTrafficField(world.workers);
      const claims = getClaimCounts();
      const structureCrowding = buildStructureCrowdingMap(world.workers, world.structures);
      const workerSpatialGrid = buildWorkerSpatialGrid(world.workers);

      for (let workerIndex = 0; workerIndex < world.workers.length; workerIndex += 1) {
        const worker = world.workers[workerIndex];
        if (deadWorkerIds.has(worker.id)) {
          continue;
        }

        if (worker.malfunctionTimer > 0) {
          worker.malfunctionTimer = Math.max(0, worker.malfunctionTimer - dt);
        }

        const populationPressure = clamp((world.workers.length - desiredWorkers) / desiredWorkers, -0.5, 0.75);
        const malfunctionRate = WORKER_MALFUNCTION_RATE * (0.7 + loadFactor * 0.9);
        const failureRate =
          WORKER_FAILURE_RATE *
          (1 + Math.max(0, populationPressure) * 1.6) *
          (worker.malfunctionTimer > 0 ? 1.8 : 1);
        if (Math.random() < failureRate * dt) {
          if (worker.task) {
            applyTaskClaimDelta(claims, worker.task, -1);
          }
          deadWorkerIds.add(worker.id);
          removeWorkerWithBurst(worker);
          continue;
        }

        if (worker.malfunctionTimer <= 0 && Math.random() < malfunctionRate * dt) {
          triggerWorkerMalfunction(worker);
        }

        if (
          worker.task &&
          (!findNode(worker.task.sourceId) || !findNode(worker.task.targetId))
        ) {
          applyTaskClaimDelta(claims, worker.task, -1);
          worker.task = null;
          worker.carrying = null;
          clearWorkerRoute(worker);
        }

        if (!worker.task && worker.malfunctionTimer <= 0) {
          assignTask(worker, claims, structureCrowding);
        }

        applyFlocking(worker, dt, workerSpatialGrid, workerIndex);

        if (worker.malfunctionTimer > 0) {
          worker.wanderSeed += dt * 2.8;
          const faultX = worker.x + Math.cos(worker.wanderSeed * 3.5 + worker.wobble) * 16;
          const faultY = worker.y + Math.sin(worker.wanderSeed * 4.2 + worker.wobble) * 12;
          steerTo(worker, faultX, faultY, 29, dt);
          worker.vx += (Math.random() - 0.5) * 46 * dt;
          worker.vy += (Math.random() - 0.5) * 46 * dt;
        } else if (worker.task) {
          const target =
            worker.task.phase === 'pickup'
              ? findNode(worker.task.sourceId)
              : findNode(worker.task.targetId);

          if (target) {
            updateWorkerTask(worker, target, dt);
          }
        } else {
          worker.wanderSeed += dt * (0.9 + worker.wobble * 0.00005);
          worker.idleTargetTimer = Math.max(0, worker.idleTargetTimer - dt);
          let idleTarget = worker.idleTargetId ? findNode(worker.idleTargetId) : null;

          if (
            !idleTarget ||
            worker.idleTargetTimer <= 0 ||
            distance(worker.x, worker.y, idleTarget.x, idleTarget.y) < idleTarget.size + 18
          ) {
            idleTarget = chooseIdleTarget(worker);
          }

          if (idleTarget) {
            ensureRoute(worker, `idle:${idleTarget.id}`, idleTarget.x, idleTarget.y);
            const nextWaypoint = advanceWorkerRoute(worker, idleTarget.x, idleTarget.y);
            const offsetAngle = worker.wobble * 0.003 + worker.wanderSeed * 0.35;
            const targetX = idleTarget.x + Math.cos(offsetAngle) * 22;
            const targetY = idleTarget.y + Math.sin(offsetAngle) * 18;
            const steerPoint =
              distance(nextWaypoint.x, nextWaypoint.y, idleTarget.x, idleTarget.y) < 12
                ? { x: targetX, y: targetY }
                : nextWaypoint;
            steerTo(worker, steerPoint.x, steerPoint.y, 91, dt);
          } else {
            steerTo(worker, world.width * 0.5, world.height * 0.5, 60, dt);
          }
        }

        applyLocalWorkerAvoidance(worker, dt, workerSpatialGrid, workerIndex);
        applyObstacleAvoidance(worker, dt);

        const edgeForceX =
          (worker.x < 28 ? 1 : 0) -
          (worker.x > world.width - 28 ? 1 : 0);
        const edgeForceY =
          (worker.y < 28 ? 1 : 0) -
          (worker.y > world.height - 28 ? 1 : 0);
        worker.vx += edgeForceX * 22 * dt;
        worker.vy += edgeForceY * 22 * dt;

        worker.vx *= 0.985;
        worker.vy *= 0.985;

        const speed = Math.hypot(worker.vx, worker.vy);
        const maxSpeed = worker.carrying ? 138 : 156;
        if (speed > maxSpeed) {
          worker.vx = (worker.vx / speed) * maxSpeed;
          worker.vy = (worker.vy / speed) * maxSpeed;
        }

        worker.x = clamp(worker.x + worker.vx * dt, 10, world.width - 10);
        worker.y = clamp(worker.y + worker.vy * dt, 10, world.height - 10);

        if (constrainPointToMap(worker, WORKER_RADIUS)) {
          worker.vx *= 0.72;
          worker.vy *= 0.72;
        }

        if (speed > 2) {
          worker.angle = Math.atan2(worker.vy, worker.vx);
        }
        updateWorkerSpatialGridPosition(workerSpatialGrid, workerIndex, worker);
      }

      if (deadWorkerIds.size > 0) {
        world.workers = world.workers.filter((worker) => !deadWorkerIds.has(worker.id));
      }

      resolveWorkerCrowding(world.workers, deadWorkerIds);
      activeWorkerTrafficField = null;
    }

    function drawGrid() {
      const world = worldRef.current;
      if (!gridCacheCanvas) {
        gridCacheCanvas = document.createElement('canvas');
        gridCacheCanvas.width = Math.max(1, Math.floor(world.width));
        gridCacheCanvas.height = Math.max(1, Math.floor(world.height));

        const gridCtx = gridCacheCanvas.getContext('2d');
        if (gridCtx) {
          gridCtx.strokeStyle = COLORS.softInk;
          gridCtx.lineWidth = 1;
          for (let x = 0; x < world.width; x += 32) {
            gridCtx.beginPath();
            gridCtx.moveTo(x + 0.5, 0);
            gridCtx.lineTo(x + 0.5, world.height);
            gridCtx.stroke();
          }
          for (let y = 0; y < world.height; y += 32) {
            gridCtx.beginPath();
            gridCtx.moveTo(0, y + 0.5);
            gridCtx.lineTo(world.width, y + 0.5);
            gridCtx.stroke();
          }

          gridCtx.fillStyle = 'rgba(0, 185, 6, 0.06)';
          for (let x = 16; x < world.width; x += 96) {
            for (let y = 16; y < world.height; y += 96) {
              gridCtx.fillRect(Math.round(x), Math.round(y), 2, 2);
            }
          }
        }
      }

      if (gridCacheCanvas) {
        ctx.drawImage(gridCacheCanvas, 0, 0, world.width, world.height);
      }
    }

    function drawBackgroundScene() {
      const world = worldRef.current;

      if (!backgroundSceneCanvas) {
        backgroundSceneCanvas = document.createElement('canvas');
        backgroundSceneCanvas.width = Math.max(1, Math.floor(world.width));
        backgroundSceneCanvas.height = Math.max(1, Math.floor(world.height));

        const backgroundCtx = backgroundSceneCanvas.getContext('2d');
        if (!backgroundCtx) {
          backgroundSceneCanvas = null;
          return;
        }

        backgroundCtx.fillStyle = COLORS.paper;
        backgroundCtx.fillRect(0, 0, world.width, world.height);

        if (!gridCacheCanvas) {
          drawGrid();
        }

        if (gridCacheCanvas) {
          backgroundCtx.save();
          clipContextToMap(backgroundCtx);
          backgroundCtx.drawImage(gridCacheCanvas, 0, 0, world.width, world.height);
          backgroundCtx.restore();
        }
      }

      if (backgroundSceneCanvas) {
        ctx.drawImage(backgroundSceneCanvas, 0, 0, world.width, world.height);
      }
    }

    function drawNetworkHints() {
      const coalPatches = getNodes('coal') as CoalPatch[];
      const generators = getNodes('generator') as GeneratorNode[];
      const batteries = getNodes('battery') as BatteryNode[];
      const labs = getNodes('lab') as LabNode[];
      const factories = getNodes('factory') as FactoryNode[];

      ctx.save();
      ctx.setLineDash([4, 6]);
      ctx.lineWidth = 1;

      generators.forEach((generator) => {
        const source = coalPatches.reduce<CoalPatch | null>((best, node) => {
          if (!best) {
            return node;
          }
          return distance(generator.x, generator.y, node.x, node.y) <
            distance(generator.x, generator.y, best.x, best.y)
            ? node
            : best;
        }, null);

        if (source) {
          ctx.strokeStyle = 'rgba(66, 66, 66, 0.22)';
          ctx.beginPath();
          ctx.moveTo(source.x, source.y);
          ctx.lineTo(generator.x, generator.y);
          ctx.stroke();
        }
      });

      batteries.forEach((battery) => {
        const source = generators.reduce<GeneratorNode | null>((best, node) => {
          if (!best) {
            return node;
          }
          return distance(battery.x, battery.y, node.x, node.y) <
            distance(battery.x, battery.y, best.x, best.y)
            ? node
            : best;
        }, null);

        if (source) {
          ctx.strokeStyle = 'rgba(0, 185, 6, 0.22)';
          ctx.beginPath();
          ctx.moveTo(source.x, source.y);
          ctx.lineTo(battery.x, battery.y);
          ctx.stroke();
        }
      });

      labs.forEach((lab) => {
        const source = batteries.reduce<BatteryNode | null>((best, node) => {
          if (!best) {
            return node;
          }
          return distance(lab.x, lab.y, node.x, node.y) <
            distance(lab.x, lab.y, best.x, best.y)
            ? node
            : best;
        }, null);

        if (source) {
          ctx.strokeStyle = 'rgba(185, 233, 55, 0.24)';
          ctx.beginPath();
          ctx.moveTo(source.x, source.y);
          ctx.lineTo(lab.x, lab.y);
          ctx.stroke();
        }
      });

      factories.forEach((factory) => {
        const source = batteries.reduce<BatteryNode | null>((best, node) => {
          if (!best) {
            return node;
          }
          return distance(factory.x, factory.y, node.x, node.y) <
            distance(factory.x, factory.y, best.x, best.y)
            ? node
            : best;
        }, null);

        if (source) {
          ctx.strokeStyle = 'rgba(66, 66, 66, 0.18)';
          ctx.beginPath();
          ctx.moveTo(source.x, source.y);
          ctx.lineTo(factory.x, factory.y);
          ctx.stroke();
        }
      });

      ctx.restore();
    }

    function drawLabel(text: string, x: number, y: number) {
      ctx.fillStyle = COLORS.ink;
      ctx.font = "11px 'SFMono-Regular', 'JetBrains Mono', monospace";
      ctx.textAlign = 'center';
      ctx.fillText(text, Math.round(x), Math.round(y));
    }

    function drawNode(node: Structure) {
      const x = Math.round(node.x);
      const y = Math.round(node.y);

      if (node.kind === 'coal') {
        ctx.fillStyle = COLORS.ink;
        ctx.fillRect(x - 16, y - 12, 32, 24);
        ctx.fillStyle = COLORS.paper;
        ctx.fillRect(x - 14, y - 10, 28, 20);
        ctx.fillStyle = COLORS.ink;
        ctx.fillRect(x - 10, y - 6, 8, 8);
        ctx.fillRect(x - 1, y - 10, 10, 10);
        ctx.fillRect(x + 4, y + 1, 7, 7);
        ctx.fillStyle = COLORS.green;
        ctx.fillRect(x - 12, y + 8, 24, 2);
        drawLabel('COAL', x, y + 28);
        return;
      }

      if (node.kind === 'generator') {
        const fuelWidth = Math.round((node.fuel / 100) * 24);
        ctx.fillStyle = COLORS.ink;
        ctx.fillRect(x - 16, y - 14, 32, 28);
        ctx.fillRect(x + 6, y - 20, 8, 12);
        ctx.fillStyle = COLORS.paper;
        ctx.fillRect(x - 14, y - 12, 28, 24);
        ctx.fillStyle = COLORS.ink;
        ctx.fillRect(x - 8, y - 4, 14, 10);
        ctx.fillStyle = COLORS.green;
        ctx.fillRect(x - 7, y - 3, 12, 8);
        ctx.fillStyle = 'rgba(185, 233, 55, 0.25)';
        ctx.fillRect(x - 14, y + 16, 28, 4);
        ctx.fillStyle = COLORS.lime;
        ctx.fillRect(x - 14, y + 16, fuelWidth, 4);
        ctx.fillStyle = node.outputCells > 0 ? COLORS.green : COLORS.softInk;
        ctx.fillRect(x - 12, y - 18, Math.min(4 + node.outputCells * 3, 18), 2);
        if (node.pulse > 0) {
          ctx.strokeStyle = `rgba(0, 185, 6, ${node.pulse * 0.6})`;
          ctx.lineWidth = 2;
          ctx.strokeRect(x - 19, y - 17, 38, 34);
        }
        drawLabel('GEN', x, y + 31);
        return;
      }

      if (node.kind === 'battery') {
        const chargeHeight = Math.round((node.charge / node.capacity) * 24);
        ctx.fillStyle = COLORS.ink;
        ctx.fillRect(x - 12, y - 17, 24, 34);
        ctx.fillStyle = COLORS.paper;
        ctx.fillRect(x - 10, y - 15, 20, 30);
        ctx.fillStyle = COLORS.ink;
        ctx.fillRect(x - 4, y - 21, 8, 4);
        ctx.fillStyle = COLORS.green;
        ctx.fillRect(x - 8, y + 11 - chargeHeight, 16, chargeHeight);
        if (node.pulse > 0) {
          ctx.strokeStyle = `rgba(185, 233, 55, ${node.pulse * 0.65})`;
          ctx.lineWidth = 2;
          ctx.strokeRect(x - 15, y - 20, 30, 40);
        }
        drawLabel('CELL', x, y + 33);
        return;
      }

      if (node.kind === 'lab') {
        const energyWidth = Math.round((node.energy / 100) * 24);
        ctx.fillStyle = COLORS.ink;
        ctx.fillRect(x - 16, y - 13, 32, 26);
        ctx.fillStyle = COLORS.paper;
        ctx.fillRect(x - 14, y - 11, 28, 22);
        ctx.fillStyle = COLORS.ink;
        ctx.fillRect(x - 9, y - 6, 18, 12);
        ctx.fillStyle = COLORS.green;
        ctx.fillRect(x - 7, y - 4, Math.max(6, energyWidth), 8);
        ctx.fillStyle = COLORS.ink;
        ctx.fillRect(x - 4, y + 13, 8, 4);
        if (node.pulse > 0) {
          ctx.strokeStyle = `rgba(0, 185, 6, ${node.pulse * 0.7})`;
          ctx.lineWidth = 2;
          ctx.strokeRect(x - 19, y - 16, 38, 32);
        }
        drawLabel('LAB', x, y + 30);
        return;
      }

      const factoryChargeWidth = Math.round((node.charge / 100) * 24);
      const buildWidth = Math.round((node.buildProgress / 100) * 24);
      ctx.fillStyle = COLORS.ink;
      ctx.fillRect(x - 18, y - 14, 36, 30);
      ctx.fillStyle = COLORS.paper;
      ctx.fillRect(x - 16, y - 12, 32, 26);
      ctx.fillStyle = COLORS.ink;
      ctx.fillRect(x - 10, y - 6, 8, 8);
      ctx.fillRect(x + 2, y - 6, 8, 8);
      ctx.strokeStyle = COLORS.green;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(x - 2, y - 2);
      ctx.lineTo(x + 2, y + 2);
      ctx.moveTo(x - 2, y + 2);
      ctx.lineTo(x + 2, y - 2);
      ctx.stroke();
      ctx.fillStyle = 'rgba(185, 233, 55, 0.22)';
      ctx.fillRect(x - 14, y + 18, 28, 4);
      ctx.fillStyle = COLORS.lime;
      ctx.fillRect(x - 14, y + 18, factoryChargeWidth, 4);
      ctx.fillStyle = COLORS.green;
      ctx.fillRect(x - 14, y - 18, buildWidth, 2);
      if (node.pulse > 0) {
        ctx.strokeStyle = `rgba(185, 233, 55, ${node.pulse * 0.7})`;
        ctx.lineWidth = 2;
        ctx.strokeRect(x - 21, y - 17, 42, 36);
      }
      drawLabel('FACT', x, y + 33);
    }

    function drawWorker(worker: Worker) {
      const x = Math.round(worker.x);
      const y = Math.round(worker.y);
      const bodyLength = 8;
      const tailLength = 5;

      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(worker.angle);

      const isMalfunctioning = worker.malfunctionTimer > 0;
      ctx.strokeStyle = isMalfunctioning ? COLORS.danger : COLORS.green;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(0, -1);
      ctx.lineTo(5, -5);
      ctx.moveTo(0, 1);
      ctx.lineTo(5, 5);
      ctx.stroke();

      ctx.fillStyle = isMalfunctioning ? COLORS.dangerDark : COLORS.ink;
      ctx.beginPath();
      ctx.moveTo(bodyLength, 0);
      ctx.lineTo(-tailLength, -5);
      ctx.lineTo(-1, 0);
      ctx.lineTo(-tailLength, 5);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = isMalfunctioning ? COLORS.dangerLight : COLORS.lime;
      ctx.fillRect(1, -1, 2, 2);

      if (isMalfunctioning) {
        ctx.strokeStyle = COLORS.danger;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(0, 0, 8, 0, Math.PI * 2);
        ctx.stroke();
      }

      if (worker.carrying) {
        ctx.strokeStyle = COLORS.green;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(4, -2);
        ctx.lineTo(8, -4);
        ctx.moveTo(4, 2);
        ctx.lineTo(8, 4);
        ctx.stroke();
        ctx.fillStyle = worker.carrying === 'coal' ? COLORS.ink : COLORS.green;
        ctx.fillRect(7, -2, 4, 4);
        ctx.strokeStyle = worker.carrying === 'coal' ? COLORS.lime : COLORS.ink;
        ctx.strokeRect(7, -2, 4, 4);
      }

      ctx.restore();
    }

    function drawParticles() {
      worldRef.current.particles.forEach((particle) => {
        ctx.save();
        ctx.globalAlpha = Math.max(0, particle.life);
        ctx.fillStyle = particle.color;
        ctx.fillRect(
          Math.round(particle.x - particle.size * 0.5),
          Math.round(particle.y - particle.size * 0.5),
          particle.size,
          particle.size,
        );
        ctx.restore();
      });
    }

    function drawRipples() {
      worldRef.current.ripples.forEach((ripple) => {
        const size = (1 - ripple.life) * 26;
        ctx.strokeStyle = ripple.color.startsWith('#')
          ? hexToRgba(ripple.color, Math.max(0.12, ripple.life))
          : ripple.color;
        ctx.lineWidth = 1.5;
        ctx.strokeRect(ripple.x - size * 0.5, ripple.y - size * 0.5, size, size);
      });
    }

    function drawScene() {
      const world = worldRef.current;
      ctx.clearRect(0, 0, world.width, world.height);
      drawBackgroundScene();

      ctx.save();
      clipToMap();
      if (!performanceProfile.simplifiedVisuals) {
        drawNetworkHints();
      }
      world.structures.forEach(drawNode);
      world.workers.forEach(drawWorker);
      drawParticles();
      drawRipples();
      ctx.restore();
    }

    function loop(now: number) {
      if (document.visibilityState !== 'visible') {
        previousTime = now;
        lastRenderTime = now;
        animationFrame = window.requestAnimationFrame(loop);
        return;
      }

      if (
        performanceProfile.frameIntervalMs > 0 &&
        now - lastRenderTime < performanceProfile.frameIntervalMs
      ) {
        animationFrame = window.requestAnimationFrame(loop);
        return;
      }

      const dt = Math.min(0.05, (now - previousTime) / 1000);
      previousTime = now;
      lastRenderTime = now;
      simulationTime += dt;

      updateSwarmStrategy(dt);
      updateStructures(dt);
      updateWorkers(dt);
      drawScene();

      statsTimer += dt;
      if (statsTimer >= 0.25) {
        statsTimer = 0;
        publishMetrics(worldRef.current);
      }

      animationFrame = window.requestAnimationFrame(loop);
    }

    let layoutSyncFrame = 0;
    const scheduleLayoutSync = () => {
      if (layoutSyncFrame) {
        return;
      }

      layoutSyncFrame = window.requestAnimationFrame(() => {
        layoutSyncFrame = 0;
        syncWorldToCurrentLayout();
      });
    };
    const layoutObserver = new ResizeObserver(scheduleLayoutSync);

    Array.from(document.querySelectorAll('.panel-shell, .page-main, .site-nav')).forEach((element) => {
      if (element instanceof HTMLElement) {
        layoutObserver.observe(element);
      }
    });

    resizeWorld();
    window.addEventListener('resize', resizeWorld);
    window.addEventListener('scroll', scheduleLayoutSync, { passive: true });
    animationFrame = window.requestAnimationFrame(loop);

    return () => {
      window.cancelAnimationFrame(animationFrame);
      if (layoutSyncFrame) {
        window.cancelAnimationFrame(layoutSyncFrame);
      }
      layoutObserver.disconnect();
      window.removeEventListener('resize', resizeWorld);
      window.removeEventListener('scroll', scheduleLayoutSync);
    };
  }, []);

  return (
    <>
      <canvas
        ref={canvasRef}
        aria-hidden="true"
        style={{
          position: 'fixed',
          inset: 0,
          width: '100vw',
          height: '100vh',
          zIndex: 0,
          display: 'block',
          cursor: 'default',
        }}
      />

      <aside
        className={`sim-hotbar ${isMenuMinimized ? 'is-minimized' : ''}`}
        aria-label="Power grid simulation controls"
      >
        <div className="sim-hotbar__header">
          <p className="sim-hotbar__eyebrow">Ambient power grid</p>
        </div>

        {!isMenuMinimized && isHelpOpen && (
          <section id="boid-help-panel" className="sim-hotbar__help">
            <h2 className="sim-hotbar__help-title">How it works</h2>
            <p className="sim-hotbar__help-copy">
              The worker-boids act like a homeostatic controller for the whole system. They continuously rotate through short strategic pushes so fuel, stored cells, lab energy, and worker count all stay in motion instead of letting one objective dominate forever.
            </p>
            <ul className="sim-hotbar__help-list">
              <li><span className="sim-hotbar__token">Fuel push</span> sends more traffic toward coal, generators, and even new worker production if fuel stays stressed.</li>
              <li><span className="sim-hotbar__token">Reserve balancing</span> shifts attention toward moving energy into batteries.</li>
              <li><span className="sim-hotbar__token">Lab support</span> redirects traffic from storage into lab power.</li>
              <li><span className="sim-hotbar__token">Factory ramp</span> and <span className="sim-hotbar__token">Crew recovery</span> raise factory priority when the swarm wants more workers or needs to replace faults.</li>
              <li>The hallway routes stay adaptive, so the swarm replans as the page layout changes and keeps returning toward equilibrium.</li>
            </ul>
            <p className="sim-hotbar__help-note">
              This simulation is tuned to surface rich, shifting behavior, so the swarm keeps producing new dynamics instead of settling into one static pattern.
            </p>
          </section>
        )}

        {!isMenuMinimized && (
          <>
            <div className="sim-hotbar__status-card">
              <p className="sim-hotbar__status-label">Status</p>
              <p className="sim-hotbar__status-value">{metrics.status}</p>
            </div>
            <div className="sim-hotbar__graphs" aria-label="Power grid trend graphs">
              <MiniGraph
                label="Power"
                value={`${metrics.powerPct}%`}
                detail="fuel + reserves"
                values={graphHistory.power}
                color={COLORS.green}
              />
              <MiniGraph
                label="Cells"
                value={`${metrics.cellsPct}%`}
                detail="stored charge"
                values={graphHistory.cells}
                color={COLORS.lime}
              />
              <MiniGraph
                label="Workers"
                value={`${metrics.workers}/${metrics.workerCap}`}
                detail={metrics.malfunctioning > 0 ? `${metrics.malfunctioning} faulty` : 'crew stable'}
                values={graphHistory.workers}
                color={COLORS.ink}
              />
              <MiniGraph
                label="Factory"
                value={`${metrics.factoryPct}%`}
                detail={`${metrics.factoryCharge}% charge · ${metrics.factoryProgress}% build`}
                values={graphHistory.factory}
                color={COLORS.green}
              />
            </div>
          </>
        )}

        <div className="sim-hotbar__footer">
          <div className="sim-hotbar__actions">
            <button
              type="button"
              className="sim-hotbar__icon-button"
              aria-expanded={isHelpOpen && !isMenuMinimized}
              aria-controls="boid-help-panel"
              aria-label="About the boid simulation"
              onClick={() => {
                if (isMenuMinimized) {
                  setIsMenuMinimized(false);
                  setIsHelpOpen(true);
                  return;
                }

                setIsHelpOpen((open) => !open);
              }}
            >
              ?
            </button>
            <button
              type="button"
              className="sim-hotbar__icon-button"
              aria-label={isMenuMinimized ? 'Expand boid menu' : 'Minimize boid menu'}
              aria-expanded={!isMenuMinimized}
              onClick={() => {
                setIsMenuMinimized((collapsed) => !collapsed);
              }}
            >
              {isMenuMinimized ? '+' : '–'}
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}
