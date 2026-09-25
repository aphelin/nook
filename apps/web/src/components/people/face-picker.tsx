"use client";

import { FACE_SHAPES, type Face, type FaceShape, type FaceTone } from "@nook/contracts";
import { ArrowCounterClockwise } from "@phosphor-icons/react/dist/ssr";
import { useId, useLayoutEffect, useRef, useState } from "react";
import { colourName } from "@/lib/colour-name";
import { SHAPE_NAMES, SHAPES } from "@/lib/faces";
import { gsap, reducedMotion, useGSAP } from "@/lib/motion";
import { Initial } from "@/components/brand/initial";

const TONES: FaceTone[] = [1, 2, 3];

/*
 * Your face, chosen.
 *
 * Twenty-one shapes and three colours. The colours are the surface's own three face colours, so
 * what you pick is a slot rather than a hex: every nook paints it from its own kit, and you look
 * like yourself in every club without ever clashing with one. The preview morphs from the shape
 * you had to the one you picked, which is the whole point of the moment: you watch yourself change.
 */

/*
 * The morph. Every face shape can be seen whole from its own centre, so each one is described as
 * its radius at 120 evenly spaced angles, measured once from the real path. Morphing is then just
 * blending two lists of 120 numbers each frame: no point matching, no twisting, nothing heavy at
 * the start of the tween. When it lands, the exact path takes over again.
 */
const RAYS = 120;
const profiles = new Map<FaceShape, number[]>();

function profileOf(shape: FaceShape): number[] {
  const known = profiles.get(shape);
  if (known) return known;
  const ns = "http://www.w3.org/2000/svg";
  const host = document.createElementNS(ns, "svg");
  host.setAttribute("style", "position:absolute;width:0;height:0;visibility:hidden");
  const probe = document.createElementNS(ns, "path");
  probe.setAttribute("d", SHAPES[shape]);
  host.append(probe);
  document.body.append(host);
  const length = probe.getTotalLength();
  const samples: [number, number][] = [];
  for (let i = 0; i < 720; i += 1) {
    const pt = probe.getPointAtLength((length * i) / 720);
    // Angle from straight up, clockwise, the way lib/faces draws its polar shapes.
    const angle = (Math.atan2(pt.x - 20, -(pt.y - 20)) + Math.PI * 2) % (Math.PI * 2);
    samples.push([angle, Math.hypot(pt.x - 20, pt.y - 20)]);
  }
  host.remove();
  samples.sort((a, b) => a[0] - b[0]);
  const radii = Array.from({ length: RAYS }, (_, k) => {
    const target = (k / RAYS) * Math.PI * 2;
    let hi = samples.findIndex(([angle]) => angle >= target);
    if (hi < 0) hi = 0;
    const lo = (hi - 1 + samples.length) % samples.length;
    const [a0, r0] = samples[lo]!;
    const [a1, r1] = samples[hi]!;
    const span = (a1 - a0 + Math.PI * 2) % (Math.PI * 2) || 1;
    const t = ((target - a0 + Math.PI * 2) % (Math.PI * 2)) / span;
    return r0 + (r1 - r0) * Math.min(1, Math.max(0, t));
  });
  profiles.set(shape, radii);
  return radii;
}

const outline = (radii: number[]) =>
  `${radii
    .map((r, k) => {
      const a = (k / RAYS) * Math.PI * 2;
      return `${k ? "L" : "M"}${(20 + r * Math.sin(a)).toFixed(2)} ${(20 - r * Math.cos(a)).toFixed(2)}`;
    })
    .join("")}Z`;

/** The big preview: your initial in your shape, morphing when the shape changes. */
export function FacePreview({ face, initial, size = 88 }: { face: Face; initial: string; size?: number }) {
  const path = useRef<SVGPathElement>(null);
  const svg = useRef<SVGSVGElement>(null);
  // React draws the first shape; after that the morph owns the path's outline.
  const [first] = useState(() => SHAPES[face.shape]);
  const shown = useRef(face.shape);
  // The outline as it is right now, so a pick in the middle of a morph starts from where it is.
  const now = useRef<number[] | null>(null);
  const morph = useRef<gsap.core.Tween | null>(null);

  // Measure every shape while the dialog is idle, so the first pick has nothing to wait for.
  useLayoutEffect(() => {
    const idle = window.requestIdleCallback ?? ((fn: () => void) => window.setTimeout(fn, 60));
    const id = idle(() => FACE_SHAPES.forEach((s) => profileOf(s)));
    return () => (window.cancelIdleCallback ?? window.clearTimeout)(id as number);
  }, []);

  useGSAP(
    () => {
      const el = path.current;
      if (!el || shown.current === face.shape) return;
      const from = now.current ?? profileOf(shown.current);
      const to = profileOf(face.shape);
      const target = face.shape;
      shown.current = target;
      morph.current?.kill();
      if (reducedMotion()) {
        now.current = null;
        el.setAttribute("d", SHAPES[target]);
        return;
      }
      const state = { p: 0 };
      const blend = () => from.map((r, k) => r + (to[k]! - r) * state.p);
      morph.current = gsap.to(state, {
        p: 1,
        duration: 0.65,
        ease: "nook-morph",
        onUpdate: () => {
          now.current = blend();
          el.setAttribute("d", outline(now.current));
        },
        onComplete: () => {
          now.current = null;
          el.setAttribute("d", SHAPES[target]);
        },
      });
      gsap.fromTo(svg.current, { scale: 0.92 }, { scale: 1, duration: 0.6, ease: "nook-pop", overwrite: true });
    },
    { dependencies: [face.shape] },
  );

  return (
    <svg
      ref={svg}
      width={size}
      height={size}
      viewBox="0 0 40 40"
      aria-hidden="true"
      data-shape={face.shape}
      data-tone={face.tone}
      className="shrink-0 overflow-visible"
    >
      <path ref={path} d={first} className="tint" style={{ fill: `var(--face-${face.tone})` }} />
      <Initial char={initial} y={21} style={{ fill: `var(--on-face-${face.tone})` }} />
    </svg>
  );
}

const cell =
  "relative grid cursor-pointer place-items-center rounded-full transition-[background-color] duration-200 ease-out-expo [--grow:1.12] hover:bg-hover has-[:checked]:bg-chip has-[:checked]:inset-ring-[2.5px] has-[:checked]:inset-ring-fg has-[:focus-visible]:outline-[2.5px] has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-fg";

export function FacePicker({
  face,
  initial,
  custom,
  hasPhoto,
  onPick,
  onReset,
}: {
  face: Face;
  initial: string;
  /** Whether the face is one you chose, rather than the one your handle gives you. */
  custom: boolean;
  hasPhoto: boolean;
  onPick: (face: Face) => void;
  onReset: () => void;
}) {
  const ids = { shape: useId(), shapeHint: useId(), tone: useId(), toneHint: useId() };
  // Each colour is said as what it is in this nook ("Orange, with a navy initial"), read off the
  // swatch as drawn, since the slot's colour comes from the kit rather than from a name.
  const swatches = useRef<(SVGSVGElement | null)[]>([]);
  const [spoken, setSpoken] = useState<string[]>([]);
  useLayoutEffect(() => {
    const named = swatches.current.map((svg) => {
      const [fill, ink] = [svg?.querySelector("path:not([data-initial])"), svg?.querySelector("[data-initial]")].map((el) =>
        el ? colourName(getComputedStyle(el).fill) : "",
      );
      return fill ? `${fill[0]!.toUpperCase()}${fill.slice(1)}${ink ? `, with a ${ink} initial` : ""}` : "";
    });
    setSpoken(named);
  }, [hasPhoto]);
  return (
    <div className="flex flex-col gap-5">
      <div className="flex min-w-0 flex-col gap-2">
        <div className="flex min-h-8 items-center justify-between gap-3">
          <span id={ids.shape} className="text-base font-bold text-fg">
            Shape
          </span>
          {custom && (
            <button
              type="button"
              onClick={onReset}
              className="-my-1 inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-sm font-semibold text-fg-2 transition-colors duration-150 hover:bg-hover hover:text-fg"
            >
              <ArrowCounterClockwise size={14} weight="bold" aria-hidden="true" /> Use the one I was given
            </button>
          )}
        </div>
        <p id={ids.shapeHint} className="text-xs text-fg-2">
          {hasPhoto ? "Your photo is cut to this shape." : "Everyone who hasn’t picked gets one from their handle."}
        </p>
        <div
          role="radiogroup"
          aria-labelledby={ids.shape}
          aria-describedby={ids.shapeHint}
          className="grid grid-cols-[repeat(auto-fill,minmax(2.875rem,1fr))] gap-1 pt-1"
        >
          {FACE_SHAPES.map((shape: FaceShape) => (
            <label key={shape} data-grows className={`${cell} aspect-square`}>
              <input
                type="radio"
                name="face-shape"
                value={shape}
                aria-label={SHAPE_NAMES[shape]}
                checked={face.shape === shape}
                onChange={() => onPick({ ...face, shape })}
                className="sr-only"
              />
              <svg viewBox="0 0 40 40" aria-hidden="true" className="size-[62%] overflow-visible">
                {/* Silhouettes in the card's highlight, certified on it in both schemes; colour is picked below. */}
                <path data-grow d={SHAPES[shape]} className="tint fill-hi" />
              </svg>
            </label>
          ))}
        </div>
      </div>

      {!hasPhoto && (
        <div className="flex min-w-0 flex-col gap-2">
          <span id={ids.tone} className="text-base font-bold text-fg">
            Colour
          </span>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <div role="radiogroup" aria-labelledby={ids.tone} aria-describedby={ids.toneHint} className="flex gap-1.5">
              {TONES.map((tone) => (
                <label key={tone} data-grows className={`${cell} size-14`}>
                  <input
                    type="radio"
                    name="face-tone"
                    value={tone}
                    aria-label={spoken[tone - 1] || `Colour ${tone}`}
                    checked={face.tone === tone}
                    onChange={() => onPick({ ...face, tone })}
                    className="sr-only"
                  />
                  <svg
                    ref={(el) => {
                      swatches.current[tone - 1] = el;
                    }}
                    viewBox="0 0 40 40"
                    aria-hidden="true"
                    className="size-10 overflow-visible"
                  >
                    <g data-grow>
                      <path d={SHAPES[face.shape]} className="tint" style={{ fill: `var(--face-${tone})` }} />
                      <Initial char={initial} y={21} style={{ fill: `var(--on-face-${tone})` }} />
                    </g>
                  </svg>
                </label>
              ))}
            </div>
            <p id={ids.toneHint} className="max-w-[26ch] text-xs text-fg-2">
              Each nook paints these from its own two colours.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
