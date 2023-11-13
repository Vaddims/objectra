import { Objectra, Transformator } from "../src";

describe('test custom transformer handling', () => {
  test('vector transformation', () => {
    const sepSymbol = ':';
    @Transformator.Register({
      serializator: (bridge) => {
        return `${bridge.instance[0]}${sepSymbol}${bridge.instance[1]}`;
      },
      instantiator: (bridge) => {
        const flatVector = bridge.getRepresenterValue(bridge.representer) as string;
        const [x, y] = flatVector.split(sepSymbol).map(Number);
        return new Vector(x, y);
      },
    })
    class Vector {
      readonly 0: number;
      readonly 1: number;

      constructor(x: number, y: number) {
        this[0] = x;
        this[1] = y;
      }
    }

    const vector = new Vector(23.342, 12.1232124);
    const vectorDuplicate = Objectra.duplicate(vector);
    
    expect(vectorDuplicate).not.toBe(vector);
    expect(vectorDuplicate[0]).toBe(vector[0]);
    expect(vectorDuplicate[1]).toBe(vector[1]);
  });

  test('named transformation', () => {
    Transformator.register('nametest').configure({
      serializator: (bridge) => {
        const { instance } = bridge;
        const res = instance.a + instance.b + instance.c;
        return res;
      },
      instantiator: (bridge) => {
        const value = bridge.getRepresenterValue(bridge.representer);
        return {
          composed: value,
        };
      }
    });

    const myObject = {
      a: 'abc',
      b: 'def',
      c: '123'
    };

    const myObjectDuplicate = Objectra.duplicate<any>(myObject, {
      altMapping: [
        [myObject, 'nametest'],
      ],
    });

    expect(myObjectDuplicate.composed).toBe(myObject.a + myObject.b + myObject.c);
  })
});