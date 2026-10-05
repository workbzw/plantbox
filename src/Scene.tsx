import { tr } from "./i18n";
import type { Locale } from "./routing";
import { Suspense, memo, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import type { ComponentType } from "react";
import { Html } from "@react-three/drei/web/Html.js";
import { OrbitControls } from "@react-three/drei/core/OrbitControls.js";
import { afterPaint } from "./startup";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import * as THREE from "three";

function Label(props: React.ComponentProps<typeof Html>) {
  const gl = useThree((s) => s.gl);
  const portal = useMemo(
    () => ({ current: gl.domElement.parentElement! }),
    [gl],
  );
  return <Html {...props} portal={portal} />;
}
import {
  ContainerModel,
  EnvironmentModel,
  TruckModel,
  Warehouse,
} from "./Models";
import { useStore } from "./store";
import { phaseAt, TRUCKS } from "./simulation";
import { frontWheelAngle, TRUCK_GEOMETRY, truckPose } from "./truckMotion";

import { HandlingScene } from "./HandlingScene";
import { DOCK_X } from "./logistics";

function SelectionRing({
  radius = 2,
  color = "#4472e0",
}: {
  radius?: number;
  color?: string;
}) {
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.09, 0]}>
        <ringGeometry args={[radius - 0.045, radius, 64]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={0.9}
          depthWrite={false}
        />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.085, 0]}>
        <circleGeometry args={[radius, 64]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={0.07}
          depthWrite={false}
        />
      </mesh>
    </group>
  );
}

function MovingTruck({
  index,
  clock,
}: {
  index: number;
  clock: React.RefObject<number>;
}) {
  const data = TRUCKS[index];
  const ref = useRef<THREE.Group>(null);
  const wheelRig = useRef<THREE.Group>(null);
  const labels = useStore((s) => s.labels);
  const phase = useStore((s) => phaseAt(s.time + data.offset).phase);
  const selected = useStore(
    (s) => s.selected.kind === "truck" && s.selected.id === data.id,
  );
  const [visible, setVisible] = useState(true);
  useFrame(() => {
    // The truck and its secured cargo must use the same physical instant.
    const p = truckPose(clock.current + data.offset, index);
    if (p.visible !== visible) setVisible(p.visible);
    if (!ref.current) return;
    ref.current.position.set(p.x, 0.08, p.z);
    ref.current.rotation.y = p.rot;
    ref.current.visible = p.visible;
    wheelRig.current?.children.forEach((wheel, i) => {
      wheel.rotation.y =
        i % 3 === 2
          ? frontWheelAngle(
              p.curvature,
              i < 3 ? -TRUCK_GEOMETRY.halfTrack : TRUCK_GEOMETRY.halfTrack,
            )
          : 0;
      wheel.children[0].rotation.x =
        p.wheelTravel[i] / TRUCK_GEOMETRY.wheelRadius;
    });
  });
  return (
    <group
      ref={ref}
      onClick={(e) => {
        e.stopPropagation();
        useStore.getState().select({ kind: "truck", id: data.id });
      }}
      onPointerOver={() => {
        document.body.style.cursor = "pointer";
      }}
      onPointerOut={() => {
        document.body.style.cursor = "";
      }}
    >
      <TruckModel
        color={data.color}
        openSide={phase === "loading"}
        wheelRig={wheelRig}
        reversing={phase === "docking"}
      />
      {selected && <SelectionRing radius={5.2} />}
      <Label
        style={{ display: labels && visible ? "block" : "none" }}
        position={[0, 4.8, -1]}
        center
        zIndexRange={[6, 0]}
      >
        <button
          className={`scene-tag vehicle-tag ${selected ? "selected" : ""}`}
          onClick={() =>
            useStore.getState().select({ kind: "truck", id: data.id })
          }
        >
          <span style={{ background: data.color }} />
          {data.id}
          <b>{data.direction === "inbound" ? tr("入库") : tr("出库")}</b>
        </button>
      </Label>
    </group>
  );
}

function CameraRig() {
  const controls = useRef<OrbitControlsImpl>(null);
  const { camera, size } = useThree();
  const command = useStore((s) => s.camera);
  const focusDock = useStore((s) =>
    s.selected.kind === "forklift"
      ? Number(s.selected.id.slice(-1)) - 1
      : s.selected.kind === "pallet"
        ? Number(s.selected.id.split("-")[1]) - 1
        : -1,
  );
  const target = useRef(new THREE.Vector3(-2, 0, 0));
  const position = useRef(new THREE.Vector3(58, 48, 72));
  const zoom = useRef(10);
  const animating = useRef(true);
  useEffect(() => {
    const views = {
      overview: { target: [-8, 1, 8], pos: [56, 57, 85], factor: 2 },
      dock: { target: [-8, 1, 15], pos: [29, 37, 65], factor: 1.4 },
      storage: { target: [26, 1, -8], pos: [55, 33, 40], factor: 2 },
      top: { target: [-1, 0, 6], pos: [-1, 100, 6.01], factor: 0.88 },
      interior: { target: [-8, 1, -7], pos: [26, 43, 38], factor: 1.5 },
    }[command.view];
    if (command.view === "dock" && focusDock >= 0 && focusDock < 3) {
      views.target = [DOCK_X[focusDock] + 4.7, 0.8, 9.5];
      views.pos = [DOCK_X[focusDock] + 24.7, 34.8, 41.5];
      views.factor = 2;
    }
    target.current.set(...(views.target as [number, number, number]));
    const offset = new THREE.Vector3(...(views.pos as [number, number, number]))
      .sub(target.current)
      .applyAxisAngle(new THREE.Vector3(0, 1, 0), command.rotation);
    position.current.copy(target.current).add(offset);
    zoom.current =
      Math.min(size.width / 80, size.height / 66) * views.factor * command.zoom;
    animating.current = true;
  }, [command, focusDock, size.width, size.height]);
  useFrame((_, dt) => {
    if (!controls.current || !animating.current) return;
    const a = 1 - Math.exp(-dt * 5);
    camera.position.lerp(position.current, a);
    controls.current.target.lerp(target.current, a);
    camera.zoom = THREE.MathUtils.lerp(camera.zoom, zoom.current, a);
    camera.updateProjectionMatrix();
    controls.current.update();
    if (
      camera.position.distanceTo(position.current) < 0.02 &&
      Math.abs(camera.zoom - zoom.current) < 0.005
    )
      animating.current = false;
  });
  return (
    <OrbitControls
      ref={controls}
      makeDefault
      enableDamping
      dampingFactor={0.08}
      minZoom={3}
      maxZoom={45}
      minPolarAngle={0.05}
      maxPolarAngle={Math.PI / 2.18}
      onStart={() => {
        animating.current = false;
      }}
      target={[-2, 0, -1]}
    />
  );
}

function World({ onReady }: { locale: Locale; onReady: () => void }) {
  const [Effects, setEffects] = useState<ComponentType<{
    quality: "high" | "balanced";
  }> | null>(null);
  useEffect(() => {
    let cancelled = false;
    const cancel = afterPaint(() => {
      void import("./SceneEffects")
        .then((module) => {
          if (!cancelled) setEffects(() => module.default);
        })
        .catch((error) => {
          console.warn("Optional scene effects could not load", error);
        });
    });
    return () => {
      cancelled = true;
      cancel();
    };
  }, []);
  const announced = useRef(false);
  useFrame(() => {
    if (announced.current) return;
    announced.current = true;
    requestAnimationFrame(() => {
      onReady();
      performance.mark("plantbox:scene-ready");
    });
  });
  const physicalClock = useRef(useStore.getState().time);
  const roofOpen = useStore((s) => s.roofOpen);
  const labels = useStore((s) => s.labels);
  const quality = useStore((s) => s.quality);
  const selected = useStore((s) => s.selected);
  const select = useStore((s) => s.select);
  const containerColors = ["#398789", "#3864ba", "#dc965c"];
  const groundMaterial = useMemo(
    () => new THREE.MeshStandardMaterial({ color: "#e7ecf1", roughness: 1 }),
    [],
  );
  return (
    <>
      <color attach="background" args={["#edf1f5"]} />
      <ambientLight intensity={0.3} />
      <hemisphereLight args={["#dbeaff", "#b8b4a4", 0.75]} />
      <directionalLight
        position={[-30, 55, 35]}
        intensity={2.1}
        color="#fff5df"
        castShadow={Effects !== null}
        shadow-mapSize={quality === "high" ? [4096, 4096] : [2048, 2048]}
        shadow-camera-left={-65}
        shadow-camera-right={65}
        shadow-camera-top={60}
        shadow-camera-bottom={-60}
        shadow-camera-near={1}
        shadow-camera-far={160}
        shadow-normalBias={0.08}
        shadow-bias={-0.00015}
        shadow-radius={3}
      />
      <directionalLight
        position={[30, 20, -40]}
        intensity={0.45}
        color="#c8dcff"
      />
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, -1.1, 0]}
        receiveShadow
        material={groundMaterial}
      >
        <planeGeometry args={[300, 300]} />
      </mesh>
      <EnvironmentModel />
      <Warehouse
        roofOpen={roofOpen}
        onClick={(e) => {
          e.stopPropagation();
          select({ kind: "site", id: "WH-01" });
        }}
      />
      <Label
        style={{ display: labels ? "block" : "none" }}
        position={[-10, 10, -10]}
        center
        zIndexRange={[5, 0]}
      >
        <button
          className="scene-tag warehouse-tag"
          onClick={() => select({ kind: "site", id: "WH-01" })}
        >
          <span className="tag-cube">▣</span>
          <div>
            <b>{tr("滨河仓储中心")}</b>
            <small>{tr("WH-01 · 运行正常")}</small>
          </div>
        </button>
      </Label>
      {TRUCKS.map((t, i) => (
        <MovingTruck key={t.id} index={i} clock={physicalClock} />
      ))}
      <HandlingScene clock={physicalClock} />
      {[0, 1, 2].map((i) => (
        <group
          key={i}
          position={[23 + (i % 2) * 4, i === 2 ? 2.82 : 0, -11]}
          onClick={(e) => {
            e.stopPropagation();
            select({ kind: "container", id: `CNT-00${i + 1}` });
          }}
        >
          <ContainerModel color={containerColors[i]} />
          {selected.kind === "container" &&
            selected.id === `CNT-00${i + 1}` && <SelectionRing radius={4.5} />}
        </group>
      ))}
      <Label
        style={{ display: labels ? "block" : "none" }}
        position={[26, 7.8, -11]}
        center
        zIndexRange={[5, 0]}
      >
        <button
          className="scene-tag"
          onClick={() => {
            select({ kind: "container", id: "CNT-001" });
            useStore.getState().setCamera("storage");
          }}
        >
          <span className="small-dot teal" />
          {tr("集装箱堆场")}
          <b>03</b>
        </button>
      </Label>
      <CameraRig />
      {Effects && (
        <Suspense fallback={null}>
          <Effects quality={quality} />
        </Suspense>
      )}
    </>
  );
}

function Scene({ locale }: { locale: Locale }) {
  const page = useStore((s) => s.page);
  const quality = useStore((s) => s.quality);
  const [ready, setReady] = useState(false);
  return (
    <div className="scene-canvas" aria-label={tr("可交互的三维仓储园区")}>
      <Canvas
        frameloop={page === "scene" ? "always" : "never"}
        orthographic
        shadows
        dpr={quality === "high" ? [1, 1.6] : [1, 1.15]}
        camera={{ position: [58, 48, 72], zoom: 10, near: 0.1, far: 350 }}
        gl={{
          antialias: true,
          powerPreference: "high-performance",
          toneMapping: THREE.ACESFilmicToneMapping,
          toneMappingExposure: 1.06,
        }}
        onCreated={({ gl }) => {
          gl.shadowMap.type = THREE.PCFSoftShadowMap;
        }}
        onPointerMissed={() =>
          useStore.getState().select({ kind: "site", id: "WH-01" })
        }
      >
        <Suspense fallback={null}>
          <World locale={locale} onReady={() => setReady(true)} />
        </Suspense>
      </Canvas>
      {!ready && (
        <div className="scene-loading">
          <span className="loading-cube">▣</span>
          <strong>{tr("正在准备园区场景")}</strong>
          <small>{tr("建筑、车辆与作业数据加载中")}</small>
        </div>
      )}
    </div>
  );
}

export default memo(Scene);
