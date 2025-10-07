import React, { useEffect, useRef } from "react";

// Canvas Pachinko with:
// • Air + bucket ball-ball collisions (spatial hash in air)
// • OFF-SCREEN TOP FUNNEL (not rendered) that constrains initial ball positions/collisions
// • Stable stacking, per-bucket counters, random peg deflections, and a Galton Demo custom event
export default function PachinkoCanvas() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d", { alpha: true })!;

    // --- HiDPI setup ---
    const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));

    // --- Physics constants (seconds-based) ---
    const GRAVITY = 1800; // px/s^2
    const AIR_DRAG = 0.995;
    const GROUND_DRAG = 0.965; // slightly more friction for stable stacks
    const BOUNCE = 0.33; // a touch softer
    const PEG_BOUNCE = 0.7;
    const MAX_DT = 1 / 30;
    const SUBSTEPS = 2; // split dt for stability when crowded

    // Pair-collision solver params
    const MAX_PAIR_ITERS_BUCKET = 3; // relaxation passes in bucket
    const MAX_PAIR_ITERS_AIR = 1;    // fewer iterations while airborne for perf
    const PAIR_PUSH_BUCKET = 0.6;    // stronger separation to avoid sinking
    const PAIR_PUSH_AIR = 0.45;      // a bit softer in air to reduce jitter
    const FLOOR_SLOP = 0.3;          // resting tolerance

    const BALL_RADIUS = 7;
    const PEG_RADIUS = 6;

    // Spatial hash (broadphase). Cell ~ few radii.
    const GRID_CELL = BALL_RADIUS * 3;

    type Ball = {
      x: number; y: number; vx: number; vy: number; r: number; color: string;
      isOnFloor: boolean; bucketIndex: number; timeInBucket: number;
    };
    type Peg = { x: number; y: number; r: number };
    type Bucket = { x: number; y: number; width: number; height: number; balls: Ball[] };
    type Segment = { x1: number; y1: number; x2: number; y2: number };

    const state = {
      w: 0,
      h: 0,
      running: false,
      balls: [] as Ball[],
      pegs: [] as Peg[],
      buckets: [] as Bucket[],
      segments: [] as Segment[], // OFF-SCREEN funnel walls
      bucketY: 0,
      funnelGap: 30,   // opening width at the bottom of the funnel (px)
      funnelDepth: 160,// vertical depth of the funnel above the visible region
      renderFunnel: false, // not rendered by default
    };

    let passiveSpawnTimer: number | null = null;

    const ballColors = ["#E94822", "#F2910A", "#EFD510", "#00D4AA", "#6C5CE7", "#FD79A8", "#C0C0C0", "#FFD700"];

    const powDrag = (factor: number, dt: number) => Math.pow(factor, dt * 60);

    function hexToRGBA(hex: string, alpha = 1) {
      let h = hex.replace('#','');
      if (h.length === 3) h = h.split('').map(c => c+c).join('');
      const r = parseInt(h.slice(0,2),16), g = parseInt(h.slice(2,4),16), b = parseInt(h.slice(4,6),16);
      return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }

    function resize() {
      state.w = window.innerWidth;
      state.h = window.innerHeight;
      canvas.width = Math.floor(state.w * dpr);
      canvas.height = Math.floor(state.h * dpr);
      canvas.style.width = state.w + 'px';
      canvas.style.height = state.h + 'px';
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      state.bucketY = state.h * 0.85;
      generatePegs();
      generateBuckets();
      generateOffscreenFunnel();
    }

    function generatePegs() {
      state.pegs = [];
      const pegSpacing = 32;
      const boardHeight = state.h * 0.84;
      for (let y = 40; y < boardHeight - 20; y += pegSpacing) {
        const stagger = (Math.floor(y / pegSpacing) % 2) * (pegSpacing / 2);
        for (let x = 40; x < state.w - 20; x += pegSpacing) {
          const px = x + stagger;
          if (px < state.w - 20) state.pegs.push({ x: px, y, r: PEG_RADIUS });
        }
      }
    }

    function generateBuckets() {
      state.buckets = [];
      // More buckets so the Gaussian shape is clearer
      const bucketCount = Math.max(16, Math.min(36, Math.floor(state.w / 45)));
      const width = state.w / bucketCount;
      const height = state.h * 0.15;
      const y = state.bucketY;
      for (let i = 0; i < bucketCount; i++) state.buckets.push({ x: i*width, y, width, height, balls: [] });
    }

    // Create an OFF-SCREEN funnel above the canvas. Balls will spawn inside and collide with it
    // before entering the visible area, yielding a narrow initial distribution.
    function generateOffscreenFunnel() {
      const gap = state.funnelGap; // opening at bottom of funnel
      const depth = state.funnelDepth; // how tall the funnel is (offscreen)
      const cx = state.w * 0.5;
      const botY = -10;              // just above the visible top edge
      const topY = botY - depth;     // further offscreen
      const leftTopX = Math.max(10, cx - state.w * 0.35);
      const rightTopX = Math.min(state.w - 10, cx + state.w * 0.35);
      const leftBotX = cx - gap * 0.5;
      const rightBotX = cx + gap * 0.5;

      state.segments = [
        { x1: leftTopX,  y1: topY, x2: leftBotX,  y2: botY },
        { x1: rightTopX, y1: topY, x2: rightBotX, y2: botY },
      ];
    }

    function getBucketIndexForX(x: number) {
      const idx = Math.floor((x / state.w) * state.buckets.length);
      return Math.max(0, Math.min(state.buckets.length - 1, idx));
    }

    function createBall(x: number, y: number, color?: string) {
      const ball: Ball = {
        x, y, vx: (Math.random()-0.5)*140, vy: 0, r: BALL_RADIUS,
        color: color ?? ballColors[Math.floor(Math.random()*ballColors.length)],
        isOnFloor: false, bucketIndex: -1, timeInBucket: 0,
      };
      state.balls.push(ball);
    }

    // Spawn N balls inside the offscreen funnel opening so they collide with funnel walls
    function spawnFromFunnel(n: number, color?: string) {
      const cx = state.w * 0.5;
      const botY = -10; // bottom (offscreen) edge of funnel
      for (let i = 0; i < n; i++) {
        const x = cx + (Math.random() - 0.5) * Math.max(8, state.funnelGap * 0.6);
        const y = botY - 2 - Math.random() * 8; // just inside the funnel
        createBall(x, y, color);
      }
    }

    const STREAM_COLOR = "#C0C0C0";
    const STREAM_INTERVAL_MS = 260;

    function spawnStreamBall(batch = 1) {
      spawnFromFunnel(batch, STREAM_COLOR);
    }

    function startPassiveStream() {
      if (passiveSpawnTimer !== null) return;
      spawnStreamBall();
      passiveSpawnTimer = window.setInterval(() => spawnStreamBall(), STREAM_INTERVAL_MS);
    }

    function stopPassiveStream() {
      if (passiveSpawnTimer === null) return;
      window.clearInterval(passiveSpawnTimer);
      passiveSpawnTimer = null;
    }

    function spawnGaltonDemo() {
      state.balls.length = 0;
      spawnFromFunnel(100, STREAM_COLOR);
      spawnFromFunnel(1, "#FFD700");
    }

    // --- Collision helpers ---
    function resolveBallPeg(ball: Ball, peg: Peg) {
      const dx = ball.x - peg.x, dy = ball.y - peg.y;
      const dist = Math.hypot(dx, dy), minDist = ball.r + peg.r;
      if (dist < minDist) {
        const nx = dx / (dist || 1), ny = dy / (dist || 1);
        const pen = minDist - dist;
        ball.x += nx * pen;
        ball.y += ny * pen;
        const vn = ball.vx * nx + ball.vy * ny;
        const tx = -ny, ty = nx;
        const vt = ball.vx * tx + ball.vy * ty;
        const rnd = (Math.random() - 0.5) * 0.25; // random turn on peg hit
        const newVn = -vn * PEG_BOUNCE;
        const newVt = vt * 0.9 + rnd * 100;
        ball.vx = newVn * nx + newVt * tx;
        ball.vy = newVn * ny + newVt * ty;
      }
    }

    function resolveBallBall(a: Ball, b: Ball, push: number) {
      const dx = b.x - a.x, dy = b.y - a.y;
      const dist = Math.hypot(dx, dy), minDist = a.r + b.r;
      if (dist > 0 && dist < minDist) {
        const nx = dx / dist, ny = dy / dist;
        const overlap = (minDist - dist) * push;
        a.x -= nx * overlap * 0.5; a.y -= ny * overlap * 0.5;
        b.x += nx * overlap * 0.5; b.y += ny * overlap * 0.5;
        const rvx = b.vx - a.vx, rvy = b.vy - a.vy;
        const rel = rvx * nx + rvy * ny;
        if (rel < 0) {
          const imp = -(1 - BOUNCE) * rel * 0.5;
          const ix = imp * nx, iy = imp * ny;
          a.vx -= ix; a.vy -= iy; b.vx += ix; b.vy += iy;
        }
      }
    }

    // Circle vs segment (funnel walls). Push ball out and reflect velocity.
    function resolveBallSegment(ball: Ball, s: Segment) {
      const vx = s.x2 - s.x1, vy = s.y2 - s.y1;
      const len2 = vx*vx + vy*vy || 1;
      const t = Math.max(0, Math.min(1, ((ball.x - s.x1)*vx + (ball.y - s.y1)*vy) / len2));
      const cx = s.x1 + t * vx, cy = s.y1 + t * vy; // closest point on segment
      const dx = ball.x - cx, dy = ball.y - cy;
      const dist = Math.hypot(dx, dy);
      if (dist < ball.r) {
        const nx = dx / (dist || 1), ny = dy / (dist || 1);
        const pen = ball.r - dist;
        ball.x += nx * pen;
        ball.y += ny * pen;
        const vn = ball.vx * nx + ball.vy * ny;
        const tx = -ny, ty = nx;
        const vt = ball.vx * tx + ball.vy * ty;
        const newVn = -vn * Math.max(PEG_BOUNCE, 0.55);
        const newVt = vt * 0.95;
        ball.vx = newVn * nx + newVt * tx;
        ball.vy = newVn * ny + newVt * ty;
      }
    }

    // Spatial hash utilities
    function cellCoord(x: number) { return Math.floor(x / GRID_CELL); }
    function key(cx: number, cy: number) { return `${cx},${cy}`; }

    function collideAirWithGrid() {
      // Build grid
      const grid = new Map<string, number[]>();
      const balls = state.balls;
      for (let i = 0; i < balls.length; i++) {
        const b = balls[i];
        if (b.y >= state.bucketY - b.r) continue; // only airborne
        const cx = cellCoord(b.x), cy = cellCoord(b.y);
        const k = key(cx, cy);
        const arr = grid.get(k);
        if (arr) arr.push(i); else grid.set(k, [i]);
      }

      // For each ball, test neighbors in 3x3 cells
      for (let iter = 0; iter < MAX_PAIR_ITERS_AIR; iter++) {
        for (let i = 0; i < balls.length; i++) {
          const a = balls[i];
          if (a.y >= state.bucketY - a.r) continue;
          const cx = cellCoord(a.x), cy = cellCoord(a.y);
          for (let oy = -1; oy <= 1; oy++) {
            for (let ox = -1; ox <= 1; ox++) {
              const arr = grid.get(key(cx + ox, cy + oy));
              if (!arr) continue;
              for (const j of arr) {
                if (j <= i) continue; // avoid double-processing
                const b = balls[j];
                // quick AABB reject before circle test
                if (Math.abs(a.x - b.x) > a.r + b.r || Math.abs(a.y - b.y) > a.r + b.r) continue;
                resolveBallBall(a, b, PAIR_PUSH_AIR);
              }
            }
          }
        }
      }
    }

    function integrate(dt: number) {
      const airDrag = powDrag(AIR_DRAG, dt);
      const groundDrag = powDrag(GROUND_DRAG, dt);

      for (const b of state.buckets) b.balls.length = 0;

      // Integrate and handle walls + offscreen funnel + pegs
      for (const ball of state.balls) {
        // gravity
        ball.vy += GRAVITY * dt;
        // integrate
        ball.x += ball.vx * dt;
        ball.y += ball.vy * dt;

        // world walls
        if (ball.x - ball.r < 0) { ball.x = ball.r; ball.vx = -ball.vx * BOUNCE; }
        if (ball.x + ball.r > state.w) { ball.x = state.w - ball.r; ball.vx = -ball.vx * BOUNCE; }

        // OFF-SCREEN funnel collisions: apply while ball is near the top edge or above it
        if (ball.y < 60) {
          for (const s of state.segments) resolveBallSegment(ball, s);
        }

        // peg collisions while above bucket line
        if (ball.y < state.bucketY - ball.r) {
          for (const peg of state.pegs) resolveBallPeg(ball, peg);
          ball.vx *= airDrag; ball.vy *= airDrag;
          ball.bucketIndex = -1; ball.isOnFloor = false; ball.timeInBucket = 0;
        }
      }

      // Airborne ball-ball collisions via spatial hash
      collideAirWithGrid();

      // Now bucket region constraints + per-bucket classification
      for (const ball of state.balls) {
        if (ball.y >= state.bucketY - ball.r) {
          const idx = getBucketIndexForX(ball.x);
          const bucket = state.buckets[idx];
          const left = bucket.x + ball.r, right = bucket.x + bucket.width - ball.r;
          const floor = bucket.y + bucket.height - ball.r;

          if (ball.x < left) { ball.x = left; if (ball.vx < 0) ball.vx = -ball.vx * BOUNCE; }
          if (ball.x > right) { ball.x = right; if (ball.vx > 0) ball.vx = -ball.vx * BOUNCE; }
          if (ball.y > floor) { ball.y = floor; if (ball.vy > 0) ball.vy = -ball.vy * BOUNCE; }

          ball.isOnFloor = Math.abs(ball.y - floor) < FLOOR_SLOP;
          if (ball.isOnFloor) { ball.vx *= GROUND_DRAG; if (Math.abs(ball.vy) < 8) ball.vy = 0; }
          else { ball.vx *= airDrag; ball.vy *= airDrag; }

          bucket.balls.push(ball);
          ball.bucketIndex = idx;
        }
      }

      // sort by height so lower balls settle first (reduces glitches)
      for (const bucket of state.buckets) {
        bucket.balls.sort((a,b) => a.y - b.y);
        const arr = bucket.balls;
        for (let it = 0; it < MAX_PAIR_ITERS_BUCKET; it++) {
          for (let i = 0; i < arr.length; i++) {
            for (let j = i+1; j < arr.length; j++) resolveBallBall(arr[i], arr[j], PAIR_PUSH_BUCKET);
          }
        }
      }

      // cull long-sleeping balls
      for (let i = state.balls.length - 1; i >= 0; i--) {
        const b = state.balls[i];
        if (b.bucketIndex !== -1) {
          b.timeInBucket += dt;
          if (b.timeInBucket >= 3) {
            state.balls.splice(i, 1);
          }
        } else {
          b.timeInBucket = 0;
        }
      }
    }

    function update(dt: number) {
      const step = dt / SUBSTEPS;
      for (let s = 0; s < SUBSTEPS; s++) integrate(step);
    }

    // --- Drawing ---
    function drawBackground() {
      const g = ctx.createLinearGradient(0, 0, 0, state.h);
      g.addColorStop(0, '#000'); g.addColorStop(0.5, '#0b0b0b'); g.addColorStop(1, '#000');
      ctx.fillStyle = g; ctx.fillRect(0, 0, state.w, state.h);

      // buckets
      for (const bucket of state.buckets) {
        ctx.fillStyle = 'rgba(51,51,51,0.85)';
        ctx.fillRect(bucket.x, bucket.y, bucket.width, bucket.height);
        ctx.strokeStyle = '#666'; ctx.lineWidth = 2; ctx.strokeRect(bucket.x, bucket.y, bucket.width, bucket.height);
        ctx.fillStyle = '#AAA'; ctx.font = `${Math.max(10, Math.min(14, Math.floor(bucket.width/6)))}px 'Roboto', sans-serif`;
        ctx.textAlign = 'center';
        ctx.fillText(`${bucket.balls.length}`, bucket.x + bucket.width/2, bucket.y + 16);
      }

      // NOTE: funnel is intentionally NOT drawn (offscreen); set renderFunnel=true to visualize for debugging
      if (state.renderFunnel) drawFunnel();
    }

    function drawFunnel() {
      ctx.save();
      ctx.strokeStyle = '#444';
      ctx.lineWidth = 6;
      ctx.lineCap = 'round';
      for (const s of state.segments) {
        ctx.beginPath();
        ctx.moveTo(s.x1, s.y1);
        ctx.lineTo(s.x2, s.y2);
        ctx.stroke();
      }
      ctx.restore();
    }

    function drawPegs() {
      for (const peg of state.pegs) {
        ctx.beginPath(); ctx.fillStyle = '#797979';
        ctx.arc(peg.x, peg.y, peg.r, 0, Math.PI*2); ctx.fill();
        ctx.beginPath(); ctx.fillStyle = '#9c9c9c';
        ctx.arc(peg.x - 2, peg.y - 2, peg.r*0.55, 0, Math.PI*2); ctx.fill();
      }
    }

    function drawBalls() {
      for (const b of state.balls) {
        const fade = b.bucketIndex !== -1
          ? Math.max(0, 1 - Math.max(0, b.timeInBucket - 1.5) / 1.5)
          : 1;
        ctx.shadowColor = `rgba(0,0,0,${0.25*fade})`; ctx.shadowBlur = 8; ctx.shadowOffsetX = 3; ctx.shadowOffsetY = 3;
        ctx.fillStyle = hexToRGBA(b.color, fade);
        ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, Math.PI*2); ctx.fill();
        ctx.shadowBlur = 0; ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 0;
        ctx.fillStyle = `rgba(255,255,255,${0.4*fade})`;
        ctx.beginPath(); ctx.arc(b.x - b.r*0.35, b.y - b.r*0.35, b.r*0.42, 0, Math.PI*2); ctx.fill();
      }
    }

    function drawFrame() {
      ctx.clearRect(0, 0, state.w, state.h);
      drawBackground();
      drawPegs();
      drawBalls();
    }

    let prev = performance.now() / 1000;
    let raf = 0;
    function loop() {
      if (!state.running) return;
      const now = performance.now() / 1000; let dt = now - prev; prev = now; dt = Math.min(MAX_DT, dt);
      update(dt); drawFrame();
      raf = requestAnimationFrame(loop);
    }

    function onPointerDown(e: PointerEvent) {
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left; const y = e.clientY - rect.top;
      // If clicking near the top, spawn from offscreen funnel instead of exact click point
      if (y < 80) {
        spawnFromFunnel(1);
      } else if (y < state.bucketY - BALL_RADIUS) {
        const jitter = (Math.random() - 0.5) * 24;
        createBall(x + jitter, Math.max(40, y));
      }
    }

    function onResize() { resize(); }

    resize();
    startPassiveStream();
    state.running = true; raf = requestAnimationFrame(loop);
    canvas.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('resize', onResize);

    const handleGaltonDemo = () => { spawnGaltonDemo(); };
    canvas.addEventListener('galtonDemo', handleGaltonDemo);

    return () => {
      state.running = false; cancelAnimationFrame(raf);
      stopPassiveStream();
      canvas.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('resize', onResize);
      canvas.removeEventListener('galtonDemo', handleGaltonDemo);
    };
  }, []);

  return (
    <>
      <canvas
        ref={canvasRef}
        style={{ 
          width: '100vw', 
          height: 'calc(100vh + 200px)', 
          display: 'block', 
          background: '#000', 
          cursor: 'crosshair',
          position: 'fixed',
          top: 0,
          left: 0,
          zIndex: 1
        }}
        aria-hidden="true"
      />
    </>
  );
}
