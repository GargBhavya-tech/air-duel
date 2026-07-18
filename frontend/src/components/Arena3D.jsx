import { Canvas } from '@react-three/fiber';
import { OrbitControls, ContactShadows, Environment } from '@react-three/drei';
import { EffectComposer, Bloom } from '@react-three/postprocessing';
import Fighter from './Fighter.jsx';

export default function Arena3D({ playerMove, aiMove, hitFlash, liveRigRef }) {
  return (
    <Canvas
      shadows
      camera={{ position: [0, 1.6, 4.4], fov: 45 }}
      style={{ background: 'transparent' }}
    >
      <ambientLight intensity={0.35} />
      <directionalLight
        position={[3, 5, 2]}
        intensity={1.1}
        castShadow
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
      />
      <pointLight position={[-3, 2, -2]} intensity={0.4} color="#00E5FF" />
      <pointLight position={[3, 2, -2]} intensity={0.4} color="#8B6BFF" />

      <Fighter position={[-0.9, 0, 0]} color="#00E5FF" currentMove={playerMove} label="YOU" liveRigRef={liveRigRef} />
      <Fighter position={[0.9, 0, 0]} color="#8B6BFF" currentMove={aiMove} mirrored label="AI" />

      <ContactShadows position={[0, 0, 0]} opacity={0.5} scale={6} blur={2} far={2} />

      {/* subtle grid floor for the "lab console" telemetry feel */}
      <gridHelper args={[8, 24, '#1E2530', '#141922']} position={[0, 0.001, 0]} />

      <EffectComposer>
        <Bloom intensity={hitFlash ? 1.4 : 0.4} luminanceThreshold={0.2} luminanceSmoothing={0.4} />
      </EffectComposer>

      <OrbitControls
        enablePan={false}
        enableZoom={false}
        minPolarAngle={Math.PI / 2.6}
        maxPolarAngle={Math.PI / 2.1}
        minAzimuthAngle={-0.3}
        maxAzimuthAngle={0.3}
      />
    </Canvas>
  );
}
