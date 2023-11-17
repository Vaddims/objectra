import type { IndexableObject } from "./types/util.types";
import { Transformator } from "./transformator";
import { Objectra } from ".";

export const stringTransformator = Transformator.register(String).configure<string, string>({
  instantiator: ({ representer, getRepresenterValue }) => getRepresenterValue(representer),
  serializator: ({ instance }) => instance,
});

export const booleanTransformator = Transformator.register(Boolean).configure<boolean, boolean>({
  instantiator: ({ representer, getRepresenterValue }) => getRepresenterValue(representer),
  serializator: ({ instance }) => instance,
});

export const numberTransformator = Transformator.register(Number).configure<number | string, number>({
  instantiator: ({ representer, getRepresenterValue }) => Number(getRepresenterValue(representer)),
  serializator: ({ instance }) => isNaN(instance) ? instance.toString() : instance,
});

export const bigintTransformator = Transformator.register(BigInt).configure<string, bigint>({
  serializator: ({ instance }) => instance.toString(),
  ignoreDefaultArgumentBehaviour: true,
  argumentPassthrough: true,
});

export const symbolTransformator = Transformator.register(Symbol).configure<string | undefined, symbol>({
  serializator: ({ instance }) => instance.description,
  ignoreDefaultArgumentBehaviour: true,
  argumentPassthrough: true,
});

export const dateTransformator = Transformator.register(Date).configure<string>({
  serializator: ({ instance }) => instance.toISOString(),
  ignoreDefaultArgumentBehaviour: true,
  argumentPassthrough: true,
});

export const arrayTransformator = Transformator.register(Array).configure<Objectra[]>({
  instantiator: ({ representer, instantiateRepresenter, keyPath, initialTransformator }) => {
    return representer.map((element, index) => {
      keyPath.push(index.toString());
      const res = instantiateRepresenter(element as any);
      keyPath.pop();
      return res;
    });
  },
  serializator: ({ instance, serialize }) => instance.map(serialize),
});

export const objectTransformator = Transformator.register(Object)
  .configure<IndexableObject<Objectra> | Array<Objectra>, IndexableObject | Array<unknown>>({
  instantiator: (bridge) => {
    const { 
      instance, 
      keyPath,
      representer, 
      initialTransformator,
      getRepresenterObjectra, 
      getRepresenterValue, 
      instantiateValue, 
    } = bridge;

    const value = getRepresenterValue(representer);
    if (Array.isArray(value)) {
      return arrayTransformator.instantiate!({ 
        instantiate: instantiateValue, 
        value: getRepresenterObjectra(representer),
        initialTransformator,
        keyPath,
      });
    }

    const result = (instance ?? {}) as IndexableObject;
    for (const key in value) {
      const element = (value as any)[key];
      const formattedKey = Transformator.getMetaKeyRepresenter(key);
      keyPath.push(formattedKey);
      result[formattedKey] = instantiateValue(element);
      keyPath.pop();
    }

    return result;
  },
  serializator: ({ instance, serialize, instanceTransformator, useSerializationSymbolIterator }) => {    
    const serializeArray = (array: unknown[]) => arrayTransformator.serialize!({
      instance: array,
      objectrafy: serialize,
      instanceTransformator,
    });

    if (Array.isArray(instance)) {
      return serializeArray(instance);
    }

    if (useSerializationSymbolIterator && typeof instance[Symbol.iterator] === 'function') {
      const iterableInstance = instance as IndexableObject<any> as Iterable<any>;
      const array = Array.from(iterableInstance);
      return serializeArray(array);
    }

    const result: Objectra.Content<any> = {}
    const serializeProperties = (keys: PropertyKey[] | readonly PropertyKey[]) => {
      for (const key of keys) {
        const metaKey = Transformator.projectMetaKey(key);
        result[metaKey] = serialize(instance[key]);
      }
    }

    const inclusivePropertyKeyNames = instanceTransformator.getMaskedObjectPropertyNames(instance);
    serializeProperties(inclusivePropertyKeyNames);

    return result;
  },
});

export const functionTransformator = Transformator.register(Function);

export const mapTransformator = Transformator.register(Map).configure({
  ignoreDefaultArgumentBehaviour: true,
  argumentPassthrough: true,
  useSerializationSymbolIterator: true,
  symbolIteratorEntryDepth: 2,
  getter: (target, key) => target.get(key),
  setter: (target, entry: [unknown, unknown]) => target.set(...entry),
});

export const setTransformator = Transformator.register(Set).configure({
  ignoreDefaultArgumentBehaviour: true,
  argumentPassthrough: true,
  useSerializationSymbolIterator: true,
  symbolIteratorEntryDepth: 1,
  getter: (target, key) => target.get(key),
  setter: (target, entry) => target.add(entry),
});

export const weakSetTransformator = Transformator.register(WeakSet).configure({
  ignoreDefaultArgumentBehaviour: true,
  argumentPassthrough: true,
  symbolIteratorEntryDepth: 1,
  useSerializationSymbolIterator: true,
  getter: (weakSet, entry) => weakSet.get(entry),
  setter: (weakSet, entry) => weakSet.add(entry),
})

export const weakMapTransformator = Transformator.register(WeakMap).configure({
  ignoreDefaultArgumentBehaviour: true,
  argumentPassthrough: false,
  symbolIteratorEntryDepth: 2,
  useSerializationSymbolIterator: false,
  getter: (weakMap, entry) => weakMap.get(entry),
  setter: (weakMap, entry) => weakMap.set(entry[0], entry[1]),
})