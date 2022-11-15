import type { Constructor, IndexableObject, ES5Primitives } from "./types/util.types";

export function* getConstructorSuperConstructors(instance: Constructor) {
  let constructor = instance;
  while (constructor) {
    constructor = Object.getPrototypeOf(constructor.prototype)?.constructor;
    yield constructor;
  }
}

// For es5 compatibility
export function objectHas(thisArg: unknown, v: PropertyKey) {
  return Object.prototype.hasOwnProperty.call(thisArg, v);
}

export function isPrimitive(value: unknown): value is ES5Primitives {
  const primitiveTypes = ['undefined', 'string', 'number', 'boolean', 'symbol', 'bigint'];
  return value === null || primitiveTypes.includes(typeof value);
}

export function removeUndefinedProperties(value: IndexableObject<any>) {
  for (const key in value) {
    if (typeof value[key] === 'undefined') {
      delete value[key];
    }
  }

  return value;
}

export enum FunctionType {
  Constructor = 'constructor',
  Function = 'function',
  Async = 'async',
  Arrow = 'arrow',
}

export function functionType(value: Function): FunctionType {
  if (value.prototype) {
    const prototypeDescriptor = Object.getOwnPropertyDescriptor(value, 'prototype');
    if (!prototypeDescriptor) {
      throw new Error(`${value.name} does not have a prototype descriptor`);
    }


    if (!prototypeDescriptor.writable) {
      const unconstructableClasses: Function[] = [Symbol, BigInt];
      if (!unconstructableClasses.includes(value)) {
        return FunctionType.Constructor;
      }
    }

    return FunctionType.Function;
  }

  return value.constructor.name === 'AsyncFunction' ? FunctionType.Async : FunctionType.Arrow;
}

export function isClass(value: Function): value is Constructor {
  const unconstructableClasses: Function[] = [Symbol, BigInt];
  if (unconstructableClasses.includes(value)) {
    return false;
  } else {
    return functionType(value) === FunctionType.Constructor;
  }
}

export function everyArrayElementIsEqual(array: unknown[]) {
  return array.every(element => array[0] === element);
}