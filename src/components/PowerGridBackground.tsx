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
  blocked: boolean[];
  version: number;
};

const COLORS = {
  paper: '#F5F5F5',
  lime: '#B9E937',
  green: '#00B906',
  ink: '#424242',
  softInk: 'rgba(66, 66, 66, 0.22)',
};

const WORKER_RADIUS = 5;
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

function buildFixedMapLayout(width: number, height: number): FixedMapLayout {
  const viewportWidth = Math.max(width, 360);
  const viewportHeight = Math.max(height, 560);

  const headerRect = measureElementRect(document.querySelector('.site-nav'));
  const footerRect = measureElementRect(document.querySelector('.site-footer'));

  let panelRects = Array.from(document.querySelectorAll<HTMLElement>('.panel-shell'))
    .map((element) => measureElementRect(element))
    .filter((rect): rect is ObstacleRect => rect !== null)
    .sort((first, second) => first.top - second.top);

  if (panelRects.length === 0) {
    const fallbackWidth = Math.min(viewportWidth - 40, 920);
    const fallbackLeft = (viewportWidth - fallbackWidth) * 0.5;
    const fallbackHallwayHeight = viewportHeight * 0.1;
    const fallbackHeight = viewportHeight * 0.45;
    const fallbackTop = [
      0,
      fallbackHeight + fallbackHallwayHeight,
    ];
    panelRects = fallbackTop.map((top) => (
      createRect(
        fallbackLeft,
        top,
        fallbackWidth,
        fallbackHeight,
      )
    ));
  }

  const hallwayY = panelRects
    .slice(0, -1)
    .map((rect, index) => {
      const nextRect = panelRects[index + 1];
      const gap = nextRect.top - rect.bottom;
      if (gap < 10) {
        return null;
      }

      return clamp(
        (rect.bottom + nextRect.top) * 0.5,
        72,
        viewportHeight - 72,
      );
    })
    .filter((lane): lane is number => lane !== null);

  if (hallwayY.length === 0) {
    hallwayY.push(clamp(viewportHeight * 0.5, 72, viewportHeight - 72));
  }

  const leftEdge = Math.min(...panelRects.map((rect) => rect.left));
  const rightEdge = Math.max(...panelRects.map((rect) => rect.right));
  const obstacles = [
    ...(headerRect ? [headerRect] : []),
    ...panelRects,
    ...(footerRect ? [footerRect] : []),
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
  const obstacleRectsRef = useRef<ObstacleRect[]>([]);
  const mapLayoutRef = useRef<FixedMapLayout | null>(null);
  const navigationGridRef = useRef<NavigationGrid | null>(null);
  const navigationVersionRef = useRef(0);
  const pathCacheRef = useRef(new Map<string, RoutePoint[]>());
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
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) {
      return;
    }

    let animationFrame = 0;
    let previousTime = performance.now();
    let statsTimer = 0;
    let simulationTime = 0;

    const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));

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
      const cellSize = 10;
      const cols = Math.max(1, Math.ceil(width / cellSize));
      const rows = Math.max(1, Math.ceil(height / cellSize));
      const blocked = new Array(cols * rows).fill(false);
      const padding = WORKER_RADIUS;

      obstacles.forEach((rect) => {
        const minCol = clamp(Math.floor((rect.left - padding) / cellSize), 0, cols - 1);
        const maxCol = clamp(Math.floor((rect.right + padding) / cellSize), 0, cols - 1);
        const minRow = clamp(Math.floor((rect.top - padding) / cellSize), 0, rows - 1);
        const maxRow = clamp(Math.floor((rect.bottom + padding) / cellSize), 0, rows - 1);

        for (let row = minRow; row <= maxRow; row += 1) {
          for (let col = minCol; col <= maxCol; col += 1) {
            blocked[row * cols + col] = true;
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

    function refreshMapLayout(width: number, height: number) {
      const layout = buildFixedMapLayout(width, height);
      mapLayoutRef.current = layout;
      obstacleRectsRef.current = layout.obstacles;
      navigationVersionRef.current += 1;
      navigationGridRef.current = buildNavigationGrid(
        width,
        height,
        layout.obstacles,
        navigationVersionRef.current,
      );
      pathCacheRef.current.clear();
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

      const cacheKey = `${grid.version}:${start.col},${start.row}:${goal.col},${goal.row}`;
      const cachedPath = pathCacheRef.current.get(cacheKey);
      if (cachedPath) {
        return [...cachedPath, { x: endX, y: endY }];
      }

      const totalCells = grid.cols * grid.rows;
      const gScore = new Array(totalCells).fill(Number.POSITIVE_INFINITY);
      const fScore = new Array(totalCells).fill(Number.POSITIVE_INFINITY);
      const cameFrom = new Array<number>(totalCells).fill(-1);
      const openSet = new Set<number>();

      const startIndex = getCellIndex(grid, start.col, start.row);
      const goalIndex = getCellIndex(grid, goal.col, goal.row);
      gScore[startIndex] = 0;
      fScore[startIndex] = Math.hypot(goal.col - start.col, goal.row - start.row);
      openSet.add(startIndex);

      const neighborSteps = [
        { dc: 1, dr: 0, cost: 1 },
        { dc: -1, dr: 0, cost: 1 },
        { dc: 0, dr: 1, cost: 1 },
        { dc: 0, dr: -1, cost: 1 },
        { dc: 1, dr: 1, cost: Math.SQRT2 },
        { dc: -1, dr: 1, cost: Math.SQRT2 },
        { dc: 1, dr: -1, cost: Math.SQRT2 },
        { dc: -1, dr: -1, cost: Math.SQRT2 },
      ];

      while (openSet.size > 0) {
        let currentIndex = -1;
        let currentScore = Number.POSITIVE_INFINITY;

        openSet.forEach((candidate) => {
          if (fScore[candidate] < currentScore) {
            currentScore = fScore[candidate];
            currentIndex = candidate;
          }
        });

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

          pathCacheRef.current.set(cacheKey, pathCells);
          return [...pathCells, { x: endX, y: endY }];
        }

        openSet.delete(currentIndex);

        const currentCol = currentIndex % grid.cols;
        const currentRow = Math.floor(currentIndex / grid.cols);

        neighborSteps.forEach(({ dc, dr, cost }) => {
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
          const tentativeScore = gScore[currentIndex] + cost;

          if (tentativeScore >= gScore[neighborIndex]) {
            return;
          }

          cameFrom[neighborIndex] = currentIndex;
          gScore[neighborIndex] = tentativeScore;
          fScore[neighborIndex] =
            tentativeScore + Math.hypot(goal.col - nextCol, goal.row - nextRow);
          openSet.add(neighborIndex);
        });
      }

      return [{ x: endX, y: endY }];
    }

    function ensureWorkerRoute(worker: Worker, target: Structure) {
      const nextRouteKey = worker.task
        ? `${worker.task.type}:${worker.task.phase}:${worker.task.sourceId}:${worker.task.targetId}`
        : null;
      ensureRoute(worker, nextRouteKey, target.x, target.y);
    }

    function ensureRoute(
      worker: Worker,
      routeKey: string | null,
      targetX: number,
      targetY: number,
    ) {
      const currentRouteVersion = navigationVersionRef.current;

      if (!routeKey) {
        clearWorkerRoute(worker);
        return;
      }

      if (
        worker.routeKey === routeKey &&
        worker.route.length > 0 &&
        worker.routeVersion === currentRouteVersion
      ) {
        return;
      }

      worker.route = planPath(worker.x, worker.y, targetX, targetY);
      worker.routeIndex = 0;
      worker.routeKey = routeKey;
      worker.routeVersion = currentRouteVersion;
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

      refreshMapLayout(world.width, world.height);

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
      const world = worldRef.current;
      ctx.beginPath();
      ctx.rect(0, 0, world.width, world.height);
      obstacleRectsRef.current.forEach((rect) => {
        ctx.rect(rect.left, rect.top, rect.width, rect.height);
      });
      ctx.clip('evenodd');
    }

    function nextId() {
      const id = worldRef.current.nextId;
      worldRef.current.nextId += 1;
      return id;
    }

    function getNodes(kind: StructureKind) {
      return worldRef.current.structures.filter((node) => node.kind === kind);
    }

    function findNode(id: number) {
      return worldRef.current.structures.find((node) => node.id === id);
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
      addRipple(worker.x, worker.y, COLORS.lime);
    }

    function spawnExplosion(x: number, y: number) {
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
          color: index % 3 === 0 ? COLORS.lime : index % 2 === 0 ? COLORS.green : COLORS.ink,
        });
      }
    }

    function removeWorkerWithBurst(worker: Worker) {
      addRipple(worker.x, worker.y, COLORS.ink);
      addRipple(worker.x + 4, worker.y - 4, COLORS.lime);
      addRipple(worker.x - 4, worker.y + 4, COLORS.ink);
      spawnExplosion(worker.x, worker.y);
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
      if (lanes.panelRects.length >= 2) {
        const topPanel = lanes.panelRects[0];
        const bottomPanel = lanes.panelRects[lanes.panelRects.length - 1];
        const topInset = clamp(topPanel.height * 0.16, 42, 110);
        const bottomInset = clamp(bottomPanel.height * 0.16, 42, 110);
        const placements: Array<{ kind: StructureKind; x: number; y: number }> = [
          {
            kind: 'coal',
            x: clamp(lanes.leftLaneX, STRUCTURE_PADDING, width - STRUCTURE_PADDING),
            y: clamp(topPanel.top + topInset, STRUCTURE_PADDING, height - STRUCTURE_PADDING),
          },
          {
            kind: 'generator',
            x: clamp(lanes.rightLaneX, STRUCTURE_PADDING, width - STRUCTURE_PADDING),
            y: clamp(topPanel.top + topInset, STRUCTURE_PADDING, height - STRUCTURE_PADDING),
          },
          {
            kind: 'battery',
            x: clamp(lanes.leftLaneX, STRUCTURE_PADDING, width - STRUCTURE_PADDING),
            y: clamp(bottomPanel.bottom - bottomInset, STRUCTURE_PADDING, height - STRUCTURE_PADDING),
          },
          {
            kind: 'lab',
            x: clamp(lanes.rightLaneX, STRUCTURE_PADDING, width - STRUCTURE_PADDING),
            y: clamp(bottomPanel.bottom - bottomInset, STRUCTURE_PADDING, height - STRUCTURE_PADDING),
          },
          {
            kind: 'factory',
            x: clamp(lanes.centerLaneX, STRUCTURE_PADDING, width - STRUCTURE_PADDING),
            y: clamp(lanes.yPositions[0] ?? height * 0.5, STRUCTURE_PADDING, height - STRUCTURE_PADDING),
          },
        ];

        return placements.map(({ kind, x, y }) => createStructure(kind, x, y, false));
      }

      const hallwayY = lanes.yPositions.length > 0
        ? lanes.yPositions
        : [clamp(height * 0.5, 96, height - 96)];

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
      const toGenerator = new Map<number, number>();
      const fromGenerator = new Map<number, number>();
      const toBattery = new Map<number, number>();
      const fromBattery = new Map<number, number>();
      const toLab = new Map<number, number>();
      const toFactory = new Map<number, number>();

      worldRef.current.workers.forEach((worker) => {
        if (!worker.task) {
          return;
        }

        if (worker.task.type === 'fuel-generator') {
          toGenerator.set(
            worker.task.targetId,
            (toGenerator.get(worker.task.targetId) || 0) + 1,
          );
        }

        if (worker.task.type === 'charge-battery') {
          fromGenerator.set(
            worker.task.sourceId,
            (fromGenerator.get(worker.task.sourceId) || 0) + 1,
          );
          toBattery.set(
            worker.task.targetId,
            (toBattery.get(worker.task.targetId) || 0) + 1,
          );
        }

        if (worker.task.type === 'power-lab') {
          fromBattery.set(
            worker.task.sourceId,
            (fromBattery.get(worker.task.sourceId) || 0) + 1,
          );
          toLab.set(worker.task.targetId, (toLab.get(worker.task.targetId) || 0) + 1);
        }

        if (worker.task.type === 'power-factory') {
          fromBattery.set(
            worker.task.sourceId,
            (fromBattery.get(worker.task.sourceId) || 0) + 1,
          );
          toFactory.set(
            worker.task.targetId,
            (toFactory.get(worker.task.targetId) || 0) + 1,
          );
        }
      });

      return {
        toGenerator,
        fromGenerator,
        toBattery,
        fromBattery,
        toLab,
        toFactory,
      };
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

    function assignTask(worker: Worker) {
      const world = worldRef.current;
      const coalPatches = getNodes('coal') as CoalPatch[];
      const generators = getNodes('generator') as GeneratorNode[];
      const batteries = getNodes('battery') as BatteryNode[];
      const labs = getNodes('lab') as LabNode[];
      const factories = getNodes('factory') as FactoryNode[];
      const claims = getClaimCounts();
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
        const score = urgency * 260 * priority.weights['fuel-generator'] - travelPenalty;

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
          const score = urgency * 200 * priority.weights['charge-battery'] - travelPenalty;

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
          const score = urgency * 240 * priority.weights['power-lab'] - travelPenalty;

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
          const score = urgency * 215 * priority.weights['power-factory'] - travelPenalty;

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

      worker.task = chosen?.task ?? null;
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

    function applyFlocking(worker: Worker, dt: number) {
      const world = worldRef.current;
      let separationX = 0;
      let separationY = 0;
      let alignmentX = 0;
      let alignmentY = 0;
      let cohesionX = 0;
      let cohesionY = 0;
      let neighbors = 0;

      world.workers.forEach((other) => {
        if (other.id === worker.id) {
          return;
        }

        const dx = worker.x - other.x;
        const dy = worker.y - other.y;
        const dist = Math.hypot(dx, dy);

        if (dist <= 0 || dist > 72) {
          return;
        }

        neighbors += 1;
        separationX += dx / dist;
        separationY += dy / dist;
        alignmentX += other.vx;
        alignmentY += other.vy;
        cohesionX += other.x;
        cohesionY += other.y;
      });

      if (neighbors > 0) {
        alignmentX /= neighbors;
        alignmentY /= neighbors;
        cohesionX = cohesionX / neighbors - worker.x;
        cohesionY = cohesionY / neighbors - worker.y;

        worker.vx += separationX * 0.55 * dt;
        worker.vy += separationY * 0.55 * dt;
        worker.vx += (alignmentX - worker.vx) * 0.18 * dt;
        worker.vy += (alignmentY - worker.vy) * 0.18 * dt;
        worker.vx += cohesionX * 0.012 * dt;
        worker.vy += cohesionY * 0.012 * dt;
      }
    }

    function updateWorkerTask(worker: Worker, target: Structure, dt: number) {
      const speed = worker.carrying ? 121 : 132;
      ensureWorkerRoute(worker, target);
      const nextWaypoint = advanceWorkerRoute(worker, target.x, target.y);
      steerTo(worker, nextWaypoint.x, nextWaypoint.y, speed, dt);

      if (distance(worker.x, worker.y, target.x, target.y) > target.size + 10) {
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

      world.workers.forEach((worker) => {
        if (deadWorkerIds.has(worker.id)) {
          return;
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
          deadWorkerIds.add(worker.id);
          removeWorkerWithBurst(worker);
          return;
        }

        if (worker.malfunctionTimer <= 0 && Math.random() < malfunctionRate * dt) {
          triggerWorkerMalfunction(worker);
        }

        if (
          worker.task &&
          (!findNode(worker.task.sourceId) || !findNode(worker.task.targetId))
        ) {
          worker.task = null;
          worker.carrying = null;
          clearWorkerRoute(worker);
        }

        if (!worker.task && worker.malfunctionTimer <= 0) {
          assignTask(worker);
        }

        applyFlocking(worker, dt);

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
      });

      if (deadWorkerIds.size > 0) {
        world.workers = world.workers.filter((worker) => !deadWorkerIds.has(worker.id));
      }
    }

    function drawGrid() {
      const world = worldRef.current;
      ctx.strokeStyle = COLORS.softInk;
      ctx.lineWidth = 1;
      for (let x = 0; x < world.width; x += 32) {
        ctx.beginPath();
        ctx.moveTo(x + 0.5, 0);
        ctx.lineTo(x + 0.5, world.height);
        ctx.stroke();
      }
      for (let y = 0; y < world.height; y += 32) {
        ctx.beginPath();
        ctx.moveTo(0, y + 0.5);
        ctx.lineTo(world.width, y + 0.5);
        ctx.stroke();
      }

      ctx.fillStyle = 'rgba(0, 185, 6, 0.06)';
      for (let x = 16; x < world.width; x += 96) {
        for (let y = 16; y < world.height; y += 96) {
          ctx.fillRect(Math.round(x), Math.round(y), 2, 2);
        }
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
      ctx.strokeStyle = isMalfunctioning ? COLORS.ink : COLORS.green;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(0, -1);
      ctx.lineTo(5, -5);
      ctx.moveTo(0, 1);
      ctx.lineTo(5, 5);
      ctx.stroke();

      ctx.fillStyle = COLORS.ink;
      ctx.beginPath();
      ctx.moveTo(bodyLength, 0);
      ctx.lineTo(-tailLength, -5);
      ctx.lineTo(-1, 0);
      ctx.lineTo(-tailLength, 5);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = isMalfunctioning ? COLORS.ink : COLORS.lime;
      ctx.fillRect(1, -1, 2, 2);

      if (isMalfunctioning) {
        ctx.strokeStyle = COLORS.lime;
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
      ctx.fillStyle = COLORS.paper;
      ctx.fillRect(0, 0, world.width, world.height);

      ctx.save();
      clipToMap();
      drawGrid();
      drawNetworkHints();
      world.structures.forEach(drawNode);
      world.workers.forEach(drawWorker);
      drawParticles();
      drawRipples();
      ctx.restore();
    }

    function loop(now: number) {
      const dt = Math.min(0.05, (now - previousTime) / 1000);
      previousTime = now;
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
    const layoutObserver = new ResizeObserver(() => {
      if (layoutSyncFrame) {
        return;
      }

      layoutSyncFrame = window.requestAnimationFrame(() => {
        layoutSyncFrame = 0;
        syncWorldToCurrentLayout();
      });
    });

    Array.from(document.querySelectorAll('.panel-shell, .page-main, .site-nav')).forEach((element) => {
      if (element instanceof HTMLElement) {
        layoutObserver.observe(element);
      }
    });

    resizeWorld();
    window.addEventListener('resize', resizeWorld);
    animationFrame = window.requestAnimationFrame(loop);

    return () => {
      window.cancelAnimationFrame(animationFrame);
      if (layoutSyncFrame) {
        window.cancelAnimationFrame(layoutSyncFrame);
      }
      layoutObserver.disconnect();
      window.removeEventListener('resize', resizeWorld);
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
