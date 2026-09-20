export class TurnCharge {
  constructor() {
    this.level = 0;
  }
  turn() {
    this.level = (this.level % 10) + 1;
    return this.level === 10;
  }
}
