module.exports={
 preset:'jest-expo',
 testMatch:['<rootDir>/test/**/*.test.ts','<rootDir>/test/**/*.test.tsx'],
 setupFiles:['<rootDir>/test/env.cjs'],
 setupFilesAfterEnv:['<rootDir>/test/setup.ts'],
 clearMocks:true
};
