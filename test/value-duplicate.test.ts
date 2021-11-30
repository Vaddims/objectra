import { Objectra } from '../src';

const { duplicate } = Objectra;

describe('test value duplication', () => {
	const string = 'Hello world';
	const number = 42;
	const boolean = true;

	test('primitives', () => {
		const symbol = Symbol(string);
		const bigint = BigInt(number);

		expect(duplicate(undefined)).toBe(undefined);
		expect(duplicate(null)).toBe(null);
		expect(duplicate(NaN)).toBe(NaN);
		expect(duplicate(string)).toBe(string);
		expect(duplicate(number)).toBe(number);
		expect(duplicate(boolean)).toBe(boolean);
		expect(duplicate(symbol)).not.toBe(symbol);
		expect((duplicate(symbol) as symbol).description).toBe(symbol.description); // Jest can't compare 2 symbols
		expect(duplicate(bigint)).toStrictEqual(bigint);
	});

	describe('objects', () => {
		test('Object', () => {
			const object = { foo: number };
			expect(duplicate(object)).toStrictEqual(object);
			expect(duplicate(object)).not.toBe(object);
		});

		test('Array', () => {
			const array = [string];
			expect(duplicate(array)).toStrictEqual(array);
			expect(duplicate(array)).not.toBe(array);
		});

		test('Objectra', () => {
			const objectra = new Objectra(Objectra, { content: new Objectra(String, string) });
			expect(duplicate(objectra)).toEqual(objectra);
			expect(duplicate(objectra)).not.toBe(objectra);
		});

		test('Map', () => {
			const map = new Map([[string, number]]);
			expect(duplicate(map)).toStrictEqual(map);
			expect(duplicate(map)).not.toBe(map);
		});

		test('Set', () => {
			const set = new Set([string, number, boolean]);
			expect(duplicate(set)).toStrictEqual(set);
			expect(duplicate(set)).not.toBe(set);
		});
	});
});
