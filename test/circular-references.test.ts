import { Objectra, Transformator } from "../src";

describe('test circular data', () => {
  test('self circular', () => {
    const selfCircularObject: any = {};
    selfCircularObject.reference = selfCircularObject;

    const selfCircularObjectDuplicate = Objectra.duplicate(selfCircularObject);

    expect(selfCircularObjectDuplicate).not.toBe(selfCircularObject);
    expect(selfCircularObjectDuplicate).toBe(selfCircularObjectDuplicate.reference);
  })

  test('external circular', () => {
    const referenceObject = {};

    const actualObject = {
      reference: referenceObject,
      reference2: referenceObject,
    };

    const actualObjectDuplicate = Objectra.duplicate(actualObject);

    expect(actualObjectDuplicate).not.toBe(referenceObject);
    expect(actualObjectDuplicate.reference).toBe(actualObjectDuplicate.reference2);
    expect(actualObjectDuplicate.reference).not.toBe(referenceObject);
  });

  test('multple interconnected references', () => {
    const lowLevelReference = {}

    const midLevelReference: any = {
      lowLevelReference,
    };

    const highLevelReference = {
      lowLevelReference,
      midLevelReference,
    };

    midLevelReference.highLevelReference = highLevelReference;

    const actualObject = {
      lowLevelReference,
      midLevelReference,
      highLevelReference,
    };

    const actualObjectDuplicate = Objectra.duplicate(actualObject);
    
    expect(actualObjectDuplicate).not.toBe(actualObject);
    expect(actualObjectDuplicate.lowLevelReference).not.toBe(lowLevelReference);
    expect(actualObjectDuplicate.midLevelReference).not.toBe(midLevelReference);
    expect(actualObjectDuplicate.highLevelReference).not.toBe(highLevelReference);

    expect(actualObjectDuplicate.lowLevelReference).toBe(actualObjectDuplicate.highLevelReference.lowLevelReference)
    expect(actualObjectDuplicate.midLevelReference).toBe(actualObjectDuplicate.highLevelReference.midLevelReference)
    expect(actualObjectDuplicate.highLevelReference).toBe(actualObjectDuplicate.midLevelReference.highLevelReference)
  });

  test('multiple interconnected class references', () => {
    class Child {}

    class Parent {
      mainChild: Child | null = null; 
      children = new Set();
    }

    const child = new Child();
    const parent = new Parent();
    parent.mainChild = child;
    parent.children.add(child);

    const parentDuplicate = Objectra.duplicate(parent);
    
    expect(parentDuplicate).not.toBe(parent);
    expect(parentDuplicate.mainChild).not.toBe(child);
    expect(parentDuplicate.mainChild).toBe(Array.from(parentDuplicate.children)[0]);
  });

  test('reference injection in instance as argument', () => {
    @Transformator.Register()
    class Child {
      @Transformator.ConstructorArgument()
      parent: Parent;

      constructor(parent: Parent) {
        this.parent = parent;
      }
    }

    class Parent {
      mainChild: Child | null = null; 
      children = new Set();
    }

    const parent = new Parent();
    const child = new Child(parent);

    parent.mainChild = child;
    parent.children.add(child);

    const parentDuplicate = Objectra.duplicate(parent);

    expect(parentDuplicate).not.toBe(parent);
    expect(parentDuplicate.mainChild).not.toBe(child);
    expect(parentDuplicate.mainChild).toBe(Array.from(parentDuplicate.children)[0]);

    const childDuplicate = parentDuplicate.mainChild;
    expect(childDuplicate).not.toBeFalsy();

    if (childDuplicate) {
      expect(childDuplicate.parent).toBe(parentDuplicate);
    }
  });
})