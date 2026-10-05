import { tr } from "./i18n";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Html } from "@react-three/drei/web/Html.js";
import * as THREE from "three";
import { CargoPallet, ForkliftModel } from "./Models";
import type { HandlingPhysics } from "./handlingPhysics";
import { materialSnapshot } from "./cargoSnapshot";
import { afterPaint } from "./startup";
import { forkliftPose, handlingLabels } from "./forkliftMotion";
import { FLOOR_Y, FORKLIFT, TRUCK_OFFSETS } from "./logistics";
import { useStore } from "./store";

function Forklift({
  dock,
  clock,
}: {
  dock: number;
  clock: React.RefObject<number>;
}) {
  const body = useRef<THREE.Group>(null),
    mast = useRef<THREE.Group>(null),
    carriage = useRef<THREE.Group>(null),
    wheels = useRef<THREE.Group>(null);
  const selected = useStore(
    (s) =>
      s.selected.kind === "forklift" && s.selected.id === `FL-0${dock + 1}`,
  );
  const stage = useStore(
    (s) => forkliftPose(s.time + TRUCK_OFFSETS[dock], dock).stage,
  );
  const gl = useThree((s) => s.gl);
  const portal = useMemo(
    () => ({ current: gl.domElement.parentElement! }),
    [gl],
  );
  const lastTime = useRef(clock.current),
    wheelTravel = useRef([0, 0, 0, 0]);
  useFrame((_, dt) => {
    const p = forkliftPose(clock.current + TRUCK_OFFSETS[dock], dock);
    body.current?.position.set(p.x, FLOOR_Y, p.z);
    if (body.current) body.current.rotation.y = p.rot;
    if (mast.current) mast.current.rotation.x = p.tilt;
    if (carriage.current) carriage.current.position.y = p.lift;
    const elapsed = Math.max(
      0,
      Math.min(0.5, clock.current - lastTime.current),
    );
    lastTime.current = clock.current;
    wheels.current?.children.forEach((wheel, i) => {
      const x = i < 2 ? -0.73 : 0.73,
        rear = i % 2 === 0;
      const steer = rear
        ? Math.atan2(-FORKLIFT.wheelbase * p.curvature, 1 - x * p.curvature)
        : 0;
      wheel.rotation.y = THREE.MathUtils.damp(wheel.rotation.y, steer, 18, dt);
      wheelTravel.current[i] +=
        p.speed *
        elapsed *
        Math.hypot(
          1 - x * p.curvature,
          rear ? FORKLIFT.wheelbase * p.curvature : 0,
        );
      wheel.children[0].rotation.x = wheelTravel.current[i] / 0.34;
    });
  });
  return (
    <group
      ref={body}
      name={`forklift-${dock}`}
      onClick={(event) => {
        event.stopPropagation();
        useStore.getState().select({ kind: "forklift", id: `FL-0${dock + 1}` });
      }}
    >
      <ForkliftModel liftRef={carriage} mastRef={mast} wheelRig={wheels} />
      {selected && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.06, 0]}>
          <ringGeometry args={[1.88, 1.92, 48]} />
          <meshBasicMaterial color="#c89a35" />
        </mesh>
      )}
      <Html
        portal={portal}
        style={{ display: selected ? "block" : "none" }}
        position={[0, 3.5, 0]}
        center
        zIndexRange={[7, 0]}
      >
        <span className="scene-tag">
          FL-0{dock + 1} · {handlingLabels[stage]}
        </span>
      </Html>
    </group>
  );
}

export function HandlingScene({ clock }: { clock: React.RefObject<number> }) {
  const [engine, setEngine] = useState<HandlingPhysics | null>(null);
  const [, setRevision] = useState(0);
  const cargoRefs = useRef(new Map<string, THREE.Group>());
  const pendingTime = useStore((s) => (engine ? 0 : s.time));
  const snapshot = useMemo(
    () => (engine ? [] : materialSnapshot(pendingTime)),
    [engine, pendingTime],
  );
  useLayoutEffect(() => {
    if (!engine) clock.current = pendingTime;
  }, [engine, pendingTime, clock]);
  useEffect(() => {
    let cancelled = false,
      world: HandlingPhysics | undefined,
      timer: ReturnType<typeof setInterval> | undefined;
    const cancelStartup = afterPaint(() => {
      void import("./handlingPhysics")
        .then(async ({ HandlingPhysics, initHandlingPhysics }) => {
          await initHandlingPhysics();
          if (cancelled) return;
          world = new HandlingPhysics(useStore.getState().time);
          clock.current = world.time;
          setEngine(world);
          useStore.setState({
            deliveries: [...world.deliveries],
            simulationReady: true,
          });
          performance.mark("plantbox:physics-ready");
          let smoothTime = world.time,
            last = performance.now(),
            cargoCount = world.cargo.length;
          // Keep material flow alive when the canvas is hidden on inventory pages.
          timer = setInterval(() => {
            if (!world) return;
            const state = useStore.getState(),
              now = performance.now(),
              dt = Math.min(0.2, (now - last) / 1000);
            last = now;
            if (
              state.time < world.time - 0.02 ||
              Math.abs(state.time - world.time) > 4 ||
              state.deliveries === undefined
            ) {
              world.reset(state.time);
              smoothTime = state.time;
              setRevision((r) => r + 1);
            } else {
              smoothTime = state.paused
                ? state.time
                : THREE.MathUtils.damp(smoothTime, state.time, 18, dt);
              world.advanceTo(smoothTime);
            }
            clock.current = world.time;
            if (world.cargo.length !== cargoCount) {
              cargoCount = world.cargo.length;
              setRevision((r) => r + 1);
            }
            if (
              state.deliveries?.length !== world.deliveries.length ||
              state.deliveries === undefined
            )
              state.setDeliveries([...world.deliveries]);
            if (world.failures.length && !state.paused)
              useStore.setState({
                paused: true,
                notice: tr("货物未确认落位，已暂停检查：{0}", {
                  0: world.failures[0],
                }),
              });
          }, 16);
        })
        .catch((error: unknown) => {
          if (cancelled) return;
          useStore.setState({
            paused: true,
            notice: tr("货物物理引擎加载失败：{0}", { 0: String(error) }),
          });
        });
    });
    return () => {
      cancelled = true;
      cancelStartup();
      if (timer) clearInterval(timer);
      world?.dispose();
      useStore.setState({ simulationReady: false });
    };
  }, [clock]);
  useFrame(() => {
    if (!engine) return;
    for (const item of engine.cargo) {
      const group = cargoRefs.current.get(item.id);
      if (!group) continue;
      group.visible = item.state !== "departed";
      if (!group.visible) continue;
      const p = item.body.translation(),
        q = item.body.rotation();
      group.position.set(p.x, p.y, p.z);
      group.quaternion.set(q.x, q.y, q.z, q.w);
    }
  });
  const cargo = engine ? engine.cargo : snapshot;
  return (
    <group name="physical-material-flow">
      {[0, 1, 2].map((dock) => (
        <Forklift key={dock} dock={dock} clock={clock} />
      ))}
      {cargo.map((item) => {
        const position =
          "body" in item ? item.body.translation() : item.position;
        const rotation = "body" in item ? item.body.rotation() : item.rotation;
        return (
          <group
            key={item.id}
            name={item.id}
            visible={item.state !== "departed"}
            position={[position.x, position.y, position.z]}
            quaternion={[rotation.x, rotation.y, rotation.z, rotation.w]}
            ref={(group) => {
              if (group) cargoRefs.current.set(item.id, group);
              else cargoRefs.current.delete(item.id);
            }}
            onClick={(event) => {
              event.stopPropagation();
              useStore.getState().select({ kind: "pallet", id: item.id });
            }}
          >
            <CargoPallet dock={item.dock} id={item.id} />
          </group>
        );
      })}
    </group>
  );
}
