const rand = (min, max) =>
  Math.floor(min + Math.random() * (max - min + 1));

export class ZooEngine {
  constructor(io, ticker) {
    this.ns = io.of("/zoo");
    this.ticker = ticker;

    this.phase = "BETTING";
    this.timeLeft = 15;
    this.highlightIdx = 0;
    this.winnerIdx = null;
    this.running = false;
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.startBetting();
  }

  stop() {
    this.running = false;
  }

  startBetting() {
    this.phase = "BETTING";
    this.timeLeft = 15;
    this.ns.emit("phase", { phase: this.phase, time: this.timeLeft });

    const betTick = this.ticker.every(1000, () => {
      if (!this.running) return;

      this.timeLeft--;
      this.ns.emit("timer", this.timeLeft);

      if (this.timeLeft <= 0) {
        this.ticker.stop(betTick);
        this.startSpinning();
      }
    });
  }

  startSpinning() {
    this.phase = "SPINNING";
    this.ns.emit("phase", { phase: this.phase });

    const spinDuration = rand(5000, 7000);
    const startAt = Date.now();
    this.winnerIdx = rand(0, 27);

    const spinTick = this.ticker.every(120, () => {
      if (!this.running) return;

      this.highlightIdx = (this.highlightIdx + 1) % 28;
      this.ns.emit("highlight", this.highlightIdx);

      if (Date.now() - startAt >= spinDuration) {
        this.ticker.stop(spinTick);
        this.ns.emit("winner", this.winnerIdx);
        this.startCountdown();
      }
    });
  }

  startCountdown() {
    this.phase = "RESULT";
    let sec = 3;
    this.ns.emit("countdown", sec);

    const cdTick = this.ticker.every(1000, () => {
      if (!this.running) return;

      sec--;
      this.ns.emit("countdown", sec);

      if (sec <= 0) {
        this.ticker.stop(cdTick);
        this.startBetting();
      }
    });
  }
}
