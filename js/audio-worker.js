class NSFProcessor extends AudioWorkletProcessor {
constructor() {
super();

this.queue = [];
this.block = null;
this.pos = 0;
this.queueFrames = 0;

this.needSent = false;
this.started = false;

this.port.onmessage = event => {
  const data = event.data;

  if (data instanceof Float32Array) {
    this.queue.push(data);
    this.queueFrames += data.length / 2;
    this.needSent = false;
    return;
  }

  if (!data || typeof data !== "object") {
    return;
  }

  if (data.type === "start") {
    this.started = true;
    this.clearQueue();
    this.needSent = false;
    this.requestMore();
    return;
  }

  if (data.type === "stop") {
    this.started = false;
    this.clearQueue();
    this.needSent = false;
    return;
  }

  if (data.type === "clear") {
    this.clearQueue();
    this.needSent = false;
    return;
  }
};

}

clearQueue() {
this.queue.length = 0;
this.block = null;
this.pos = 0;
this.queueFrames = 0;
}

requestMore() {
if (!this.started) return;

if (this.queueFrames < 4096 && !this.needSent) {
  this.needSent = true;
  this.port.postMessage({
    type: "need"
  });
}

}

process(_inputs, outputs) {
const output = outputs[0];

if (!output || !output[0]) {
  return true;
}

const left = output[0];
const right = output[1];

for (let i = 0; i < left.length; i++) {
  if (!this.started) {
    left[i] = 0;

    if (right) {
      right[i] = 0;
    }

    continue;
  }

  if (!this.block || this.pos >= this.block.length) {
    this.block = this.queue.shift() || null;
    this.pos = 0;

    if (this.block) {
      this.queueFrames -= this.block.length / 2;
    }
  }

  let v = 0;

  if (this.block) {
    const index = this.pos;

    if (index + 1 < this.block.length) {
      v = this.block[index];
      this.pos += 2;
    } else {
      this.pos = this.block.length;
    }
  }

  left[i] = v;

  if (right) {
    right[i] = v;
  }
}

this.requestMore();

return true;

}
}

registerProcessor("nsf-audio", NSFProcessor);
