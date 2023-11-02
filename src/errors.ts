import type { Objectra } from ".";
import { Transformator } from "./transformator";

interface TransformatorErrorOptions {
  readonly solution?: string;
  readonly cause?: unknown;
}

export class TransformatorError extends Error {
  public readonly cause?: Error;

  constructor(message: string, options?: TransformatorErrorOptions) {
    const { solution, cause } = options || {};


    let composedMessage = message;
    if (solution) {
      composedMessage += `\n-> ${solution}`;
    }
    
    super(composedMessage);

    this.name = this.constructor.name;
    if (cause instanceof Error) {
      this.cause = cause;
    }
  }
}

export class TransformatorNotFoundError extends TransformatorError {
  constructor(identifier: Objectra.Identifier) {
    const typeName = Transformator.typeToString(identifier)
    super(`The transformator for ${typeName} type is not registered.`);
  }
}

export class TransformatorAlreadyRegisteredError extends TransformatorError {
  constructor(identifier: Objectra.Identifier) {
    const typeName = Transformator.typeToString(identifier)
    super(`The transformator for ${typeName} type is already registered.`);
  }
}

export class TransformatorAlreadyConfiguredError extends TransformatorError {
  constructor(identifier: Objectra.Identifier) {
    const typeName = Transformator.typeToString(identifier);
    super(`The transformator for ${typeName} type is already configured.`);
  }
}

export class TransformatorMatchNotFoundError extends TransformatorError {
  constructor(identifier: Objectra.Identifier) {
    const typeName = Transformator.typeToString(identifier)
    super(`The transformator for ${typeName} type or its ancestors is not registered.`);
  }
}

export class SerializationMethodDoesNotExistError extends TransformatorError {
  constructor(identifier: Objectra.Identifier) {
    const typeName = Transformator.typeToString(identifier)
    super(`The transformator for ${typeName} type doesn't have a serialization method`);
  }
}

export class InstantiationMethodDoesNotExistError extends TransformatorError {
  constructor(identifier: Objectra.Identifier) {
    const typeName = Transformator.typeToString(identifier)
    super(`The transformator for ${typeName} type doesn't have a instantiation method`);
  }
}

export class InvalidPassthroughArgumentError extends TransformatorError {
  constructor(identifier: Objectra.Identifier, cause?: unknown) {
    const typeName = Transformator.typeToString(identifier)
    super(`The serialized value cannot be passed to the ${typeName} constructor as argument`, {
      solution: `Create an instantiation method for the type or change the serialization method to return a valid argument value for the type.`,
      cause,
    });
  }
}

export class InvalidInstantiationArgumentQuantityError extends TransformatorError {
  constructor(identifier: Objectra.Identifier, cause?: unknown) {
    const typeName = Transformator.typeToString(identifier);
    super(`Can not passthrough arguments to the ${typeName} constructor while it takes more than one argument`, {
      solution: `Create an instantiation method for the type.`,
      cause,
    });
  }
}

export class SelfSerializationError extends TransformatorError {
  constructor(identifier: Objectra.Identifier, cause?: unknown) {
    const typeName = Transformator.typeToString(identifier);
    super(`Can not serialize a value of its own type in the ${typeName} transfromator`, {
      solution: `Refactor the serialization method to not use the serialize method on the instance itself.`,
      cause,
    });
  }
}

export class SelfInstantiationError extends TransformatorError {
  constructor(identifier: Objectra.Identifier, cause?: unknown) {
    const typeName = Transformator.typeToString(identifier);
    super(`Can not instantiate a value of its own type in the ${typeName} transfromator`, {
      solution: `Refactor the instatiation method to not use the instantiate method on the serialized value itself.`,
      cause,
    });
  }
}

export class ForeignBackloopReferenceError extends TransformatorError {
  constructor(cause?: unknown) {
    super(`The passed object to the reference resolver does not belong to the backloop reference tree`, {
      solution: `Use the specialy created backloop reference tree as a value to the instantiation function`,
      cause,
    });
  }
}

export class ArgumentPassthroughIndexAlreadyExistsError extends TransformatorError {
  constructor(identifier: Objectra.Identifier | undefined, index: number) {
    const typeName = identifier ? Transformator.typeToString(identifier) : '(ts5 unknown identifier)';
    super(`Can not set more than 1 passthrough argument at the index ${index} in the ${typeName} transformator`, {
      solution: `Make sure that you do not repeat the indexes on the passthrough arguments`,
    });
  }
}

export class ArgumentPassthroughIncompatiblanceError extends TransformatorError {
  constructor(identifier?: Objectra.Identifier) {
    const typeName = identifier ? Transformator.typeToString(identifier) : '(ts5 unknown identifier)';
    super(`Can not set argument passthrough property key(s) when the argument passthrough is enabled in the ${typeName} transformator`, {
      solution: `Disable the argument passthrough option on the transformator`,
    });
  }
}