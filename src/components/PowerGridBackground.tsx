import React, { useEffect, useRef, useState } from 'react';

type StructureKind = 'coal' | 'generator' | 'battery' | 'lab';
type Tool = StructureKind | 'erase';
type ItemType = 'coal' | 'cell';
type TaskType = 'fuel-generator' | 'charge-battery' | 'power-lab';

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

type Structure = CoalPatch | GeneratorNode | BatteryNode | LabNode;

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
};

type Ripple = {
  x: number;
  y: number;
  life: number;
  color: string;
};

type World = {
  width: number;
  height: number;
  nextId: number;
  structures: Structure[];
  workers: Worker[];
  ripples: Ripple[];
};

type Metrics = {
  status: string;
  workers: number;
  coalPatches: number;
  generators: number;
  batteries: number;
  labs: number;
  storedCells: number;
};

const COLORS = {
  paper: '#F5F5F5',
  lime: '#B9E937',
  green: '#00B906',
  ink: '#424242',
  softInk: 'rgba(66, 66, 66, 0.22)',
};

const TOOL_OPTIONS: Array<{ id: Tool; label: string; short: string }> = [
  { id: 'coal', label: 'Coal patch', short: 'Coal' },
  { id: 'generator', label: 'Generator', short: 'Gen' },
  { id: 'battery', label: 'Battery', short: 'Cell' },
  { id: 'lab', label: 'Lab', short: 'Lab' },
  { id: 'erase', label: 'Clear nearby', short: 'Clear' },
];

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
  };
}

function deriveMetrics(world: World): Metrics {
  const coalPatches = world.structures.filter((node) => node.kind === 'coal').length;
  const generators = world.structures.filter((node) => node.kind === 'generator') as GeneratorNode[];
  const batteries = world.structures.filter((node) => node.kind === 'battery') as BatteryNode[];
  const labs = world.structures.filter((node) => node.kind === 'lab') as LabNode[];
  const totalFuel = generators.reduce((sum, node) => sum + node.fuel, 0);
  const totalCells =
    generators.reduce((sum, node) => sum + node.outputCells, 0) +
    batteries.reduce((sum, node) => sum + node.charge, 0);
  const totalLabEnergy = labs.reduce((sum, node) => sum + node.energy, 0);

  let status = 'Build a small grid';
  if (coalPatches && generators.length && batteries.length && labs.length) {
    status = 'Grid nominal';
    if (totalFuel < generators.length * 28) {
      status = 'Fuel low';
    } else if (totalCells < Math.max(2, batteries.length * 2)) {
      status = 'Balancing load';
    } else if (totalLabEnergy < labs.length * 35) {
      status = 'Labs are draining';
    }
  } else if (coalPatches && generators.length) {
    status = 'Add storage and a lab';
  } else if (coalPatches) {
    status = 'Drop a generator';
  }

  return {
    status,
    workers: world.workers.length,
    coalPatches,
    generators: generators.length,
    batteries: batteries.length,
    labs: labs.length,
    storedCells: totalCells,
  };
}

export default function PowerGridBackground() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const selectedToolRef = useRef<Tool>('generator');
  const resetWorldRef = useRef<() => void>(() => undefined);
  const worldRef = useRef<World>({
    width: 0,
    height: 0,
    nextId: 1,
    structures: [],
    workers: [],
    ripples: [],
  });

  const [selectedTool, setSelectedTool] = useState<Tool>('generator');
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const [metrics, setMetrics] = useState<Metrics>({
    status: 'Build a small grid',
    workers: 0,
    coalPatches: 0,
    generators: 0,
    batteries: 0,
    labs: 0,
    storedCells: 0,
  });

  useEffect(() => {
    selectedToolRef.current = selectedTool;
  }, [selectedTool]);

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

    const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));

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
        size: kind === 'coal' ? 18 : 16,
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

      return {
        ...base,
        kind,
        energy: 56,
      };
    }

    function resetWorld(keepSize = true) {
      const world = worldRef.current;
      const width = keepSize ? world.width : window.innerWidth;
      const height = keepSize ? world.height : window.innerHeight;

      world.nextId = 1;
      world.width = width;
      world.height = height;
      world.structures = [
        createStructure('coal', width * 0.16, height * 0.78, false),
        createStructure('generator', width * 0.28, height * 0.68, false),
        createStructure('battery', width * 0.73, height * 0.6, false),
        createStructure('lab', width * 0.84, height * 0.36, false),
      ];
      world.workers = [];
      world.ripples = [];

      const workerCount = 18;
      for (let index = 0; index < workerCount; index += 1) {
        const angle = (index / workerCount) * Math.PI * 2;
        world.workers.push(
          createWorker(
            nextId(),
            width * 0.52 + Math.cos(angle) * 70,
            height * 0.56 + Math.sin(angle) * 50,
          ),
        );
      }

      setMetrics(deriveMetrics(world));
    }

    resetWorldRef.current = () => {
      resetWorld(true);
    };

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
    }

    function placeStructure(kind: StructureKind, x: number, y: number) {
      const world = worldRef.current;
      const clampedX = clamp(x, 32, world.width - 32);
      const clampedY = clamp(y, 32, world.height - 32);
      const tooClose = world.structures.some(
        (node) => distance(node.x, node.y, clampedX, clampedY) < 46,
      );

      if (tooClose) {
        addRipple(clampedX, clampedY, COLORS.ink);
        return;
      }

      world.structures.push(createStructure(kind, clampedX, clampedY, true));
      addRipple(clampedX, clampedY, COLORS.green);
      setMetrics(deriveMetrics(world));
    }

    function eraseStructure(x: number, y: number) {
      const world = worldRef.current;
      let removed = false;
      world.structures = world.structures.filter((node) => {
        const shouldRemove =
          node.placedByUser && distance(node.x, node.y, x, y) < 28;
        if (shouldRemove) {
          removed = true;
        }
        return !shouldRemove;
      });

      if (removed) {
        addRipple(x, y, COLORS.ink);
        world.workers.forEach((worker) => {
          if (
            worker.task &&
            (!findNode(worker.task.sourceId) || !findNode(worker.task.targetId))
          ) {
            worker.task = null;
            worker.carrying = null;
          }
        });
        setMetrics(deriveMetrics(world));
      }
    }

    function handleCanvasPointer(event: PointerEvent) {
      const rect = canvas.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      const tool = selectedToolRef.current;

      if (tool === 'erase') {
        eraseStructure(x, y);
        return;
      }

      placeStructure(tool, x, y);
    }

    function getClaimCounts() {
      const toGenerator = new Map<number, number>();
      const fromGenerator = new Map<number, number>();
      const toBattery = new Map<number, number>();
      const fromBattery = new Map<number, number>();
      const toLab = new Map<number, number>();

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
      });

      return {
        toGenerator,
        fromGenerator,
        toBattery,
        fromBattery,
        toLab,
      };
    }

    function assignTask(worker: Worker) {
      const world = worldRef.current;
      const coalPatches = getNodes('coal') as CoalPatch[];
      const generators = getNodes('generator') as GeneratorNode[];
      const batteries = getNodes('battery') as BatteryNode[];
      const labs = getNodes('lab') as LabNode[];
      const claims = getClaimCounts();

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
        const score = urgency * 260 - travelPenalty;

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
          const score = urgency * 200 - travelPenalty;

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
          const score = urgency * 240 - travelPenalty;

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

      worker.task = chosen?.task ?? null;
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
      const speed = worker.carrying ? 84 : 92;
      steerTo(worker, target.x, target.y, speed, dt);

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
          addRipple(target.x, target.y, COLORS.lime);
          return;
        }

        if (worker.task.type === 'charge-battery' && target.kind === 'generator' && target.outputCells > 0) {
          target.outputCells -= 1;
          worker.carrying = 'cell';
          worker.task.phase = 'deliver';
          addRipple(target.x, target.y, COLORS.green);
          return;
        }

        if (worker.task.type === 'power-lab' && target.kind === 'battery' && target.charge > 0) {
          target.charge -= 1;
          worker.carrying = 'cell';
          worker.task.phase = 'deliver';
          addRipple(target.x, target.y, COLORS.green);
          return;
        }

        worker.task = null;
        worker.carrying = null;
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

      addRipple(target.x, target.y, COLORS.green);
      worker.task = null;
      worker.carrying = null;
    }

    function updateStructures(dt: number) {
      const generators = getNodes('generator') as GeneratorNode[];
      const labs = getNodes('lab') as LabNode[];

      generators.forEach((node) => {
        node.pulse = Math.max(0, node.pulse - dt * 1.6);
        if (node.fuel > 0) {
          node.production += dt * 0.55;
          node.fuel = clamp(node.fuel - dt * 3.8, 0, 100);
          if (node.production >= 1 && node.outputCells < 5) {
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
        node.energy = clamp(node.energy - dt * 4.4, 0, 100);
        if (node.energy > 16) {
          node.pulse = Math.max(node.pulse, 0.18);
        }
      });

      worldRef.current.ripples = worldRef.current.ripples.filter((ripple) => ripple.life > 0.02);
      worldRef.current.ripples.forEach((ripple) => {
        ripple.life -= dt * 1.5;
      });
    }

    function updateWorkers(dt: number) {
      const world = worldRef.current;
      const centerX = world.width * 0.56;
      const centerY = world.height * 0.5;

      world.workers.forEach((worker) => {
        if (
          worker.task &&
          (!findNode(worker.task.sourceId) || !findNode(worker.task.targetId))
        ) {
          worker.task = null;
          worker.carrying = null;
        }

        if (!worker.task) {
          assignTask(worker);
        }

        applyFlocking(worker, dt);

        if (worker.task) {
          const target =
            worker.task.phase === 'pickup'
              ? findNode(worker.task.sourceId)
              : findNode(worker.task.targetId);

          if (target) {
            updateWorkerTask(worker, target, dt);
          }
        } else {
          worker.wanderSeed += dt * (0.7 + worker.wobble * 0.00005);
          const idleX = centerX + Math.cos(worker.wanderSeed) * 140;
          const idleY = centerY + Math.sin(worker.wanderSeed * 1.2) * 90;
          steerTo(worker, idleX, idleY, 54, dt);
        }

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
        const maxSpeed = worker.carrying ? 96 : 108;
        if (speed > maxSpeed) {
          worker.vx = (worker.vx / speed) * maxSpeed;
          worker.vy = (worker.vy / speed) * maxSpeed;
        }

        worker.x = clamp(worker.x + worker.vx * dt, 10, world.width - 10);
        worker.y = clamp(worker.y + worker.vy * dt, 10, world.height - 10);

        if (speed > 2) {
          worker.angle = Math.atan2(worker.vy, worker.vx);
        }
      });
    }

    function drawGrid() {
      const world = worldRef.current;
      ctx.clearRect(0, 0, world.width, world.height);
      ctx.fillStyle = COLORS.paper;
      ctx.fillRect(0, 0, world.width, world.height);

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
    }

    function drawWorker(worker: Worker) {
      const x = Math.round(worker.x);
      const y = Math.round(worker.y);

      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(worker.angle);

      ctx.fillStyle = 'rgba(66, 66, 66, 0.12)';
      ctx.beginPath();
      ctx.ellipse(0, 8, 9, 4, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = COLORS.green;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(-1, -1);
      ctx.lineTo(6, -6);
      ctx.moveTo(-1, 1);
      ctx.lineTo(6, 6);
      ctx.stroke();

      ctx.fillStyle = COLORS.ink;
      ctx.beginPath();
      ctx.moveTo(10, 0);
      ctx.lineTo(-6, -6);
      ctx.lineTo(-1, 0);
      ctx.lineTo(-6, 6);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = COLORS.lime;
      ctx.fillRect(2, -1, 3, 2);

      if (worker.carrying) {
        ctx.strokeStyle = COLORS.green;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(5, -3);
        ctx.lineTo(10, -6);
        ctx.moveTo(5, 3);
        ctx.lineTo(10, 6);
        ctx.stroke();
        ctx.fillStyle = worker.carrying === 'coal' ? COLORS.ink : COLORS.green;
        ctx.fillRect(9, -3, 6, 6);
        ctx.strokeStyle = worker.carrying === 'coal' ? COLORS.lime : COLORS.ink;
        ctx.strokeRect(9, -3, 6, 6);
      }

      ctx.restore();
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
      drawGrid();
      drawNetworkHints();
      worldRef.current.structures.forEach(drawNode);
      worldRef.current.workers.forEach(drawWorker);
      drawRipples();
    }

    function loop(now: number) {
      const dt = Math.min(0.05, (now - previousTime) / 1000);
      previousTime = now;

      updateStructures(dt);
      updateWorkers(dt);
      drawScene();

      statsTimer += dt;
      if (statsTimer >= 0.25) {
        statsTimer = 0;
        setMetrics(deriveMetrics(worldRef.current));
      }

      animationFrame = window.requestAnimationFrame(loop);
    }

    resizeWorld();
    canvas.addEventListener('pointerdown', handleCanvasPointer);
    window.addEventListener('resize', resizeWorld);
    animationFrame = window.requestAnimationFrame(loop);

    return () => {
      window.cancelAnimationFrame(animationFrame);
      canvas.removeEventListener('pointerdown', handleCanvasPointer);
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
          cursor: 'crosshair',
        }}
      />

      <aside className="sim-hotbar" aria-label="Power grid simulation controls">
        <div className="sim-hotbar__header">
          <p className="sim-hotbar__eyebrow">Ambient power grid</p>
          <button
            type="button"
            className="sim-hotbar__help-toggle"
            aria-expanded={isHelpOpen}
            aria-controls="boid-help-panel"
            aria-label="About the boid simulation"
            onClick={() => setIsHelpOpen((open) => !open)}
          >
            ?
          </button>
        </div>

        {isHelpOpen && (
          <section id="boid-help-panel" className="sim-hotbar__help">
            <h2 className="sim-hotbar__help-title">How to play</h2>
            <p className="sim-hotbar__help-copy">
              The worker-boids keep a tiny power grid alive. They flock when idle, then switch to jobs as soon as your layout creates demand.
            </p>
            <ul className="sim-hotbar__help-list">
              <li>Pick a tool, then click empty space in the background to place it.</li>
              <li>
                <span className="sim-hotbar__token">Coal</span> feeds <span className="sim-hotbar__token">Gen</span>, <span className="sim-hotbar__token">Gen</span> makes energy cells, <span className="sim-hotbar__token">Cell</span> stores them, and <span className="sim-hotbar__token">Lab</span> consumes them.
              </li>
              <li>
                Use <span className="sim-hotbar__token">Clear</span> to remove nearby structures you placed. <span className="sim-hotbar__token">Reset layout</span> restores the default map.
              </li>
              <li>
                Watch <span className="sim-hotbar__token">Status</span> and <span className="sim-hotbar__token">Cells</span>. If fuel is low or labs are draining, add coal, generators, or storage.
              </li>
            </ul>
          </section>
        )}

        <div className="sim-hotbar__buttons" role="group" aria-label="Placement tools">
          {TOOL_OPTIONS.map((tool) => (
            <button
              key={tool.id}
              type="button"
              aria-label={tool.label}
              className={`sim-hotbar__button ${
                selectedTool === tool.id ? 'is-active' : ''
              }`}
              onClick={() => setSelectedTool(tool.id)}
            >
              {tool.short}
            </button>
          ))}
        </div>
        <button
          type="button"
          className="sim-hotbar__reset"
          onClick={() => {
            selectedToolRef.current = 'generator';
            setSelectedTool('generator');
            resetWorldRef.current();
          }}
        >
          Reset layout
        </button>
        <dl className="sim-hotbar__stats">
          <div>
            <dt>Status</dt>
            <dd>{metrics.status}</dd>
          </div>
          <div>
            <dt>Workers</dt>
            <dd>{metrics.workers}</dd>
          </div>
          <div>
            <dt>Grid</dt>
            <dd>
              {metrics.coalPatches}/{metrics.generators}/{metrics.batteries}/{metrics.labs}
            </dd>
          </div>
          <div>
            <dt>Cells</dt>
            <dd>{metrics.storedCells}</dd>
          </div>
        </dl>
        <p className="sim-hotbar__hint">
          Click open background space to place the selected structure.
        </p>
      </aside>
    </>
  );
}
