"use client";

import { Float, MeshDistortMaterial, OrbitControls } from "@react-three/drei";
import { Canvas, useFrame } from "@react-three/fiber";
import { useRef } from "react";
import type { Group } from "three";

function BulldogAbstract() {
  const group = useRef<Group>(null);

  useFrame(({ pointer }) => {
    if (!group.current) {
      return;
    }

    group.current.rotation.y = pointer.x * 0.35;
    group.current.rotation.x = pointer.y * 0.18;
  });

  return (
    <Float speed={1.6} rotationIntensity={0.18} floatIntensity={0.8}>
      <group ref={group}>
        <mesh position={[0, 0.3, 0]}>
          <sphereGeometry args={[1.25, 64, 64]} />
          <MeshDistortMaterial
            color="#7c1228"
            roughness={0.18}
            metalness={0.75}
            distort={0.18}
            speed={2}
          />
        </mesh>
        <mesh position={[-1.2, 1.1, 0]}>
          <coneGeometry args={[0.34, 0.82, 24]} />
          <meshStandardMaterial color="#f2ece3" metalness={0.2} roughness={0.4} />
        </mesh>
        <mesh position={[1.2, 1.1, 0]}>
          <coneGeometry args={[0.34, 0.82, 24]} />
          <meshStandardMaterial color="#f2ece3" metalness={0.2} roughness={0.4} />
        </mesh>
        <mesh position={[-0.5, 0.35, 1.05]}>
          <sphereGeometry args={[0.18, 24, 24]} />
          <meshStandardMaterial color="#f2ece3" />
        </mesh>
        <mesh position={[0.5, 0.35, 1.05]}>
          <sphereGeometry args={[0.18, 24, 24]} />
          <meshStandardMaterial color="#f2ece3" />
        </mesh>
        <mesh position={[0, -0.55, 1.1]}>
          <boxGeometry args={[0.62, 0.34, 0.54]} />
          <meshStandardMaterial color="#f2ece3" metalness={0.12} roughness={0.35} />
        </mesh>
        <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, -2.2, -0.1]}>
          <ringGeometry args={[2.4, 3.2, 64]} />
          <meshStandardMaterial color="#6f1023" transparent opacity={0.32} />
        </mesh>
      </group>
    </Float>
  );
}

export function BulldogStage() {
  return (
    <div className="h-[420px] w-full">
      <Canvas camera={{ position: [0, 0, 5.5], fov: 42 }}>
        <ambientLight intensity={1.2} />
        <directionalLight position={[3, 4, 3]} intensity={2.4} />
        <directionalLight position={[-3, -1, 2]} intensity={1.2} color="#d36a7b" />
        <BulldogAbstract />
        <OrbitControls enableZoom={false} enablePan={false} autoRotate autoRotateSpeed={0.8} />
      </Canvas>
    </div>
  );
}
