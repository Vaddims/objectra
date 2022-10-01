import type { IndexableObject } from "./types/util.types";
import type { Backloop } from "./types/backloop.types";
import { Transformator } from "./transformator";
import { Objectra } from ".";

export const stringTransformator = Transformator.register(String).setup<string, string>({
  instantiator: ({ representer, getRepresenterValue }) => getRepresenterValue(representer),
  serializator: ({ instance }) => instance,
});

export const booleanTransformator = Transformator.register(Boolean).setup<boolean, boolean>({
  instantiator: ({ representer, getRepresenterValue }) => getRepresenterValue(representer),
  serializator: ({ instance }) => instance,
});

export const numberTransformator = Transformator.register(Number).setup<number | string, number>({
  instantiator: ({ representer, getRepresenterValue }) => Number(getRepresenterValue(representer)),
  serializator: ({ instance }) => isNaN(instance) ? instance.toString() : instance,
});

export const bigintTransformator = Transformator.register(BigInt).setup<string, bigint>({
  argumentPassthrough: true,
  typeIsNative: true,
  serializator: ({ instance }) => instance.toString(),
});

export const symbolTransformator = Transformator.register(Symbol).setup<string | undefined, symbol>({
  argumentPassthrough: true,
  typeIsNative: true,
  serializator: ({ instance }) => instance.description,
});

export const dateTransformator = Transformator.register(Date).setup<string>({
  typeIsNative: true,
  argumentPassthrough: true,
  serializator: ({ instance }) => instance.toISOString(),
});

export const arrayTransformator = Transformator.register(Array).setup<Objectra[]>({
  instantiator: ({ representer, instantiateRepresenter }) => representer.map(instantiateRepresenter as any),
  serializator: ({ instance, serialize }) => instance.map(serialize),
});

export const objectTransformator = Transformator.register(Object)
  .setup<IndexableObject<Objectra> | Array<Objectra>, IndexableObject | Array<unknown>>({
  instantiator: (bridge) => {
    const { representer, instance, getRepresenterObjectra, getRepresenterValue, instantiateValue } = bridge;
    const value = getRepresenterValue(representer);
    if (Array.isArray(value)) {
      return arrayTransformator.instantiate!({ 
        instantiate: instantiateValue, 
        value: getRepresenterObjectra(representer),
      });
    }

    const result = (instance ?? {}) as IndexableObject;
    for (const key in value) {
      const element = (value as any)[key];
      result[key] = instantiateValue(element);
    }

    return result;
  },
  serializator: ({ instance, serialize }) => {
    const serializeArray = (array: unknown[]) => arrayTransformator.serialize!({
      instance: array,
      objectrafy: serialize,
    });

    if (Array.isArray(instance)) {
      return serializeArray(instance);
    }

    if (typeof instance[Symbol.iterator] === 'function') {
      const iterableInstance = instance as IndexableObject<any> as Iterable<any>;
      const array = Array.from(iterableInstance);
      return serializeArray(array);
    }

    const result: Objectra.Content<any> = {}
    for (const key in instance) {
      result[key] = serialize(instance[key]);
    }

    return result;
  },
});

export const mapTransformator = Transformator.register(Map).setup({
  argumentPassthrough: true,
  typeIsNative: true,
});

export const setTransformator = Transformator.register(Set).setup({
  argumentPassthrough: true,
  typeIsNative: true,
});