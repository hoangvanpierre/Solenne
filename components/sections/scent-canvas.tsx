"use client";

import { useRef, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Float, OrbitControls, Sparkles } from "@react-three/drei";
import * as THREE from "three";
import type { ScentCategory } from "@/types";

// Palette mapped to scent categories
const SCENT_THEMES: Record<
  ScentCategory,
  {
    waxColor: string;
    glowColor: string;
    lightIntensity: number;
    sparkleColor: string;
  }
> = {
  floral: {
    waxColor: "#E8C5C8",
    glowColor: "#FFB5BA",
    lightIntensity: 2.2,
    sparkleColor: "#FFD0D4",
  },
  woody: {
    waxColor: "#A68968",
    glowColor: "#D4A373",
    lightIntensity: 1.8,
    sparkleColor: "#CDB498",
  },
  fresh: {
    waxColor: "#A3B899",
    glowColor: "#B5D5C5",
    lightIntensity: 2.0,
    sparkleColor: "#C9E4D6",
  },
  warm: {
    waxColor: "#D9A066",
    glowColor: "#F4A261",
    lightIntensity: 2.5,
    sparkleColor: "#FFE3C2",
  },
};

function Flame({ color }: { color: string }) {
  const flameRef = useRef<THREE.Mesh>(null);
  const lightRef = useRef<THREE.PointLight>(null);

  useFrame((state) => {
    const t = state.clock.getElapsedTime();
    if (flameRef.current) {
      // Gentle flicker
      const flicker = Math.sin(t * 8) * 0.05 + Math.sin(t * 15) * 0.02;
      flameRef.current.scale.set(
        1 + flicker,
        1 + Math.sin(t * 12) * 0.1,
        1 + flicker
      );
      flameRef.current.position.y = 1.35 + Math.sin(t * 7) * 0.015;
    }
    if (lightRef.current) {
      lightRef.current.intensity =
        1.8 + Math.sin(t * 10) * 0.3 + Math.random() * 0.1;
    }
  });

  return (
    <group>
      {/* Flame Mesh (tear-drop silhouette) */}
      <mesh ref={flameRef} position={[0, 1.35, 0]}>
        <coneGeometry args={[0.08, 0.28, 16]} />
        <meshBasicMaterial color="#FFF5D6" />
      </mesh>

      {/* Flame glow sphere */}
      <mesh position={[0, 1.32, 0]}>
        <sphereGeometry args={[0.16, 16, 16]} />
        <meshBasicMaterial color={color} transparent opacity={0.35} />
      </mesh>

      {/* Dynamic light */}
      <pointLight
        ref={lightRef}
        position={[0, 1.45, 0]}
        color={color}
        distance={4}
        decay={2}
      />
    </group>
  );
}

function CandleJar({ category }: { category: ScentCategory }) {
  const groupRef = useRef<THREE.Group>(null);
  const theme = SCENT_THEMES[category];

  useFrame((_state, delta) => {
    if (groupRef.current) {
      groupRef.current.rotation.y += delta * 0.25;
    }
  });

  return (
    <group ref={groupRef}>
      {/* Outer Glass Jar */}
      <mesh position={[0, 0.4, 0]}>
        <cylinderGeometry args={[0.95, 0.92, 1.7, 32, 1, true]} />
        <meshPhysicalMaterial
          color="#FAF8F5"
          transparent
          opacity={0.35}
          roughness={0.12}
          metalness={0.05}
          transmission={0.65}
          thickness={0.5}
        />
      </mesh>

      {/* Glass Jar Bottom */}
      <mesh position={[0, -0.45, 0]}>
        <cylinderGeometry args={[0.92, 0.92, 0.08, 32]} />
        <meshPhysicalMaterial
          color="#FAF8F5"
          transparent
          opacity={0.5}
          roughness={0.15}
        />
      </mesh>

      {/* Soy Wax Cylinder */}
      <mesh position={[0, 0.2, 0]}>
        <cylinderGeometry args={[0.88, 0.88, 1.3, 32]} />
        <meshStandardMaterial
          color={theme.waxColor}
          roughness={0.45}
          metalness={0.02}
        />
      </mesh>

      {/* Melt Pool (top surface) */}
      <mesh position={[0, 0.855, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.88, 32]} />
        <meshStandardMaterial
          color={theme.waxColor}
          roughness={0.2}
          metalness={0.1}
        />
      </mesh>

      {/* Cotton Wick */}
      <mesh position={[0, 1.0, 0]}>
        <cylinderGeometry args={[0.02, 0.02, 0.35, 12]} />
        <meshStandardMaterial color="#2B2620" roughness={0.9} />
      </mesh>

      {/* Flame */}
      <Flame color={theme.glowColor} />

      {/* Ambient Sparkles themed to the fragrance */}
      <Sparkles
        count={28}
        scale={[2.5, 2.8, 2.5]}
        size={2.5}
        speed={0.4}
        color={theme.sparkleColor}
      />
    </group>
  );
}

export interface ScentCanvasProps {
  category: ScentCategory;
}

export function ScentCanvas({ category }: ScentCanvasProps) {
  return (
    <div className="relative h-[380px] w-full sm:h-[450px] lg:h-[500px]">
      <Canvas
        camera={{ position: [0, 1.2, 3.8], fov: 42 }}
        dpr={[1, 2]}
        gl={{ antialias: true, alpha: true }}
      >
        <ambientLight intensity={0.8} />
        <directionalLight position={[3, 4, 2]} intensity={1.2} color="#FFF8F0" />
        <directionalLight position={[-3, 2, -2]} intensity={0.5} color="#E8E4DF" />

        <Float speed={1.5} rotationIntensity={0.2} floatIntensity={0.3}>
          <CandleJar category={category} />
        </Float>

        <OrbitControls
          enableZoom={false}
          enablePan={false}
          maxPolarAngle={Math.PI / 1.8}
          minPolarAngle={Math.PI / 3}
          rotateSpeed={0.6}
        />
      </Canvas>
    </div>
  );
}
