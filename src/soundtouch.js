import { SoundTouchNode } from "@soundtouchjs/audio-worklet";
import processorUrl from "@soundtouchjs/audio-worklet/processor?url";

export async function prepareStretch(context) {
  await SoundTouchNode.register(context, processorUrl);
  return () => {
    const node = new SoundTouchNode({ context });
    node.setStretchParameters({
      sequenceMs: 30,
      seekWindowMs: 10,
      overlapMs: 8,
    });
    node.pitch.value = 1;
    return node;
  };
}
