/**
 * Fighter.jsx — Procedural rig perfectly mirroring Kalidokit's VRM output.
 */
import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { useSpring, animated } from '@react-spring/three';
import * as THREE from 'three';

const ALPHA_LIVE = 0.22;

function applyKalido(ref, rigNode, alpha) {
  if (!ref.current || !rigNode) return;
  // Kalidokit Euler angles are meant for VRM (which is T-pose, Z-forward, Y-up).
  // We apply them via slerp for smooth tracking.
  const target = new THREE.Euler(rigNode.x || 0, rigNode.y || 0, rigNode.z || 0);
  const qTarget = new THREE.Quaternion().setFromEuler(target);
  ref.current.quaternion.slerp(qTarget, alpha);
}

function applyArr(ref, arr, alpha) {
  if (!ref.current || !arr) return;
  const target = new THREE.Euler(arr[0] || 0, arr[1] || 0, arr[2] || 0);
  const qTarget = new THREE.Quaternion().setFromEuler(target);
  ref.current.quaternion.slerp(qTarget, alpha);
}

const POSES = {
  idle: {
    hips: [0, 0, 0], spine: [0, 0, 0], head: [0, 0, 0],
    lUpperArm: [0, 0, 0.3], lLowerArm: [-0.1, 0, 0.1],
    rUpperArm: [0, 0, -0.3], rLowerArm: [-0.1, 0, -0.1],
    lUpperLeg: [0, 0, 0.06], lLowerLeg: [0.05, 0, 0],
    rUpperLeg: [0, 0, -0.06], rLowerLeg: [0.05, 0, 0],
  },
  punch: {
    hips: [0, 0, 0], spine: [0.06, 0, 0], head: [0.04, 0, 0],
    lUpperArm: [0, 0, 0.3], lLowerArm: [-0.1, 0, 0.1],
    rUpperArm: [-1.4, 0.3, -0.08], rLowerArm: [-0.4, 0, -0.05],
    lUpperLeg: [0.1, 0, 0.08], lLowerLeg: [0.05, 0, 0],
    rUpperLeg: [-0.05, 0, -0.06], rLowerLeg: [0.05, 0, 0],
  },
  kick: {
    hips: [0, 0, 0], spine: [-0.1, 0, 0], head: [-0.05, 0, 0],
    lUpperArm: [0.4, 0, 0.45], lLowerArm: [0.25, 0, 0.15],
    rUpperArm: [0.4, 0, -0.45], rLowerArm: [0.25, 0, -0.15],
    lUpperLeg: [-1.1, 0, 0.05], lLowerLeg: [-0.9, 0, 0],
    rUpperLeg: [0.05, 0, -0.06], rLowerLeg: [0.05, 0, 0],
  },
  block: {
    hips: [0, 0, 0], spine: [0.1, 0, 0], head: [0.08, 0, 0],
    lUpperArm: [-0.8, 0.25, 0.5], lLowerArm: [-1.4, 0, 0.25],
    rUpperArm: [-0.8, -0.25, -0.5], rLowerArm: [-1.4, 0, -0.25],
    lUpperLeg: [0.05, 0, 0.12], lLowerLeg: [0.05, 0, 0],
    rUpperLeg: [-0.05, 0, -0.12], rLowerLeg: [0.05, 0, 0],
  },
  dodge_left: {
    hips: [0, 0, -0.25], spine: [0, 0, -0.25], head: [0, 0, -0.12],
    lUpperArm: [0, 0, 0.45], lLowerArm: [0, 0, 0.15],
    rUpperArm: [0, 0, -0.18], rLowerArm: [0, 0, -0.08],
    lUpperLeg: [0, 0, 0.22], lLowerLeg: [0.05, 0, 0],
    rUpperLeg: [0, 0, 0.10], rLowerLeg: [0.05, 0, 0],
  },
  dodge_right: {
    hips: [0, 0, 0.25], spine: [0, 0, 0.25], head: [0, 0, 0.12],
    lUpperArm: [0, 0, 0.18], lLowerArm: [0, 0, 0.08],
    rUpperArm: [0, 0, -0.45], rLowerArm: [0, 0, -0.15],
    lUpperLeg: [0, 0, -0.10], lLowerLeg: [0.05, 0, 0],
    rUpperLeg: [0, 0, -0.22], rLowerLeg: [0.05, 0, 0],
  },
  hit: {
    hips: [0, 0, 0], spine: [-0.22, 0, 0], head: [-0.18, 0, 0.05],
    lUpperArm: [0.35, 0, 0.65], lLowerArm: [0.35, 0, 0.30],
    rUpperArm: [0.35, 0, -0.65], rLowerArm: [0.35, 0, -0.30],
    lUpperLeg: [0, 0, 0.12], lLowerLeg: [0.05, 0, 0],
    rUpperLeg: [0, 0, -0.12], rLowerLeg: [0.05, 0, 0],
  },
};

export default function Fighter({ position, color, emissiveColor, currentMove, mirrored = false, liveRigRef }) {
  const groupRef = useRef();
  
  // Bones
  const hipsRef = useRef();
  const spineRef = useRef();
  const chestRef = useRef();
  const neckRef = useRef();
  const headRef = useRef();
  
  const lUpperArmRef = useRef();
  const lLowerArmRef = useRef();
  const rUpperArmRef = useRef();
  const rLowerArmRef = useRef();
  
  const lUpperLegRef = useRef();
  const lLowerLegRef = useRef();
  const rUpperLegRef = useRef();
  const rLowerLegRef = useRef();

  const pose = POSES[currentMove] || POSES.idle;

  const { xOffset } = useSpring({
    xOffset: (pose.hips?.[2] || 0) * (mirrored ? -1 : 1), // dodge offset
    config: { tension: 260, friction: 22 },
  });

  useFrame((state, delta) => {
    if (!groupRef.current) return;
    const t = state.clock.getElapsedTime();
    const alpha = Math.min(1, delta * 30 * ALPHA_LIVE);

    groupRef.current.position.y = position[1] + Math.sin(t * 1.8) * 0.012;

    const frameData = liveRigRef?.current;
    
    if (frameData && frameData.rig) {
      const rig = frameData.rig;
      
      applyKalido(hipsRef, rig.Hips?.rotation, alpha);
      applyKalido(spineRef, rig.Spine, alpha);
      applyKalido(chestRef, rig.Chest, alpha);
      applyKalido(neckRef, rig.Neck, alpha);
      applyKalido(headRef, rig.Head, alpha);
      
      applyKalido(rUpperArmRef, rig.LeftUpperArm, alpha);
      applyKalido(rLowerArmRef, rig.LeftLowerArm, alpha);
      applyKalido(lUpperArmRef, rig.RightUpperArm, alpha);
      applyKalido(lLowerArmRef, rig.RightLowerArm, alpha);
      
      applyKalido(rUpperLegRef, rig.LeftUpperLeg, alpha);
      applyKalido(rLowerLegRef, rig.LeftLowerLeg, alpha);
      applyKalido(lUpperLegRef, rig.RightUpperLeg, alpha);
      applyKalido(lLowerLegRef, rig.RightLowerLeg, alpha);

    } else {
      const p = pose;
      const aiAlpha = Math.min(1, delta * 10);
      
      applyArr(hipsRef, p.hips, aiAlpha);
      applyArr(spineRef, p.spine, aiAlpha);
      applyArr(headRef, p.head, aiAlpha);
      
      applyArr(lUpperArmRef, p.lUpperArm, aiAlpha);
      applyArr(lLowerArmRef, p.lLowerArm, aiAlpha);
      applyArr(rUpperArmRef, p.rUpperArm, aiAlpha);
      applyArr(rLowerArmRef, p.rLowerArm, aiAlpha);
      
      applyArr(lUpperLegRef, p.lUpperLeg, aiAlpha);
      applyArr(lLowerLegRef, p.lLowerLeg, aiAlpha);
      applyArr(rUpperLegRef, p.rUpperLeg, aiAlpha);
      applyArr(rLowerLegRef, p.rLowerLeg, aiAlpha);
    }
  });

  const f = mirrored ? -1 : 1;
  const mat = <FighterMat base={color} trim={emissiveColor} />;
  const matD = <FighterMat base={color} trim={emissiveColor} dark />;
  const matT = <FighterMat base={color} trim={emissiveColor} isTrim />;
  const matJ = <FighterMat base={color} trim={emissiveColor} isJoint />;

  // Proper T-pose hierarchy
  return (
    <animated.group
      ref={groupRef}
      position-x={xOffset.to((x) => position[0] + x)}
      position-y={position[1]}
      position-z={position[2]}
      rotation-y={mirrored ? Math.PI : 0}
    >
      <group ref={hipsRef} position={[0, 1.0, 0]}>
        <mesh castShadow><boxGeometry args={[0.32, 0.22, 0.22]} />{mat}</mesh>
        
        {/* SPINE */}
        <group ref={spineRef} position={[0, 0.11, 0]}>
          <mesh position={[0, 0.1, 0]} castShadow><capsuleGeometry args={[0.18, 0.18, 4, 10]} />{matD}</mesh>
          <group ref={chestRef} position={[0, 0.2, 0]}>
            <mesh position={[0, 0.15, 0]} castShadow><capsuleGeometry args={[0.22, 0.2, 6, 12]} />{mat}</mesh>
            <mesh position={[0, 0.3, 0]} castShadow><boxGeometry args={[0.90, 0.10, 0.24]} />{mat}</mesh>
            
            {/* NECK / HEAD */}
            <group ref={neckRef} position={[0, 0.4, 0]}>
              <mesh position={[0, 0.05, 0]} castShadow><cylinderGeometry args={[0.085, 0.105, 0.1, 8]} />{mat}</mesh>
              <group ref={headRef} position={[0, 0.1, 0]}>
                <mesh position={[0, 0.1, 0]} castShadow><sphereGeometry args={[0.205, 16, 12]} />{mat}</mesh>
                <mesh position={[0, 0.12, 0.17]} castShadow><boxGeometry args={[0.23, 0.13, 0.04]} />{matT}</mesh>
              </group>
            </group>

            {/* LEFT ARM (T-Pose points left: +X) */}
            <group position={[0.47, 0.3, 0]}>
              <mesh><sphereGeometry args={[0.078, 10, 8]} />{matJ}</mesh>
              <group ref={lUpperArmRef}>
                <mesh position={[0.15, 0, 0]} rotation={[0, 0, Math.PI/2]} castShadow><capsuleGeometry args={[0.073, 0.28, 4, 8]} />{mat}</mesh>
                <group position={[0.35, 0, 0]}>
                  <mesh><sphereGeometry args={[0.066, 10, 8]} />{matJ}</mesh>
                  <group ref={lLowerArmRef}>
                     <mesh position={[0.15, 0, 0]} rotation={[0, 0, Math.PI/2]} castShadow><capsuleGeometry args={[0.055, 0.24, 4, 8]} />{matD}</mesh>
                     <mesh position={[0.3, 0, 0]}><sphereGeometry args={[0.050, 8, 6]} />{matJ}</mesh>
                     <mesh position={[0.38, 0, 0]} castShadow><boxGeometry args={[0.12, 0.10, 0.07]} />{matT}</mesh>
                  </group>
                </group>
              </group>
            </group>

            {/* RIGHT ARM (T-Pose points right: -X) */}
            <group position={[-0.47, 0.3, 0]}>
              <mesh><sphereGeometry args={[0.078, 10, 8]} />{matJ}</mesh>
              <group ref={rUpperArmRef}>
                <mesh position={[-0.15, 0, 0]} rotation={[0, 0, Math.PI/2]} castShadow><capsuleGeometry args={[0.073, 0.28, 4, 8]} />{mat}</mesh>
                <group position={[-0.35, 0, 0]}>
                  <mesh><sphereGeometry args={[0.066, 10, 8]} />{matJ}</mesh>
                  <group ref={rLowerArmRef}>
                     <mesh position={[-0.15, 0, 0]} rotation={[0, 0, Math.PI/2]} castShadow><capsuleGeometry args={[0.055, 0.24, 4, 8]} />{matD}</mesh>
                     <mesh position={[-0.3, 0, 0]}><sphereGeometry args={[0.050, 8, 6]} />{matJ}</mesh>
                     <mesh position={[-0.38, 0, 0]} castShadow><boxGeometry args={[0.12, 0.10, 0.07]} />{matT}</mesh>
                  </group>
                </group>
              </group>
            </group>

          </group>
        </group>

        {/* LEFT LEG (Points down: -Y) */}
        <group position={[0.14, -0.11, 0]}>
          <mesh><sphereGeometry args={[0.085, 10, 8]} />{matJ}</mesh>
          <group ref={lUpperLegRef}>
            <mesh position={[0, -0.22, 0]} castShadow><capsuleGeometry args={[0.095, 0.38, 4, 8]} />{mat}</mesh>
            <group position={[0, -0.45, 0]}>
              <mesh><sphereGeometry args={[0.082, 10, 8]} />{matJ}</mesh>
              <group ref={lLowerLegRef}>
                <mesh position={[0, -0.2, 0]} castShadow><capsuleGeometry args={[0.072, 0.32, 4, 8]} />{matD}</mesh>
                <mesh position={[0, -0.4, 0]}><sphereGeometry args={[0.064, 8, 6]} />{matJ}</mesh>
                <mesh position={[0, -0.45, 0.08]} castShadow><boxGeometry args={[0.12, 0.07, 0.26]} />{matT}</mesh>
              </group>
            </group>
          </group>
        </group>

        {/* RIGHT LEG (Points down: -Y) */}
        <group position={[-0.14, -0.11, 0]}>
          <mesh><sphereGeometry args={[0.085, 10, 8]} />{matJ}</mesh>
          <group ref={rUpperLegRef}>
            <mesh position={[0, -0.22, 0]} castShadow><capsuleGeometry args={[0.095, 0.38, 4, 8]} />{mat}</mesh>
            <group position={[0, -0.45, 0]}>
              <mesh><sphereGeometry args={[0.082, 10, 8]} />{matJ}</mesh>
              <group ref={rLowerLegRef}>
                <mesh position={[0, -0.2, 0]} castShadow><capsuleGeometry args={[0.072, 0.32, 4, 8]} />{matD}</mesh>
                <mesh position={[0, -0.4, 0]}><sphereGeometry args={[0.064, 8, 6]} />{matJ}</mesh>
                <mesh position={[0, -0.45, 0.08]} castShadow><boxGeometry args={[0.12, 0.07, 0.26]} />{matT}</mesh>
              </group>
            </group>
          </group>
        </group>

      </group>

      {/* Ground glow ring */}
      <mesh position={[0, 0.01, 0]} rotation={[-Math.PI/2, 0, 0]}>
        <ringGeometry args={[0.36, 0.52, 32]} />
        <meshBasicMaterial color={color} transparent opacity={0.4} />
      </mesh>
    </animated.group>
  );
}

function FighterMat({ base, trim, dark, isTrim, isJoint }) {
  if (isJoint) return (
    <meshPhysicalMaterial color={trim} roughness={0.20} metalness={0.75} emissive={base} emissiveIntensity={0.7} clearcoat={0.9} clearcoatRoughness={0.1} />
  );
  if (isTrim) return (
    <meshPhysicalMaterial color={base} roughness={0.28} metalness={0.55} emissive={base} emissiveIntensity={0.50} clearcoat={0.65} clearcoatRoughness={0.2} />
  );
  return (
    <meshPhysicalMaterial color={dark ? shiftDark(base) : base} roughness={dark ? 0.78 : 0.65} metalness={0.18} emissive={trim} emissiveIntensity={dark ? 0.04 : 0.10} />
  );
}

function shiftDark(hex) {
  try {
    const c = new THREE.Color(hex);
    c.multiplyScalar(0.60);
    return `#${c.getHexString()}`;
  } catch { return hex; }
}
