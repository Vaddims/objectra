import { Objectra } from ".";
import { getConstructorSuperConstructors } from './utils';
import type { Constructor } from "./types/util.types";
import { 
  ArgumentPassthroughIndexAlreadyExistsError,
  InstantiationMethodDoesNotExistError, 
  InvalidInstantiationArgumentQuantityError, 
  SelfInstantiationError, 
  SelfSerializationError, 
  SerializationMethodDoesNotExistError, 
  TransformatorAlreadyRegisteredError, 
  TransformatorNotFoundError 
} from "./errors";
import { Backloop } from "./types/backloop.types";

type IdentifierInstance<RegistrationIdentifier> = RegistrationIdentifier extends Constructor 
  ? InstanceType<RegistrationIdentifier> 
  : RegistrationIdentifier;

export class Transformator<IdentifierType extends Objectra.Identifier = Objectra.Identifier, InstanceType = any, SerializationType = any> {
  public readonly type: IdentifierType;
  public readonly overload?: number;
  public readonly argumentPassthrough: boolean;
  public readonly ignoreDefaultArgumentBehaviour: boolean;
  private readonly transformers: Transformator.Transformers<InstanceType, SerializationType>;
  private readonly useSerializationSymbolIterator: boolean;

  private argumentPassthroughPropertyKeys: string[]; // Not uncombinable with global argumentPassthrough
  private propertyTransformationMapping: Transformator.PropertyTransformationMapping;

  private propertyTransformationWhitelist: string[]; // Higher priority over the the transformation mask
  private propertyTransformationMask: string[];


  private constructor(type: IdentifierType, options: Transformator.Options<InstanceType, SerializationType> = {}) {
    const { 
      overload, 
      argumentPassthrough = false, 
      propertyTransformationMask = [],
      propertyTransformationWhitelist = [],
      argumentPassthroughPropertyKeys = [],
      ignoreDefaultArgumentBehaviour = false,
      propertyTransformationMapping = Transformator.PropertyTransformationMapping.Inclusion,
      useSerializationSymbolIterator = false,
      serializator,
      instantiator,
      setter = Reflect.set as unknown as Transformator.Transformer.Setter<InstanceType>,
      getter = Reflect.get as unknown as Transformator.Transformer.Getter<InstanceType>,
    } = options;

    this.type = type;
    this.overload = overload;
    this.argumentPassthrough = argumentPassthrough;
    this.ignoreDefaultArgumentBehaviour = ignoreDefaultArgumentBehaviour;
    this.useSerializationSymbolIterator = useSerializationSymbolIterator;
    this.transformers = { serializator, instantiator, getter, setter };
    
    this.propertyTransformationMapping = propertyTransformationMapping;
    this.propertyTransformationMask = propertyTransformationMask;
    this.propertyTransformationWhitelist = propertyTransformationWhitelist;

    this.argumentPassthroughPropertyKeys = [...argumentPassthroughPropertyKeys];

    if (!this.ignoreDefaultArgumentBehaviour && !this.transformers.instantiator && this.argumentPassthrough && typeof this.type === 'function' && this.type.length > 1) {
      throw new InvalidInstantiationArgumentQuantityError(this.identifierToString());
    }
  }

  public identifierToString() {
    const identifier = Transformator.typeToString(this.type);
    const overload = this.overload ? `/${this.overload}` : '';
    return `${identifier}${overload}`;
  }
  
  public get serialize() {
    if (!this.transformers.serializator) {
      return;
    }
    
    return this.serializationProxy.bind(this);
  }

  public get instantiate() {
    if (!this.transformers.instantiator) {
      return;
    }

    return this.instantiationProxy.bind(this);
  }

  private serializationProxy<T extends InstanceType>(bridge: Transformator.SerializationBridge<T>): Objectra.Content {
    if (!this.transformers.serializator) {
      throw new SerializationMethodDoesNotExistError(this.identifierToString());
    }

    const { instance, objectrafy, instanceTransformator = this } = bridge;

    try {
      return this.transformers.serializator({
        instance,
        serialize: objectrafy,
        instanceTransformator,
        useSerializationSymbolIterator: instanceTransformator.useSerializationSymbolIterator
      });
    } catch (error) {
      if (error instanceof RangeError) {
        throw new SelfSerializationError(this.identifierToString(), error);
      }

      throw error;
    }
  }

  private instantiationProxy(bridge: Transformator.InstantiationBridge<SerializationType, InstanceType>): InstanceType {
    if (!this.transformers.instantiator) {
      throw new InstantiationMethodDoesNotExistError(this.identifierToString());
    }

    const { value, instantiate, instance, initialTransformator = this, keyPath } = bridge;
    const [backloopRepresenter, resolve] = value['createBackloopReferenceDuplex']();

    const representer = backloopRepresenter;
    const instantiateValue = instantiate;
    const getRepresenterObjectra = resolve;
    const getRepresenterValue = <T>(endpoint: Backloop.Reference<Objectra<T>>): T => (<Objectra<T, any>>getRepresenterObjectra(endpoint))['content']!;
    const instantiateRepresenter = <K>(endpoint: Backloop.Reference<Objectra<K>>): K => instantiateValue(getRepresenterObjectra(endpoint));

    try {
      return this.transformers.instantiator({
        representer,
        instance,
        instantiateValue,
        getRepresenterObjectra,
        getRepresenterValue,
        instantiateRepresenter,
        initialTransformator,
        keyPath,
        useSerializationSymbolIterator: this.useSerializationSymbolIterator,
      });
    } catch (error) {
      if (error instanceof RangeError) {
        throw new SelfInstantiationError(this.identifierToString(), error);
      }

      throw error;
    }
  }

  get getter() {
    return this.transformers.getter;
  }

  get setter() {
    return this.transformers.setter;
  }

  public static readonly registrations: Transformator<any, any>[] = [];
  private static readonly registrationCallbackQueue = new Map<Objectra.Identifier, ((transformator: Transformator) => void)[]>();

  public static registrationExists(identifier: Objectra.Identifier, overload?: number) {
    return Transformator.registrations.some((transformator) => transformator.type === identifier && transformator.overload === overload);
  }

  public static find(identifier: Objectra.Identifier, overload?: number) {
    if (typeof identifier === 'function') {
      return Transformator.registrations.find(transformator => transformator.type === identifier);
    }

    return Transformator.registrations.find((transformator) => 
      transformator.type === identifier &&
      transformator.overload === overload
    );
  }

  public static get(identifier: Objectra.Identifier, overload?: number) {
    const transformator = Transformator.find(identifier, overload);
    // console.log('get ', Transformator.typeToString(identifier), typeof identifier, 'resulted to', !!transformator)
    if (!transformator) {
      throw new TransformatorNotFoundError(identifier);
    }

    return transformator;
  }

  public static findByType(name: string, overload?: number) {
    const transformator = Transformator.registrations.find(transformator =>
      typeof transformator.type === 'function' && 
      transformator.type.name === name && 
      transformator.overload === overload
    );

    return transformator as Transformator<Constructor | Function, any, any>;
  }

  public static getByType(name: string, overload?: number) {
    const transformator = Transformator.findByType(name, overload);
    if (!transformator) {
      throw new TransformatorNotFoundError(name);
    }

    return transformator;
  }

  public static getSuperTransformators = function*(constructor: Constructor) {
    const superConstructors = getConstructorSuperConstructors(constructor);

    for (const superConstructor of superConstructors) {
      const superTransformator = Transformator.find(superConstructor);
      if (superTransformator) {
        yield superTransformator;
      }
    }
  }
  
  public static register<RegistrationIdentifier extends Objectra.Identifier>(identifier: RegistrationIdentifier) {
    if (Transformator.registrationExists(identifier)) {
      throw new TransformatorAlreadyRegisteredError(identifier);
    }

    // console.log('registered ', Transformator.typeToString(identifier))
    const transformator = new Transformator(identifier);
    Transformator.registrations.push(transformator);
    return transformator;
  }

  public setup<SerializedStructure, RegistrationIdentifier = IdentifierType>(
    options: Transformator.Options<IdentifierInstance<RegistrationIdentifier>, SerializedStructure> = {}, //SetupOptions<RegistrationIdentifier, SerializedStructure> = {},
  ) {
    const transformatorIndex = Transformator.registrations.findIndex(
      transformator => transformator.type === this.type && transformator.overload === this.overload
    );

    if (transformatorIndex === -1) {
      throw new TransformatorNotFoundError(this.type);
    }

    if (typeof this.type === 'string') {
      const transformator = new Transformator<IdentifierType, IdentifierInstance<RegistrationIdentifier>, SerializedStructure>(this.type, options);
      Transformator.registrations[transformatorIndex] = transformator;
      return transformator;
    }

    // TODO Check if instantiation method is required and throw an error if needed

    const transformator = new Transformator<IdentifierType, IdentifierInstance<RegistrationIdentifier>, SerializedStructure>(this.type, options);
    Transformator.registrations[transformatorIndex] = transformator;
    return transformator;
  }

  public static typeToString(identifer: Objectra.Identifier) {
    return typeof identifer === 'string' ? identifer : identifer.name;
  }

  public static Register<T = unknown, S = any, K extends Constructor = Constructor<T>>(options?: Transformator.Options<IdentifierInstance<K>, S>) {
    return (constructor: K) => {
      // TODO Check if registration already exists and warn if needed 

      const transformator = Transformator.register<K>(constructor).setup(options);
      const callbackQueue = Transformator.registrationCallbackQueue.get(constructor);
      if (!callbackQueue) {
        return;
      }

      for (const resolve of callbackQueue) {
        resolve(transformator);
      }

      Transformator.registrationCallbackQueue.delete(constructor);
    }
  }

  public static TransforamationException<T extends Constructor>() {
    return (target: T, propertyKey: string) => {
      const transformator = Transformator.get(target);
      if (!transformator.propertyTransformationWhitelist.includes(propertyKey)) {
        transformator.propertyTransformationMask.push(propertyKey);
      }
    }
  }

  public static Include() {
    return Transformator.conditionalTransformationException(Transformator.PropertyTransformationMapping.Exclusion);
  }

  public static Exclude() {
    return Transformator.conditionalTransformationException(Transformator.PropertyTransformationMapping.Inclusion);
  }

  public static ArgumentPassthrough<T extends object>(argumentIndex?: number) {
    return (target: T, propertyKey: string) => {
      // TODO Check if it is possible to add property passthrough and warn if needed

      const resolver = (transformator: Transformator) => {
        if (!argumentIndex) {
          transformator.argumentPassthroughPropertyKeys.push(propertyKey);
          return;
        }

        if (transformator.argumentPassthroughPropertyKeys[argumentIndex]) {
          throw new ArgumentPassthroughIndexAlreadyExistsError(transformator.type, argumentIndex);
        }

        transformator.argumentPassthroughPropertyKeys[argumentIndex] = propertyKey;
      }

      Transformator.addRegistrationCallbackResolver(target.constructor, resolver);
    }
  }

  private static addRegistrationCallbackResolver(identifier: Objectra.Identifier, callback: (transformator: Transformator) => void) {
    const callbackQueue = Transformator.registrationCallbackQueue.get(identifier);
    if (!callbackQueue) {
      Transformator.registrationCallbackQueue.set(identifier, [callback]);
      return;
    }

    callbackQueue.push(callback);
  }

  private static conditionalTransformationException<T extends object>(targetMapping: Transformator.PropertyTransformationMapping) {
    return (target: T, propertyKey: string) => {
      const resolver = (transformator: Transformator) => {
        if (!transformator.propertyTransformationWhitelist.includes(propertyKey)) {
          if (transformator.propertyTransformationMapping === targetMapping) {
            transformator.propertyTransformationMask.push(propertyKey);
          } else {
            transformator.propertyTransformationWhitelist.push(propertyKey);
          }
        }
      }
      
      Transformator.addRegistrationCallbackResolver(target.constructor, resolver);
    }
  }
}

export namespace Transformator {
  export interface SerializationBridge<Instance = unknown> {
    readonly objectrafy: Objectra.ValueSerialization;
    readonly instance: Instance;
    readonly instanceTransformator: Transformator;
  }

  export interface InstantiationBridge<S, V> {
    readonly instantiate: Objectra.ValueInstantiation;
    readonly value: Objectra<Objectra.Content<S>>;
    readonly instance?: V;
    readonly initialTransformator: Transformator;
    readonly keyPath: string[];
  }

  export namespace Transformer {
    export type Setter<T> = (target: T, key: any, value: any, receiver?: any) => void;
    export type Getter<T> = (target: T, key: any, receiver?: any) => unknown;
    
    export interface SerializationBridge<InstanceType> {
      readonly serialize: (value: unknown) => Objectra;
      readonly instance: InstanceType;
      readonly instanceTransformator: Transformator;
      readonly useSerializationSymbolIterator: boolean;
    }

    export interface InstantiationBridge<SerializedType, Instance> {
      readonly instance?: Instance;
      readonly representer: Backloop.Reference<Objectra<Objectra.Content<SerializedType>>>;
      readonly instantiateValue: Objectra.ValueInstantiation;
      readonly getRepresenterObjectra: Backloop.ResolveRepresenter;
      readonly getRepresenterValue: <T>(endpoint: Backloop.Reference<Objectra<T>>) => T;
      readonly instantiateRepresenter: <T>(endpoint: Backloop.Reference<Objectra<T>>) => T;
      readonly initialTransformator: Transformator;
      readonly keyPath: string[];
      readonly useSerializationSymbolIterator: boolean;
    }

    export type Serializator<Instance> = (bridge: SerializationBridge<Instance>) => Objectra.Content;
    export type Instantiator<Serialization, Instance> = (
      (bridge: InstantiationBridge<Serialization, Instance>) => Instance
    );
  }

  export interface Transformers<Instance, Serialized> {
    readonly serializator?: Transformer.Serializator<Instance>;
    readonly instantiator?: Transformer.Instantiator<Serialized, Instance>;
    readonly setter?: Transformer.Setter<Instance>;
    readonly getter?: Transformer.Getter<any>;
  }

  export interface Options<V, S> extends Transformers<V, S> {
    readonly overload?: number;
    readonly argumentPassthrough?: boolean;
    readonly ignoreDefaultArgumentBehaviour?: boolean;
    readonly argumentPassthroughPropertyKeys?: string[];
    readonly propertyTransformationMapping?: Transformator.PropertyTransformationMapping;
    readonly propertyTransformationMask?: string[];
    readonly propertyTransformationWhitelist?: string[];
    readonly useSerializationSymbolIterator?: boolean;
  }

  export enum PropertyTransformationMapping {
    Inclusion = 'inclusion',
    Exclusion = 'exclusion',
  }
}