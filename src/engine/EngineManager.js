import { GlobalTicker } from "./GlobalTicker.js";
import { ZooEngine } from "../games/zoo/ZooEngine.js";
import { AviatorEngine } from "../games/aviator/AviatorEngine.js";

export class EngineManager {
  constructor(io) {
    this.io = io;
    this.ticker = new GlobalTicker();
    this.engines = [];
  }

  start() {
    // Zoo Roulette
    const zoo = new ZooEngine(this.io, this.ticker);
    zoo.start();
    this.engines.push(zoo);

    // Aviator
    const aviator = new AviatorEngine(this.io, this.ticker);
    aviator.start();
    this.engines.push(aviator);
  }

  stopAll() {
    this.engines.forEach((e) => e.stop());
    this.ticker.stopAll();
  }
}
