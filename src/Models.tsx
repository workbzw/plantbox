import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { SITE } from "./config/site";
import { tr } from "./i18n";
import { DOCK_X, FORKLIFT, SLOT_Z, STORAGE_X } from "./logistics";

const matCache = new Map<string, THREE.MeshStandardMaterial>();
function material(color: string, metal = 0, roughness = 0.72) {
  const key = `${color}-${metal}-${roughness}`;
  if (!matCache.has(key))
    matCache.set(
      key,
      new THREE.MeshStandardMaterial({ color, metalness: metal, roughness }),
    );
  return matCache.get(key)!;
}
class Builder {
  parts = new Map<THREE.Material, THREE.BufferGeometry[]>();
  add(
    geo: THREE.BufferGeometry,
    color: string,
    p: number[],
    r: number[] = [0, 0, 0],
    metal = 0,
    roughness = 0.72,
  ) {
    const matrix = new THREE.Matrix4().compose(
      new THREE.Vector3(...p),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(r[0], r[1], r[2])),
      new THREE.Vector3(1, 1, 1),
    );
    let geometry = geo.index ? geo.toNonIndexed() : geo;
    if (geometry !== geo) geo.dispose();
    geometry = geometry.applyMatrix4(matrix);
    const m = material(color, metal, roughness);
    if (!this.parts.has(m)) this.parts.set(m, []);
    this.parts.get(m)!.push(geometry);
    return this;
  }
  box(s: number[], p: number[], color: string, r?: number[], metal = 0) {
    return this.add(
      new THREE.BoxGeometry(s[0], s[1], s[2]),
      color,
      p,
      r,
      metal,
    );
  }
  round(s: number[], p: number[], color: string, radius = 0.1, metal = 0) {
    return this.add(
      new RoundedBoxGeometry(s[0], s[1], s[2], 2, radius),
      color,
      p,
      undefined,
      metal,
    );
  }
  cylinder(
    radius: number,
    height: number,
    p: number[],
    color: string,
    r?: number[],
    segments = 12,
  ) {
    return this.add(
      new THREE.CylinderGeometry(radius, radius, height, segments),
      color,
      p,
      r,
    );
  }
  sphere(s: number[], p: number[], color: string) {
    const g = new THREE.SphereGeometry(1, 10, 8);
    g.scale(s[0], s[1], s[2]);
    return this.add(g, color, p);
  }
  build() {
    const group = new THREE.Group();
    for (const [mat, parts] of this.parts) {
      const merged = mergeGeometries(parts);
      parts.forEach((p) => p.dispose());
      if (!merged) continue;
      merged.computeBoundingSphere();
      const mesh = new THREE.Mesh(merged, mat);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      group.add(mesh);
    }
    return group;
  }
}

// A bounded session cache: three pallet variants and one forklift body.
// Clones share immutable geometry/materials, while each load keeps its own
// Object3D transform, label and independent Rapier rigid body.
const sharedModels = new Map<string, THREE.Group>();
function sharedModel(key: string, create: () => THREE.Group) {
  if (!sharedModels.has(key)) sharedModels.set(key, create());
  return sharedModels.get(key)!;
}
if (import.meta.hot)
  import.meta.hot.dispose(() => {
    for (const model of sharedModels.values())
      model.traverse((object) => {
        if (object instanceof THREE.Mesh) object.geometry.dispose();
      });
    sharedModels.clear();
  });

export function Sign({
  text,
  position,
  width = 4,
  color = "#ffffff",
  background = "#2855cc",
  rotation = [0, 0, 0],
  height,
  resolution = 1024,
}: {
  text: string;
  position: [number, number, number];
  width?: number;
  height?: number;
  color?: string;
  background?: string;
  rotation?: [number, number, number];
  resolution?: number;
}) {
  const texture = useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = resolution;
    canvas.height = resolution / 4;
    const ctx = canvas.getContext("2d")!;
    ctx.scale(resolution / 1024, resolution / 1024);
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, 1024, 256);
    ctx.fillStyle = color;
    ctx.font = '600 108px "Arial", "PingFang SC", sans-serif';
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, 512, 133, 960);
    const t = new THREE.CanvasTexture(canvas);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 8;
    return t;
  }, [text, color, background, resolution]);
  useEffect(() => () => texture.dispose(), [texture]);
  return (
    <mesh position={position} rotation={rotation}>
      <planeGeometry args={[width, height ?? width / 4]} />
      <meshStandardMaterial
        map={texture}
        roughness={0.8}
        transparent={background === "transparent"}
      />
    </mesh>
  );
}

function pallet(
  b: Builder,
  x: number,
  y: number,
  z: number,
  color = "#c29969",
  boxes = true,
) {
  for (let i = -1; i <= 1; i++)
    b.box([0.16, 0.2, 1.5], [x + i * 0.58, y + 0.1, z], "#a58460");
  for (let i = 0; i < 5; i++)
    b.box([1.45, 0.09, 0.22], [x, y + 0.25, z - 0.6 + i * 0.3], "#c1a27a");
  if (boxes)
    for (let a = 0; a < 2; a++)
      for (let c = 0; c < 2; c++) {
        const px = x - 0.35 + a * 0.7,
          pz = z - 0.34 + c * 0.69;
        b.box([0.65, 0.7, 0.63], [px, y + 0.65, pz], color);
        b.box([0.07, 0.708, 0.635], [px, y + 0.65, pz], "#dfc499");
        b.box([0.18, 0.2, 0.008], [px + 0.16, y + 0.65, pz + 0.32], "#eee8d9");
      }
}
export function Pallet({
  color = "#c29969",
  ...props
}: { color?: string } & Omit<React.ComponentProps<"group">, "ref">) {
  const model = useMemo(() => {
    const b = new Builder();
    pallet(b, 0, 0, 0, color);
    return b.build();
  }, [color]);
  useEffect(
    () => () => {
      model.traverse((o) => {
        if (o instanceof THREE.Mesh) o.geometry.dispose();
      });
    },
    [model],
  );
  return (
    <group {...props}>
      <primitive object={model} />
    </group>
  );
}

export function Warehouse({
  roofOpen,
  onClick,
}: {
  roofOpen: boolean;
  onClick: (e: import("@react-three/fiber").ThreeEvent<MouseEvent>) => void;
}) {
  const structure = useMemo(() => {
    const b = new Builder();
    b.round([34.4, 0.62, 20.4], [-8, 0.2, -8], "#acb7c5", 0.12);
    b.box([34, 0.22, 20], [-8, 0.65, -8], "#d7dcdf");
    b.box([0.25, 6.5, 20], [-25, 3.8, -8], "#d7dfe4");
    b.box([0.25, 6.5, 20], [9, 3.8, -8], "#d7dfe4");
    b.box([34, 6.5, 0.25], [-8, 3.8, -18], "#dce3e8");
    b.box([34, 2.1, 0.3], [-8, 6.1, 2], "#e7eced");
    for (let i = 0; i < 4; i++)
      b.box([4.1, 4.5, 0.3], [-25 + 1.65 + i * 11.1, 2.9, 2], "#e2e8eb");
    for (let x = -24.8; x < 9; x += 0.48)
      b.box([0.032, 2.02, 0.06], [x, 6.1, 2.19], "#c9d4df");
    for (let z = -17.9; z < 2; z += 0.5) {
      b.box([0.055, 6.1, 0.04], [9.17, 3.8, z], "#bfcbd4");
      b.box([0.055, 6.1, 0.04], [-25.17, 3.8, z], "#c4cfd6");
    }
    for (let x = -25; x <= 9; x += 11.33)
      b.box([0.2, 6.9, 0.4], [x, 3.7, 2.15], "#3760a0");
    b.box([34.5, 0.3, 0.55], [-8, 7.18, 2.2], "#274c90");
    b.box([34, 0.7, 0.35], [-8, 0.91, 2.15], "#8193a5");
    for (const x of [-19, -8, 3]) {
      b.box([5, 4.5, 0.5], [x, 2.8, 2.32], "#2b3a51");
      b.box([4.25, 4.1, 0.53], [x, 2.7, 2.4], "#626f7e");
      b.box([4.05, 2.65, 0.58], [x, 3.45, 2.43], "#acb8c3");
      for (let y = 2.15; y < 4.8; y += 0.23)
        b.box([4.06, 0.025, 0.025], [x, y, 2.74], "#8b99a8");
      b.box([4, 0.14, 1.4], [x, 0.88, 2.75], "#7d8a96", undefined, 0.35);
      b.box([5.2, 0.16, 1.85], [x, 5.4, 2.95], "#305cac", [-0.09, 0, 0], 0.2);
      for (const dx of [-2.7, 2.7]) {
        b.cylinder(0.11, 1.2, [x + dx, 1, 3.15], "#e8b64a");
        b.cylinder(0.113, 0.22, [x + dx, 0.94, 3.15], "#39414b");
        b.box([0.2, 1.8, 0.2], [x + dx, 3.15, 2.5], "#263956");
      }
      b.box([0.18, 0.4, 0.2], [x + 2.7, 4.2, 2.69], "#42ac82");
      b.box([3.9, 0.025, 14], [x, 0.035, 11.1], "#d2d9dc");
      for (const dx of [-3.05, 3.05])
        b.box([0.1, 0.027, 14], [x + dx, 0.06, 11.1], "#e4b543");
      b.box([6.2, 0.027, 0.1], [x, 0.06, 18.1], "#e4b543");
      for (let i = 0; i < 5; i++)
        b.box(
          [0.26, 0.02, 1.3],
          [x - 2.1 + i * 1.05, 0.065, 17.4],
          "#ece9cf",
          [0, -0.55, 0],
        );
    }
    // Steel frame and storage racks become visible when the roof is lifted.
    for (let x = -23; x < 9; x += 7.4) {
      b.box([0.25, 6.2, 0.25], [x, 3.5, -14], "#527aa4");
      for (const z of [-13, -6]) {
        for (const dx of [-2.4, 2.4])
          for (const dz of [-0.85, 0.85])
            b.box([0.08, 4.5, 0.08], [x + dx, 2.9, z + dz], "#3e679a");
        for (const y of [1, 2.6, 4.2]) {
          b.box([5, 0.12, 1.8], [x, y, z], "#bd8850");
          for (const dx of [-1.6, 0, 1.6])
            pallet(b, x + dx, y + 0.1, z, (x + z) % 3 ? "#bd9465" : "#668abe");
        }
      }
    }
    // Office wing with deep blue glazing and white mullions.
    b.round([8, 5.6, 9], [14, 3.3, -12.5], "#e3e9eb", 0.16);
    b.box([8.2, 0.25, 9.2], [14, 6.2, -12.5], "#758b9c");
    b.box([0.08, 3.5, 8.6], [18.04, 3.85, -12.5], "#345873", undefined, 0.6);
    b.box([7.8, 3.5, 0.08], [14, 3.85, -7.94], "#426784", undefined, 0.5);
    for (let z = -16.5; z < -8; z += 1.4)
      b.box([0.12, 3.6, 0.06], [18.1, 3.85, z], "#a7b9c7");
    for (let x = 10.2; x < 18; x += 1.5)
      b.box([0.065, 3.6, 0.1], [x, 3.85, -7.87], "#b5c3ce");
    b.box([7.95, 0.1, 0.15], [14, 3.5, -7.82], "#b5c3ce");
    b.box([2, 2.3, 0.12], [14, 1.55, -7.79], "#375576");
    b.box([3.2, 0.12, 1.8], [14, 2.9, -7.3], "#f4f6f6");
    for (let i = 0; i < 3; i++)
      b.box([3, 0.16, 1.2 - i * 0.27], [14, 0.12 + i * 0.16, -7], "#bbc6ce");
    return b.build();
  }, []);
  const roof = useMemo(() => {
    const b = new Builder();
    for (const x of [-16.5, 0.5]) {
      for (const side of [-1, 1]) {
        const angle = side * 0.13;
        b.box(
          [8.65, 0.18, 20.7],
          [x + side * 4.23, 7.88, -8],
          "#396dcc",
          [0, 0, -angle],
          0.22,
        );
        for (let z = -18.2; z <= 2.2; z += 0.8)
          b.box(
            [8.65, 0.055, 0.052],
            [x + side * 4.23, 8.01, z],
            "#5d89dc",
            [0, 0, -angle],
            0.18,
          );
      }
      const gable = new THREE.Shape([
        new THREE.Vector2(-8.5, 0),
        new THREE.Vector2(8.5, 0),
        new THREE.Vector2(0, 1.17),
      ]);
      for (const z of [-18.25, 2.22]) {
        b.add(
          new THREE.ExtrudeGeometry(gable, {
            depth: 0.12,
            bevelEnabled: false,
          }),
          "#d6e1ec",
          [x, 7.28, z],
        );
      }
      b.box([0.22, 0.18, 21], [x, 8.52, -8], "#9bbbee", undefined, 0.3);
      b.box([17.2, 0.14, 0.15], [x, 7.4, 2.5], "#b8cbe4");
      for (const z of [-13, -5]) {
        b.box(
          [3.9, 0.09, 2.15],
          [x + 4, 8.02, z],
          "#183b69",
          [0, 0, -0.13],
          0.65,
        );
        for (let i = 0; i < 5; i++)
          b.box(
            [0.024, 0.018, 2.13],
            [x + 2.1 + i * 0.96, 8.08 - i * 0.124, z],
            "#789aca",
          );
      }
      b.box([1.7, 0.5, 1.4], [x - 3.5, 8.22, -14], "#d3dde4");
      b.cylinder(0.5, 0.18, [x - 3.5, 8.57, -14], "#526274");
    }
    return b.build();
  }, []);
  return (
    <group onClick={onClick}>
      <primitive object={structure} />
      <group visible={!roofOpen}>
        <primitive object={roof} />
      </group>
      <Sign
        text={tr(SITE.sign)}
        position={[-8, 6.1, 2.38]}
        width={12}
        height={1.1}
        background="#e7eced"
        color="#2552a0"
      />
      {[-19, -8, 3].map((x, i) => (
        <Sign
          key={x}
          text={`0${i + 1}`}
          position={[x, 5.85, 2.4]}
          width={1.2}
          height={0.6}
        />
      ))}
      <Sign
        text="OPERATIONS"
        position={[14, 5.9, -7.81]}
        width={4.7}
        height={0.4}
        background="#e3e9eb"
        color="#314e73"
      />
    </group>
  );
}

export function EnvironmentModel() {
  const model = useMemo(() => {
    const b = new Builder();
    // The long-wheelbase truck needs room for cab swing, not just its
    // centerline. Keep the entire swept envelope inside the fenced apron.
    b.round([96, 0.8, 78], [0, -0.65, 7], "#aebbc5", 0.35);
    b.round([96, 0.18, 78], [0, -0.16, 7], "#d9e1e3", 0.25);
    b.box([96, 0.035, 8], [0, -0.045, 41], "#7e8e9e");
    b.box([96, 0.05, 0.22], [0, 0.001, 37.05], "#e6eaf0");
    b.box([96, 0.05, 0.22], [0, 0.001, 44.95], "#e6eaf0");
    for (let x = -45; x < 47; x += 5)
      b.box([2.4, 0.035, 0.12], [x, 0.001, 41], "#ecefe9");
    b.round([60, 0.15, 1.3], [-12, 0.02, 36.4], "#e9eeeb", 0.08);
    b.round([4.2, 0.15, 65], [-45, 0.02, 3.5], "#e9eeeb", 0.08);
    b.box([3, 0.04, 63], [-45, 0.13, 3.5], "#afc2aa");
    b.box([90, 0.04, 2.6], [0, 0.015, -28], "#b4c4ae");
    b.box([13, 0.035, 41], [30, 0.015, -6], "#c9d2d8");
    // Pedestrian lane and yard safety markings.
    b.box([66, 0.027, 1.5], [-3, 0.029, 4.7], "#a2bcb0");
    for (let z = 25.5; z < 33; z += 1.1)
      b.box([3, 0.04, 0.55], [43.5, 0.08, z], "#f1f0e8");
    for (let x = 19; x < 47; x += 4.5)
      b.box([2.5, 0.025, 0.1], [x, 0.025, 28.9], "#f0eee3");
    for (const z of [-23, 36.8]) {
      for (let x = -41.5; x <= 36; x += 3.5) {
        if (z > 0 && x > 19) continue;
        b.box([0.09, 1.9, 0.09], [x, 0.95, z], "#96a8b5");
        b.box([3.5, 0.055, 0.06], [x + 1.75, 1.45, z], "#b3bfc6");
        b.box([3.5, 0.055, 0.06], [x + 1.75, 0.55, z], "#b3bfc6");
        for (let i = 1; i < 7; i++)
          b.box([0.032, 1.65, 0.035], [x + i * 0.5, 0.95, z], "#b8c3ca");
      }
    }
    for (let z = -23; z <= 33; z += 3.5) {
      b.box([0.09, 1.9, 0.09], [-41.5, 0.95, z], "#96a8b5");
      b.box([0.06, 0.055, 3.5], [-41.5, 1.45, z + 1.75], "#b3bfc6");
      b.box([0.06, 0.055, 3.5], [-41.5, 0.55, z + 1.75], "#b3bfc6");
    }
    const treePositions = [
      [-45, -24],
      [-45, -15],
      [-45, -5],
      [-45, 5],
      [-45, 15],
      [-45, 26],
      [-28, -28],
      [-17, -28],
      [-6, -28],
      [5, -28],
      [16, -28],
      [27, -28],
      [38, -28],
      [38, -18],
      [38, -7],
      [38, 4],
      [38, 15],
      [-29, 36.4],
      [-15, 36.4],
      [-1, 36.4],
      [13, 36.4],
    ];
    treePositions.forEach(([x, z], i) => {
      const h = 3.8 + (i % 3) * 0.35;
      b.cylinder(0.11, h, [x, h / 2, z], "#8a8070", undefined, 7);
      b.sphere(
        [1.15, 1.7, 1.1],
        [x, h + 0.45, z],
        i % 3 ? "#6eaa82" : "#8ab595",
      );
      b.sphere([0.75, 1.05, 0.8], [x - 0.48, h, z + 0.3], "#629f79");
      b.cylinder(0.9, 0.08, [x, 0.07, z], "#a3b99f");
    });
    for (const x of [-29, 16, 34])
      for (const z of [-20, 17]) {
        b.cylinder(0.075, 6.4, [x, 3.2, z], "#73899b");
        b.box([1.25, 0.065, 0.08], [x + 0.55, 6.35, z], "#647b8e");
        b.round([0.9, 0.16, 0.42], [x + 1, 6.3, z], "#d1dae0", 0.06);
        b.box([0.7, 0.035, 0.32], [x + 1, 6.2, z], "#fff8dc");
      }
    // Gatehouse, boom barrier and charging bays.
    b.round([3.7, 2.9, 3.3], [35.5, 1.45, 21.3], "#eff2ef", 0.12);
    b.box([3.9, 0.24, 3.5], [35.5, 3, 21.3], "#3d6597");
    b.box([3.4, 1.45, 0.05], [35.5, 1.87, 22.98], "#54758b", undefined, 0.4);
    b.box([0.055, 1.45, 2.7], [33.6, 1.87, 21.3], "#54758b");
    b.round([0.6, 1.5, 0.6], [41.5, 0.75, 23.3], "#e9e8df", 0.1);
    // Open boom, beside rather than across the truck approach lane.
    b.box([0.13, 5, 0.13], [41.5, 3.75, 24.15], "#f1eee7", [0.35, 0, 0]);
    for (let i = 0; i < 6; i++)
      b.box(
        [0.15, 0.28, 0.15],
        [41.5, 1.8 + i * 0.73, 23.44 + i * 0.27],
        "#d88267",
        [0.35, 0, 0],
      );
    for (const z of [-17, -11, -5]) {
      b.round([2.7, 0.12, 3.7], [-29, 0.05, z], "#b7cec2", 0.12);
      b.round([0.45, 1.65, 0.65], [-31, 0.83, z], "#3d6680", 0.07);
      b.box([0.035, 0.35, 0.37], [-30.75, 1.2, z], "#80d1b1");
    }
    // Marked source/receiving slots; cargo is rendered by the physics world.
    for (const dockX of DOCK_X)
      for (const z of SLOT_Z) {
        b.box([1.5, 0.016, 0.91], [dockX + STORAGE_X, 0.014, z], "#b8cabc");
        for (const dx of [-0.73, 0.73])
          b.box(
            [0.035, 0.018, 0.91],
            [dockX + STORAGE_X + dx, 0.027, z],
            "#f3df99",
          );
      }
    return b.build();
  }, []);
  return (
    <group>
      <primitive object={model} />
      <Sign
        text="SLOW   15"
        position={[11, 0.06, 41]}
        width={5.5}
        height={1.3}
        rotation={[-Math.PI / 2, 0, 0]}
        color="#e5e9e7"
        background="#7e8e9e"
      />
      <Sign
        text={tr("仓 储 作 业 区")}
        position={[-9, 0.08, 34.5]}
        width={9}
        height={0.8}
        rotation={[-Math.PI / 2, 0, 0]}
        background="#d9e1e3"
        color="#788b98"
      />
      <Sign
        text={tr("←  IN / 入口")}
        position={[28, 0.08, 26.65]}
        width={3.2}
        height={0.85}
        rotation={[-Math.PI / 2, 0, 0]}
        background="#d9e1e3"
        color="#547785"
      />
      <Sign
        text={tr("OUT / 出口  →")}
        position={[28, 0.08, 31.15]}
        width={5}
        height={0.85}
        rotation={[-Math.PI / 2, 0, 0]}
        background="#d9e1e3"
        color="#788b98"
      />
    </group>
  );
}

export function ContainerModel({ color = "#36728b" }: { color?: string }) {
  const model = useMemo(() => {
    const b = new Builder();
    b.box([3.1, 2.7, 7.8], [0, 1.45, 0], color, undefined, 0.2);
    b.box([3.15, 0.12, 7.85], [0, 2.84, 0], "#bdcbd1");
    for (let z = -3.8; z < 3.9; z += 0.25)
      for (const x of [-1.57, 1.57])
        b.box([0.055, 2.52, 0.065], [x, 1.48, z], color);
    for (const x of [-1.48, 1.48])
      b.box([0.12, 2.8, 0.12], [x, 1.45, 3.92], "#adc0cb");
    for (const x of [-0.75, 0.75])
      b.box([0.04, 2.3, 0.04], [x, 1.45, 3.93], "#b9c7cb");
    return b.build();
  }, [color]);
  return (
    <group>
      <primitive object={model} />
      <Sign
        text="PLANTBOX"
        position={[1.608, 1.55, 0]}
        rotation={[0, Math.PI / 2, 0]}
        width={3.4}
        height={0.65}
        background={color}
      />
    </group>
  );
}

function TruckSideDoor({
  rig,
  color,
}: {
  rig: React.RefObject<THREE.Group | null>;
  color: string;
}) {
  const panel = useMemo(() => {
    const b = new Builder();
    b.box([0.08, 2.8, 6.6], [1.32, -1.4, -1.6], "#f0f1e9");
    for (let z = -4.7; z < 1.7; z += 0.22)
      b.box([0.018, 2.56, 0.018], [1.37, -1.43, z], "#d8dfdf");
    return b.build();
  }, []);
  useEffect(
    () => () => {
      panel.traverse((o) => {
        if (o instanceof THREE.Mesh) o.geometry.dispose();
      });
    },
    [panel],
  );
  return (
    <group ref={rig} name="loading-side-door" position={[0, 3.98, 0]}>
      <primitive object={panel} />
      <Sign
        text="▣  PLANTBOX"
        position={[1.399, -1.31, -1.3]}
        rotation={[0, Math.PI / 2, 0]}
        width={4.55}
        height={1.1}
        background="#f0f1e9"
        color={color}
      />
    </group>
  );
}

export function TruckModel({
  color = "#2855ce",
  openSide = false,
  wheelRig,
  reversing = false,
  sideDoorRig,
}: {
  color?: string;
  openSide?: boolean;
  wheelRig?: React.RefObject<THREE.Group | null>;
  reversing?: boolean;
  sideDoorRig?: React.RefObject<THREE.Group | null>;
}) {
  const model = useMemo(() => {
    const b = new Builder();
    b.round([2.45, 0.33, 9.3], [0, 0.73, -0.3], "#394652", 0.08);
    b.box([2.65, 0.15, 6.6], [0, 1.25, -1.6], "#aebbc1");
    b.box([0.08, 2.8, 6.6], [-1.32, 2.58, -1.6], "#f0f1e9");
    b.box([2.64, 2.8, 0.08], [0, 2.58, -4.86], "#e4e8e5");
    b.box([2.64, 2.8, 0.08], [0, 2.58, 1.66], "#e4e8e5");
    if (openSide || sideDoorRig)
      b.round([0.19, 0.38, 6.58], [1.34, 3.83, -1.6], "#e2e8e5", 0.07);
    else b.box([0.08, 2.8, 6.6], [1.32, 2.58, -1.6], "#f0f1e9");
    b.box([2.76, 0.26, 6.6], [0, 1.12, -1.6], color);
    b.box([2.74, 0.13, 6.65], [0, 4.04, -1.6], "#bfcdd8");
    for (let z = -4.7; z < 1.7; z += 0.22)
      for (const x of openSide || sideDoorRig ? [-1.37] : [-1.37, 1.37])
        b.box([0.018, 2.56, 0.018], [x, 2.55, z], "#d8dfdf");
    b.round([2.64, 2.4, 2.52], [0, 2.04, 3.1], color, 0.22, 0.22);
    b.round([2.35, 0.38, 1.65], [0, 3.3, 2.95], color, 0.18, 0.22);
    b.box([2.22, 0.79, 0.07], [0, 2.62, 4.36], "#263c4b", [0.08, 0, 0], 0.4);
    b.box([0.05, 0.86, 1.56], [1.34, 2.57, 3.07], "#2d4a5e", undefined, 0.45);
    b.box([0.05, 0.86, 1.56], [-1.34, 2.57, 3.07], "#2d4a5e", undefined, 0.45);
    b.round([2.12, 0.65, 0.075], [0, 1.62, 4.39], "#344550", 0.05);
    for (let y = 1.4; y < 1.91; y += 0.12)
      b.box([1.96, 0.032, 0.08], [0, y, 4.44], "#7c909c");
    b.round([2.71, 0.28, 0.18], [0, 1.14, 4.38], "#d5dde0", 0.06, 0.65);
    for (const x of [-1.01, 1.01]) {
      b.box([0.42, 0.23, 0.09], [x, 1.92, 4.42], "#fff7d8");
      b.box([0.14, 0.13, 0.12], [x, 1.62, -4.97], "#cd6657");
      b.box([0.13, 0.11, 0.48], [x * 1.5, 2.49, 3.91], "#303f4b");
      b.round([0.21, 0.4, 0.15], [x * 1.53, 2.62, 4.03], "#344958", 0.04);
    }
    b.box([0.67, 0.22, 0.09], [0, 1.12, 4.49], "#304865");
    for (const x of [-0.7, 0.7])
      b.box([0.04, 2.4, 0.05], [x, 2.4, -4.94], "#96aab6");
    return b.build();
  }, [color, openSide, sideDoorRig]);
  useEffect(
    () => () => {
      model.traverse((o) => {
        if (o instanceof THREE.Mesh) o.geometry.dispose();
      });
    },
    [model],
  );
  return (
    <group>
      <primitive object={model} />
      <group ref={wheelRig}>
        {[-1.31, 1.31].flatMap((x) =>
          [-3.95, -2.72, 3.15].map((z) => (
            <group key={`${x}:${z}`} position={[x, 0.61, z]}>
              <TruckWheel side={Math.sign(x)} />
            </group>
          )),
        )}
      </group>
      {[-0.8, 0.8].map((x) => (
        <mesh key={x} position={[x, 1.61, -4.98]}>
          <boxGeometry args={[0.16, 0.12, 0.06]} />
          <meshStandardMaterial
            color={reversing ? "#fffde5" : "#9eaaa9"}
            emissive="#fff6c8"
            emissiveIntensity={reversing ? 1.2 : 0}
          />
        </mesh>
      ))}
      {sideDoorRig && <TruckSideDoor rig={sideDoorRig} color={color} />}
      {!openSide && !sideDoorRig && (
        <Sign
          text="▣  PLANTBOX"
          position={[1.399, 2.67, -1.3]}
          rotation={[0, Math.PI / 2, 0]}
          width={4.55}
          height={1.1}
          background="#f0f1e9"
          color={color}
        />
      )}
      <Sign
        text="PLANTBOX"
        position={[-1.399, 2.67, -1.3]}
        rotation={[0, -Math.PI / 2, 0]}
        width={4.55}
        height={1.1}
        background="#f0f1e9"
        color={color}
      />
    </group>
  );
}

function TruckWheel({ side }: { side: number }) {
  return (
    <group>
      <mesh rotation={[0, 0, Math.PI / 2]} castShadow>
        <cylinderGeometry args={[0.57, 0.57, 0.34, 20]} />
        <meshStandardMaterial color="#29343d" roughness={0.95} />
      </mesh>
      <mesh rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.29, 0.29, 0.355, 16]} />
        <meshStandardMaterial
          color="#bcc9d0"
          metalness={0.45}
          roughness={0.5}
        />
      </mesh>
      <mesh rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.12, 0.12, 0.37, 10]} />
        <meshStandardMaterial color="#677c8b" />
      </mesh>
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <mesh
          key={i}
          position={[
            side * 0.18,
            Math.cos((i * Math.PI) / 3) * 0.21,
            Math.sin((i * Math.PI) / 3) * 0.21,
          ]}
        >
          <boxGeometry args={[0.018, 0.065, 0.065]} />
          <meshStandardMaterial color="#465b6a" />
        </mesh>
      ))}
    </group>
  );
}

export function CargoPallet({ dock, id }: { dock: number; id: string }) {
  const model = useMemo(
    () =>
      sharedModel(`cargo-${dock}`, () => {
        const b = new Builder();
        for (const x of [-0.32, 0, 0.32])
          b.box([0.13, 0.125, 1.2], [x, 0.0625, 0], "#ac8356");
        for (let i = 0; i < 5; i++)
          b.box([0.8, 0.035, 0.215], [0, 0.1425, -0.49 + i * 0.245], "#cfad78");
        const color = ["#bf915c", "#4877b0", "#ccb488"][dock];
        for (const z of [-0.29, 0.29]) {
          b.round([0.74, 0.56, 0.54], [0, 0.44, z], color, 0.018);
          if (dock === 1) {
            b.box([0.76, 0.045, 0.56], [0, 0.695, z], "#355d93");
            b.box([0.22, 0.055, 0.014], [0, 0.56, z + 0.275], "#264a74");
          } else {
            b.box([0.065, 0.565, 0.548], [0, 0.442, z], "#dec794");
            b.box([0.745, 0.04, 0.548], [0, 0.62, z], "#b49970");
          }
        }
        return b.build();
      }).clone(true),
    [dock],
  );
  return (
    <group>
      <primitive object={model} dispose={null} />
      <Sign
        text={id.replace("PAL-", "P")}
        resolution={256}
        width={0.48}
        height={0.14}
        position={[0, 0.45, 0.565]}
        color="#354557"
        background="#f4f0e4"
      />
    </group>
  );
}

export function ForkliftModel({
  liftRef,
  mastRef,
  wheelRig,
}: {
  liftRef: React.RefObject<THREE.Group | null>;
  mastRef: React.RefObject<THREE.Group | null>;
  wheelRig: React.RefObject<THREE.Group | null>;
}) {
  const body = useMemo(
    () =>
      sharedModel("forklift", () => {
        const b = new Builder();
        b.round([1.4, 0.75, 1.9], [0, 0.65, -0.2], "#e7b237", 0.18, 0.1);
        b.round([1.37, 0.95, 0.63], [0, 0.9, -0.87], "#edbc45", 0.16);
        b.box([1.3, 0.12, 1.8], [0, 2.54, -0.05], "#344854");
        for (const x of [-0.58, 0.58])
          for (const z of [-0.67, 0.58])
            b.box([0.065, 1.6, 0.065], [x, 1.78, z], "#334452");
        b.round([0.63, 0.18, 0.58], [0, 1.12, -0.1], "#34444c", 0.08);
        b.round([0.62, 0.65, 0.1], [0, 1.38, -0.38], "#34444c", 0.04);
        b.box([0.045, 0.4, 0.06], [0, 1.27, 0.36], "#394952", [0.4, 0, 0]);
        b.cylinder(0.17, 0.035, [0, 1.48, 0.4], "#33434e", [0.55, 0, 0]);
        b.round([0.43, 0.55, 0.29], [0, 1.55, -0.08], "#527b8f", 0.08);
        b.sphere([0.16, 0.2, 0.16], [0, 1.96, -0.04], "#d6b596");
        b.sphere([0.2, 0.12, 0.19], [0, 2.1, -0.04], "#f5d46a");
        for (const x of [-0.24, 0.24])
          b.box([0.1, 0.11, 0.4], [x, 1.57, 0.15], "#527b8f");
        b.cylinder(0.1, 0.18, [0.3, 2.7, -0.4], "#f69835");
        return b.build();
      }).clone(true),
    [],
  );
  return (
    <group>
      <primitive object={body} dispose={null} />
      <group ref={wheelRig}>
        {[-0.73, 0.73].flatMap((x) =>
          [-0.8, 0.5].map((z) => (
            <group key={`${x}:${z}`} position={[x, 0.35, z]}>
              <group>
                <group scale={[0.65, 0.6, 0.6]}>
                  <TruckWheel side={Math.sign(x)} />
                </group>
              </group>
            </group>
          )),
        )}
      </group>
      <group ref={mastRef}>
        {[-0.46, 0.46].map((x) => (
          <mesh key={x} position={[x, 1.58, 1.04]} castShadow>
            <boxGeometry args={[0.12, 3.02, 0.16]} />
            <meshStandardMaterial color="#3c4c58" />
          </mesh>
        ))}
        <mesh position={[0, 0.94, 0.98]} castShadow>
          <cylinderGeometry args={[0.065, 0.065, 1.65, 10]} />
          <meshStandardMaterial
            color="#9eaeb7"
            metalness={0.7}
            roughness={0.3}
          />
        </mesh>
        <mesh position={[0, 3.04, 1.04]}>
          <boxGeometry args={[1.04, 0.1, 0.17]} />
          <meshStandardMaterial color="#506574" />
        </mesh>
        <group ref={liftRef}>
          <mesh position={[0, 0.35, 1.045]} castShadow>
            <boxGeometry args={[0.95, 0.72, 0.065]} />
            <meshStandardMaterial color="#576a78" />
          </mesh>
          {[-FORKLIFT.tineX, FORKLIFT.tineX].map((x) => (
            <mesh key={x} position={[x, 0, FORKLIFT.tineZ]} castShadow>
              <boxGeometry
                args={[
                  FORKLIFT.tineWidth,
                  FORKLIFT.tineThickness,
                  FORKLIFT.tineLength,
                ]}
              />
              <meshStandardMaterial
                color="#72818c"
                metalness={0.55}
                roughness={0.45}
              />
            </mesh>
          ))}
        </group>
      </group>
    </group>
  );
}
