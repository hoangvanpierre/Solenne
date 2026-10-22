"use client";

import { useEffect, useMemo, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Environment, Lightformer, OrbitControls } from "@react-three/drei";
import { useReducedMotion } from "framer-motion";
import * as THREE from "three";
import type { ScentCategory } from "@/types";

// ---------------------------------------------------------------------------
// Solenne candle — a hand-thrown glass tumbler modelled from the product
// photography in public/images/product/.
//
// Reference reading (Solenne Golden Hours.jpg, Solenne Midnight Garden Candle
// Glow.png, Solenne Vanilla Ember.png):
//   • straight-sided vessel, total height ≈ 1.15–1.2× its diameter
//   • thick solid glass base (~11% of the height) that the wall flows into
//     through one rounded heel — no narrower foot ring, no concave waist
//   • a thin rolled rim with visible wall thickness (≈4% of the diameter)
//   • wax filled to ~10% below the rim, with a shallow melt pool at the wick
//   • a short charred cotton wick and an elongated teardrop flame (~2.5:1)
//   • an ivory paper label, roughly 63% of the jar width and 60% of its height,
//     carrying "Solenne", the product name and its tagline
//
// The vessel is one closed LatheGeometry profile (outer wall → rolled rim →
// inner wall → inner base), so the mouth, wall thickness and solid glass base
// are all real geometry rather than stacked transparent shells.
// ---------------------------------------------------------------------------

/** Height of the set wax, used to seat the wick inside the melt pool. */
const WAX_SURFACE_Y = 1.245;

/** Product names and taglines taken from scripts/seed-products.mjs. */
interface ProductLabel {
  name: string;
  tagline: string;
}

interface ScentTheme {
  waxColor: string;
  /** Flame light tint: warm, with a whisper of the family's palette. */
  lightColor: string;
  label: ProductLabel;
}

const SCENT_THEMES: Record<ScentCategory, ScentTheme> = {
  floral: {
    waxColor: "#E7CBC5",
    lightColor: "#FFC8B2",
    // Midnight Garden is the floral catalogue entry.
    label: { name: "Midnight Garden", tagline: "A moonlit stroll through blooming jasmine" },
  },
  woody: {
    waxColor: "#C0A683",
    lightColor: "#FFC389",
    label: { name: "Cedar & Sage", tagline: "A forest retreat for the soul" },
  },
  fresh: {
    waxColor: "#B9C3A7",
    lightColor: "#FFD4A8",
    label: { name: "Ocean Breeze", tagline: "The calm of coastal mornings" },
  },
  warm: {
    waxColor: "#E0BC8D",
    lightColor: "#FFC58C",
    label: { name: "Vanilla Ember", tagline: "Warmth that lingers" },
  },
};

// ---------------------------------------------------------------------------
// Geometry profiles (module scope: stable identities, built once)
// ---------------------------------------------------------------------------

const v2 = (x: number, y: number) => new THREE.Vector2(x, y);

// Underside → rounded heel → body → rolled rim → inner wall → inner base.
// The lower profile is deliberately monotonic: the wall runs straight down to
// a single tangent-continuous fillet at the floor, so body and base read as one
// blown piece. A concave waist or inward step would read as a foot ring glued
// to the body, and the tangent break at the top of a flare becomes a dark crease.
const HEEL_RADIUS = 0.05;
const HEEL_BOTTOM_RADIUS = 0.57; // contact ring where the fillet meets the floor

/** 12-step quarter round from the floor (y=0) up to the wall (y=HEEL_RADIUS). */
const HEEL_ARC = Array.from({ length: 13 }, (_, step) => {
  const angle = (step / 12) * (Math.PI / 2);
  return v2(
    HEEL_BOTTOM_RADIUS + Math.sin(angle) * HEEL_RADIUS,
    HEEL_RADIUS - Math.cos(angle) * HEEL_RADIUS
  );
});

const JAR_PROFILE = [
  v2(0, 0),
  ...HEEL_ARC,
  v2(0.62, 1.325),
  v2(0.619, 1.352),
  v2(0.613, 1.377),
  v2(0.601, 1.393),
  v2(0.59, 1.398),
  v2(0.584, 1.397),
  v2(0.577, 1.389),
  v2(0.575, 1.372),
  v2(0.575, 1.33),
  v2(0.575, 0.215),
  v2(0.568, 0.19),
  v2(0.545, 0.172),
  v2(0.48, 0.16),
  v2(0.24, 0.155),
  v2(0, 0.155),
];

// Solid wax: base → inner wall → gently recessed melt pool at the wick.
const WAX_PROFILE = [
  v2(0, 0.156),
  v2(0.3, 0.158),
  v2(0.52, 0.161),
  v2(0.562, 0.171),
  v2(0.573, 0.196),
  v2(0.574, 1.205),
  v2(0.572, 1.229),
  v2(0.563, 1.243),
  v2(0.545, 1.249),
  v2(0.46, 1.249),
  v2(0.4, 1.2488),
  v2(0.368, 1.2476),
  v2(0.35, 1.2418),
  v2(0.338, 1.2312),
  v2(0.322, 1.2226),
  v2(0.288, 1.217),
  v2(0.24, 1.2152),
  v2(0.14, 1.2142),
  v2(0, 1.214),
];

// Shallower glossy disc sitting in the melt pool, just above the wax.
const POOL_PROFILE = [
  v2(0, 1.2146),
  v2(0.14, 1.2148),
  v2(0.24, 1.2158),
  v2(0.288, 1.2176),
  v2(0.315, 1.2212),
  v2(0.332, 1.2252),
];

// Teardrop, base at y=0 so scaling and sway pivot on the wick tip.
const FLAME_PROFILE = [
  v2(0, 0),
  v2(0.018, 0.008),
  v2(0.03, 0.024),
  v2(0.038, 0.048),
  v2(0.042, 0.078),
  v2(0.043, 0.108),
  v2(0.041, 0.14),
  v2(0.036, 0.17),
  v2(0.029, 0.196),
  v2(0.021, 0.218),
  v2(0.012, 0.234),
  v2(0.004, 0.243),
  v2(0, 0.246),
];

/**
 * Teardrop flame geometry with the heat gradient baked into vertex colours, so
 * the flame needs no extra lights, sprites or post-processing.
 */
function createFlameGeometry(segments: number, palette: [string, string, string]) {
  const geometry = new THREE.LatheGeometry(FLAME_PROFILE, segments);
  const position = geometry.attributes.position;
  const colors = new Float32Array(position.count * 3);
  const base = new THREE.Color(palette[0]);
  const middle = new THREE.Color(palette[1]);
  const tip = new THREE.Color(palette[2]);
  const shade = new THREE.Color();
  const maxY = FLAME_PROFILE[FLAME_PROFILE.length - 1].y;

  for (let i = 0; i < position.count; i++) {
    const t = THREE.MathUtils.clamp(position.getY(i) / maxY, 0, 1);
    if (t < 0.4) shade.copy(base).lerp(middle, t / 0.4);
    else shade.copy(middle).lerp(tip, (t - 0.4) / 0.6);
    colors[i * 3] = shade.r;
    colors[i * 3 + 1] = shade.g;
    colors[i * 3 + 2] = shade.b;
  }

  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  return geometry;
}

const FLAME_BODY_GEOMETRY = createFlameGeometry(28, ["#FFF4D2", "#FFC46B", "#FF7E2A"]);
const FLAME_CORE_GEOMETRY = createFlameGeometry(24, ["#FFFFFF", "#FFF6D8", "#FFCB7A"]);

/** Body font stack, read at draw time so the label uses the real brand face. */
function brandFontFamily(): string {
  if (typeof window === "undefined") return '"Cactus Classical Serif", Georgia, serif';
  const stack = getComputedStyle(document.body).fontFamily;
  return stack && stack.trim().length > 0
    ? `${stack}, Georgia, serif`
    : '"Cactus Classical Serif", Georgia, serif';
}

/**
 * Draws the jar label into an offscreen canvas. Deterministic: the paper grain
 * uses a fixed-seed LCG so the texture is identical on every mount.
 */
function createLabelCanvas(product: ProductLabel) {
  const width = 800;
  const height = 760;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return { canvas, draw: () => {} };

  const draw = () => {
    const family = brandFontFamily();
    ctx.clearRect(0, 0, width, height);

    // Reseed on every draw so the font-ready repaint is pixel-identical to the
    // first pass instead of continuing the grain sequence.
    let seed = 0x5f3a91;
    const random = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 4294967296;
    };

    // Warm ivory stock: the label is lit by the scene, so the swatch is a touch
    // deeper than the ivory we want to see (see `emissiveIntensity` below).
    const paper = ctx.createLinearGradient(0, 0, 0, height);
    paper.addColorStop(0, "#F9F0DE");
    paper.addColorStop(0.55, "#F6E9D2");
    paper.addColorStop(1, "#EEDFC4");
    ctx.fillStyle = paper;
    ctx.fillRect(0, 0, width, height);

    // Fine paper grain.
    for (let i = 0; i < 3200; i++) {
      const x = random() * width;
      const y = random() * height;
      const shade = random();
      ctx.fillStyle =
        shade > 0.55 ? "rgba(120, 101, 78, 0.045)" : "rgba(255, 252, 244, 0.05)";
      ctx.fillRect(x, y, 1.4, 1.4);
    }

    // Soft edge falloff so the label does not look like a flat sticker.
    const edge = ctx.createRadialGradient(
      width / 2,
      height / 2,
      width * 0.28,
      width / 2,
      height / 2,
      width * 0.78
    );
    edge.addColorStop(0, "rgba(120, 100, 74, 0)");
    edge.addColorStop(1, "rgba(120, 100, 74, 0.055)");
    ctx.fillStyle = edge;
    ctx.fillRect(0, 0, width, height);

    // Crisp paper edge so the label reads as a separate applied layer.
    ctx.strokeStyle = "rgba(96, 78, 56, 0.2)";
    ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, width - 2, height - 2);

    const ink = "#17120D";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    // Brand wordmark
    ctx.fillStyle = ink;
    ctx.font = `400 ${Math.round(width * 0.158)}px ${family}`;
    if ("letterSpacing" in ctx) {
      (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = "-1px";
    }
    ctx.fillText("Solenne", width / 2, height * 0.245, width * 0.9);

    // Hairline rule with a small diamond, as on the Midnight Garden label.
    const ruleY = height * 0.405;
    ctx.strokeStyle = "rgba(23, 18, 13, 0.45)";
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    ctx.moveTo(width * 0.315, ruleY);
    ctx.lineTo(width * 0.452, ruleY);
    ctx.moveTo(width * 0.548, ruleY);
    ctx.lineTo(width * 0.685, ruleY);
    ctx.stroke();

    ctx.save();
    ctx.translate(width / 2, ruleY);
    ctx.rotate(Math.PI / 4);
    ctx.fillStyle = "rgba(23, 18, 13, 0.7)";
    ctx.fillRect(-4.2, -4.2, 8.4, 8.4);
    ctx.restore();

    // Product name
    ctx.fillStyle = ink;
    ctx.font = `400 ${Math.round(width * 0.062)}px ${family}`;
    if ("letterSpacing" in ctx) {
      (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = "5px";
    }
    ctx.fillText(product.name.toUpperCase(), width / 2, height * 0.565, width * 0.84);

    // Tagline
    ctx.fillStyle = "rgba(23, 18, 13, 0.75)";
    ctx.font = `400 ${Math.round(width * 0.0245)}px ${family}`;
    if ("letterSpacing" in ctx) {
      (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = "2.6px";
    }
    ctx.fillText(product.tagline.toUpperCase(), width / 2, height * 0.675, width * 0.8);

    if ("letterSpacing" in ctx) {
      (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = "0px";
    }
  };

  draw();
  return { canvas, draw };
}

/** Label texture, regenerated per product and disposed on change/unmount. */
function useLabelTexture(product: ProductLabel) {
  const resource = useMemo(() => {
    if (typeof document === "undefined") return null;
    const { canvas, draw } = createLabelCanvas(product);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 4;
    return { texture, draw };
  }, [product]);

  useEffect(() => {
    if (!resource) return;
    let cancelled = false;

    // Re-render once the brand webfont is available (initial draw may fall back).
    document.fonts?.ready
      .then(() => {
        if (cancelled) return;
        resource.draw();
        resource.texture.needsUpdate = true;
      })
      .catch(() => {});

    return () => {
      cancelled = true;
      resource.texture.dispose();
    };
  }, [resource]);

  return resource?.texture ?? null;
}

/** Soft elliptical contact shadow painted on the card, no shadow-map pass. */
function ContactShadow() {
  const texture = useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      const gradient = ctx.createRadialGradient(128, 128, 6, 128, 128, 126);
      gradient.addColorStop(0, "rgba(74, 56, 38, 0.42)");
      gradient.addColorStop(0.42, "rgba(74, 56, 38, 0.19)");
      gradient.addColorStop(1, "rgba(74, 56, 38, 0)");
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, 256, 256);
    }
    const canvasTexture = new THREE.CanvasTexture(canvas);
    canvasTexture.colorSpace = THREE.SRGBColorSpace;
    return canvasTexture;
  }, []);

  useEffect(() => () => texture.dispose(), [texture]);

  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.002, 0]} scale={[1.72, 1.12, 1]}>
      <planeGeometry args={[1, 1]} />
      <meshBasicMaterial
        map={texture}
        transparent
        opacity={0.8}
        depthWrite={false}
        toneMapped={false}
      />
    </mesh>
  );
}

function Flame({ theme, animate }: { theme: ScentTheme; animate: boolean }) {
  const coreRef = useRef<THREE.Mesh>(null);
  const bodyRef = useRef<THREE.Mesh>(null);
  const lightRef = useRef<THREE.PointLight>(null);

  useFrame((state) => {
    if (!animate) return;
    const t = state.clock.elapsedTime;
    // Restrained, deterministic sway: three incommensurate sines, no RNG.
    const sway =
      Math.sin(t * 5.6) * 0.5 + Math.sin(t * 9.4 + 1.7) * 0.3 + Math.sin(t * 14.1 + 0.6) * 0.2;

    if (bodyRef.current) {
      const sx = 1.04 * (1 + sway * 0.022);
      const sy = 1.04 * (1 + sway * 0.038);
      bodyRef.current.scale.set(sx, sy, sx);
      bodyRef.current.rotation.z = sway * 0.026;
    }
    if (coreRef.current) {
      coreRef.current.scale.set(0.45, 0.62 * (1 + sway * 0.05), 0.45);
      coreRef.current.rotation.z = sway * 0.018;
    }
    if (lightRef.current) {
      lightRef.current.intensity = 1.15 + sway * 0.1;
    }
  });

  return (
    <group position={[0, 1.252, 0]}>
      {/* Opaque, unlit and vertex-coloured so the transmission pass can see it
          through the glass; the glow itself comes from the point light below. */}
      <mesh ref={bodyRef} geometry={FLAME_BODY_GEOMETRY} scale={[1.04, 1.04, 1.04]}>
        <meshBasicMaterial vertexColors toneMapped={false} />
      </mesh>

      <mesh ref={coreRef} geometry={FLAME_CORE_GEOMETRY} scale={[0.45, 0.62, 0.45]}>
        <meshBasicMaterial vertexColors toneMapped={false} />
      </mesh>

      <pointLight
        ref={lightRef}
        position={[0, 0.09, 0]}
        color={theme.lightColor}
        intensity={1.7}
        distance={2.6}
        decay={2}
      />
    </group>
  );
}

function CandleJar({
  category,
  animate,
  interacting,
}: {
  category: ScentCategory;
  animate: boolean;
  /** Set by OrbitControls while the visitor drags; pauses the turntable drift. */
  interacting: { current: boolean };
}) {
  const groupRef = useRef<THREE.Group>(null);
  const theme = SCENT_THEMES[category];
  const labelTexture = useLabelTexture(theme.label);

  useFrame((_state, delta) => {
    if (!animate || interacting.current || !groupRef.current) return;
    // Slow turntable drift; paused while the visitor drags.
    groupRef.current.rotation.y += Math.min(delta, 0.05) * 0.075;
  });

  // Each scent family starts facing the viewer, label first.
  useEffect(() => {
    if (groupRef.current) groupRef.current.rotation.y = 0;
  }, [category]);

  return (
    <group ref={groupRef}>
      {/* Glass vessel: rounded heel, body, rolled rim, wall thickness, solid base.
          Alpha-blended rather than `transmission`: the wax, wick and flame sit
          inside the vessel, and three's transmission pass only re-projects
          opaque objects, so a transmissive shell visually swallowed the flame.
          A thin alpha film plus a clearcoat keeps the interior readable while
          the environment strips still read as glass reflections.
          Values are deliberately restrained: 0.13 opacity keeps wax, wick and
          flame legible, while the clearcoat rim and heel still separate from the
          light card behind them (measured 11-25 levels of edge contrast). */}
      <mesh>
        <latheGeometry args={[JAR_PROFILE, 128]} />
        <meshPhysicalMaterial
          color="#FCF7EF"
          transparent
          opacity={0.13}
          depthWrite={false}
          ior={1.5}
          roughness={0.06}
          metalness={0}
          clearcoat={0.8}
          clearcoatRoughness={0.04}
          envMapIntensity={0.95}
          specularIntensity={1}
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* Soy wax with a shallow melt pool */}
      <mesh>
        <latheGeometry args={[WAX_PROFILE, 96]} />
        <meshStandardMaterial
          color={theme.waxColor}
          roughness={0.66}
          metalness={0}
          envMapIntensity={0.3}
        />
      </mesh>

      {/* Melt pool: glossier skin around the wick */}
      <mesh>
        <latheGeometry args={[POOL_PROFILE, 72]} />
        <meshStandardMaterial
          color={theme.waxColor}
          roughness={0.26}
          metalness={0}
          envMapIntensity={0.5}
        />
      </mesh>

      {/* Short cotton wick, slightly off-vertical, with a charred tip */}
      <group position={[0, WAX_SURFACE_Y - 0.03, 0]} rotation={[0.04, 0, 0.07]}>
        <mesh position={[0, 0.024, 0]}>
          <cylinderGeometry args={[0.0062, 0.0086, 0.062, 10]} />
          <meshStandardMaterial color="#3B2C20" roughness={0.96} metalness={0} />
        </mesh>
        <mesh position={[0, 0.057, 0]}>
          <sphereGeometry args={[0.0072, 10, 8]} />
          <meshStandardMaterial
            color="#3A2418"
            roughness={0.9}
            emissive="#FF6A1E"
            emissiveIntensity={0.7}
            toneMapped={false}
          />
        </mesh>
      </group>

      <Flame theme={theme} animate={animate} />

      {/* Paper label, curved to the glass surface */}
      {labelTexture ? (
        <mesh position={[0, 0.64, 0]}>
          {/* Sits 0.0018 outside the 0.620 glass wall, so the paper reads as
              adhered stock instead of a floating plaque. 96 radial segments
              keep the chord sagitta (R·(1-cos π/96) ≈ 0.00033) far below that
              clearance; at 48 segments the sagitta was ~0.0013 and the glass
              facets poked through the label. */}
          <cylinderGeometry
            args={[0.6218, 0.6218, 0.78, 96, 1, true, -0.575, 1.15]}
          />
          <meshStandardMaterial
            map={labelTexture}
            // The paper sits in its own shade under the studio key light, which
            // read as grey card. Re-using the texture as a proportional emissive
            // map lifts the stock to warm ivory while the dark ink stays dark,
            // without extra maps, meshes or a lighting change to the vessel.
            emissiveMap={labelTexture}
            emissive="#FFF8EF"
            emissiveIntensity={0.3}
            roughness={0.92}
            metalness={0}
            envMapIntensity={0.22}
            side={THREE.FrontSide}
          />
        </mesh>
      ) : null}

      <ContactShadow />
    </group>
  );
}

export interface ScentCanvasProps {
  category: ScentCategory;
  /** When false, the render loop is paused (canvas scrolled out of view). */
  active?: boolean;
}

export function ScentCanvas({ category, active = true }: ScentCanvasProps) {
  const reduceMotion = Boolean(useReducedMotion());
  const interacting = useRef(false);

  return (
    <div className="relative h-[380px] w-full sm:h-[450px] lg:h-[500px]">
      <Canvas
        camera={{ position: [0, 1.46, 3.2], fov: 34 }}
        dpr={[1, 1.5]}
        gl={{
          antialias: true,
          alpha: true,
          powerPreference: "high-performance",
          toneMapping: THREE.ACESFilmicToneMapping,
          toneMappingExposure: 0.95,
        }}
        frameloop={active ? "always" : "never"}
      >
        <ambientLight intensity={0.16} />
        <directionalLight position={[3.2, 4.2, 2.6]} intensity={1.55} color="#FFF3E2" />
        <directionalLight position={[-2.6, 1.8, 1.2]} intensity={0.35} color="#F6EADB" />
        <directionalLight position={[-2.2, 2.2, 2.8]} intensity={0.55} color="#FFF6EC" />

        {/* Local studio environment (procedural, no HDRI download). A darker
            surround plus a few narrow sources gives the glass crisp highlight
            strips instead of a flat cream wash. */}
        <Environment resolution={256} frames={1}>
          <color attach="background" args={["#2E2A25"]} />
          <Lightformer
            form="rect"
            intensity={2.8}
            color="#FFF6E6"
            position={[2.2, 2.2, 2.4]}
            scale={[2.4, 3, 1]}
          />
          <Lightformer
            form="rect"
            intensity={2.4}
            color="#FFFDF6"
            position={[-2.8, 1.2, 0.6]}
            scale={[0.6, 3.2, 1]}
          />
          <Lightformer
            form="rect"
            intensity={1.4}
            color="#FFFFFF"
            position={[0, 3.4, 0.2]}
            scale={[2.2, 0.6, 1]}
          />
          <Lightformer
            form="rect"
            intensity={0.8}
            color="#FFE9CE"
            position={[-0.4, 1.6, -3.4]}
            scale={[2.8, 1.6, 1]}
          />
          <Lightformer
            form="rect"
            intensity={1.8}
            color="#FFF8EC"
            position={[-2.2, 1.6, -2.2]}
            scale={[0.8, 3, 1]}
          />
        </Environment>

        <group position={[0, 0, 0]}>
          <CandleJar
            category={category}
            animate={!reduceMotion && active}
            interacting={interacting}
          />
        </group>

        <OrbitControls
          makeDefault
          target={[0, 0.74, 0]}
          enableZoom={false}
          enablePan={false}
          enableDamping
          dampingFactor={0.065}
          rotateSpeed={0.55}
          minPolarAngle={Math.PI / 2.75}
          maxPolarAngle={Math.PI / 1.95}
          onStart={() => {
            interacting.current = true;
          }}
          onEnd={() => {
            interacting.current = false;
          }}
        />
      </Canvas>
    </div>
  );
}
