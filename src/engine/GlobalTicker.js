export class GlobalTicker {
  constructor() {
    this.intervals = new Set();
  }

  every(ms, fn) {
    const id = setInterval(fn, ms);
    this.intervals.add(id);
    return id;
  }

  stop(id) {
    clearInterval(id);
    this.intervals.delete(id);
  }

  stopAll() {
    for (const id of this.intervals) clearInterval(id);
    this.intervals.clear();
  }
}
