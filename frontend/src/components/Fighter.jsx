import { useRef, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import { useSpring, animated } from '@react-spring/three';

/**
 * Procedural low-poly fighter — no external 3D model files needed,
 * built entirely from primitives. Each limb is its own group with a
 * spring-animated rotation, driven by `currentMove`. This keeps the
 * whole thing dependency-light (no GLTF rigging pipeline) while still
 * giving real pose-reactive animation instead of a static mesh.
 *
 * Pose targets per move — [leftArm, rightArm, leftLeg, rightLeg] as
 * [x, y, z] euler rotations in radians.
 */
const POSES = {
  idle:        { lArm: [0, 0, 0.15], rArm: [0, 0, -0.15], lLeg: [0, 0, 0],    rLeg: [0, 0, 0],    lean: 0 },
  punch:       { lArm: [0, 0, 0.15], rArm: [-1.3, 0, -0.1], lLeg: [0, 0, 0],  rLeg: [0, 0, 0],    lean: 0.08 },
  kick:        { lArm: [0.3, 0, 0.3], rArm: [0.3, 0, -0.3], lLeg: [-1.1, 0, 0], rLeg: [0, 0, 0],  lean: -0.15 },
  block:       { lArm: [-0.9, 0.3, 0.5], rArm: [-0.9, -0.3, -0.5], lLeg: [0, 0, 0], rLeg: [0, 0, 0], lean: 0.05 },
  dodge_left:  { lArm: [0, 0, 0.4], rArm: [0, 0, -0.2], lLeg: [0, 0, 0.3], rLeg: [0, 0, 0.1], lean: 0, xOffset: -0.5 },
  dodge_right: { lArm: [0, 0, 0.2], rArm: [0, 0, -0.4], lLeg: [0, 0, -0.1], rLeg: [0, 0, -0.3], lean: 0, xOffset: 0.5 },
  hit:         { lArm: [0.2, 0, 0.5], rArm: [0.2, 0, -0.5], lLeg: [0, 0, 0], rLeg: [0, 0, 0], lean: -0.25 },
};

export default function Fighter({ position, color, currentMove, mirrored = false, label }) {
  const groupRef = useRef();
  const pose = POSES[currentMove] || POSES.idle;

  const { lArmRot, rArmRot, lLegRot, rLegRot, lean, xOffset } = useSpring({
    lArmRot: pose.lArm,
    rArmRot: pose.rArm,
    lLegRot: pose.lLeg,
    rLegRot: pose.rLeg,
    lean: pose.lean,
    xOffset: pose.xOffset || 0,
    config: { tension: 320, friction: 18 },
  });

  // idle bob so the character never looks frozen between moves
  useFrame((stateFrame) => {
    if (!groupRef.current) return;
    const t = stateFrame.clock.getElapsedTime();
    groupRef.current.position.y = position[1] + Math.sin(t * 2) * 0.02;
  });

  const facing = mirrored ? -1 : 1;

  return (
    <animated.group
      ref={groupRef}
      position-x={xOffset.to((x) => position[0] + x)}
      position-y={position[1]}
      position-z={position[2]}
      rotation-y={mirrored ? Math.PI : 0}
      rotation-z={lean}
    >
      {/* torso */}
      <mesh position={[0, 1.1, 0]} castShadow>
        <capsuleGeometry args={[0.32, 0.6, 4, 8]} />
        <meshStandardMaterial color={color} roughness={0.4} metalness={0.15} />
      </mesh>

      {/* head */}
      <mesh position={[0, 1.85, 0]} castShadow>
        <icosahedronGeometry args={[0.24, 1]} />
        <meshStandardMaterial color={color} roughness={0.3} metalness={0.2} emissive={color} emissiveIntensity={0.08} />
      </mesh>

      {/* left arm */}
      <animated.group position={[0.42 * facing, 1.4, 0]} rotation={lArmRot}>
        <mesh position={[0, -0.35, 0]} castShadow>
          <capsuleGeometry args={[0.09, 0.6, 4, 8]} />
          <meshStandardMaterial color={color} roughness={0.5} />
        </mesh>
      </animated.group>

      {/* right arm */}
      <animated.group position={[-0.42 * facing, 1.4, 0]} rotation={rArmRot}>
        <mesh position={[0, -0.35, 0]} castShadow>
          <capsuleGeometry args={[0.09, 0.6, 4, 8]} />
          <meshStandardMaterial color={color} roughness={0.5} />
        </mesh>
      </animated.group>

      {/* left leg */}
      <animated.group position={[0.16, 0.75, 0]} rotation={lLegRot}>
        <mesh position={[0, -0.4, 0]} castShadow>
          <capsuleGeometry args={[0.11, 0.7, 4, 8]} />
          <meshStandardMaterial color={color} roughness={0.5} />
        </mesh>
      </animated.group>

      {/* right leg */}
      <animated.group position={[-0.16, 0.75, 0]} rotation={rLegRot}>
        <mesh position={[0, -0.4, 0]} castShadow>
          <capsuleGeometry args={[0.11, 0.7, 4, 8]} />
          <meshStandardMaterial color={color} roughness={0.5} />
        </mesh>
      </animated.group>

      {/* ground contact glow ring — telemetry aesthetic */}
      <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.4, 0.5, 32]} />
        <meshBasicMaterial color={color} transparent opacity={0.35} />
      </mesh>
    </animated.group>
  );
}
