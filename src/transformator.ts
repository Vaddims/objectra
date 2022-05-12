import { ObjectraContent, IndexableObject, Objectra, SerializedObjectra, SerializedObjectraContent } from ".";
import { TransformationBridge } from "./transformation-bridge";

const transformators = new Map<string, Transformator<any>>();

type TransformatorIdentifier = string | ClassConstructor | Function;
type Primitives = string | number | boolean | bigint | symbol;

interface ClassConstructor<T = any> {
  new (...args: any[]): T;
}

const identifierToType = (identifier: TransformatorIdentifier) => {
  if (typeof identifier === "string") {
    return identifier;
  }
  
  return identifier.name;
}

export interface TransformerMethods<Instance, Serialized = Instance> {
  serializeManualy(transformationBridge: TransformationBridge<Instance>): Serialized;
  instantiateManualy(content: Serialized): Instance;
  serialize(content: Instance): Serialized;
  instantiate(content: Serialized): Instance;
}

type TransformerPairOverload<T, V, K extends keyof TransformerMethods<T, V>> = Pick<TransformerMethods<T, V>, K>;
export type Transformer<T, K> = IndexableObject<undefined>
  & (TransformerPairOverload<T, K, 'instantiate' | 'serialize'>
  | TransformerPairOverload<T, K, 'instantiate' | 'serializeManualy'>
  | TransformerPairOverload<T, K, 'instantiateManualy' | 'serialize'>
  | TransformerPairOverload<T, K, 'instantiateManualy' | 'serializeManualy'>)


export class Transformator<T = any, V = T> implements Partial<TransformerMethods<T, V>> {
  readonly serializeManualy?: (transformationBridge: TransformationBridge<T>) => V;
  readonly instantiateManualy?: (content: V) => T;
  readonly serialize?: (content: T) => V;
  readonly instantiate?: (content: V) => T;

  private constructor(public readonly type: string, transformer: Partial<TransformerMethods<T, V>>) {
    const { serialize, serializeManualy, instantiate, instantiateManualy } = transformer;

    if (!(serialize || serializeManualy) || !(instantiate || instantiateManualy)) {
      throw new Error(`Transformator for ${type} must have serialize and instantiate transformer methods`);
    }

    this.serializeManualy = serializeManualy;
    this.instantiateManualy = instantiateManualy;
    this.serialize = serialize;
    this.instantiate = instantiate;
  }

  private static readonly registrations = new Map<string, Transformator>();

  private static registerPrimitive<T extends Primitives, V = T>(
    constructor: ClassConstructor | Function,
    transformer: TransformerPairOverload<T, V, 'instantiate' | 'serializeManualy'> | TransformerPairOverload<T, V, 'instantiateManualy' | 'serializeManualy'>
  ) {
    const transformator = new Transformator(constructor.name, transformer);
    Transformator.registrations.set(constructor.name, transformator);
  }

  public static register<T extends ClassConstructor>(constructor: T) {
    return function<Serialized, RedunduntT = T>(transformer:
      (TransformerPairOverload<RedunduntT extends T ? InstanceType<T> : RedunduntT, Serialized, 'instantiate' | 'serialize'>
      | TransformerPairOverload<RedunduntT extends T ? InstanceType<T> : RedunduntT, Serialized, 'instantiate' | 'serializeManualy'>
      | TransformerPairOverload<RedunduntT extends T ? InstanceType<T> : RedunduntT, Serialized, 'instantiateManualy' | 'serialize'>
      | TransformerPairOverload<RedunduntT extends T ? InstanceType<T> : RedunduntT, Serialized, 'instantiateManualy' | 'serializeManualy'>)
      
      /*Partial<TransformerMethods<RedunduntT extends T ? InstanceType<T> : RedunduntT, Serialized>>*/) {
      const transformator = new Transformator(constructor.name, transformer);
      Transformator.registrations.set(constructor.name, transformator);
    }
  }

  public static get<T = any, V = any>(identifier: TransformatorIdentifier) {
    const type = identifierToType(identifier);
    const transformator = Transformator.registrations.get(type);
    if (!transformator) {
      throw new Error(`Transformator for ${type} not found`);
    }

    return transformator as Transformator<T, V>;
  }

  static {
    const { register, registerPrimitive } = Transformator;

    registerPrimitive<string>(String, {
      instantiate: (content) => content,
      serializeManualy: ({ value }) => value,
    });

    registerPrimitive<boolean>(Boolean, {
      instantiate: (content) => content,
      serializeManualy: ({ value }) => value,
    });

    registerPrimitive<number, string | number>(Number, {
      instantiate: (content) => Number(content),
      serializeManualy: ({ value }) => {
        if (isNaN(value)) {
          return value.toString();
        }

        return value;
      },
    });

    registerPrimitive<bigint, string>(BigInt, {
      instantiate: (bigint) => BigInt(bigint),
      serializeManualy: ({ value }) => value.toString(),
    });

    registerPrimitive<symbol, string | undefined>(Symbol, {
      instantiate: (symbol) => Symbol(symbol),
      serializeManualy: ({ value }) => value.description,
    });

    register(Object)<IndexableObject<Objectra>, IndexableObject>({
      instantiateManualy(content) {
        const object: IndexableObject = {};
        for (const key in content) {
          const objectra = content[key];
          object[key] = objectra.toValue();
        }

        return object;
      },

      serializeManualy(bridge) {
        const object: ObjectraContent = {};
        for (const key in bridge.value) {
          const value = bridge.value[key];
          object[key] = bridge.objectrafy(value);
        }

        return object;
      }
    })

    register(Array)<Objectra[]>({
      serializeManualy: (bridge) => bridge.value.map(Objectra.from),
      instantiateManualy: (content) => content.map((objectra) => objectra.toValue()),
    });

    register(Map)<[unknown, unknown][]>({
      instantiate: (content) => new Map(content),
      serialize: Array.from,
    });

    register(Set)<unknown[]>({
      instantiate: (content) => new Set(content),
      serialize: Array.from,
    })

    // TODO Function
  }
}

