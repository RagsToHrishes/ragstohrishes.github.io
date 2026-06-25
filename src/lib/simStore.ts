export type SimMetrics = {
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

export type SimGraphHistory = {
  power: number[];
  cells: number[];
  workers: number[];
  factory: number[];
};

type SimListener = () => void;

const listeners = new Set<SimListener>();

export const simStore = {
  metrics: {
    status: 'Booting grid',
    powerPct: 0,
    cellsPct: 0,
    workers: 0,
    workerCap: 50,
    malfunctioning: 0,
    factoryPct: 0,
    factoryCharge: 0,
    factoryProgress: 0,
  } satisfies SimMetrics,
  graphHistory: {
    power: [],
    cells: [],
    workers: [],
    factory: [],
  } satisfies SimGraphHistory,

  setMetrics(next: SimMetrics) {
    this.metrics = next;
    this.notify();
  },

  setGraphHistory(next: SimGraphHistory) {
    this.graphHistory = next;
    this.notify();
  },

  subscribe(listener: SimListener) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },

  notify() {
    listeners.forEach((listener) => listener());
  },
};
