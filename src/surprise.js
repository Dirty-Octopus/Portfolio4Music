export class SurpriseBag {
  constructor(random = Math.random) {
    this.random = random;
    this.misses = 0;
  }
  turn() {
    this.misses += 1;
    if (this.misses >= 50 || this.random() < 0.035) {
      this.misses = 0;
      return true;
    }
    return false;
  }
}
