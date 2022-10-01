import { Objectra } from '../src';

const number = 42;
const string = 'Hello world';
const boolean = true;

describe('test objectra serialization and instantiation', () => {
	describe('primitives', () => {
		test('undefined', () => {
			expect(Objectra.from(undefined).instantiate()).toBe(undefined);
		});

		test('null', () => {
			expect(Objectra.from(null).instantiate()).toBe(null);
		});

		test('string', () => {
			expect(Objectra.from(string).instantiate()).toBe(string);
		});

		test('number', () => {
			expect(Objectra.from(number).instantiate()).toBe(number);
			expect(Objectra.from(NaN).instantiate()).toBe(NaN);
		});

		test('boolean', () => {
			expect(Objectra.from(boolean).instantiate()).toBe(boolean);
		});

		test('symbol', () => {
			const instantiatedSymbol = Objectra.from(Symbol('test')).instantiate() as symbol;
			expect(instantiatedSymbol.description).toBe(Symbol('test').description);
		});

		test('bigint', () => {
			expect(Objectra.from(BigInt(number)).instantiate()).toBe(BigInt(number));
		});
	});

	describe('simple instances', () => {
		test('date', () => {
			const date = new Date();
			const objectraDate = Objectra.from(date).instantiate();
			expect(objectraDate).toStrictEqual(date);
			expect(objectraDate).not.toBe(date);
		});

		test('array', () => {
			const array = [number, string, boolean];
			const objectraArray = Objectra.from(array).instantiate();
			expect(objectraArray).toStrictEqual(array);
			expect(objectraArray).not.toBe(array);
		});

		test('object', () => {
			const object = {
				number,
				string,
				boolean,
			};
			const objectraObject = Objectra.from(object).instantiate();
			expect(objectraObject).toStrictEqual(object);
			expect(objectraObject).not.toBe(object);
		});

		test('map', () => {
			const map = new Map<string, unknown>([
				['number', number],
				['string', string],
				['boolean', boolean],
			]);
			const objectraMap = Objectra.from(map).instantiate();
			expect(objectraMap).toStrictEqual(map);
			expect(objectraMap).not.toBe(map);
		});

		test('set', () => {
			const set = new Set<unknown>([number, string, boolean]);
			const objectraSet = Objectra.from(set).instantiate();
			expect(objectraSet).toStrictEqual(set);
			expect(objectraSet).not.toBe(set);
		});
	})

	describe('complex instances', () => {
		test('array', () => {
			const array = [number, string, boolean, new Set([number, string, boolean])];

			const objectraArray = Objectra.from(array).instantiate();
			expect(objectraArray).toStrictEqual(array);
			expect(objectraArray).not.toBe(array);
		});

		test('object', () => {
			const object = {
				number,
				string,
				boolean,
				object: { number, string, boolean },
				set: new Set([string]),
				map: new Map(),
			};

			const objectraObject = Objectra.from(object).instantiate();
			expect(objectraObject).toStrictEqual(object);
			expect(objectraObject).not.toBe(object);
		});

		test('map', () => {
			const map = new Map<string, unknown>([
				['number', number],
				['string', string],
				['boolean', boolean],
				['array', [number, string, boolean]],
				['object', { number, string, boolean }],
				['set', new Set([number, string, boolean])],
			]);

			const objectraMap = Objectra.from(map).instantiate();
			expect(objectraMap).toStrictEqual(map);
			expect(objectraMap).not.toBe(map);
		});

		test('set', () => {
			const set = new Set<unknown>([number, string, boolean, new Set([number, string, boolean])]);

			const objectraSet = Objectra.from(set).instantiate();
			expect(objectraSet).toStrictEqual(set);
			expect(objectraSet).not.toBe(set);
		});
	});
});
