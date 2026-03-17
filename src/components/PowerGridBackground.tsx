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

type TaskPriorityProfile = {
  desiredWorkers: number;
  status: string;
  weights: Record<TaskType, number>;
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

type StructureStats = {
  coalPatches: CoalPatch[];
  generators: GeneratorNode[];
  batteries: BatteryNode[];
  labs: LabNode[];
  factories: FactoryNode[];
  totalFuel: number;
  totalCells: number;
  totalLabEnergy: number;
  totalFactoryCharge: number;
  totalFactoryProgress: number;
  totalCellCapacity: number;
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
  cells: Map<number, Set<number>>;
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

const WORKER_RADIUS = 8;
const WORKER_MIN_SEPARATION = WORKER_RADIUS * 2 + 4;
const LOCAL_AVOIDANCE_RADIUS = 32;
const LOCAL_AVOIDANCE_LOOKAHEAD = 0.22;
const LOCAL_AVOIDANCE_MAX_NEIGHBORS = 18;
const LOCAL_AVOIDANCE_MAX_FORCE = 210;
const LOCAL_AVOIDANCE_PUSH = 130;
const LOCAL_AVOIDANCE_OVERLAP_PUSH = 36;
const LOCAL_AVOIDANCE_SIDE_SLIP = 18;
const STRUCTURE_PADDING = 22;
const OBSTACLE_REPULSION_RANGE = 54;
const OBSTACLE_LOOKAHEAD = 0.24;
const OBSTACLE_SLIDE_FORCE = 145;
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
const GOLDEN_ANGLE = 2.399963229728653;
const TRAFFIC_PENALTY_SCALE = 4.4;
const SPATIAL_GRID_KEY_STRIDE = 100000;
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

function distanceSquared(ax: number, ay: number, bx: number, by: number) {
  const dx = ax - bx;
  const dy = ay - by;
  return dx * dx + dy * dy;
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

function countMalfunctioningWorkers(workers: Worker[]) {
  let malfunctioning = 0;

  for (let index = 0; index < workers.length; index += 1) {
    if (workers[index].malfunctionTimer > 0) {
      malfunctioning += 1;
    }
  }

  return malfunctioning;
}

function getStructureStats(structureIndex: StructureIndex): StructureStats {
  const coalPatches = structureIndex.byKind.coal;
  const generators = structureIndex.byKind.generator;
  const batteries = structureIndex.byKind.battery;
  const labs = structureIndex.byKind.lab;
  const factories = structureIndex.byKind.factory;

  let totalFuel = 0;
  let totalCells = 0;
  let totalLabEnergy = 0;
  let totalFactoryCharge = 0;
  let totalFactoryProgress = 0;
  let totalCellCapacity = generators.length * MAX_GENERATOR_OUTPUT;

  for (let index = 0; index < generators.length; index += 1) {
    const node = generators[index];
    totalFuel += node.fuel;
    totalCells += node.outputCells;
  }

  for (let index = 0; index < batteries.length; index += 1) {
    const node = batteries[index];
    totalCells += node.charge;
    totalCellCapacity += node.capacity;
  }

  for (let index = 0; index < labs.length; index += 1) {
    totalLabEnergy += labs[index].energy;
  }

  for (let index = 0; index < factories.length; index += 1) {
    const node = factories[index];
    totalFactoryCharge += node.charge;
    totalFactoryProgress += node.buildProgress;
  }

  return {
    coalPatches,
    generators,
    batteries,
    labs,
    factories,
    totalFuel,
    totalCells,
    totalLabEnergy,
    totalFactoryCharge,
    totalFactoryProgress,
    totalCellCapacity,
  };
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

function deriveMetrics(
  world: World,
  statusOverride?: string,
  structureIndex?: StructureIndex,
): Metrics {
  const stats = getStructureStats(structureIndex ?? createStructureIndex(world.structures));
  const {
    coalPatches,
    generators,
    batteries,
    labs,
    factories,
    totalFuel,
    totalCells,
    totalLabEnergy,
    totalFactoryCharge,
    totalFactoryProgress,
    totalCellCapacity,
  } = stats;
  const malfunctioning = countMalfunctioningWorkers(world.workers);
  const cellsPct = totalCellCapacity > 0 ? (totalCells / totalCellCapacity) * 100 : 0;
  const fuelPct = generators.length > 0 ? (totalFuel / (generators.length * 100)) * 100 : 0;
  const labPct = labs.length > 0 ? (totalLabEnergy / (labs.length * 100)) * 100 : 0;
  const powerPct = fuelPct * 0.35 + cellsPct * 0.4 + labPct * 0.25;
  const averageFactoryCharge = factories.length > 0 ? totalFactoryCharge / factories.length : 0;
  const averageFactoryProgress = factories.length > 0 ? totalFactoryProgress / factories.length : 0;
  const factoryPct = averageFactoryCharge * 0.55 + averageFactoryProgress * 0.45;

  let status = 'Booting grid';
  if (coalPatches.length && generators.length && batteries.length && labs.length && factories.length) {
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
  } else if (coalPatches.length && generators.length && batteries.length) {
    status = 'Bring factory online';
  } else if (coalPatches.length && generators.length) {
    status = 'Add storage';
  } else if (coalPatches.length) {
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
  const backgroundCanvasRef = useRef<HTMLCanvasElement | null>(null);
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
    const backgroundCanvas = backgroundCanvasRef.current!;
    const canvas = canvasRef.current!;
    if (!backgroundCanvas || !canvas) {
      return;
    }

    const backgroundCtx = backgroundCanvas.getContext('2d', { alpha: false, desynchronized: true })!;
    const ctx = canvas.getContext('2d', { alpha: true, desynchronized: true })!;
    if (!backgroundCtx || !ctx) {
      return;
    }

    let animationFrame = 0;
    let previousTime = performance.now();
    let lastRenderTime = 0;
    let statsTimer = 0;
    let simulationTime = 0;
    let activeWorkerTrafficField: Float32Array | null = null;
    let workerTrafficFieldBuffer: Float32Array | null = null;
    let backgroundSceneCanvas: HTMLCanvasElement | null = null;
    let gridCacheCanvas: HTMLCanvasElement | null = null;
    let networkHintsCanvas: HTMLCanvasElement | null = null;
    let mapClipPath: Path2D | null = null;
    let staticLayerDirty = true;
    const reusableClaims = createClaimCounts();
    const reusableStructureCrowding = new Map<number, number>();
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
    const viewportPixels = Math.max(1, window.innerWidth * window.innerHeight);
    const largeViewport = viewportPixels >= 3_000_000;
    const surfacePixelBudget = lowPowerDevice
      ? 2_600_000
      : largeViewport
        ? 8_500_000
        : Number.POSITIVE_INFINITY;
    const budgetedDpr = Number.isFinite(surfacePixelBudget)
      ? Math.sqrt(surfacePixelBudget / viewportPixels)
      : performanceProfile.maxDpr;
    const dpr = Math.max(
      1,
      Math.min(performanceProfile.maxDpr, window.devicePixelRatio || 1, budgetedDpr),
    );
    const WORKER_SPRITE_SIZE = 36;
    const WORKER_SPRITE_HALF = WORKER_SPRITE_SIZE * 0.5;
    const WORKER_SPRITE_ANGLES = performanceProfile.lowPower ? 36 : 48;
    const WORKER_SPRITE_VARIANTS: Array<{
      key: string;
      malfunctioning: boolean;
      carrying: ItemType | null;
    }> = [
      { key: 'normal-empty', malfunctioning: false, carrying: null },
      { key: 'normal-coal', malfunctioning: false, carrying: 'coal' },
      { key: 'normal-cell', malfunctioning: false, carrying: 'cell' },
      { key: 'fault-empty', malfunctioning: true, carrying: null },
      { key: 'fault-coal', malfunctioning: true, carrying: 'coal' },
      { key: 'fault-cell', malfunctioning: true, carrying: 'cell' },
    ];
    const workerSpriteCache = new Map<string, HTMLCanvasElement[]>();

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
      structureStats: StructureStats,
      malfunctioning: number,
    ) {
      const baseTarget = getDesiredWorkerCount();
      const averageFuel =
        structureStats.generators.length > 0
          ? structureStats.totalFuel / structureStats.generators.length
          : 0;
      const averageLabEnergy =
        structureStats.labs.length > 0
          ? structureStats.totalLabEnergy / structureStats.labs.length
          : 0;
      const averageFactoryCharge =
        structureStats.factories.length > 0
          ? structureStats.totalFactoryCharge / structureStats.factories.length
          : 0;
      const cellsPct = structureStats.totalCellCapacity > 0
        ? (structureStats.totalCells / structureStats.totalCellCapacity) * 100
        : 0;

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
      const structureStats = getStructureStats(structureIndexRef.current);
      const {
        coalPatches,
        generators,
        batteries,
        labs,
        factories,
        totalFuel,
        totalCells,
        totalLabEnergy,
        totalFactoryCharge,
        totalCellCapacity,
      } = structureStats;
      const malfunctioning = countMalfunctioningWorkers(world.workers);
      const systemReady =
        coalPatches.length > 0 &&
        generators.length > 0 &&
        batteries.length > 0 &&
        labs.length > 0 &&
        factories.length > 0;

      if (!systemReady) {
        currentStrategy = {
          ...currentStrategy,
          label: deriveMetrics(world, undefined, structureIndexRef.current).status,
          desiredWorkers: getDesiredWorkerCount(),
        };
        return;
      }

      const baseDesiredWorkers = getStrategicDesiredWorkerCount(world, structureStats, malfunctioning);
      const averageFuel = generators.length > 0 ? totalFuel / generators.length : 0;
      const cellsPct = totalCellCapacity > 0 ? (totalCells / totalCellCapacity) * 100 : 0;
      const averageLabEnergy = labs.length > 0 ? totalLabEnergy / labs.length : 0;
      const averageFactoryCharge = factories.length > 0 ? totalFactoryCharge / factories.length : 0;
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

    function clearClaimCounts(claims: ClaimCounts) {
      claims.toGenerator.clear();
      claims.fromGenerator.clear();
      claims.toBattery.clear();
      claims.fromBattery.clear();
      claims.toLab.clear();
      claims.toFactory.clear();
    }

    function publishMetrics(world: World) {
      const nextMetrics = deriveMetrics(world, currentStrategy.label, structureIndexRef.current);
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
        mapClipPath = null;
        invalidateStaticLayer();
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
              ? (activeWorkerTrafficField?.[neighborIndex] ?? 0) * TRAFFIC_PENALTY_SCALE
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
        simulationTime - worker.routeRefreshAt > 0.28 &&
        activeWorkerTrafficField[
          getCellIndex(navigationGrid, nextWaypointCell.col, nextWaypointCell.row)
        ] > 0.55;

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
        if (!waypoint || distanceSquared(worker.x, worker.y, waypoint.x, waypoint.y) > 18 * 18) {
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
      const minimumTravelSq = minimumTravel * minimumTravel;
      const candidates = structures.filter((node) => (
        node.id !== worker.idleTargetId &&
        distanceSquared(worker.x, worker.y, node.x, node.y) >= minimumTravelSq
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
      const obstacles = obstacleRectsRef.current;

      for (let pass = 0; pass < 2; pass += 1) {
        for (let index = 0; index < obstacles.length; index += 1) {
          const rect = obstacles[index];
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
            continue;
          }

          const leftDistance = Math.abs(point.x - left);
          const rightDistance = Math.abs(right - point.x);
          const topDistance = Math.abs(point.y - top);
          const bottomDistance = Math.abs(bottom - point.y);

          let bestEdge: 'left' | 'right' | 'top' | 'bottom' = 'left';
          let bestDistance = leftDistance;

          if (rightDistance < bestDistance) {
            bestDistance = rightDistance;
            bestEdge = 'right';
          }

          if (topDistance < bestDistance) {
            bestDistance = topDistance;
            bestEdge = 'top';
          }

          if (bottomDistance < bestDistance) {
            bestEdge = 'bottom';
          }

          if (bestEdge === 'left') {
            point.x = left;
          } else if (bestEdge === 'right') {
            point.x = right;
          } else if (bestEdge === 'top') {
            point.y = top;
          } else {
            point.y = bottom;
          }
          moved = true;
        }
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
      networkHintsCanvas = null;
      invalidateStaticLayer();
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
      const obstacles = obstacleRectsRef.current;
      const travel = getPreferredTravelDirection(worker);
      const projectedX = worker.x + worker.vx * OBSTACLE_LOOKAHEAD;
      const projectedY = worker.y + worker.vy * OBSTACLE_LOOKAHEAD;

      for (let index = 0; index < obstacles.length; index += 1) {
        const rect = obstacles[index];
        const left = rect.left - WORKER_RADIUS;
        const right = rect.right + WORKER_RADIUS;
        const top = rect.top - WORKER_RADIUS;
        const bottom = rect.bottom + WORKER_RADIUS;
        const nearestX = clamp(projectedX, left, right);
        const nearestY = clamp(projectedY, top, bottom);
        let dx = projectedX - nearestX;
        let dy = projectedY - nearestY;
        let distSq = dx * dx + dy * dy;

        if (distSq > OBSTACLE_REPULSION_RANGE * OBSTACLE_REPULSION_RANGE) {
          continue;
        }

        if (distSq <= 0.000001) {
          const rectCenterX = (left + right) * 0.5;
          const rectCenterY = (top + bottom) * 0.5;
          dx = projectedX - rectCenterX;
          dy = projectedY - rectCenterY;
          distSq = dx * dx + dy * dy;
        }

        const safeDist = distSq > 0.000001 ? Math.sqrt(distSq) : 0.001;
        const nx = dx / safeDist;
        const ny = dy / safeDist;
        const force = (OBSTACLE_REPULSION_RANGE - safeDist) / OBSTACLE_REPULSION_RANGE;
        const forceSq = force * force;
        worker.vx += nx * forceSq * 320 * dt;
        worker.vy += ny * forceSq * 320 * dt;

        if (travel.x !== 0 || travel.y !== 0) {
          const leftTangentX = -ny;
          const leftTangentY = nx;
          const rightTangentX = ny;
          const rightTangentY = -nx;
          const leftScore = leftTangentX * travel.x + leftTangentY * travel.y;
          const rightScore = rightTangentX * travel.x + rightTangentY * travel.y;
          const tangentX = leftScore >= rightScore ? leftTangentX : rightTangentX;
          const tangentY = leftScore >= rightScore ? leftTangentY : rightTangentY;
          const faceIntoObstacle = Math.abs(travel.x * nx + travel.y * ny);
          const slideForce = (1 - faceIntoObstacle) * forceSq;
          worker.vx += tangentX * slideForce * OBSTACLE_SLIDE_FORCE * dt;
          worker.vy += tangentY * slideForce * OBSTACLE_SLIDE_FORCE * dt;
        }
      }
    }

    function clipToMap() {
      clipContextToMap(ctx);
    }

    function buildMapClipPath() {
      const world = worldRef.current;
      const clipPath = new Path2D();
      clipPath.rect(0, 0, world.width, world.height);
      const obstacles = obstacleRectsRef.current;

      for (let index = 0; index < obstacles.length; index += 1) {
        const rect = obstacles[index];
        clipPath.rect(rect.left, rect.top, rect.width, rect.height);
      }

      return clipPath;
    }

    function clipContextToMap(targetCtx: CanvasRenderingContext2D) {
      if (!mapClipPath) {
        mapClipPath = buildMapClipPath();
      }

      targetCtx.clip(mapClipPath, 'evenodd');
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
      networkHintsCanvas = null;
      mapClipPath = null;
      invalidateStaticLayer();

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

      backgroundCanvas.width = Math.floor(nextWidth * dpr);
      backgroundCanvas.height = Math.floor(nextHeight * dpr);
      backgroundCanvas.style.width = `${nextWidth}px`;
      backgroundCanvas.style.height = `${nextHeight}px`;
      backgroundCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
      backgroundCtx.imageSmoothingEnabled = false;

      canvas.width = Math.floor(nextWidth * dpr);
      canvas.height = Math.floor(nextHeight * dpr);
      canvas.style.width = `${nextWidth}px`;
      canvas.style.height = `${nextHeight}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.imageSmoothingEnabled = false;
      backgroundSceneCanvas = null;
      gridCacheCanvas = null;
      networkHintsCanvas = null;
      mapClipPath = null;
      invalidateStaticLayer();
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
      const claims = reusableClaims;
      clearClaimCounts(claims);

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
      structureStats: StructureStats,
      desiredWorkers: number,
    ): TaskPriorityProfile {
      const {
        generators,
        labs,
        factories,
        totalFuel,
        totalCells,
        totalLabEnergy,
        totalFactoryCharge,
        totalCellCapacity,
      } = structureStats;
      const averageFuel = generators.length > 0 ? totalFuel / generators.length : 0;
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
      const crowding = reusableStructureCrowding;
      crowding.clear();
      for (let workerIndex = 0; workerIndex < workers.length; workerIndex += 1) {
        const worker = workers[workerIndex];
        let nearestId = -1;
        let nearestDistanceSq = Number.POSITIVE_INFINITY;

        for (let structureIndex = 0; structureIndex < structures.length; structureIndex += 1) {
          const node = structures[structureIndex];
          const threshold = node.size + 68;
          const nodeDistanceSq = distanceSquared(worker.x, worker.y, node.x, node.y);
          if (nodeDistanceSq > threshold * threshold || nodeDistanceSq >= nearestDistanceSq) {
            continue;
          }

          nearestId = node.id;
          nearestDistanceSq = nodeDistanceSq;
        }

        if (nearestId !== -1) {
          crowding.set(nearestId, (crowding.get(nearestId) || 0) + 1);
        }
      }

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
      coalPatches: CoalPatch[],
      generators: GeneratorNode[],
      batteries: BatteryNode[],
      labs: LabNode[],
      factories: FactoryNode[],
      priority: TaskPriorityProfile,
    ) {
      const world = worldRef.current;
      const workerX = worker.x;
      const workerY = worker.y;

      let chosen: { score: number; task: Task } | null = null;

      generators.forEach((generator) => {
        const pendingFuel = claims.toGenerator.get(generator.id) || 0;
        const openFuelSlots = Math.max(0, Math.ceil((82 - generator.fuel) / 24) - pendingFuel);
        if (openFuelSlots <= 0 || coalPatches.length === 0) {
          return;
        }

        let source = coalPatches[0];
        let bestSourceDistanceSq = Number.POSITIVE_INFINITY;
        for (let coalIndex = 0; coalIndex < coalPatches.length; coalIndex += 1) {
          const node = coalPatches[coalIndex];
          const nodeDistanceSq = distanceSquared(workerX, workerY, node.x, node.y);
          if (nodeDistanceSq < bestSourceDistanceSq) {
            bestSourceDistanceSq = nodeDistanceSq;
            source = node;
          }
        }

        const urgency = (100 - generator.fuel) / 100;
        const travelPenalty =
          distance(workerX, workerY, source.x, source.y) * 0.35 +
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
            distance(workerX, workerY, generator.x, generator.y) * 0.35 +
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
            distance(workerX, workerY, battery.x, battery.y) * 0.35 +
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
            distance(workerX, workerY, battery.x, battery.y) * 0.35 +
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

    function getPreferredTravelDirection(worker: Worker): RoutePoint {
      const waypoint = worker.route[worker.routeIndex];
      if (waypoint) {
        const dx = waypoint.x - worker.x;
        const dy = waypoint.y - worker.y;
        const length = Math.hypot(dx, dy);
        if (length > 0.001) {
          return {
            x: dx / length,
            y: dy / length,
          };
        }
      }

      const speed = Math.hypot(worker.vx, worker.vy);
      if (speed > 0.001) {
        return {
          x: worker.vx / speed,
          y: worker.vy / speed,
        };
      }

      return { x: 0, y: 0 };
    }

    function sampleObstaclePressure(x: number, y: number, range: number) {
      let pressureX = 0;
      let pressureY = 0;
      const obstacles = obstacleRectsRef.current;

      for (let index = 0; index < obstacles.length; index += 1) {
        const rect = obstacles[index];
        const left = rect.left - WORKER_RADIUS;
        const right = rect.right + WORKER_RADIUS;
        const top = rect.top - WORKER_RADIUS;
        const bottom = rect.bottom + WORKER_RADIUS;
        const nearestX = clamp(x, left, right);
        const nearestY = clamp(y, top, bottom);
        let dx = x - nearestX;
        let dy = y - nearestY;
        let distSq = dx * dx + dy * dy;

        if (distSq > range * range) {
          continue;
        }

        if (distSq <= 0.000001) {
          const rectCenterX = (left + right) * 0.5;
          const rectCenterY = (top + bottom) * 0.5;
          dx = x - rectCenterX;
          dy = y - rectCenterY;
          distSq = dx * dx + dy * dy;
        }

        const safeDist = distSq > 0.000001 ? Math.sqrt(distSq) : 0.001;
        const force = (range - safeDist) / range;
        pressureX += (dx / safeDist) * force;
        pressureY += (dy / safeDist) * force;
      }

      const world = worldRef.current;
      if (x < range) {
        pressureX += (range - x) / range;
      } else if (x > world.width - range) {
        pressureX -= (x - (world.width - range)) / range;
      }

      if (y < range) {
        pressureY += (range - y) / range;
      } else if (y > world.height - range) {
        pressureY -= (y - (world.height - range)) / range;
      }

      return { x: pressureX, y: pressureY };
    }

    function getWorkerSpatialCellKey(col: number, row: number) {
      return col * SPATIAL_GRID_KEY_STRIDE + row;
    }

    function buildWorkerSpatialGrid(workers: Worker[]): WorkerSpatialGrid {
      const cells = new Map<number, Set<number>>();
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

      const totalCells = grid.cols * grid.rows;
      if (!workerTrafficFieldBuffer || workerTrafficFieldBuffer.length !== totalCells) {
        workerTrafficFieldBuffer = new Float32Array(totalCells);
      } else {
        workerTrafficFieldBuffer.fill(0);
      }
      const field = workerTrafficFieldBuffer;

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

    function resolveWorkerCrowding(workers: Worker[], passes = 3) {
      const minSeparationSq = WORKER_MIN_SEPARATION * WORKER_MIN_SEPARATION;
      for (let pass = 0; pass < passes; pass += 1) {
        const workerSpatialGrid = buildWorkerSpatialGrid(workers);
        let movedAnyWorker = false;

        for (let workerIndex = 0; workerIndex < workers.length; workerIndex += 1) {
          const worker = workers[workerIndex];
          const workerCol = workerSpatialGrid.cols[workerIndex];
          const workerRow = workerSpatialGrid.rows[workerIndex];

          for (let row = workerRow - 1; row <= workerRow + 1; row += 1) {
            for (let col = workerCol - 1; col <= workerCol + 1; col += 1) {
              const bucket = workerSpatialGrid.cells.get(getWorkerSpatialCellKey(col, row));
              if (!bucket) {
                continue;
              }

              for (const otherIndex of bucket) {
                if (otherIndex <= workerIndex) {
                  continue;
                }

                const other = workers[otherIndex];
                const dx = other.x - worker.x;
                const dy = other.y - worker.y;
                const distSq = dx * dx + dy * dy;
                if (distSq >= minSeparationSq) {
                  continue;
                }

                movedAnyWorker = true;
                const safeDist = distSq > 0.000001 ? Math.sqrt(distSq) : 0.001;
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
              }
            }
          }
        }

        if (!movedAnyWorker) {
          break;
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
      const maxNeighbors = performanceProfile.maxFlockingNeighbors;
      const flockingRadiusSq = FLOCKING_RADIUS * FLOCKING_RADIUS;
      const workerCol = workerSpatialGrid.cols[workerIndex];
      const workerRow = workerSpatialGrid.rows[workerIndex];
      let reachedNeighborCap = false;

      for (let row = workerRow - 1; row <= workerRow + 1; row += 1) {
        for (let col = workerCol - 1; col <= workerCol + 1; col += 1) {
          const bucket = workerSpatialGrid.cells.get(getWorkerSpatialCellKey(col, row));
          if (!bucket) {
            continue;
          }

          for (const index of bucket) {
            if (index === workerIndex) {
              continue;
            }

            if (stride > 1 && index % stride !== strideOffset) {
              continue;
            }

            const other = world.workers[index];
            const dx = worker.x - other.x;
            const dy = worker.y - other.y;
            const distSq = dx * dx + dy * dy;
            if (distSq <= 0 || distSq > flockingRadiusSq) {
              continue;
            }

            const dist = Math.sqrt(distSq);
            neighbors += 1;
            const distanceWeight = 1 - dist / FLOCKING_RADIUS;
            separationX += (dx / dist) * (0.8 + distanceWeight * 1.6);
            separationY += (dy / dist) * (0.8 + distanceWeight * 1.6);
            alignmentX += other.vx;
            alignmentY += other.vy;
            cohesionX += other.x;
            cohesionY += other.y;

            if (neighbors >= maxNeighbors) {
              reachedNeighborCap = true;
              break;
            }
          }

          if (reachedNeighborCap) {
            break;
          }
        }

        if (reachedNeighborCap) {
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
      let avoidX = 0;
      let avoidY = 0;
      let neighborsChecked = 0;

      const projectedWorkerX = worker.x + worker.vx * LOCAL_AVOIDANCE_LOOKAHEAD;
      const projectedWorkerY = worker.y + worker.vy * LOCAL_AVOIDANCE_LOOKAHEAD;
      const minGap = WORKER_MIN_SEPARATION + 2;
      const localAvoidanceRadiusSq = LOCAL_AVOIDANCE_RADIUS * LOCAL_AVOIDANCE_RADIUS;
      const obstaclePressure = sampleObstaclePressure(
        projectedWorkerX,
        projectedWorkerY,
        OBSTACLE_REPULSION_RANGE + 18,
      );
      const travel = getPreferredTravelDirection(worker);
      const workerCol = workerSpatialGrid.cols[workerIndex];
      const workerRow = workerSpatialGrid.rows[workerIndex];
      let reachedNeighborCap = false;

      for (let row = workerRow - 1; row <= workerRow + 1; row += 1) {
        for (let col = workerCol - 1; col <= workerCol + 1; col += 1) {
          const bucket = workerSpatialGrid.cells.get(getWorkerSpatialCellKey(col, row));
          if (!bucket) {
            continue;
          }

          for (const index of bucket) {
            if (index === workerIndex) {
              continue;
            }

            const other = world.workers[index];
            const projectedOtherX = other.x + other.vx * LOCAL_AVOIDANCE_LOOKAHEAD;
            const projectedOtherY = other.y + other.vy * LOCAL_AVOIDANCE_LOOKAHEAD;
            let dx = projectedWorkerX - projectedOtherX;
            let dy = projectedWorkerY - projectedOtherY;
            let distSq = dx * dx + dy * dy;
            if (distSq <= 0.00000001) {
              // Deterministic fallback avoids unstable jitter at identical positions.
              const fallbackAngle = (worker.id - other.id) * GOLDEN_ANGLE;
              dx = Math.cos(fallbackAngle);
              dy = Math.sin(fallbackAngle);
              distSq = 1;
            }

            if (distSq > localAvoidanceRadiusSq) {
              continue;
            }

            const dist = Math.sqrt(distSq);
            neighborsChecked += 1;
            const closeness = 1 - dist / LOCAL_AVOIDANCE_RADIUS;
            const closeness2 = closeness * closeness;
            const nx = dx / dist;
            const ny = dy / dist;
            const leftSlipX = -ny;
            const leftSlipY = nx;
            const rightSlipX = ny;
            const rightSlipY = -nx;
            const leftScore =
              leftSlipX * obstaclePressure.x +
              leftSlipY * obstaclePressure.y +
              (leftSlipX * travel.x + leftSlipY * travel.y) * 0.18;
            const rightScore =
              rightSlipX * obstaclePressure.x +
              rightSlipY * obstaclePressure.y +
              (rightSlipX * travel.x + rightSlipY * travel.y) * 0.18;
            const side = leftScore > rightScore + 0.0001
              ? 1
              : rightScore > leftScore + 0.0001
                ? -1
                : worker.id < other.id
                  ? 1
                  : -1;

            avoidX += nx * (LOCAL_AVOIDANCE_PUSH * closeness2);
            avoidY += ny * (LOCAL_AVOIDANCE_PUSH * closeness2);

            if (dist < minGap) {
              const overlap = minGap - dist;
              avoidX += nx * overlap * LOCAL_AVOIDANCE_OVERLAP_PUSH;
              avoidY += ny * overlap * LOCAL_AVOIDANCE_OVERLAP_PUSH;
            }

            // Side-slip term reduces head-on deadlocks when paths intersect.
            avoidX += -ny * side * (LOCAL_AVOIDANCE_SIDE_SLIP * closeness2);
            avoidY += nx * side * (LOCAL_AVOIDANCE_SIDE_SLIP * closeness2);

            if (neighborsChecked >= LOCAL_AVOIDANCE_MAX_NEIGHBORS) {
              reachedNeighborCap = true;
              break;
            }
          }

          if (reachedNeighborCap) {
            break;
          }
        }

        if (reachedNeighborCap) {
          break;
        }
      }

      if (neighborsChecked === 0) {
        return;
      }

      const force = Math.hypot(avoidX, avoidY);
      if (force > 0) {
        const scale = force > LOCAL_AVOIDANCE_MAX_FORCE ? LOCAL_AVOIDANCE_MAX_FORCE / force : 1;
        worker.vx += avoidX * scale * dt;
        worker.vy += avoidY * scale * dt;
      }
    }

    function getTaskApproachPoint(worker: Worker, target: Structure): RoutePoint {
      const world = worldRef.current;
      const phaseOffset = worker.task?.phase === 'deliver' ? Math.PI * 0.37 : 0;
      const angle = worker.id * GOLDEN_ANGLE + target.id * 0.61 + phaseOffset;
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

      const targetReach = target.size + 12;
      const nearTarget =
        distanceSquared(worker.x, worker.y, target.x, target.y) <= targetReach * targetReach;
      const nearApproach =
        distanceSquared(worker.x, worker.y, approachPoint.x, approachPoint.y) <= 14 * 14;
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
      const world = worldRef.current;
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
        if (world.workers.length >= desiredWorkers + 4) {
          node.buildProgress = Math.max(0, node.buildProgress - dt * 2.2);
          return;
        }

        if (node.charge <= 0) {
          node.charge = 0;
          return;
        }

        const buildDemand = clamp((desiredWorkers - world.workers.length) / desiredWorkers, 0.08, 1);
        node.charge = clamp(node.charge - dt * FACTORY_POWER_DRAIN * buildDemand, 0, 100);
        node.buildProgress = clamp(node.buildProgress + dt * FACTORY_BUILD_RATE * buildDemand, 0, 100);
        node.pulse = Math.max(node.pulse, 0.2);

        if (node.buildProgress >= 100 && world.workers.length < WORKER_CAP) {
          node.buildProgress = Math.max(0, node.buildProgress - 100);
          spawnWorkerNearFactory(node);
          node.pulse = 1;
        }
      });

      let rippleWriteIndex = 0;
      for (let index = 0; index < world.ripples.length; index += 1) {
        const ripple = world.ripples[index];
        ripple.life -= dt * 1.5;
        if (ripple.life <= 0.02) {
          continue;
        }

        world.ripples[rippleWriteIndex] = ripple;
        rippleWriteIndex += 1;
      }
      world.ripples.length = rippleWriteIndex;

      let particleWriteIndex = 0;
      for (let index = 0; index < world.particles.length; index += 1) {
        const particle = world.particles[index];
        particle.life -= dt * 2.2;
        if (particle.life <= 0.02) {
          continue;
        }

        particle.x += particle.vx * dt;
        particle.y += particle.vy * dt;
        particle.vx *= 0.96;
        particle.vy *= 0.96;
        world.particles[particleWriteIndex] = particle;
        particleWriteIndex += 1;
      }
      world.particles.length = particleWriteIndex;
    }

    function updateWorkers(dt: number) {
      const world = worldRef.current;
      const deadWorkerIds = new Set<number>();
      const desiredWorkers = currentStrategy.desiredWorkers;
      const loadFactor = getLoadCycleValue();
      const structureStats = getStructureStats(structureIndexRef.current);
      const { coalPatches, generators, batteries, labs, factories } = structureStats;
      const taskPriority = getTaskPriorityProfile(world, structureStats, desiredWorkers);
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
          assignTask(
            worker,
            claims,
            structureCrowding,
            coalPatches,
            generators,
            batteries,
            labs,
            factories,
            taskPriority,
          );
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
            distanceSquared(worker.x, worker.y, idleTarget.x, idleTarget.y) <
              (idleTarget.size + 18) * (idleTarget.size + 18)
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
              distanceSquared(nextWaypoint.x, nextWaypoint.y, idleTarget.x, idleTarget.y) < 12 * 12
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

        const speedSq = worker.vx * worker.vx + worker.vy * worker.vy;
        const maxSpeed = worker.carrying ? 138 : 156;
        if (speedSq > maxSpeed * maxSpeed) {
          const speed = Math.sqrt(speedSq);
          worker.vx = (worker.vx / speed) * maxSpeed;
          worker.vy = (worker.vy / speed) * maxSpeed;
        }

        worker.x = clamp(worker.x + worker.vx * dt, 10, world.width - 10);
        worker.y = clamp(worker.y + worker.vy * dt, 10, world.height - 10);

        if (constrainPointToMap(worker, WORKER_RADIUS)) {
          worker.vx *= 0.72;
          worker.vy *= 0.72;
        }

        if (worker.vx * worker.vx + worker.vy * worker.vy > 4) {
          worker.angle = Math.atan2(worker.vy, worker.vx);
        }
        updateWorkerSpatialGridPosition(workerSpatialGrid, workerIndex, worker);
      }

      if (deadWorkerIds.size > 0) {
        world.workers = world.workers.filter((worker) => !deadWorkerIds.has(worker.id));
      }

      resolveWorkerCrowding(world.workers);
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

    }

    function drawNetworkHints() {
      const coalPatches = getNodes('coal') as CoalPatch[];
      const generators = getNodes('generator') as GeneratorNode[];
      const batteries = getNodes('battery') as BatteryNode[];
      const labs = getNodes('lab') as LabNode[];
      const factories = getNodes('factory') as FactoryNode[];
      const world = worldRef.current;

      if (!networkHintsCanvas) {
        networkHintsCanvas = document.createElement('canvas');
        networkHintsCanvas.width = Math.max(1, Math.floor(world.width));
        networkHintsCanvas.height = Math.max(1, Math.floor(world.height));

        const hintsCtx = networkHintsCanvas.getContext('2d');
        if (!hintsCtx) {
          networkHintsCanvas = null;
          return;
        }

        hintsCtx.setLineDash([4, 6]);
        hintsCtx.lineWidth = 1;

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
            hintsCtx.strokeStyle = 'rgba(66, 66, 66, 0.22)';
            hintsCtx.beginPath();
            hintsCtx.moveTo(source.x, source.y);
            hintsCtx.lineTo(generator.x, generator.y);
            hintsCtx.stroke();
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
            hintsCtx.strokeStyle = 'rgba(0, 185, 6, 0.22)';
            hintsCtx.beginPath();
            hintsCtx.moveTo(source.x, source.y);
            hintsCtx.lineTo(battery.x, battery.y);
            hintsCtx.stroke();
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
            hintsCtx.strokeStyle = 'rgba(185, 233, 55, 0.24)';
            hintsCtx.beginPath();
            hintsCtx.moveTo(source.x, source.y);
            hintsCtx.lineTo(lab.x, lab.y);
            hintsCtx.stroke();
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
            hintsCtx.strokeStyle = 'rgba(66, 66, 66, 0.18)';
            hintsCtx.beginPath();
            hintsCtx.moveTo(source.x, source.y);
            hintsCtx.lineTo(factory.x, factory.y);
            hintsCtx.stroke();
          }
        });
      }

    }

    function invalidateStaticLayer() {
      staticLayerDirty = true;
    }

    function renderStaticLayer() {
      const world = worldRef.current;
      backgroundCtx.clearRect(0, 0, world.width, world.height);
      drawBackgroundScene();
      if (backgroundSceneCanvas) {
        backgroundCtx.drawImage(backgroundSceneCanvas, 0, 0, world.width, world.height);
      } else {
        backgroundCtx.fillStyle = COLORS.paper;
        backgroundCtx.fillRect(0, 0, world.width, world.height);
      }

      if (!performanceProfile.simplifiedVisuals) {
        drawNetworkHints();
        if (networkHintsCanvas) {
          backgroundCtx.save();
          clipContextToMap(backgroundCtx);
          backgroundCtx.drawImage(networkHintsCanvas, 0, 0, world.width, world.height);
          backgroundCtx.restore();
        }
      }

      staticLayerDirty = false;
    }

    function drawLabel(text: string, x: number, y: number) {
      ctx.fillStyle = COLORS.ink;
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

    function drawWorkerGlyph(
      targetCtx: CanvasRenderingContext2D,
      isMalfunctioning: boolean,
      carrying: ItemType | null,
    ) {
      const bodyLength = 8;
      const tailLength = 5;

      targetCtx.fillStyle = isMalfunctioning ? COLORS.dangerDark : COLORS.ink;
      targetCtx.beginPath();
      targetCtx.moveTo(bodyLength, 0);
      targetCtx.lineTo(-tailLength, -5);
      targetCtx.lineTo(-1, 0);
      targetCtx.lineTo(-tailLength, 5);
      targetCtx.closePath();
      targetCtx.fill();

      targetCtx.fillStyle = isMalfunctioning ? COLORS.dangerLight : COLORS.lime;
      targetCtx.fillRect(1, -1, 2, 2);

      if (isMalfunctioning) {
        targetCtx.strokeStyle = COLORS.danger;
        targetCtx.lineWidth = 1;
        targetCtx.beginPath();
        targetCtx.arc(0, 0, 8, 0, Math.PI * 2);
        targetCtx.stroke();
      }

      if (carrying) {
        targetCtx.strokeStyle = COLORS.green;
        targetCtx.lineWidth = 1;
        targetCtx.beginPath();
        targetCtx.moveTo(4, -2);
        targetCtx.lineTo(8, -4);
        targetCtx.moveTo(4, 2);
        targetCtx.lineTo(8, 4);
        targetCtx.stroke();
        targetCtx.fillStyle = carrying === 'coal' ? COLORS.ink : COLORS.green;
        targetCtx.fillRect(7, -2, 4, 4);
        targetCtx.strokeStyle = carrying === 'coal' ? COLORS.lime : COLORS.ink;
        targetCtx.strokeRect(7, -2, 4, 4);
      }
    }

    function getWorkerSpriteFrames(
      key: string,
      isMalfunctioning: boolean,
      carrying: ItemType | null,
    ) {
      const cached = workerSpriteCache.get(key);
      if (cached) {
        return cached;
      }

      const frames: HTMLCanvasElement[] = [];
      for (let index = 0; index < WORKER_SPRITE_ANGLES; index += 1) {
        const sprite = document.createElement('canvas');
        sprite.width = WORKER_SPRITE_SIZE;
        sprite.height = WORKER_SPRITE_SIZE;
        const spriteCtx = sprite.getContext('2d');
        if (!spriteCtx) {
          continue;
        }

        spriteCtx.imageSmoothingEnabled = false;
        spriteCtx.translate(WORKER_SPRITE_HALF, WORKER_SPRITE_HALF);
        spriteCtx.rotate((index / WORKER_SPRITE_ANGLES) * Math.PI * 2);
        drawWorkerGlyph(spriteCtx, isMalfunctioning, carrying);
        frames.push(sprite);
      }

      workerSpriteCache.set(key, frames);
      return frames;
    }

    function warmWorkerSpriteCache() {
      for (let index = 0; index < WORKER_SPRITE_VARIANTS.length; index += 1) {
        const variant = WORKER_SPRITE_VARIANTS[index];
        getWorkerSpriteFrames(variant.key, variant.malfunctioning, variant.carrying);
      }
    }

    function drawWorker(worker: Worker) {
      const variantKey = worker.malfunctionTimer > 0
        ? worker.carrying
          ? `fault-${worker.carrying}`
          : 'fault-empty'
        : worker.carrying
          ? `normal-${worker.carrying}`
          : 'normal-empty';
      const frames = getWorkerSpriteFrames(
        variantKey,
        worker.malfunctionTimer > 0,
        worker.carrying,
      );
      const normalizedAngle = ((worker.angle % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
      const frameIndex =
        Math.round((normalizedAngle / (Math.PI * 2)) * WORKER_SPRITE_ANGLES) % WORKER_SPRITE_ANGLES;
      const sprite = frames[frameIndex];
      if (!sprite) {
        return;
      }

      ctx.drawImage(
        sprite,
        Math.round(worker.x - WORKER_SPRITE_HALF),
        Math.round(worker.y - WORKER_SPRITE_HALF),
      );
    }

    function drawParticles() {
      const particles = worldRef.current.particles;
      for (let index = 0; index < particles.length; index += 1) {
        const particle = particles[index];
        ctx.globalAlpha = Math.max(0, particle.life);
        ctx.fillStyle = particle.color;
        ctx.fillRect(
          Math.round(particle.x - particle.size * 0.5),
          Math.round(particle.y - particle.size * 0.5),
          particle.size,
          particle.size,
        );
      }
      ctx.globalAlpha = 1;
    }

    function drawRipples() {
      const ripples = worldRef.current.ripples;
      ctx.lineWidth = 1.5;
      for (let index = 0; index < ripples.length; index += 1) {
        const ripple = ripples[index];
        const size = (1 - ripple.life) * 26;
        ctx.strokeStyle = ripple.color.startsWith('#')
          ? hexToRgba(ripple.color, Math.max(0.12, ripple.life))
          : ripple.color;
        ctx.strokeRect(ripple.x - size * 0.5, ripple.y - size * 0.5, size, size);
      }
    }

    function drawScene() {
      const world = worldRef.current;
      ctx.clearRect(0, 0, world.width, world.height);

      ctx.save();
      clipToMap();
      ctx.font = "11px 'SFMono-Regular', 'JetBrains Mono', monospace";
      ctx.textAlign = 'center';
      for (let index = 0; index < world.structures.length; index += 1) {
        drawNode(world.structures[index]);
      }
      for (let index = 0; index < world.workers.length; index += 1) {
        drawWorker(world.workers[index]);
      }
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
      if (staticLayerDirty) {
        renderStaticLayer();
      }
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

    warmWorkerSpriteCache();
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
        ref={backgroundCanvasRef}
        aria-hidden="true"
        style={{
          position: 'fixed',
          inset: 0,
          width: '100vw',
          height: '100vh',
          zIndex: 0,
          display: 'block',
          cursor: 'default',
          pointerEvents: 'none',
          transform: 'translateZ(0)',
          willChange: 'transform',
          contain: 'strict',
        }}
      />
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
          pointerEvents: 'none',
          transform: 'translateZ(0)',
          willChange: 'transform',
          contain: 'strict',
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
