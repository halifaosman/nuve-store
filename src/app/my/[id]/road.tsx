'use client';
import { useEffect, useRef, useState } from 'react';

// The delivery scene: a night-time street map with a road from the Nuvé store to the customer's door.
// The van drives to the spot for the current stage (it shows progress, not the driver's live location).

const ROAD = 'M 46 238 C 110 238, 96 168, 150 160 S 214 182, 236 128 S 262 62, 318 58';

export default function Road({ progress, moving, delivered, problem }: { progress: number; moving: boolean; delivered: boolean; problem: boolean }) {
  const path = useRef<SVGPathElement>(null);
  const van = useRef<SVGGElement>(null);
  const trail = useRef<SVGPathElement>(null);
  const shown = useRef(0);
  const [len, setLen] = useState(0);

  useEffect(() => { if (path.current) setLen(path.current.getTotalLength()); }, []);

  // Drive smoothly from where the van is now to the new stage.
  useEffect(() => {
    const p = path.current, v = van.current, tr = trail.current;
    if (!p || !v || !tr || !len) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const from = shown.current, to = Math.max(0, Math.min(1, progress));
    const dur = reduce ? 0 : Math.min(3200, 900 + Math.abs(to - from) * 3200);
    const start = performance.now();
    let raf = 0;
    const place = (f: number) => {
      const at = Math.max(0.0001, Math.min(len - 30, f * len)); // park just short of the door so the house stays visible
      const pt = p.getPointAtLength(at), ahead = p.getPointAtLength(Math.min(len, at + 2));
      const ang = (Math.atan2(ahead.y - pt.y, ahead.x - pt.x) * 180) / Math.PI;
      v.setAttribute('transform', `translate(${pt.x} ${pt.y}) rotate(${ang}) scale(1.3)`);
      tr.style.strokeDasharray = `${f * len} ${len}`;
      shown.current = f;
    };
    const step = (now: number) => {
      const k = dur ? Math.min(1, (now - start) / dur) : 1;
      const e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2; // ease in-out
      place(from + (to - from) * e);
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [progress, len]);

  return (
    <svg className={`road${moving ? ' moving' : ''}${delivered ? ' arrived' : ''}`} viewBox="0 0 360 280" role="img" aria-label={delivered ? 'Your parcel has arrived at your door' : 'Your parcel on its way from Nuvé to your door'}>
      {/* city blocks */}
      <g className="blocks">
        {[[14, 18, 70, 46], [96, 14, 58, 62], [172, 20, 48, 40], [16, 86, 52, 58], [80, 92, 38, 34], [250, 92, 88, 30], [270, 136, 72, 52], [176, 196, 66, 60], [256, 206, 86, 56], [16, 168, 30, 40], [106, 192, 44, 22]].map(([x, y, w, h], i) => (
          <rect key={i} x={x} y={y} width={w} height={h} rx="6" />
        ))}
        <path className="street" d="M0 74 H360 M0 154 H90 M168 0 V60 M244 0 V280 M0 182 H120 M124 110 V280" />
      </g>
      {/* road, travelled part, centre line */}
      <path ref={path} d={ROAD} className="r-base" />
      <path ref={trail} d={ROAD} className="r-trail" style={{ strokeDasharray: `0 ${len || 1000}` }} />
      <path d={ROAD} className="r-dash" />
      {/* Nuvé store */}
      <g transform="translate(46 238)" className="store">
        <circle r="17" className="pin-bg" />
        <path d="M0 -9 A9 9 0 1 0 6.4 -6.4" className="ring" />
        <circle r="3.4" className="ring-dot" cx="4" cy="-8" />
      </g>
      {/* your door */}
      <g transform="translate(318 58)" className="home">
        <circle r="24" className="pulse" />
        <circle r="17" className="pin-bg" />
        <path d="M-8 2 L0 -6 L8 2 V9 H-8 Z" className="house" />
        <rect x="-2.4" y="3" width="4.8" height="6" className="door" />
      </g>
      {/* van */}
      <g ref={van} transform="translate(46 238)">
        <g className={`van${problem ? ' stuck' : ''}`}>
          <rect x="-15" y="-9" width="22" height="15" rx="3" className="v-body" />
          <path d="M7 -5 H12 L16 0 V6 H7 Z" className="v-body" />
          <path d="M8.5 -3.4 H11.6 L14.2 0 H8.5 Z" className="v-glass" />
          <path d="M-8.6 -1.5 A3.6 3.6 0 1 0 -5.6 -4" className="v-logo" />
          <circle cx="-8" cy="7" r="3" className="v-wheel" />
          <circle cx="10" cy="7" r="3" className="v-wheel" />
        </g>
      </g>
      {delivered && (
        <g className="confetti" transform="translate(318 58)">
          {Array.from({ length: 14 }, (_, i) => <rect key={i} x="-2" y="-2" width="4" height="7" rx="1" style={{ ['--a' as string]: `${(i * 360) / 14}deg`, ['--d' as string]: `${(i % 3) * 0.12}s` }} />)}
        </g>
      )}
    </svg>
  );
}
