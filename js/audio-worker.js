class NSFProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.queue = [];
    this.block = null;
    this.pos = 0;
    this.port.onmessage = e => {
      if (e.data instanceof Float32Array) this.queue.push(e.data);
    };
  }
  process(_inputs, outputs) {
    const out = outputs[0];
    const left = out[0], right = out[1];
    for (let i = 0; i < left.length; i++) {
      if (!this.block || this.pos >= this.block.length) {
        this.block = this.queue.shift() || null;
        this.pos = 0;
      }
      const v = this.block ? this.block[this.pos++] : 0;
      left[i] = v;
      if (right) right[i] = v;
    }
    return true;
  }
}
registerProcessor("nsf-audio", NSFProcessor);
