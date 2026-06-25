import React, { useEffect, useRef, useState } from 'react';
import { simStore, type SimGraphHistory, type SimMetrics } from '../lib/simStore';

const GRAPH_COLORS = {
  green: '#00B906',
  lime: '#B9E937',
  ink: 'var(--color-text-primary)',
};

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
    <article className="factorybots-menu__graph">
      <div className="factorybots-menu__graph-header">
        <p className="factorybots-menu__graph-label">{label}</p>
        <p className="factorybots-menu__graph-value">{value}</p>
      </div>
      <svg className="factorybots-menu__graph-svg" viewBox="0 0 112 28" preserveAspectRatio="none" aria-hidden="true">
        <path
          d={buildSparklinePath(values)}
          fill="none"
          stroke={color}
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <p className="factorybots-menu__graph-detail">{detail}</p>
    </article>
  );
}

export default function FactorybotsMenu() {
  const [isOpen, setIsOpen] = useState(false);
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const [metrics, setMetrics] = useState<SimMetrics>(simStore.metrics);
  const [graphHistory, setGraphHistory] = useState<SimGraphHistory>(simStore.graphHistory);
  const [inkGraphColor, setInkGraphColor] = useState(GRAPH_COLORS.ink);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function syncInkColor() {
      const style = getComputedStyle(document.documentElement);
      const next = style.getPropertyValue('--color-text-primary').trim();
      if (next) {
        setInkGraphColor(next);
      }
    }

    syncInkColor();
    window.addEventListener('themechange', syncInkColor);
    return () => {
      window.removeEventListener('themechange', syncInkColor);
    };
  }, []);

  useEffect(() => {
    return simStore.subscribe(() => {
      setMetrics({ ...simStore.metrics });
      setGraphHistory({
        power: [...simStore.graphHistory.power],
        cells: [...simStore.graphHistory.cells],
        workers: [...simStore.graphHistory.workers],
        factory: [...simStore.graphHistory.factory],
      });
    });
  }, []);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setIsOpen(false);
        setIsHelpOpen(false);
      }
    }

    function handlePointerDown(event: MouseEvent) {
      if (!menuRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
        setIsHelpOpen(false);
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('pointerdown', handlePointerDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('pointerdown', handlePointerDown);
    };
  }, [isOpen]);

  return (
    <div className="factorybots-menu" ref={menuRef} data-sim-obstacle="header">
      <button
        type="button"
        className="factorybots-menu__trigger"
        aria-expanded={isOpen}
        aria-haspopup="true"
        aria-controls="factorybots-panel"
        onClick={() => {
          setIsOpen((open) => !open);
          if (isOpen) {
            setIsHelpOpen(false);
          }
        }}
      >
        Factorybots
      </button>

      {isOpen && (
        <div id="factorybots-panel" className="factorybots-menu__panel" role="region" aria-label="Factorybots simulation">
          <div className="factorybots-menu__panel-header">
            <p className="factorybots-menu__eyebrow">Factorybots</p>
            <div className="factorybots-menu__actions">
              <button
                type="button"
                className="factorybots-menu__icon-button"
                aria-expanded={isHelpOpen}
                aria-controls="factorybots-help-panel"
                aria-label="About the factorybots simulation"
                onClick={() => setIsHelpOpen((open) => !open)}
              >
                ?
              </button>
            </div>
          </div>

          {isHelpOpen && (
            <section id="factorybots-help-panel" className="factorybots-menu__help">
              <h2 className="factorybots-menu__help-title">How it works</h2>
              <p className="factorybots-menu__help-copy">
                The worker-boids act like a homeostatic controller for the whole system. They continuously rotate through short strategic pushes so fuel, stored cells, lab energy, and worker count all stay in motion instead of letting one objective dominate forever.
              </p>
              <ul className="factorybots-menu__help-list">
                <li><span className="factorybots-menu__token">Fuel push</span> sends more traffic toward coal, generators, and even new worker production if fuel stays stressed.</li>
                <li><span className="factorybots-menu__token">Reserve balancing</span> shifts attention toward moving energy into batteries.</li>
                <li><span className="factorybots-menu__token">Lab support</span> redirects traffic from storage into lab power.</li>
                <li><span className="factorybots-menu__token">Factory ramp</span> and <span className="factorybots-menu__token">Crew recovery</span> raise factory priority when the swarm wants more workers or needs to replace faults.</li>
                <li>The hallway routes stay adaptive, so the swarm replans as the page layout changes and keeps returning toward equilibrium.</li>
              </ul>
              <p className="factorybots-menu__help-note">
                This simulation is tuned to surface rich, shifting behavior, so the swarm keeps producing new dynamics instead of settling into one static pattern.
              </p>
            </section>
          )}

          <div className="factorybots-menu__status-card">
            <p className="factorybots-menu__status-label">Status</p>
            <p className="factorybots-menu__status-value">{metrics.status}</p>
          </div>

          <div className="factorybots-menu__graphs" aria-label="Factorybots trend graphs">
            <MiniGraph
              label="Power"
              value={`${metrics.powerPct}%`}
              detail="fuel + reserves"
              values={graphHistory.power}
              color={GRAPH_COLORS.green}
            />
            <MiniGraph
              label="Cells"
              value={`${metrics.cellsPct}%`}
              detail="stored charge"
              values={graphHistory.cells}
              color={GRAPH_COLORS.lime}
            />
            <MiniGraph
              label="Workers"
              value={`${metrics.workers}/${metrics.workerCap}`}
              detail={metrics.malfunctioning > 0 ? `${metrics.malfunctioning} faulty` : 'crew stable'}
              values={graphHistory.workers}
              color={inkGraphColor}
            />
            <MiniGraph
              label="Factory"
              value={`${metrics.factoryPct}%`}
              detail={`${metrics.factoryCharge}% charge · ${metrics.factoryProgress}% build`}
              values={graphHistory.factory}
              color={GRAPH_COLORS.green}
            />
          </div>
        </div>
      )}
    </div>
  );
}
