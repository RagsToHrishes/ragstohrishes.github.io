import React, { useEffect, useRef } from "react";

/**
 * FirefliesBackground - Simple fireflies that pulse and glow
 * No interactivity, just ambient pulsing fireflies
 */

type Props = {
  className?: string;
  density?: number;
  maxFireflies?: number;
};

export default function FirefliesBackground({ 
  className, 
  density = 0.4, 
  maxFireflies = 80 
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d", { alpha: true })!;

    const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));

    type Firefly = {
      x: number;
      y: number;
      vx: number;
      vy: number;
      r: number;
      phase: number;
      speed: number;
      intensity: number;
    };

    const state = {
      w: 0,
      h: 0,
      running: false,
      fireflies: [] as Firefly[],
    };

    function resize() {
      state.w = window.innerWidth;
      state.h = window.innerHeight;
      canvas.width = Math.floor(state.w * dpr);
      canvas.height = Math.floor(state.h * dpr);
      canvas.style.width = state.w + "px";
      canvas.style.height = state.h + "px";
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      
      const area = (state.w * state.h) / 10000;
      const target = Math.min(maxFireflies, Math.round(area * density));
      
      if (state.fireflies.length < target) {
        for (let i = state.fireflies.length; i < target; i++) {
          state.fireflies.push({
            x: Math.random() * state.w,
            y: Math.random() * state.h,
            vx: (Math.random() - 0.5) * 0.3,
            vy: (Math.random() - 0.5) * 0.3,
            r: 1 + Math.random() * 2,
            phase: Math.random() * Math.PI * 2,
            speed: 0.005 + Math.random() * 0.01,
            intensity: 0.3 + Math.random() * 0.7,
          });
        }
      }
    }

    function draw(now: number, prev: number) {
      const dt = (now - prev) / 16.6667;
      
      ctx.clearRect(0, 0, state.w, state.h);
      
      // Black gradient background
      const gradient = ctx.createLinearGradient(0, 0, 0, state.h);
      gradient.addColorStop(0, "#000000");
      gradient.addColorStop(0.5, "#0a0a0a");
      gradient.addColorStop(1, "#000000");
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, state.w, state.h);
      
      for (const firefly of state.fireflies) {
        // Update position
        firefly.x += firefly.vx * dt;
        firefly.y += firefly.vy * dt;
        
        // Wrap around edges
        if (firefly.x < -10) firefly.x = state.w + 10;
        if (firefly.x > state.w + 10) firefly.x = -10;
        if (firefly.y < -10) firefly.y = state.h + 10;
        if (firefly.y > state.h + 10) firefly.y = -10;
        
        // Update pulsing phase
        firefly.phase += firefly.speed * dt;
        
        // Calculate pulsing intensity
        const pulse = (Math.sin(firefly.phase) + 1) * 0.5;
        const opacity = 0.3 + pulse * firefly.intensity;
        
        // Draw firefly with glow
        ctx.shadowColor = `rgba(255, 215, 100, ${opacity * 0.8})`;
        ctx.shadowBlur = firefly.r * 8;
        ctx.fillStyle = `rgba(255, 215, 100, ${opacity})`;
        ctx.beginPath();
        ctx.arc(firefly.x, firefly.y, firefly.r, 0, Math.PI * 2);
        ctx.fill();
        
        // Add inner bright core
        ctx.shadowBlur = 0;
        ctx.fillStyle = `rgba(255, 255, 200, ${opacity * 0.8})`;
        ctx.beginPath();
        ctx.arc(firefly.x, firefly.y, firefly.r * 0.4, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    let prev = performance.now();
    let raf = 0;
    function loop(now: number) {
      if (!state.running) return;
      draw(now, prev);
      prev = now;
      raf = requestAnimationFrame(loop);
    }

    resize();
    state.running = true;
    raf = requestAnimationFrame(loop);
    
    const handleResize = () => resize();
    window.addEventListener("resize", handleResize);

    return () => {
      state.running = false;
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", handleResize);
    };
  }, [density, maxFireflies]);

  return (
    <canvas
      ref={canvasRef}
      className={"w-full h-full fixed inset-0 z-0 " + (className || "")}
      aria-hidden="true"
      style={{
        width: "100vw",
        height: "100vh",
        position: "fixed",
        top: 0,
        left: 0,
        zIndex: -1
      }}
    />
  );
}
