class NSFProcessor extends AudioWorkletProcessor {
  constructor() {
    super();

    this.queue = [];
    this.block = null;
    this.pos = 0;

    this.port.onmessage = (event) => {
      if (event.data === "clear") {
        this.queue.length = 0;
        this.block = null;
        this.pos = 0;
        return;
      }

      if (event.data instanceof Float32Array) {
        this.queue.push(event.data);
      }
    };
  }

  process(_inputs, outputs) {
    const output = outputs[0];
    const left = output[0];
    const right = output[1];

    for (let i = 0; i < left.length; i++) {
      if (!this.block || this.pos >= this.block.length) {
        this.block = this.queue.shift() || null;
        this.pos = 0;
      }

      const value = this.block
        ? this.block[this.pos++]
        : 0;

      left[i] = value;

      if (right) {
        right[i] = value;
      }
    }

    return true;
  }
}

registerProcessor("nsf-audio", NSFProcessor);
