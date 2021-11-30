import type { Config } from '@jest/types';

const config: Config.InitialOptions = {
  transform: {
    ['.ts']: 'ts-jest',
  },
  testRegex: '(/__tests__/.*|\\.(test|spec))\\.(ts|js)$',
  moduleFileExtensions: [
    'ts',
    'js',
  ]
}

export default config;