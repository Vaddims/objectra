import type { IndexableObject } from "./types/util.types";
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
  serializator: ({ instance }) => instance.toString(),
  ignoreDefaultArgumentBehaviour: true,
  argumentPassthrough: true,
});

export const symbolTransformator = Transformator.register(Symbol).setup<string | undefined, symbol>({
  serializator: ({ instance }) => instance.description,
  ignoreDefaultArgumentBehaviour: true,
  argumentPassthrough: true,
});

export const dateTransformator = Transformator.register(Date).setup<string>({
  serializator: ({ instance }) => instance.toISOString(),
  ignoreDefaultArgumentBehaviour: true,
  argumentPassthrough: true,
});

export const arrayTransformator = Transformator.register(Array).setup<Objectra[]>({
  instantiator: ({ representer, instantiateRepresenter }) => representer.map(instantiateRepresenter as any),
  serializator: ({ instance, serialize }) => instance.map(serialize),
});

export const objectTransformator = Transformator.register(Object)
  .setup<IndexableObject<Objectra> | Array<Objectra>, IndexableObject | Array<unknown>>({
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
      keyPath.push(key);
      result[key] = instantiateValue(element);
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
    const serializeProperties = (keys: string[]) => {
      for (const key of keys) {
        result[key] = serialize(instance[key]);
      }
    }
    
    const propertyTransformationMask = instanceTransformator['propertyTransformationMask'];
    const propertyTransformationWhitelist = instanceTransformator['propertyTransformationWhitelist'];
    if (instanceTransformator['propertyTransformationMapping'] === Transformator.PropertyTransformationMapping.Inclusion) {
      const keys = Object.getOwnPropertyNames(instance);
      const inclusiveKeys = keys.filter(key => (
        propertyTransformationWhitelist.includes(key) || !propertyTransformationMask.includes(key)
      ));
      serializeProperties(inclusiveKeys);
    } else {
      serializeProperties(propertyTransformationMask);
    }

    return result;
  },
});

export const mapTransformator = Transformator.register(Map).setup({
  ignoreDefaultArgumentBehaviour: true,
  argumentPassthrough: true,
  useSerializationSymbolIterator: true,
  getter: (target, key) => target.get(key),
  setter: (target, key, value) => target.set(key, value),
});

export const setTransformator = Transformator.register(Set).setup({
  ignoreDefaultArgumentBehaviour: true,
  argumentPassthrough: true,
  useSerializationSymbolIterator: true,
  getter: (target, key) => target.get(key),
  setter: (target, _, value) => target.add(value),
});