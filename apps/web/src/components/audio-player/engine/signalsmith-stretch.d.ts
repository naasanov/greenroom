declare module "signalsmith-stretch" {
  export interface StretchSchedule {
    output?: number;
    active?: boolean;
    input?: number;
    rate?: number;
    semitones?: number;
    loopStart?: number;
    loopEnd?: number;
  }

  export interface StretchNode extends AudioNode {
    inputTime: number;
    addBuffers(
      buffers: Float32Array[],
      transfer?: Transferable[],
    ): Promise<number>;
    dropBuffers(toSeconds?: number): Promise<unknown>;
    schedule(change: StretchSchedule): void;
    start(when?: number): void;
    stop(when?: number): void;
    latency(): number;
    setUpdateInterval(
      seconds: number,
      callback?: (inputTime: number) => void,
    ): void;
  }

  export default function SignalsmithStretch(
    context: BaseAudioContext,
    options?: AudioNodeOptions & {
      numberOfInputs?: number;
      numberOfOutputs?: number;
      outputChannelCount?: number[];
    },
  ): Promise<StretchNode>;
}
