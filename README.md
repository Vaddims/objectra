# Objectra

Utility for deep object duplication, serialization and parsing.

# Install

```bash
npm install objectra
```

# Usage

## Basic functionality with built-in [transformators](#transformators)

Import the Objectra class

```typescript
const { Objectra } = require('objectra');
```

Let's say we want to copy a value without losing any data (for example object inheritance) but remove all object references. In this case the `duplicate` method will help.

```typescript
const set = new Set<string>(['Hello world']);
const duplicatedValue = Objectra.duplicate(set);
```

But sometimes we may have another need for example to serialize a value into a pure object.

```typescript
const serializedSet = Objectra.serialize(set);
```

The returned data from the above method will return an object with the Objectra schema which gives the ability to parse it at any time.

```typescript
const parsedSet = Objectra.parse(serializedSet);
```
## Transformators

A Transformator is a set of transformers (parsing instructions) that Objectra uses to parse values. Each class has its own transformator. Objectra does not support implicit parsing of a class object and therefore if we try to parse a class instance that does not have a transformator registered it will throw an error.

__Built-in class transformators:__

* All primitives (including Symbol and BigInt)
* Object
* Array
* Objectra
* Map
* Set

## Transformator creation

To understand how a transformator works we first create a class.

```typescript
class Point {
    constructor(public x: number, public y: number) {}
}
```

Now we can create a transformator for the class. Let's add 2 methods in it: 

* __construct__ which takes as an argument the value that was in the class before serialization and returns an instance of the class
* __simplify__ which takes an instance of a class as an argument and returns it as a pure object (object or array) or even as a primitive value

```typescript
Objectra.addTransformator(Point, {
    construct: (content: any) => new Point(content.x, content.y),
    simplify: (point: Point) => ({ ...point }),
});
```

And it's all! We can now use Objectra to manage all future Point instances.

# License

[ISC](https://choosealicense.com/licenses/isc/)


# Author
- [Vaddims](https://github.com/Vaddims)