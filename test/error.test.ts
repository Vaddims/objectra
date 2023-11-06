import { Objectra, Transformator } from "../src";

describe('test expected errors', () => {
  test('class not registered error', () => {
    class Target {
      @Transformator.ConstructorArgument()
      readonly seed: number;

      constructor(seed: number) {
        this.seed = seed;
      }
    }

    const seed = Math.random();
    const target = new Target(seed);
    expect(Objectra.from(target).compose).toThrow();
  });
})