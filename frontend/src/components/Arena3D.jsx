import { useRef, useMemo } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { ContactShadows } from '@react-three/drei';
import { EffectComposer, Bloom } from '@react-three/postprocessing';
import * as THREE from 'three';
import Fighter from './Fighter.jsx';

// ─── Hit Spark Burst ─────────────────────────────────────────────────────────
const SPARK_COUNT = 18;

function HitSparks({ active, color }) {
  const ref   = useRef();
  const clock = useRef(0);
  const alive = useRef(false);

  // Pre-generate random directions for each spark
  const dirs = useMemo(() =>
    Array.from({ length: SPARK_COUNT }, () => new THREE.Vector3(
      (Math.random() - 0.5) * 2,
      Math.random() * 1.5 + 0.2,
      (Math.random() - 0.5) * 2,
    ).normalize().multiplyScalar(Math.random() * 0.8 + 0.3)),
  []);

  // Trigger on active change
  const prevActive = useRef(null);
  useFrame((_, delta) => {
    if (!ref.current) return;
    if (active !== prevActive.current) {
      prevActive.current = active;
      if (active) { clock.current = 0; alive.current = true; }
    }

    if (!alive.current) {
      ref.current.children.forEach(c => { c.visible = false; });
      return;
    }

    clock.current += delta;
    const t = clock.current;
    const dur = 0.45;

    if (t > dur) { alive.current = false; return; }

    const progress = t / dur;

    ref.current.children.forEach((mesh, i) => {
      const dir = dirs[i];
      mesh.visible = true;
      mesh.position.set(
        dir.x * progress * 1.2,
        1.2 + dir.y * progress * 1.0 - 0.5 * 9.8 * progress * progress * 0.12,
        dir.z * progress * 1.2,
      );
      mesh.material.opacity = Math.max(0, 1 - progress * 2.2);
      const s = (1 - progress) * 0.06 + 0.01;
      mesh.scale.setScalar(s);
    });
  });

  return (
    <group ref={ref} position={[0, 0, 0]}>
      {dirs.map((_, i) => (
        <mesh key={i} visible={false}>
          <dodecahedronGeometry args={[1, 0]} />
          <meshBasicMaterial color={color} transparent opacity={1} />
        </mesh>
      ))}
    </group>
  );
}

// ─── Arena Floor Ring (octagon / fighting ring lines) ────────────────────────
function FightingRing() {
  const ringRef = useRef();
  useFrame((state) => {
    if (ringRef.current) {
      ringRef.current.material.opacity = 0.25 + Math.sin(state.clock.getElapsedTime() * 1.2) * 0.06;
    }
  });

  return (
    <group>
      {/* Outer ring */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.002, 0]} ref={ringRef}>
        <ringGeometry args={[2.2, 2.35, 8]} />
        <meshBasicMaterial color="#00E5FF" transparent opacity={0.25} side={THREE.DoubleSide} />
      </mesh>
      {/* Inner ring */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.002, 0]}>
        <ringGeometry args={[1.6, 1.68, 8]} />
        <meshBasicMaterial color="#9B6FFF" transparent opacity={0.12} side={THREE.DoubleSide} />
      </mesh>
      {/* Center cross */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.002, 0]}>
        <planeGeometry args={[0.04, 0.8]} />
        <meshBasicMaterial color="#00E5FF" transparent opacity={0.3} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, Math.PI / 2, 0]} position={[0, 0.002, 0]}>
        <planeGeometry args={[0.04, 0.8]} />
        <meshBasicMaterial color="#00E5FF" transparent opacity={0.3} />
      </mesh>
      {/* Grid floor */}
      <gridHelper args={[10, 28, '#141D2E', '#0D1420']} position={[0, 0.001, 0]} />
    </group>
  );
}

// ─── Main Arena ──────────────────────────────────────────────────────────────
export default function Arena3D({ playerMove, aiMove, hitFlash, liveRigRef }) {
  return (
    <Canvas
      shadows
      camera={{ position: [0, 1.3, 5.2], fov: 44 }}
      style={{ background: 'transparent' }}
      gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.1 }}
    >
      {/* ── Lights ── */}
      <ambientLight intensity={0.20} />

      {/* Key light — slightly warm */}
      <directionalLight
        position={[2, 7, 3]} intensity={1.4} castShadow
        shadow-mapSize={[2048, 2048]} shadow-bias={-0.0005}
        color="#FFF5E8"
      />
      {/* Player side rim — cyan */}
      <pointLight position={[-3.5, 3, 1.5]} intensity={1.4} color="#00E5FF" />
      {/* AI side rim — violet */}
      <pointLight position={[ 3.5, 3, 1.5]} intensity={1.4} color="#9B6FFF" />
      {/* Front fill */}
      <pointLight position={[0, 1.0, 4.0]} intensity={0.5} color="#ffffff" />
      {/* Ground bounce — subtle blue tint */}
      <pointLight position={[0, -0.4, 1]} intensity={0.25} color="#0A1835" />

      {/* ── Fighters ── */}
      <Fighter
        position={[-1.05, 0, 0]}
        color="#1A3040"
        emissiveColor="#003344"
        currentMove={playerMove}
        label="YOU"
        liveRigRef={liveRigRef}
      />
      <Fighter
        position={[1.05, 0, 0]}
        color="#1A1028"
        emissiveColor="#220033"
        currentMove={aiMove}
        mirrored
        label="AI"
      />

      {/* ── Hit sparks ── */}
      <HitSparks active={hitFlash} color={hitFlash ? '#FF4D2E' : '#00E5FF'} />

      {/* ── Floor ── */}
      <ContactShadows
        position={[0, 0, 0]} opacity={0.7} scale={8}
        blur={2.5} far={2.5} color="#000820"
      />
      <FightingRing />

      {/* ── Post processing ── */}
      <EffectComposer multisampling={0}>
        <Bloom
          intensity={hitFlash ? 2.5 : 0.6}
          luminanceThreshold={0.12}
          luminanceSmoothing={0.4}
          mipmapBlur
        />
      </EffectComposer>
    </Canvas>
  );
}
