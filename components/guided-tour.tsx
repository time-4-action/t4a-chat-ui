"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { useTour } from "@/lib/tour-context";
import { TOUR_STEPS } from "@/lib/tour-steps";

const PAD = 8;
const POPOVER_WIDTH = 300;
const POPOVER_HEIGHT = 180;

interface Rect { x: number; y: number; width: number; height: number }

export default function GuidedTour() {
  const { isActive, currentStep, totalSteps, nextStep, prevStep, skipTour } = useTour();
  const [rect, setRect] = useState<Rect | null>(null);
  const [vw, setVw] = useState(0);
  const [vh, setVh] = useState(0);
  const [mounted, setMounted] = useState(false);
  const [isInteracting, setIsInteracting] = useState(false);
  const rectRef = useRef<Rect | null>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setMounted(true); }, []);

  // Measure target element position
  useEffect(() => {
    if (!isActive) return;

    function measure() {
      const step = TOUR_STEPS[currentStep];
      const el = document.querySelector(step.selector);
      setVw(window.innerWidth);
      setVh(window.innerHeight);
      if (!el) { setRect(null); rectRef.current = null; return; }
      const r = el.getBoundingClientRect();
      const next = { x: r.left, y: r.top, width: r.width, height: r.height };
      setRect(next);
      rectRef.current = next;
    }

    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [isActive, currentStep]);

  // Reset interacting state whenever the step changes
  useEffect(() => {
    setIsInteracting(false);
  }, [currentStep]);

  // Detect clicks inside the spotlight → undim so user can interact freely
  useEffect(() => {
    if (!isActive) return;

    function onMouseDown(e: MouseEvent) {
      const r = rectRef.current;
      if (!r) return;
      if (popoverRef.current?.contains(e.target as Node)) return;

      const sx = r.x - PAD;
      const sy = r.y - PAD;
      const sw = r.width + PAD * 2;
      const sh = r.height + PAD * 2;
      const inSpotlight =
        e.clientX >= sx && e.clientX <= sx + sw &&
        e.clientY >= sy && e.clientY <= sy + sh;

      if (inSpotlight) setIsInteracting(true);
    }

    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, [isActive]);

  if (!mounted || !isActive) return null;

  const step = TOUR_STEPS[currentStep];

  // Spotlight bounds
  const sx = rect ? rect.x - PAD : 0;
  const sy = rect ? rect.y - PAD : 0;
  const sw = rect ? rect.width + PAD * 2 : 0;
  const sh = rect ? rect.height + PAD * 2 : 0;

  // 4 click-blocking regions around the spotlight
  const regions = rect
    ? [
        { left: 0,       top: 0,       width: vw,             height: sy },
        { left: 0,       top: sy + sh, width: vw,             height: vh - (sy + sh) },
        { left: 0,       top: sy,      width: sx,             height: sh },
        { left: sx + sw, top: sy,      width: vw - (sx + sw), height: sh },
      ]
    : [{ left: 0, top: 0, width: vw, height: vh }];

  // Compute popover position
  let popoverX = vw / 2 - POPOVER_WIDTH / 2;
  let popoverY = vh / 2 - POPOVER_HEIGHT / 2;

  if (rect) {
    const centerX = rect.x + rect.width / 2;
    const spaceBelow = vh - (rect.y + rect.height + PAD + 8);

    if (step.placement === "right") {
      popoverX = Math.min(rect.x + rect.width + PAD + 8, vw - POPOVER_WIDTH - 16);
      popoverY = Math.max(16, Math.min(rect.y + rect.height / 2 - POPOVER_HEIGHT / 2, vh - POPOVER_HEIGHT - 16));
    } else if (step.placement === "bottom" || spaceBelow >= POPOVER_HEIGHT) {
      popoverY = rect.y + rect.height + PAD + 8;
      popoverX = Math.max(16, Math.min(centerX - POPOVER_WIDTH / 2, vw - POPOVER_WIDTH - 16));
    } else {
      popoverY = Math.max(16, rect.y - PAD - 8 - POPOVER_HEIGHT);
      popoverX = Math.max(16, Math.min(centerX - POPOVER_WIDTH / 2, vw - POPOVER_WIDTH - 16));
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-[9999]" style={{ pointerEvents: "none" }}>

      {/* Dim overlay — hidden while user is interacting */}
      {rect && !isInteracting && (
        <svg
          className="absolute inset-0 w-full h-full"
          xmlns="http://www.w3.org/2000/svg"
          style={{ pointerEvents: "none" }}
        >
          <defs>
            <mask id="tour-mask">
              <rect width="100%" height="100%" fill="white" />
              <rect x={sx} y={sy} width={sw} height={sh} rx="10" fill="black" />
            </mask>
          </defs>
          <rect width="100%" height="100%" fill="rgba(0,0,0,0.55)" mask="url(#tour-mask)" />
        </svg>
      )}

      {/* Spotlight ring */}
      {rect && !isInteracting && (
        <div
          className="absolute rounded-xl pointer-events-none"
          style={{ left: sx, top: sy, width: sw, height: sh, boxShadow: "0 0 0 2px rgba(255,255,255,0.5)" }}
        />
      )}

      {/* Click-blocking regions — only active when not interacting */}
      {!isInteracting && regions.map((r, i) => (
        <div
          key={i}
          className="absolute"
          style={{ left: r.left, top: r.top, width: r.width, height: r.height, pointerEvents: "all" }}
        />
      ))}

      {/* Popover */}
      <div
        ref={popoverRef}
        className="absolute bg-white rounded-2xl shadow-2xl border border-slate-200 p-5"
        style={{ left: popoverX, top: popoverY, width: POPOVER_WIDTH, pointerEvents: "all" }}
      >
        <div className="flex items-start justify-between gap-2 mb-2">
          <h3 className="text-sm font-semibold text-slate-800 leading-snug">{step.title}</h3>
          <button
            onClick={skipTour}
            className="shrink-0 h-6 w-6 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        <p className="text-xs text-slate-500 leading-relaxed mb-4">{step.description}</p>

        <div className="flex items-center justify-between">
          <span className="text-[11px] text-slate-400">{currentStep + 1} / {totalSteps}</span>
          <div className="flex items-center gap-2">
            {currentStep > 0 && (
              <button
                onClick={prevStep}
                className="text-xs text-slate-500 hover:text-slate-700 px-3 py-1.5 rounded-lg hover:bg-slate-100 transition-colors"
              >
                Back
              </button>
            )}
            <button
              onClick={skipTour}
              className="text-xs text-slate-400 hover:text-slate-600 px-3 py-1.5 rounded-lg hover:bg-slate-100 transition-colors"
            >
              Skip
            </button>
            <button
              onClick={nextStep}
              className="text-xs font-medium bg-[#0f172a] text-white px-4 py-1.5 rounded-lg hover:bg-slate-700 transition-colors"
            >
              {currentStep === totalSteps - 1 ? "Done" : "Next"}
            </button>
          </div>
        </div>

        {/* Progress dots */}
        <div className="flex justify-center gap-1.5 mt-3">
          {Array.from({ length: totalSteps }).map((_, i) => (
            <div
              key={i}
              className={`h-1.5 rounded-full transition-all ${
                i === currentStep ? "w-4 bg-[#0f172a]" : "w-1.5 bg-slate-300"
              }`}
            />
          ))}
        </div>
      </div>
    </div>,
    document.body
  );
}
