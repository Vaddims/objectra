import { Objectra } from ".";
import { getConstructorSuperConstructors } from './utils';
import type { Constructor } from "./types/util.types";
import { 
  InstantiationMethodDoesNotExistError, 
  InvalidInstantiationArgumentQuantityError, 
  SelfInstantiationError, 
  SelfSerializationError, 
  SerializationMethodDoesNotExistError, 
  TransformatorAlreadyRegisteredError, 
  TransformatorAlreadySetupedError, 
  TransformatorNotFoundError 
} from "./errors";
import { Backloop } from "./types/backloop.types";

type IdentifierInstance<RegistrationIdentifier> = RegistrationIdentifier extends Constructor 
  ? InstanceType<RegistrationIdentifier> 
  : RegistrationIdentifier;

export class Transformator<IdentifierType extends Transformator.Identifier = Transformator.Identifier, InstanceType = any, SerializationType = any> {
  public readonly type: IdentifierType;
  public readonly overload?: number;
  public readonly argumentPassthrough: boolean;
  public readonly ignoreDefaultTypeBehaviour: boolean;
  private readonly transformers: Transformator.Transformers<InstanceType, SerializationType>;
  private modified = false;

  private constructor(type: IdentifierType, options: Transformator.Options<InstanceType, SerializationType> = {}) {
    const { overload, argumentPassthrough, typeIsNative, ...transformers } = options;

    this.type = type;
    this.overload = overload;
    this.transformers = transformers;
    this.argumentPassthrough = argumentPassthrough ?? false;
    this.ignoreDefaultTypeBehaviour = typeIsNative ?? false;

    if (!this.ignoreDefaultTypeBehaviour && !this.transformers.instantiator && this.argumentPassthrough && typeof this.type === 'function' && this.type.length > 1) {
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

    const { instance, objectrafy } = bridge;

    try {
      return this.transformers.serializator({
        instance,
        serialize: objectrafy,
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

    const { value, instantiate, instance } = bridge;
    const [backloopReferenceTree, resolve] = value.createBackloopReferenceDuplex();

    const representer = backloopReferenceTree;
    const instantiateValue = instantiate;
    const getRepresenterObjectra = resolve;
    const getRepresenterValue = <T>(endpoint: Backloop.Reference<Objectra<T>>): T => getRepresenterObjectra(endpoint).content;
    const instantiateRepresenter = <K>(endpoint: Backloop.Reference<Objectra<K>>): K => instantiateValue(getRepresenterObjectra(endpoint));

    try {
      return this.transformers.instantiator({
        representer,
        instance,
        instantiateValue,
        getRepresenterObjectra,
        getRepresenterValue,
        instantiateRepresenter,
      });
    } catch (error) {
      if (error instanceof RangeError) {
        throw new SelfInstantiationError(this.identifierToString(), error);
      }

      throw error;
    }
  }

  public static readonly registrations: Transformator<any, any>[] = [];

  public static registrationExists(identifier: Transformator.Identifier, overload?: number) {
    return Transformator.registrations.some((transformator) => transformator.type === identifier && transformator.overload === overload);
  }

  public static find(identifier: Transformator.Identifier, overload?: number) {
    return Transformator.registrations.find((transformator) => 
      transformator.type === identifier &&
      transformator.overload === overload
    );
  }

  public static get(identifier: Transformator.Identifier, overload?: number) {
    const transformator = Transformator.find(identifier, overload);
    if (!transformator) {
      throw new TransformatorNotFoundError(identifier);
    }

    return transformator;
  }

  public static findByConstructorName(name: string, overload?: number) {
    const transformator = Transformator.registrations.find(transformator =>
      typeof transformator.type === 'function' && 
      transformator.type.name === name && 
      transformator.overload === overload
    );

    return transformator as Transformator<Constructor, any, any>;
  }

  public static getByConstructorName(name: string, overload?: number) {
    const transformator = Transformator.findByConstructorName(name, overload);
    if (!transformator) {
      throw new TransformatorNotFoundError(name);
    }

    return transformator;
  }

  public static getSuperClassTransformators = function*(constructor: Constructor) {
    const superConstructors = getConstructorSuperConstructors(constructor);

    for (const superConstructor of superConstructors) {
      const superTransformator = Transformator.find(superConstructor);
      if (superTransformator) {
        yield superTransformator;
      }
    }
  }
  
  public static register<RegistrationIdentifier extends Transformator.Identifier>(identifier: RegistrationIdentifier) {
    if (Transformator.registrationExists(identifier)) {
      throw new TransformatorAlreadyRegisteredError(identifier);
    }

    const transformator = new Transformator(identifier);
    Transformator.registrations.push(transformator);
    return transformator;
  }

  public setup<SerializedStructure, RegistrationIdentifier = IdentifierType>(
    options: Transformator.Options<IdentifierInstance<RegistrationIdentifier>, SerializedStructure> = {}, //SetupOptions<RegistrationIdentifier, SerializedStructure> = {},
  ) {
    if (this.modified) {
      throw new TransformatorAlreadySetupedError(this.type);
    }

    const transformatorIndex = Transformator.registrations.findIndex(
      transformator => transformator.type === this.type && transformator.overload === this.overload
    );

    if (transformatorIndex === -1) {
      throw new TransformatorNotFoundError(this.type);
    }

    this.modified = true;

    if (typeof this.type === 'string') {
      const transformator = new Transformator<IdentifierType, IdentifierInstance<RegistrationIdentifier>, SerializedStructure>(this.type, options);
      Transformator.registrations[transformatorIndex] = transformator;
      return transformator;
    }

    const identifierArguments = this.type.length;
    if (!options.instantiator && (options.typeIsNative ? !options.argumentPassthrough : identifierArguments > 1 || !options.argumentPassthrough)) {
      throw new InstantiationMethodDoesNotExistError(this.type);
    }

    const transformator = new Transformator<IdentifierType, IdentifierInstance<RegistrationIdentifier>, SerializedStructure>(this.type, options);
    Transformator.registrations[transformatorIndex] = transformator;
    return transformator;
  }

  public static typeToString(identifer: Transformator.Identifier) {
    return typeof identifer === 'string' ? identifer : identifer.name;
  }
}

export namespace Transformator {
  export interface SerializationBridge<Instance = unknown> {
    readonly objectrafy: Objectra.ValueSerialization;
    readonly instance: Instance;
  }

  export interface InstantiationBridge<S, V> {
    readonly instantiate: Objectra.ValueInstantiation;
    readonly value: Objectra<Objectra.Content<S>>;
    readonly instance?: V;
  }

  export namespace Transformer {
    export interface SerializationBridge<InstanceType> {
      readonly serialize: (value: unknown) => Objectra;
      readonly instance: InstanceType;
    }

    export interface InstantiationBridge<SerializedType, Instance> {
      readonly instance?: Instance;
      readonly representer: Backloop.Reference<Objectra<Objectra.Content<SerializedType>>>;
      readonly instantiateValue: Objectra.ValueInstantiation;
      readonly getRepresenterObjectra: Backloop.ResolveRepresenter;
      readonly getRepresenterValue: <T>(endpoint: Backloop.Reference<Objectra<T>>) => T;
      readonly instantiateRepresenter: <T>(endpoint: Backloop.Reference<Objectra<T>>) => T;
    }

    export type Serializator<Instance> = (bridge: SerializationBridge<Instance>) => Objectra.Content;
    export type Instantiator<Serialization, Instance> = (
      (bridge: InstantiationBridge<Serialization, Instance>) => Instance
    );
  }

  export interface Transformers<Instance, Serialized> {
    readonly serializator?: Transformer.Serializator<Instance>;
    readonly instantiator?: Transformer.Instantiator<Serialized, Instance>;
  }

  export interface Options<V, S> extends Transformers<V, S> {
    readonly overload?: number;
    readonly argumentPassthrough?: boolean;
    readonly typeIsNative?: boolean;
  }

  export type Identifier = Constructor | Function | string;
}