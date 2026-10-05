import { useEffect } from "react";
import { Environment } from "@react-three/drei/core/Environment.js";
import { Lightformer } from "@react-three/drei/core/Lightformer.js";
import { EffectComposer, N8AO, ToneMapping } from "@react-three/postprocessing";
import { ToneMappingMode } from "postprocessing";

export default function SceneEffects({
  quality,
}: {
  quality: "high" | "balanced";
}) {
  useEffect(() => {
    performance.mark("plantbox:effects-ready");
  }, []);
  return (
    <>
      <Environment resolution={128} frames={1}>
        <Lightformer
          intensity={1}
          position={[0, 18, 0]}
          rotation={[Math.PI / 2, 0, 0]}
          scale={[50, 50, 1]}
        />
        <Lightformer
          intensity={0.7}
          position={[-30, 10, 10]}
          rotation={[0, Math.PI / 2, 0]}
          scale={[30, 20, 1]}
        />
      </Environment>
      {quality === "high" && (
        <EffectComposer multisampling={4}>
          <N8AO
            aoRadius={1.3}
            intensity={1.1}
            distanceFalloff={1}
            halfRes
            color="#294059"
          />
          <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
        </EffectComposer>
      )}
    </>
  );
}
