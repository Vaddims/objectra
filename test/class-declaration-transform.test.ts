import { Objectra, Transformator } from "../src";
import { Constructor } from "../src/types/util.types";

describe('test class declaration transform', () => {
  test('2 primitive declaration', () => {
    @Transformator.Register()
    class Parent {}

    @Transformator.Register()
    class Child {
      @Transformator.ConstructorArgument()
      parentConstructor: Constructor<Parent>;

      constructor(parentConstructor: Constructor<Parent>) {
        this.parentConstructor = parentConstructor;
      }
    }
    
    const child = new Child(Parent);
    const childDuplicate = Objectra.duplicate(child);
    expect(childDuplicate).not.toBe(child);
    expect(childDuplicate.parentConstructor).toBe(Parent);
  });
})