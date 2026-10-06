import { Html } from "@react-three/drei/web/Html.js";
import { useFrame, useThree } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import type { Group } from "three";
import { CargoPallet, ForkliftModel, TruckModel } from "../../Models";
import { SITE } from "../../config/site";
import { statusLabels } from "../../domain/warehouse";
import { handlingLabels } from "../../forkliftMotion";
import { tr } from "../../i18n";
import { FLOOR_Y, FORKLIFT } from "../../logistics";
import {
  useLivePlayback,
  usePlaybackState,
} from "../../runtime/LivePlaybackProvider";
import { useUIStore } from "../../state/uiStore";
import { frontWheelAngle, TRUCK_GEOMETRY } from "../../truckMotion";
function Label(props: React.ComponentProps<typeof Html>) {
  const gl = useThree((s) => s.gl);
  const portal = useMemo(
    () => ({ current: gl.domElement.parentElement! }),
    [gl],
  );
  return <Html {...props} portal={portal} />;
}
function AnimatedTruck({ id }: { id: string }) {
  const playback = useLivePlayback(),
    view = usePlaybackState();
  const ref = useRef<Group>(null),
    wheels = useRef<Group>(null),
    door = useRef<Group>(null);
  const labels = useUIStore((s) => s.labels),
    selected = useUIStore(
      (s) =>
        s.selected.kind === "truck" &&
        s.selected.id === playback.shipments.get(id)?.data.vehicleId,
    );
  const shipment = playback.shipments.get(id)!;
  useFrame(() => {
    const p = shipment.truck;
    if (!ref.current) return;
    ref.current.visible = p.visible;
    ref.current.position.set(p.x, 0.08, p.z);
    ref.current.rotation.y = p.rot;
    if (door.current) door.current.scale.y = Math.max(0.015, 1 - shipment.door);
    wheels.current?.children.forEach((wheel, i) => {
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
  const p = shipment.truck;
  return (
    <group
      ref={ref}
      name={`backend-truck-${shipment.data.vehicleId}`}
      visible={p.visible}
      position={[p.x, 0.08, p.z]}
      rotation={[0, p.rot, 0]}
      onClick={(e) => {
        e.stopPropagation();
        useUIStore
          .getState()
          .select({ kind: "truck", id: shipment.data.vehicleId });
      }}
    >
      <TruckModel
        color={shipment.data.color}
        wheelRig={wheels}
        sideDoorRig={door}
        reversing={view.active === id && view.label === "倒车靠台"}
      />
      {selected && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.03, -0.5]}>
          <ringGeometry args={[5.0, 5.05, 64]} />
          <meshBasicMaterial color="#4773d2" />
        </mesh>
      )}
      <Label
        center
        position={[0, 4.8, -1]}
        style={{ display: labels && p.visible ? "block" : "none" }}
      >
        <span className="scene-tag">
          {shipment.data.vehicleId} ·{" "}
          {tr(view.active === id ? view.label : statusLabels[shipment.status])}
        </span>
      </Label>
    </group>
  );
}
function AnimatedForklift({ dock }: { dock: number }) {
  const playback = useLivePlayback();
  usePlaybackState();
  const body = useRef<Group>(null),
    lift = useRef<Group>(null),
    mast = useRef<Group>(null),
    wheels = useRef<Group>(null);
  const id = `FL-0${dock + 1}`;
  const selected = useUIStore(
    (s) => s.selected.kind === "forklift" && s.selected.id === id,
  );
  const forklift = playback.forklifts.get(dock)!;
  useFrame(() => {
    const p = forklift.pose;
    body.current?.position.set(p.x, FLOOR_Y, p.z);
    if (body.current) body.current.rotation.y = p.rot;
    if (lift.current) lift.current.position.y = p.lift;
    if (mast.current) mast.current.rotation.x = p.tilt;
    wheels.current?.children.forEach((wheel, i) => {
      wheel.rotation.y =
        i % 2 === 0
          ? Math.atan2(
              -FORKLIFT.wheelbase * p.curvature,
              1 -
                (i < 2 ? -FORKLIFT.track / 2 : FORKLIFT.track / 2) *
                  p.curvature,
            )
          : 0;
      wheel.children[0].rotation.x = forklift.wheels[i] / 0.34;
    });
  });
  const p = forklift.pose;
  return (
    <group
      ref={body}
      name={`backend-forklift-${dock}`}
      position={[p.x, FLOOR_Y, p.z]}
      rotation={[0, p.rot, 0]}
      onClick={(e) => {
        e.stopPropagation();
        useUIStore.getState().select({ kind: "forklift", id });
      }}
    >
      <ForkliftModel liftRef={lift} mastRef={mast} wheelRig={wheels} />
      {selected && (
        <Label center position={[0, 3.5, 0]}>
          <span className="scene-tag">
            {id} · {tr(handlingLabels[p.stage])}
          </span>
        </Label>
      )}
    </group>
  );
}
function AnimatedPallet({ id }: { id: string }) {
  const playback = useLivePlayback(),
    ref = useRef<Group>(null);
  const pallet = playback.pallets.get(id)!;
  const dock = SITE.docks.findIndex((d) => d.id === pallet.dockId);
  const pose = playback.palletPose(id);
  useFrame(() => {
    if (!ref.current) return;
    const p = playback.palletPose(id);
    ref.current.visible = p.visible;
    ref.current.position.set(p.position.x, p.position.y, p.position.z);
    ref.current.quaternion.set(
      p.rotation.x,
      p.rotation.y,
      p.rotation.z,
      p.rotation.w,
    );
  });
  return (
    <group
      ref={ref}
      name={`backend-pallet-${id}`}
      visible={pose.visible}
      position={[pose.position.x, pose.position.y, pose.position.z]}
      quaternion={[
        pose.rotation.x,
        pose.rotation.y,
        pose.rotation.z,
        pose.rotation.w,
      ]}
      onClick={(e) => {
        e.stopPropagation();
        useUIStore.getState().select({ kind: "pallet", id });
      }}
    >
      <CargoPallet dock={dock} id={id} />
    </group>
  );
}
/** Confirmed business events drive a separate presentation clock. */
export default function LiveAssets() {
  const playback = useLivePlayback();
  usePlaybackState();
  useFrame((_, dt) => {
    if (!document.hidden) playback.advance(Math.min(dt, 0.1));
  }, -2);
  return (
    <group name="backend-warehouse-state">
      {[...playback.shipments.keys()].map((id) => (
        <AnimatedTruck key={id} id={id} />
      ))}
      {[...playback.forklifts.keys()].map((dock) => (
        <AnimatedForklift key={dock} dock={dock} />
      ))}
      {[...playback.pallets.keys()].map((id) => (
        <AnimatedPallet key={id} id={id} />
      ))}
    </group>
  );
}
