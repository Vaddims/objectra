import { Objectra } from ".";
import { getConstructorSuperConstructors, isClass } from './utils';
import type { Constructor, Writeable } from "./types/util.types";
import { 
  ArgumentPassthroughIndexAlreadyExistsError,
  InstantiationMethodDoesNotExistError, 
  InvalidInstantiationArgumentQuantityError, 
  SelfInstantiationError, 
  SelfSerializationError, 
  SerializationMethodDoesNotExistError, 
  TransformatorAlreadyRegisteredError, 
  TransformatorAlreadyConfiguredError, 
  TransformatorNotFoundError, 
  ArgumentPassthroughIncompatiblanceError
} from "./errors";
import type { Backloop } from "./types/backloop.types";

type IdentifierInstance<RegistrationIdentifier> = RegistrationIdentifier extends Constructor 
  ? InstanceType<RegistrationIdentifier> 
  : RegistrationIdentifier;

export class Transformator<IdentifierType extends Objectra.Identifier = Objectra.Identifier, InstanceType = any, SerializationType = any> {
  // Identifiers
  public readonly type: IdentifierType;
  public readonly creationMethod: Transformator.CreationMethod;
  public readonly overload: number | undefined;
  
  // Argument grouping
  public readonly argumentPassthrough: boolean;
  public readonly ignoreDefaultArgumentBehaviour: boolean;
  public readonly argumentPassthroughPropertyKeys: readonly string[]; // Not uncombinable with global argumentPassthrough
  
  // Property seperation
  public readonly propertyTransformationMask: readonly string[];
  public readonly propertyTransformationWhitelist: readonly string[]; // Higher priority over the the transformation mask
  public readonly propertyTransformationMapping: Transformator.PropertyTransformationMapping;
  
  // Branching
  public readonly useSerializationSymbolIterator: boolean;
  private readonly branchedProperties: readonly (keyof Transformator.ConfigOptions<InstanceType, SerializationType>)[] = [];
  private configurable = true;

  // transformers
  private readonly serializator: Transformator.Transformers<InstanceType, SerializationType>['serializator'];
  private readonly instantiator: Transformator.Transformers<InstanceType, SerializationType>['instantiator'];
  private readonly getter: Transformator.Transformers<InstanceType, SerializationType>['getter'];
  private readonly setter: Transformator.Transformers<InstanceType, SerializationType>['setter'];

  // * Static Properties
  public static readonly staticRegistrations: Transformator[] = [];
  // Use weak map to prevent memory leak in cases when objectra serializes scoped funcitons
  public static readonly dynamicRegistrations = new WeakMap<Constructor | Function, Transformator>();
  // Used commonly for decorator registrations their configs
  private static readonly registrationCallbackQueueMap: Transformator.RegistrationCallbackQueueMap = new Map();

  private constructor(options: Transformator.InitOptions<IdentifierType, InstanceType, SerializationType>) {
    this.type = options.type;
    this.creationMethod = options.creationMethod;
    this.overload = options.overload;

    this.argumentPassthrough = options.argumentPassthrough ?? false;
    this.ignoreDefaultArgumentBehaviour = options.ignoreDefaultArgumentBehaviour ?? false;
    this.argumentPassthroughPropertyKeys = Array.from(options.argumentPassthroughPropertyKeys ?? []);
    
    this.propertyTransformationMask = options.propertyTransformationMask ?? [];
    this.propertyTransformationWhitelist = options.propertyTransformationWhitelist ?? [];
    this.propertyTransformationMapping = options.propertyTransformationMapping ?? Transformator.PropertyTransformationMapping.Inclusion;

    this.useSerializationSymbolIterator = options.useSerializationSymbolIterator ?? false;

    this.serializator = options.serializator;
    this.instantiator = options.instantiator;
    this.getter = options.getter;
    this.setter = options.setter;

    this.branchedProperties = [...options.branchedProperties];
    
    if (!this.ignoreDefaultArgumentBehaviour && !this.instantiator && this.argumentPassthrough && typeof this.type === 'function' && this.type.length > 1) {
      throw new InvalidInstantiationArgumentQuantityError(this.identifierToString());
    }
  }

  public static typeToString(identifer: Objectra.Identifier) {
    return typeof identifer === 'string' ? identifer : identifer.name;
  }

  public identifierToString() {
    const identifier = Transformator.typeToString(this.type);
    const overload = this.overload ? `/${this.overload}` : '';
    return `${identifier}${overload}`;
  }
  
  public get serialize() {
    if (!this.serializator) {
      return;
    }
    
    return this.serializationProxy.bind(this);
  }

  public get instantiate() {
    if (!this.instantiator) {
      return;
    }

    return this.instantiationProxy.bind(this);
  }

  private serializationProxy<T extends InstanceType>(bridge: Transformator.SerializationBridge<T>): Objectra.Content {
    if (!this.serializator) {
      throw new SerializationMethodDoesNotExistError(this.identifierToString());
    }

    const { instance, objectrafy, instanceTransformator = this } = bridge;

    try {
      return this.serializator({
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
    if (!this.instantiator) {
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
      return this.instantiator({
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

  public configure<SerializedStructure, RegistrationIdentifier = IdentifierType>(
    options: Transformator.ConfigOptions<IdentifierInstance<RegistrationIdentifier>, SerializedStructure> = {},
  ) {
    if (!this.configurable) {
      throw new TransformatorAlreadyConfiguredError(this.type);
    }

    const transformatorIndex = Transformator.staticRegistrations.findIndex(
      transformator => transformator.type === this.type && transformator.overload === this.overload
    );

    if (transformatorIndex === -1) {
      throw new TransformatorNotFoundError(this.type);
    }

    const splittedConfigOptions = Transformator.splitConfigOptions(options);
    const transformator = Transformator.createInherited<IdentifierType, IdentifierInstance<RegistrationIdentifier>, SerializedStructure>({
      type: this.type,
      creationMethod: Transformator.CreationMethod.Manual,
      ...splittedConfigOptions,
    });

    this.configurable = false;
    Transformator.staticRegistrations[transformatorIndex] = transformator;
    return transformator;
  }

  public getSpecificationOptions(): Transformator.SpecificationOptions {
    return {
      argumentPassthrough: this.argumentPassthrough,
      ignoreDefaultArgumentBehaviour: this.ignoreDefaultArgumentBehaviour,
      argumentPassthroughPropertyKeys: Array.from(this.argumentPassthroughPropertyKeys),
      propertyTransformationMask: Array.from(this.propertyTransformationMask),
      propertyTransformationWhitelist: Array.from(this.propertyTransformationWhitelist),
      propertyTransformationMapping: this.propertyTransformationMapping,
      useSerializationSymbolIterator: this.useSerializationSymbolIterator,
    }
  }

  private static splitConfigOptions<V, S>(options: Transformator.ConfigOptions<V, S>): Transformator.ConfigOptionsSplitted<V, S> {
    const { serializator, instantiator, getter, setter, ...specifications } = options;

    return {
      specifications,
      transformers: { serializator, instantiator, getter, setter },
    }
  }

  private static getIdentifierConstructor(identifer: Objectra.Identifier): Constructor {
    if (typeof identifer === 'string') {
      return Object;
    }

    if (isClass(identifer)) {
      return identifer;
    }

    return Function;
  }

  // #region Registration utilities
  private static isDescribable<T extends Objectra.Identifier>(identifier: T, overload?: number) {
    return (transformator: Transformator): transformator is Transformator<T> => (
      (typeof identifier === 'function' || transformator.overload === overload)
      && transformator.type === identifier
    )
  }

  public static exists(identifier: Objectra.Identifier, overload?: number) {
    const staticRegistrationExist = Transformator.staticRegistrations.some(Transformator.isDescribable(identifier, overload));
    if (staticRegistrationExist || typeof identifier === 'string') {
      return staticRegistrationExist;
    }

    return Transformator.dynamicRegistrations.has(identifier);
  }

  public static findStaticByStringType(name: string, overload?: number) {
    return Transformator.staticRegistrations.find(transformator =>
      typeof transformator.type === 'function' && 
      transformator.type.name === name && 
      transformator.overload === overload
    ) as Transformator<Constructor | Function>;
  }

  public static getStaticByStringType(name: string, overload?: number) {
    const transformator = Transformator.findStaticByStringType(name, overload);
    if (!transformator) {
      throw new TransformatorNotFoundError(name);
    }

    return transformator;
  }

  public static findStatic<T extends Objectra.Identifier>(identifier: T, overload?: number) {
    return Transformator.staticRegistrations.find(Transformator.isDescribable(identifier, overload));
  }

  public static getStatic<T extends Objectra.Identifier>(identifier: T, overload?: number) {
    const transformator = Transformator.findStatic(identifier, overload);
    if (!transformator) {
      throw new TransformatorNotFoundError(identifier);
    }

    return transformator;
  }

  // Finds transformator in static and dynamic registrations
  public static findAvailable<T extends Objectra.Identifier>(identifier: T, overload?: number) {
    if (typeof identifier !== 'string') {
      const transformator = Transformator.dynamicRegistrations.get(identifier);
      if (transformator) {
        return transformator as Transformator<T>;
      }
    }

    return Transformator.findStatic(identifier, overload);
  }

  public static getAvailable<T extends Objectra.Identifier>(identifier: T, overload?: number) {
    const transformator = Transformator.findAvailable(identifier, overload);
    if (!transformator) {
      throw new TransformatorNotFoundError(identifier);
    }

    return transformator;
  }

  public static get<T extends Function | Constructor>(identifier: T, overload?: number) {
    const staticTransformator = Transformator.findStatic(identifier, overload);
    return staticTransformator ?? Transformator.registerDynamic(identifier);
  }

  public static *getSuperTransformators(constructor: Constructor) {
    const superConstructors = getConstructorSuperConstructors(constructor);
    for (const superConstructor of superConstructors) {
      const superTransformator = Transformator.findAvailable(superConstructor);
      if (superTransformator) {
        yield superTransformator;
      }
    }
  }

  public static getParentTransformator(constructor: Constructor) {
    const superTransfarmators = Transformator.getSuperTransformators(constructor);
    return superTransfarmators.next().value;
  }

  private static createInherited<T extends Objectra.Identifier, V, S>(options: Transformator.InheritedInitOptions<T, V, S>): Transformator<T, V, S> {
    const typeConstructor = Transformator.getIdentifierConstructor(options.type);
    const parentTransformator = Transformator.getParentTransformator(typeConstructor);
    const parentSpecifications = parentTransformator?.getSpecificationOptions();
    const specifications = options.specifications ?? {};

    const transformator = new Transformator({
      ...parentSpecifications,
      ...specifications,
      ...options.transformers,
      branchedProperties: Object.keys(specifications) as (keyof Transformator.ConfigOptions<V, S>)[],
      creationMethod: options.creationMethod,
      type: options.type,
    });

    return transformator;
  }

  public static register<RegistrationIdentifier extends Objectra.Identifier>(identifier: RegistrationIdentifier) {
    if (Transformator.exists(identifier)) {
      throw new TransformatorAlreadyRegisteredError(identifier);
    }

    const transformator = Transformator.createInherited({
      creationMethod: Transformator.CreationMethod.Manual,
      type: identifier,
    });

    Transformator.staticRegistrations.push(transformator);
    return transformator;
  }

  public static registerDynamic<T extends Constructor | Function>(identifier: T) {
    const transformator = Transformator.createInherited({
      creationMethod: Transformator.CreationMethod.Dynamic,
      type: identifier,
    });


    Transformator.dynamicRegistrations.set(identifier, transformator);
    return transformator;
  }
  // #endregion

  // #region Decorators
  public static Register<T = unknown, S = any, K extends Constructor = Constructor<T>>(options: Transformator.ConfigOptions<IdentifierInstance<K>, S> = {}) {
    return (constructor: K) => {
      if (Transformator.exists(constructor)) {
        throw new TransformatorAlreadyRegisteredError(constructor);
      }

      const callbackQueue = Transformator.registrationCallbackQueueMap.get(constructor);
      if (!callbackQueue) {
        return;
      }

      Transformator.registrationCallbackQueueMap.delete(constructor);
      
      for (const resolve of callbackQueue) {
        const resolvedConfigOptions = resolve({ ...options });
        options = Object.assign(options, resolvedConfigOptions);
      }

      const transformator = Transformator.createInherited({
        type: constructor,
        creationMethod: Transformator.CreationMethod.Manual,
        ...Transformator.splitConfigOptions(options),
      });

      Transformator.staticRegistrations.push(transformator);
    }
  }

  public static TransforamationException() {
    return Transformator.conditionalTransformationException();
  }

  public static Include() {
    return Transformator.conditionalTransformationException(Transformator.PropertyTransformationMapping.Inclusion);
  }

  public static Exclude() {
    return Transformator.conditionalTransformationException(Transformator.PropertyTransformationMapping.Exclusion);
  }

  public static ArgumentPassthrough<T extends object>(argumentIndex?: number) {
    return (target: T, propertyKey: string) => {
      const resolver = (options: Transformator.ConfigOptions<any, any>) => {
        if (options.argumentPassthrough) {
          throw new ArgumentPassthroughIncompatiblanceError(target as Objectra.Identifier);
        }
        
        const customOptions = {
          argumentPassthroughPropertyKeys: Array.from(options.argumentPassthroughPropertyKeys ?? [])
        } as const;

        if (!argumentIndex) {
          customOptions.argumentPassthroughPropertyKeys.push(propertyKey);
          return customOptions;
        }

        if (customOptions.argumentPassthroughPropertyKeys[argumentIndex]) {
          throw new ArgumentPassthroughIndexAlreadyExistsError(target as Objectra.Identifier, argumentIndex);
        }

        customOptions.argumentPassthroughPropertyKeys[argumentIndex] = propertyKey;
        return customOptions;
      }

      Transformator.addRegistrationCallbackResolver(target.constructor, resolver);
    }
  }
  // #endregion

  // #region Decorator helpers
  private static addRegistrationCallbackResolver(identifier: Objectra.Identifier, callback: Transformator.RegistrationCallback) {
    const registrationCallbackQueue = Transformator.registrationCallbackQueueMap.get(identifier);
    if (!registrationCallbackQueue) {
      Transformator.registrationCallbackQueueMap.set(identifier, [callback]);
      return;
    }

    registrationCallbackQueue.push(callback);
  }

  private static conditionalTransformationException<T extends object>(targetMapping?: Transformator.PropertyTransformationMapping) {
    return (target: T, propertyKey: string) => {
      const resolver = (options: Transformator.ConfigOptions<any, any>) => {
        const customOptions = {
          propertyTransformationWhitelist: Array.from(options.propertyTransformationWhitelist ?? []),
          propertyTransformationMask: Array.from(options.propertyTransformationMask ?? []),
          propertyTransformationMapping: options.propertyTransformationMapping ?? Transformator.PropertyTransformationMapping.Inclusion,
        };

        if (customOptions.propertyTransformationWhitelist.includes(propertyKey)) {
          return customOptions;
        }

        if (typeof targetMapping === undefined) {
          targetMapping = customOptions.propertyTransformationMapping === Transformator.PropertyTransformationMapping.Inclusion 
            ? Transformator.PropertyTransformationMapping.Exclusion 
            : Transformator.PropertyTransformationMapping.Inclusion;
        }

        if (customOptions.propertyTransformationMapping === targetMapping) {
          customOptions.propertyTransformationWhitelist.push(propertyKey);
        } else {
          customOptions.propertyTransformationMask.push(propertyKey);
        }

        return customOptions;
      }
      
      Transformator.addRegistrationCallbackResolver(target.constructor, resolver);
    }
  }
  // #endregion
}

export namespace Transformator {
  export enum CreationMethod {
    Manual = 'manual',
    Dynamic = 'dynamic',
  }

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

  export interface SpecificationOptions {
    readonly argumentPassthrough?: boolean;
    readonly argumentPassthroughPropertyKeys?: string[];
    readonly ignoreDefaultArgumentBehaviour?: boolean;
    readonly propertyTransformationMask?: string[];
    readonly propertyTransformationWhitelist?: string[];
    readonly propertyTransformationMapping?: Transformator.PropertyTransformationMapping;
    readonly useSerializationSymbolIterator?: boolean;
  }

  export interface ConfigOptions<V, S> extends SpecificationOptions, Transformers<V, S> {}

  export interface RegistrationOptions<T extends Objectra.Identifier, V, S> extends ConfigOptions<V, S> {
    readonly type: T;
    readonly overload?: number;
  }

  export type InitOptions<T extends Objectra.Identifier, V, S> = Transformator.RegistrationOptions<T, V, S> & {
    readonly branchedProperties: (keyof Transformator.ConfigOptions<V, S>)[];
    readonly creationMethod: Transformator.CreationMethod;
  }

  export interface InheritedInitOptions<T extends Objectra.Identifier, V, S> {
    readonly type: T;
    readonly creationMethod: Transformator.CreationMethod;
    readonly specifications?: SpecificationOptions;
    readonly transformers?: Transformers<V, S>;
  }

  export interface ConfigOptionsSplitted<V, S> {
    readonly specifications: SpecificationOptions;
    readonly transformers: Transformers<V, S>;
  }

  export enum PropertyTransformationMapping {
    Inclusion = 'inclusion',
    Exclusion = 'exclusion',
  }

  export type RegistrationCallbackQueueMap = Map<Objectra.Identifier, RegistrationCallback[]>;
  export interface RegistrationCallback<V = any, S = any> {
    (options: ConfigOptions<V, S>): Writeable<ConfigOptions<V, S>>;
  }
}