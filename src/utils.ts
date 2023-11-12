import type { Constructor, IndexableObject, ES3Primitives, ES6Primitives } from "./types/util.types";

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

export function isES3Primitive(value: unknown): value is ES3Primitives {
  const primitiveTypes = ['undefined', 'string', 'number', 'boolean'];
  return value === null || primitiveTypes.includes(typeof value);
}

export function isES6Primitive(value: unknown): value is ES6Primitives {
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
  Generator = 'generator',
  Async = 'async',
  Arrow = 'arrow',
}

function *generatorFunctionSample() {}
const generatorConstructor = generatorFunctionSample.constructor;
export function getFunctionType(value: Function): FunctionType {
  if (value.prototype) {
    const prototypeDescriptor = Object.getOwnPropertyDescriptor(value, 'prototype');

    if (prototypeDescriptor && !prototypeDescriptor.writable) {
      const unconstructableClasses: Function[] = [Symbol, BigInt];
      if (!unconstructableClasses.includes(value)) {
        return FunctionType.Constructor;
      }
    }

    if (value.constructor === generatorConstructor) {
      return FunctionType.Generator;
    }

    return FunctionType.Function;
  }

  if (value.constructor.name === 'AsyncFunction') {
    return FunctionType.Async;
  }

  return FunctionType.Arrow;
}

export const FunctionTypeDeterminant = {
  isConstructor(value: Function): value is Constructor {
    const unconstructableClasses: Function[] = [Symbol, BigInt];
    if (unconstructableClasses.includes(value)) {
      return false;
    }
      
    return getFunctionType(value) === FunctionType.Constructor;
  },
  isGeneratorFunction(value: Function): value is GeneratorFunction {
    return getFunctionType(value) === FunctionType.Generator;
  }
}

export function everyArrayElementIsEqual(array: unknown[]) {
  return array.every(element => array[0] === element);
}