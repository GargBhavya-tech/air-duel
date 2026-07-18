import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { useSpring, animated } from '@react-spring/three';
import * as THREE from 'three';

/**
 * Procedural low-poly fighter — no external 3D model files needed.
 *
 * Two animation sources, picked per-limb at runtime:
 *  - AI opponent (and the player before a live rig exists): discrete
 *    preset poses from POSES[currentMove], smoothed with react-spring —
 *    same system as before.
 *  - Player, once `liveRigRef` is supplied: limb rotations are driven
 *    every frame directly from the Kalidokit rig (real body angles),
 *    imperatively lerped for smoothing. Position offset ("dodge slide")
 *    and torso lean still come from the discrete move table either way,
 *    since those are readable game-feedback cues, not literal body
 *    tracking.
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

const tmpVec = new THREE.Euler();

export default function Fighter({ position, color, currentMove, mirrored = false, label, liveRigRef }) {
  const groupRef = useRef();
  const lArmRef = useRef();
  const rArmRef = useRef();
  const lLegRef = useRef();
  const rLegRef = useRef();
  const spineRef = useRef();

  const pose = POSES[currentMove] || POSES.idle;

  // Position offset ("dodge slide") + torso lean: always driven by the
  // discrete classified move, for both fighters — these are readable
  // game-feedback cues, not something you'd want literally tracking
  // your real lateral position.
  const { lean, xOffset } = useSpring({
    lean: pose.lean,
    xOffset: pose.xOffset || 0,
    config: { tension: 320, friction: 18 },
  });

  useFrame((stateFrame, delta) => {
    if (!groupRef.current) return;
    const t = stateFrame.clock.getElapsedTime();
    groupRef.current.position.y = position[1] + Math.sin(t * 2) * 0.02;

    const rig = liveRigRef?.current;
    const alpha = Math.min(1, delta * 12); // frame-rate independent smoothing

    if (rig) {
      // Live-tracked path: limb rotations come straight from Kalidokit's
      // solved rig every frame.
      setTowards(lArmRef.current, rig.LeftUpperArm, alpha);
      setTowards(rArmRef.current, rig.RightUpperArm, alpha);
      setTowards(lLegRef.current, rig.LeftUpperLeg, alpha);
      setTowards(rLegRef.current, rig.RightUpperLeg, alpha);
      if (spineRef.current && rig.Spine) {
        spineRef.current.rotation.z = THREE.MathUtils.lerp(
          spineRef.current.rotation.z, rig.Spine.z || 0, alpha
        );
      }
    } else {
      // Preset path: AI opponent, or player before a live rig exists yet
      // (e.g. still calibrating).
      setTowardsArray(lArmRef.current, pose.lArm, alpha);
      setTowardsArray(rArmRef.current, pose.rArm, alpha);
      setTowardsArray(lLegRef.current, pose.lLeg, alpha);
      setTowardsArray(rLegRef.current, pose.rLeg, alpha);
    }
  });

  const facing = mirrored ? -1 : 1;

  return (
    <animated.group
      ref={groupRef}
      position-x={xOffset.to((x) => position[0] + x)}
      position-y={position[1]}
      position-z={position[2]}
      rotation-y={mirrored ? Math.PI : 0}
    >
      <animated.group rotation-z={lean} ref={spineRef}>
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
        <group ref={lArmRef} position={[0.42 * facing, 1.4, 0]}>
          <mesh position={[0, -0.35, 0]} castShadow>
            <capsuleGeometry args={[0.09, 0.6, 4, 8]} />
            <meshStandardMaterial color={color} roughness={0.5} />
          </mesh>
        </group>

        {/* right arm */}
        <group ref={rArmRef} position={[-0.42 * facing, 1.4, 0]}>
          <mesh position={[0, -0.35, 0]} castShadow>
            <capsuleGeometry args={[0.09, 0.6, 4, 8]} />
            <meshStandardMaterial color={color} roughness={0.5} />
          </mesh>
        </group>

        {/* left leg */}
        <group ref={lLegRef} position={[0.16, 0.75, 0]}>
          <mesh position={[0, -0.4, 0]} castShadow>
            <capsuleGeometry args={[0.11, 0.7, 4, 8]} />
            <meshStandardMaterial color={color} roughness={0.5} />
          </mesh>
        </group>

        {/* right leg */}
        <group ref={rLegRef} position={[-0.16, 0.75, 0]}>
          <mesh position={[0, -0.4, 0]} castShadow>
            <capsuleGeometry args={[0.11, 0.7, 4, 8]} />
            <meshStandardMaterial color={color} roughness={0.5} />
          </mesh>
        </group>
      </animated.group>

      {/* ground contact glow ring — telemetry aesthetic */}
      <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.4, 0.5, 32]} />
        <meshBasicMaterial color={color} transparent opacity={0.35} />
      </mesh>
    </animated.group>
  );
}

// Lerp a group's rotation toward a Kalidokit rig-part {x,y,z} target.
function setTowards(group, target, alpha) {
  if (!group || !target) return;
  group.rotation.x = THREE.MathUtils.lerp(group.rotation.x, target.x || 0, alpha);
  group.rotation.y = THREE.MathUtils.lerp(group.rotation.y, target.y || 0, alpha);
  group.rotation.z = THREE.MathUtils.lerp(group.rotation.z, target.z || 0, alpha);
}

// Lerp a group's rotation toward a POSES-table [x,y,z] array target.
function setTowardsArray(group, target, alpha) {
  if (!group || !target) return;
  group.rotation.x = THREE.MathUtils.lerp(group.rotation.x, target[0] || 0, alpha);
  group.rotation.y = THREE.MathUtils.lerp(group.rotation.y, target[1] || 0, alpha);
  group.rotation.z = THREE.MathUtils.lerp(group.rotation.z, target[2] || 0, alpha);
}
