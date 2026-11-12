const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const enc = new TextEncoder();

export class Controller {
  constructor() {
    this.active = false;
    this.busy = false;
    this.feedback = 0;
    this.lastAck = 0;
    this.running = null;  // No belt status until the Uno is connected.
  }

  async connect() {
    if (!navigator.serial) throw Error("Open in desktop Chrome or Edge to connect the Uno.");
    const port = await navigator.serial.requestPort();
    await port.open({baudRate:115200});
    this.port = port;
    this.writer = port.writable.getWriter();
    this.reader = port.readable.getReader();
    this.identified = false;
    this.readError = false;
    this.lastAck = 0;
    this.readTask = this.read();
    try {
      for (let attempt = 0; attempt < 10 && !this.identified; attempt++) {
        await this.writer.write(enc.encode("PROBE\n"));
        await wait(300);
      }
      if (!this.identified) throw Error("Upload TrustFallDemo.ino to this Uno and reconnect.");
      this.started = false;
      await this.writer.write(enc.encode("BELT ON\n"));
      for (let attempt = 0; attempt < 12 && !this.started; attempt++) await wait(100);
      if (!this.started) throw Error("Uno did not confirm belt start. Reconnect USB.");
      this.lastSend = -Infinity;
      this.active = true;
      this.lastAck = performance.now();
    } catch (error) {
      await this.close();
      throw error;
    }
  }

  async read() {
    const decoder = new TextDecoder();
    let buffer = "";
    try {
      for (;;) {
        const {value, done} = await this.reader.read();
        if (done) break;
        buffer += decoder.decode(value, {stream:true});
        let split;
        while ((split = buffer.indexOf("\n")) >= 0) {
          const line = buffer.slice(0, split).trim();
          buffer = buffer.slice(split + 1);
          if (line === "TRUSTFALL DEMO 2") this.identified = true;
          if (line === "BELT ON" && this.identified) { this.started = true; this.running = true; }
          if (line === "IDLE") this.running = false;
          if (line === "ERR SERVO") this.readError = true;
          const match = /^RUN (\d{4})$/.exec(line);
          if (match && this.identified) {
            this.feedback = Math.max(0, Math.min(1, (+match[1] - 1350) / 300));
            this.lastAck = performance.now();
            this.running = true;
          }
        }
        if (buffer.length > 256) buffer = "";
      }
    } catch { this.readError = true; }
  }

  async drive(lean) {
    if (!this.active || this.busy) return;
    const now = performance.now();
    if (now - this.lastSend > 1400) this.lastAck = now;  // Resume after a background tab.
    this.lastSend = now;
    if (this.readError || now - this.lastAck > 1400) throw Error("Uno stopped replying. Reconnect USB.");
    this.busy = true;
    try { await this.writer.write(enc.encode("LEAN " + Math.round(lean * 100) + "\n")); }
    finally { this.busy = false; }
  }

  async close(stopMotor = false) {
    this.active = false;
    if (!this.port || this.closing) return;
    this.closing = true;
    try {
      if (stopMotor && this.identified) {
        await this.writer.write(enc.encode("HALT\n"));
        this.running = false;
      }
    } finally {
      await this.reader.cancel().catch(() => {});
      await this.readTask;
      this.reader.releaseLock();
      this.writer.releaseLock();
      await this.port.close().catch(() => {});
      this.port = null;
      this.identified = false;
      this.closing = false;
    }
  }
}
