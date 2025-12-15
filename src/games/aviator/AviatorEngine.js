const rand = (min, max) =>
  Math.floor(min + Math.random() * (max - min + 1));

export class AviatorEngine {
  constructor(io, ticker) {
    this.ns = io.of("/aviator");
    this.ticker = ticker;

    this.running = false;
    this.multiplier = 1.0;
    this.crashAt = 0;
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.startRound();
  }

  stop() {
    this.running = false;
  }

  startRound() {
    this.multiplier = 1.0;

    // ✅ random crash time
    // can be 1s, 2s, 3s, 5s, or even 30+ seconds
    const crashAfter =
      Math.random() < 0.1 ? rand(30000, 60000) : rand(1000, 5000);

    const startTime = Date.now();

    const tick = this.ticker.every(100, () => {
      if (!this.running) return;

      const elapsed = Date.now() - startTime;
      this.multiplier = +(1 + elapsed / 1000).toFixed(2);

      this.ns.emit("tick", this.multiplier);

      if (elapsed >= crashAfter) {
        this.ticker.stop(tick);
        this.ns.emit("crash", this.multiplier);
        this.startRound();
      }
    });
  }
}
