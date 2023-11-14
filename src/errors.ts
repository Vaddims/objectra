import type { Objectra } from ".";
import { Transformator } from "./transformator";

interface TransformatorErrorOptions {
  readonly solution?: string | string[];
  readonly cause?: unknown;
}

class TransformationError extends Error {
  public readonly cause?: Error;
  public readonly possibleSolutions: string[];

  constructor(message: string, options?: TransformatorErrorOptions) {
    const possibleSolutionStructure = options?.solution ?? [];
    const possibleSolutions = typeof possibleSolutionStructure === 'string' 
    ? [possibleSolutionStructure] 
    : possibleSolutionStructure;

    const composedMessage = TransformationError.composeMessage(message, possibleSolutions);
    super(composedMessage);

    this.name = this.constructor.name;
    this.possibleSolutions = possibleSolutions;
    if (options?.cause instanceof Error) {
      this.cause = options.cause;
    }
  }

  private static composeMessage(message: string, solutions: string[] = []) {
    let composedMessage = message;

    if (solutions.length > 0) {
      composedMessage += `. Possible solution${solutions.length > 1 ? 's' : ''}:`;
    }

    for (let i = 0; i < solutions.length; i++) {
      const solutionMessage = solutions[i];
      composedMessage += `\n${i}. ${solutionMessage}`;
    }

    return composedMessage;
  }
}

export class InternalError extends TransformationError {
  constructor(message: string) {
    super(`Internal error: ${message}`, {
      solution: [
        `Update the package to its latest version`,
        `If the problem is not a 'known problem', create an issue in the package repo`,
      ],
    });
  }
}

export namespace InternalError {
  export class ConsumerIdMissingError extends InternalError {
    constructor() {
      super(`Instance was not registered as reference and no reference id was found`);
    }
  }
}

export class ObjectraError extends TransformationError {}
export namespace ObjectraError {
  export class ForeignBackloopReferenceError extends ObjectraError {
    constructor(cause?: unknown) {
      super(`The backloop reference resolver got a reference that does not belong to the origin backloop tree`, {
        cause,
      });
    }
  }

  export class CompositionError extends ObjectraError {
    constructor(identifier?: Objectra.Identifier | undefined, cause?: unknown) {
      const typeName = identifier ? Transformator.typeToString(identifier) : null;
      const objectraName = typeName ? `Objectra ${typeName}` : `Objectra`;

      const solutions: string[] = [];
      if (typeName) {
        solutions.unshift(`Register (${typeName}) transformator`);
      }

      super(`${objectraName} could not compose into an instance`, {
        cause,
        solution: [
          ...solutions,
        ]
      });
    }
  }

  export class InvalidReferenceInjectionPathError extends ObjectraError {
    constructor() {
      super(`Invalid reference injection path.`, {
        solution: [
          `Make sure to correctly apply (pathKey)s in custom intantiators`,
        ]
      })
    }
  }

  export class TypeConstructorMissingError extends ObjectraError {
    constructor(instance: any) {
      super(`Instance (${instance}) constructor is missing`);
    }
  }
}

export class TransformatorError extends TransformationError {}
export namespace TransformatorError {
  const noOptionalRegistrationsMessage = 'Make sure the registration is guaranteed to be defined and is not inside of statements';
  export class TransformatorNotFoundError extends TransformatorError {
    constructor(identifier: Objectra.Identifier) {
      const typeName = Transformator.typeToString(identifier);
      super(`Transformator (${typeName}) not found`, {
        solution: [
          `Register the transformator`,
          noOptionalRegistrationsMessage,
        ],
      });
    }
  }

  export class TransformatorAncestorsNotFoundError extends TransformatorError {
    constructor(identifier: Objectra.Identifier) {
      const typeName = Transformator.typeToString(identifier);
      super(`Transformator (${typeName}) ancestors not found`);
    }
  }

  export class TransformatorRegistrationDuplicationError extends TransformatorError {
    constructor(identifier: Objectra.Identifier) {
      const typeName = Transformator.typeToString(identifier);
      super(`Transformator (${typeName}) already registered`, {
        solution: [
          `Register transformator only once`,
          noOptionalRegistrationsMessage,
        ],
      });
    }
  }

  export class TransformatorConfigSealedError extends TransformatorError {
    constructor(identifier: Objectra.Identifier) {
      const typeName = Transformator.typeToString(identifier);
      super(`Transformator config already sealed`, {
        solution: [
          `Add all config options at the initial registration`,
        ]
      });
    }
  }


  export class TransformatorSerializatorMissingError extends TransformatorError {
    constructor(identifier: Objectra.Identifier) {
      const typeName = Transformator.typeToString(identifier);
      super(`Transformator (${typeName}) does not have a serializer`, {
        solution: [
          `Add a serializer function in the registration options`,
        ]
      });
    }
  }

  export class TransformatorInstantiatorMissingError extends TransformationError {
    constructor(identifier: Objectra.Identifier) {
      const typeName = Transformator.typeToString(identifier);
      super(`Transformator (${typeName}) does not have an instantiator`, {
        solution: [
          `Add an instantiator function in the registration options`,
        ]
      });
    }
  }

  export class InvalidConstructorArgumetsError extends TransformationError {
    constructor(identifier: Objectra.Identifier, cause?: unknown) {
      const typeName = Transformator.typeToString(identifier);

      super(`Transformator (${typeName}) has invalid constructor arguments`, {
        cause,
        solution: [
          `Make sure the right data is passed to the constructor`,
          `Create a custom instantiator function to handle the instantiation`,
        ],
      })
    }
  }

  export class InvalidConstructorArgumentQuantityError extends TransformationError {
    constructor(identifier: Objectra.Identifier) {
      const typeName = Transformator.typeToString(identifier);
      const identifierConstructorArgumentQuantity = typeof identifier === 'string' ? null : identifier.length;

      const solutions: string[] = [
        `Create a custom instantiator function to handle the instantiation`,
      ];

      if (identifierConstructorArgumentQuantity !== null) {
        solutions.unshift(`Define the correct quantity of arguments. Infered quantity: ${identifierConstructorArgumentQuantity} or less`);
      }

      super(`Transformator (${typeName}) has invalid constructor argument quantity`, {
        solution: solutions,
      });
    }
  }

  export class TransformatorSelfSerializationError extends TransformationError {
    constructor(identifier: Objectra.Identifier, cause?: Error) {
      const typeName = Transformator.typeToString(identifier);
      super(`Transformator (${typeName}) transformer (serializator function) propably does not decompose its value properly`, {
        cause,
        solution: [
          `Refactor the serializator function to decompose its instance and then serialize the contents`
        ],
      })
    }
  }

  export class TransformatorSelfInstantiationError extends TransformationError {
    constructor(identifier: Objectra.Identifier, cause?: Error) {
      const typeName = Transformator.typeToString(identifier);
      super(`Transformator (${typeName}) transformer (instantiator function) propably does not compose its value properly`, {
        cause,
        solution: [
          `Refactor the instantiator function to compose its instance manualy instead of explicitly instantiating it with the bridge`
        ],
      })
    }
  }

  export class ConstructorArgumentIndexDuplicationError extends TransformationError {
    constructor(identifier: Objectra.Identifier, index: number) {
      const typeName = Transformator.typeToString(identifier);
      super(`Transformator (${typeName}) constructor argument for at index (${index}) already setted`, {
        solution: [
          `Make sure constructor argument index don't repeat`,
          `Create a custom serializator and instantiator function to handle the transformation process`,
        ]
      });
    }
  }

  export class TransformatorInvalidTypeError extends TransformationError {
    constructor(identifier: Objectra.Identifier) {
      const typeName = Transformator.typeToString(identifier);
      super(`Transformator (${typeName}) has an invalid type`);
    }
  }
}
