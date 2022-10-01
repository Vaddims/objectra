import type { Constructor, IndexableObject } from "./types/util.types";

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

export function isPrimitive(value: unknown) {
  const primitiveTypes = ['undefined', 'string', 'number', 'symbol', 'bigint'];
  return value === null || primitiveTypes.includes(typeof value);
}

export function removeUndefinedProperties(value: IndexableObject<any>) {
  for (const key in value) {
    if (typeof value[key] === 'undefined') {
      delete value[key];
    }
  }
}