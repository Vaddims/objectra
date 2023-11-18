import { Objectra } from ".";
import { getConstructorSuperConstructors, FunctionTypeDeterminant } from './utils';
import type { Constructor, Writeable } from "./types/util.types";
import type { Backloop } from "./types/backloop.types";

import { ObjectraError, TransformatorError } from './errors';

export enum MetaKeyType {
  Key = 'K',
  Index = 'I',
  Symbol = 'S',
}

export type MetaStringKeyTemplate = `${MetaKeyType.Key}:${string}`;
export type MetaIndexKeyTemplate = `${MetaKeyType.Index}:${string}`;
export type MetaSymbolKeyTemplate = `${MetaKeyType.Symbol}@${number | ''}:${string}`;
export type MetaKeyTemplate = MetaStringKeyTemplate | MetaSymbolKeyTemplate;

type IdentifierInstance<RegistrationIdentifier> = RegistrationIdentifier extends Constructor 
  ? InstanceType<RegistrationIdentifier> 
  : RegistrationIdentifier;

// TODO Rename (inst/seri) Bridge to (inst/seri) Context / Make context class

export class Transformator<IdentifierType extends Objectra.Identifier = Objectra.Identifier, InstanceType = any, SerializationType = any> {
  // Identifiers
  public readonly type: IdentifierType;
  public readonly creationMethod: Transformator.CreationMethod;
  public readonly overload: number | undefined;

  // Argument grouping
  // TODO Merge argumentPassthrough with argumentPassthroughPropertyKeys (as null or array)
  public readonly argumentPassthrough: boolean;
  public readonly ignoreDefaultArgumentBehaviour: boolean;
  public readonly argumentPassthroughPropertyKeys: readonly PropertyKey[]; // Not combinable with global argumentPassthrough
  
  // Property seperation
  public readonly propertyExclusionMask: readonly PropertyKey[];
  
  // Branching
  public readonly useSerializationSymbolIterator: boolean;
  public readonly symbolIteratorEntryDepth: number;
  private readonly branchedProperties: readonly (keyof Transformator.ConfigOptions<InstanceType, SerializationType>)[] = [];
  private configurable = true;

  // transformers
  public readonly serializator: NonNullable<Transformator.Transformers<InstanceType, SerializationType>['serializator']>;
  public readonly instantiator: NonNullable<Transformator.Transformers<InstanceType, SerializationType>['instantiator']>;
  public readonly getter: NonNullable<Transformator.Transformers<InstanceType, SerializationType>['getter']>;
  public readonly setter: NonNullable<Transformator.Transformers<InstanceType, SerializationType>['setter']>;

  public static readonly staticRegistrations: Transformator[] = [];
  // Use weak map to prevent memory leak in cases when objectra serializes scoped funcitons
  public static readonly dynamicRegistrations = new WeakMap<Constructor | Function, Transformator>();

  private constructor(options: Transformator.InitOptions<IdentifierType, InstanceType, SerializationType>) {
    this.type = options.type;
    this.creationMethod = options.creationMethod;
    this.overload = options.overload;

    this.argumentPassthrough = options.argumentPassthrough ?? false;
    this.ignoreDefaultArgumentBehaviour = options.ignoreDefaultArgumentBehaviour ?? false;
    this.argumentPassthroughPropertyKeys = Array.from(options.argumentPassthroughPropertyKeys ?? []);
    
    this.propertyExclusionMask = options.propertyExclusionMask ?? [];

    this.useSerializationSymbolIterator = options.useSerializationSymbolIterator ?? false;
    this.symbolIteratorEntryDepth = options.symbolIteratorEntryDepth ?? 1;

    this.serializator = options.serializator!;
    this.instantiator = options.instantiator!;
    this.getter = options.getter!;
    this.setter = options.setter!;

    this.branchedProperties = [...options.branchedProperties];
    
    if (!this.ignoreDefaultArgumentBehaviour && !this.instantiator && this.argumentPassthrough && typeof this.type === 'function' && this.type.length > 1) {
      throw new TransformatorError.InvalidConstructorArgumentQuantityError(this.identifierToString());
    }
  }

  public get isNameIdentified() {
    return typeof this.type === 'string';
  }

  public get isConstructorIdentified() {
    return !this.isNameIdentified && FunctionTypeDeterminant.isConstructor(this.type as Function);
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
      throw new TransformatorError.TransformatorSerializatorMissingError(this.identifierToString());
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
        throw new TransformatorError.TransformatorSelfSerializationError(this.identifierToString(), error);
      }

      throw error;
    }
  }

  private instantiationProxy(bridge: Transformator.InstantiationBridge<SerializationType, InstanceType>): InstanceType {
    if (!this.instantiator) {
      throw new TransformatorError.TransformatorInstantiatorMissingError(this.identifierToString());
    }

    const { value, instantiate, instance, initialTransformator = this, keyPath } = bridge;
    const [backloopRepresenter, resolve] = value.createBackloopReferenceCommunication();

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
        throw new TransformatorError.TransformatorSelfInstantiationError(this.identifierToString(), error);
      }

      throw error;
    }
  }

  public configure<SerializedStructure, RegistrationIdentifier = IdentifierType>(
    options: Transformator.ConfigOptions<IdentifierInstance<RegistrationIdentifier>, SerializedStructure> = {},
  ) {
    if (!this.configurable) {
      throw new TransformatorError.TransformatorConfigSealedError(this.type);
    }

    const transformatorIndex = Transformator.staticRegistrations.findIndex(
      transformator => transformator.type === this.type && transformator.overload === this.overload
    );

    if (transformatorIndex === -1) {
      throw new TransformatorError.TransformatorMissingError(this.type);
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
      propertyExclusionMask: Array.from(this.propertyExclusionMask),
      useSerializationSymbolIterator: this.useSerializationSymbolIterator,
    }
  }

  public getMaskedObjectPropertyNames(instance: InstanceType) {
    return [...Object.getOwnPropertyNames(instance), ...Object.getOwnPropertySymbols(instance)].filter(
      (key) => !this.propertyExclusionMask.includes(key)
    );
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

    if (FunctionTypeDeterminant.isConstructor(identifer)) {
      return identifer;
    }

    return Function;
  }

  // ! #region Registration utilities
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

  public static staticExists(identifier: Objectra.Identifier, overload?: number) {
    const staticRegistrationExist = Transformator.staticRegistrations.some(Transformator.isDescribable(identifier, overload));
    return staticRegistrationExist;
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
      throw new TransformatorError.TransformatorMissingError(name);
    }

    return transformator;
  }

  public static findStatic<T extends Objectra.Identifier>(identifier: T, overload?: number) {
    return Transformator.staticRegistrations.find(Transformator.isDescribable(identifier, overload));
  }

  public static getStatic<T extends Objectra.Identifier>(identifier: T, overload?: number) {
    const transformator = Transformator.findStatic(identifier, overload);
    if (!transformator) {
      throw new TransformatorError.TransformatorMissingError(identifier);
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
      throw new TransformatorError.TransformatorMissingError(identifier);
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
    return superTransfarmators.next().value ?? null;
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

  public static register<RegistrationIdentifier extends Objectra.Identifier>(identifier: RegistrationIdentifier, overload?: number) {
    if (Transformator.exists(identifier, overload)) {
      // TODO Change error -> Identifier with this overload already exists (trace max overload and display n+1 to be declared)
      throw new TransformatorError.TransformatorRegistrationDuplicationError(identifier);
    }

    const transformator = Transformator.createInherited({
      creationMethod: Transformator.CreationMethod.Manual,
      type: identifier,
      overload,
    });

    Transformator.staticRegistrations.push(transformator);
    return transformator as Transformator<RegistrationIdentifier extends string ? any : RegistrationIdentifier, unknown, unknown>;
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

  
  private static readonly staticSymbols: [symbol, number?][] = [];
  public static registerSymbol(symbol: symbol, overload?: number) {
    if (Transformator.findSymbol(symbol.description!, overload)) {
      throw 'symbol registered';
    }

    Transformator.staticSymbols.push([symbol, overload]);
  }

  public static createSymbol(key: string, overload?: number) {
    const symbol = Symbol(key);
    Transformator.registerSymbol(symbol, overload);
    return symbol;
  }

  public static findSymbol(symbolDescription: string, symbolOverload?: number) {
    const symbolRegistration = Transformator.staticSymbols.find(([symbol, overload]) => symbol.description === symbolDescription && symbolOverload === overload);
    return symbolRegistration?.[0] ?? null;
  }

  public static getSymbol(symbolDescription: string, symbolOverload?: number) {
    const symbol = Transformator.findSymbol(symbolDescription, symbolOverload);
    if (!symbol) {
      throw new TransformatorError.SymbolRegistrationMissingError(symbolDescription);
    }

    return symbol;
  }

  private static createMetaStringKey(name: string): MetaStringKeyTemplate {
    return `${MetaKeyType.Key}:${name}`;
  }

  private static createMetaIndexKey(name: number): MetaIndexKeyTemplate {
    return `${MetaKeyType.Index}:${name}`;
  }

  private static createMetaSymbolKey(key: string, overload?: number): MetaSymbolKeyTemplate {
    return `${MetaKeyType.Symbol}@${overload ?? ''}:${key}`;
  }

  public static decodeMetaKey(metaKey: MetaKeyTemplate) {
    const [meta, key] = metaKey.split(/:(.+)/, 2);
    const [type, ...args] = meta.split('@') as [MetaKeyType, ...string[]];
    
    switch (type) {
      case MetaKeyType.Key:
        return {
          type,
          key,
        }

      case MetaKeyType.Index:
        return {
          type,
          index: Number(key),
        }
        
      case MetaKeyType.Symbol:
        return {
          type,
          symbol: Transformator.getSymbol(key, Number(args[0])),
        }
    }
  }

  public static getMetaKeyRepresenter(metaKey: string) {
    const decodedMetaKey = Transformator.decodeMetaKey(metaKey as MetaKeyTemplate);
    switch(decodedMetaKey.type) {
      case MetaKeyType.Key:
        return decodedMetaKey.key;

      case MetaKeyType.Index:
        return Number(decodedMetaKey.index);

      case MetaKeyType.Symbol:
        return decodedMetaKey.symbol;
    }
  }

  public static projectMetaKey(target: PropertyKey) {
    if (typeof target === 'number') {
      return Transformator.createMetaIndexKey(target);
    }

    if (typeof target === 'string') {
      return Transformator.createMetaStringKey(target);
    }

    const symbolRegistration = Transformator.staticSymbols.find(([symbol]) => symbol === target);
    if (!symbolRegistration) {
      throw new TransformatorError.SymbolRegistrationMissingError(target);
    }

    return Transformator.createMetaSymbolKey(symbolRegistration[0].description!, symbolRegistration[1]);
  }

  // ! #region Decorators

  private static readonly awaitingRegistrationFieldResolvers: Transformator.RegistrationCallbackQueueSet = new Set();
  public static Register<T = unknown, S = any, K extends Constructor = T extends Constructor ? T : Constructor<T>>(options: Transformator.ConfigOptions<IdentifierInstance<K>, S> = {}) {
    return (constructor: K, context: ClassDecoratorContext): void => {
      if (Transformator.exists(constructor)) {
        throw new TransformatorError.TransformatorRegistrationDuplicationError(constructor);
      }

      const callbackQueue = [...this.awaitingRegistrationFieldResolvers];
      Transformator.awaitingRegistrationFieldResolvers.clear();

      const parentOptions = Transformator.getParentTransformator(constructor)?.getSpecificationOptions() ?? {};
      options = Object.assign(parentOptions, options);
      
      for (const resolve of callbackQueue) {
        const resolvedConfigOptions = resolve({ ...options }, constructor);
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

  public static Include() {
    return Transformator.conditionalTransformationException(Transformator.PropertyTransformationMapping.Inclusion);
  }

  public static Exclude() {
    return Transformator.conditionalTransformationException(Transformator.PropertyTransformationMapping.Exclusion);
  }

  public static InvertFromMapping() {
    return Transformator.conditionalTransformationException();
  }

  private static conditionalTransformationException(targetMapping?: Transformator.PropertyTransformationMapping) {
    return function<C, V>(_: undefined, context: ClassFieldDecoratorContext<C, V>) {
      const propertyKey = context.name.toString() // TODO add symbols

      const resolver: Transformator.RegistrationCallback = (transformatorOptions, type) => {
        const newTransformatorOptions: Writeable<Transformator.ConfigOptions<any, any>> = {};

        const parentPropertyExclusionMask = transformatorOptions.propertyExclusionMask ?? [];
        const newPropertyExclusionMask = [...parentPropertyExclusionMask];

        const propertyKeyMaskIndex = newPropertyExclusionMask.indexOf(propertyKey);
        
        const isInvertion = !targetMapping;
        const isInclusion = targetMapping === Transformator.PropertyTransformationMapping.Inclusion;
        const isExclusion = targetMapping === Transformator.PropertyTransformationMapping.Exclusion;
    
        if (propertyKeyMaskIndex === -1 && (isExclusion || isInvertion)) {
          newPropertyExclusionMask.push(propertyKey);
        } else if (propertyKeyMaskIndex >= 0 && (isInclusion || isInvertion)) {
          newPropertyExclusionMask.splice(propertyKeyMaskIndex, 1);
        }

        if (newPropertyExclusionMask.length !== parentPropertyExclusionMask.length) {
          newTransformatorOptions.propertyExclusionMask = [...newPropertyExclusionMask];
        }

        return newTransformatorOptions;
      }

      Transformator.awaitingRegistrationFieldResolvers.add(resolver);
    }
  }

  public static ConstructorArgument(argumentIndex?: number) {
    return function<T, V>(_: undefined, context: ClassFieldDecoratorContext<T, V>) {
      const propertyKey = context.name.toString() // todo add symbols

      const resolver: Transformator.RegistrationCallback = (options: Transformator.ConfigOptions<any, any>, type) => {
        if (options.argumentPassthrough) { 
          throw 'TODO REFACTOR / UNIFY'
        }
        
        const customOptions = {
          argumentPassthroughPropertyKeys: Array.from(options.argumentPassthroughPropertyKeys ?? [])
        } as const;

        if (typeof argumentIndex === 'undefined') {
          customOptions.argumentPassthroughPropertyKeys.push(propertyKey);
          return customOptions;
        }

        if (customOptions.argumentPassthroughPropertyKeys[argumentIndex]) {
          throw new TransformatorError.ConstructorArgumentIndexDuplicationError(type, argumentIndex);
        }

        customOptions.argumentPassthroughPropertyKeys[argumentIndex] = propertyKey;
        return customOptions;
      }

      Transformator.awaitingRegistrationFieldResolvers.add(resolver);
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
    readonly objectrafy: Objectra.Serializator;
    readonly instance: Instance;
    readonly instanceTransformator: Transformator;
  }

  export interface InstantiationBridge<S, V> {
    readonly instantiate: Objectra.Compositor;
    readonly value: Objectra<Objectra.Content<S>>;
    readonly instance?: V;
    readonly initialTransformator: Transformator;
    readonly keyPath: PropertyKey[];
  }

  export namespace Transformer {
    export type Setter<T> = (target: T, entry: any) => void;
    export type Getter<T> = (target: T, entry: any) => unknown;
    
    export interface SerializationBridge<InstanceType> {
      readonly serialize: (value: unknown) => Objectra;
      readonly instance: InstanceType;
      readonly instanceTransformator: Transformator;
      readonly useSerializationSymbolIterator: boolean;
    }

    export interface InstantiationBridge<SerializedType, Instance> {
      readonly instance?: Instance;
      readonly representer: Backloop.Reference<Objectra<Objectra.Content<SerializedType>>>;
      readonly instantiateValue: Objectra.Compositor;
      readonly getRepresenterObjectra: Backloop.ResolveRepresenter;
      readonly getRepresenterValue: <T>(endpoint: Backloop.Reference<Objectra<T>>) => T;
      readonly instantiateRepresenter: <T>(endpoint: Backloop.Reference<Objectra<T>>) => T;
      readonly initialTransformator: Transformator;
      readonly keyPath: PropertyKey[];
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
    readonly argumentPassthroughPropertyKeys?: PropertyKey[];
    readonly ignoreDefaultArgumentBehaviour?: boolean;
    readonly propertyExclusionMask?: PropertyKey[];
    readonly useSerializationSymbolIterator?: boolean;
    readonly symbolIteratorEntryDepth?: number;
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
    readonly overload?: number;
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

  export type RegistrationCallbackQueueSet = Set<RegistrationCallback>;
  export interface RegistrationCallback<V = any, S = any> {
    (options: ConfigOptions<V, S>, type: Objectra.Identifier): Writeable<ConfigOptions<V, S>>;
  }
}