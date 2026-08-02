# Vendored identity codecs

This directory contains the minimal third-party-derived codec logic needed by Gitplane identities. It is private package implementation, not a general-purpose codec API.

## `ulid.ts`

- Upstream: [`ulid`](https://github.com/ulid/javascript), npm package version `3.0.2`
- Source inspected: `dist/node/index.js` from the `ulid@3.0.2` package
- License: MIT
- Upstream copyright: Copyright (c) 2017 Alizain Feerasta
- Copied scope: canonical alphabet and limits, timestamp encoding, cryptographically secure random-character generation, and validation rules
- Local modifications: reduced to lowercase canonical ULID generation and validation; uses Node's `randomBytes` directly and maps each uniformly random byte to its high five bits; removes decoding, UUID conversion, monotonic generation, browser/runtime PRNG discovery, public error types, and case-insensitive validation

## `crockford-base32.ts`

- Upstream: [`@scure/base`](https://github.com/paulmillr/scure-base), npm package version `2.2.0`
- Source inspected: `index.ts` and published `index.js` from the `@scure/base@2.2.0` package
- License: MIT
- Upstream copyright: Copyright (c) 2022 Paul Miller (<https://paulmillr.com>)
- Copied scope: the power-of-two radix conversion used by `base32crockford.encode` and the Crockford alphabet
- Local modifications: reduced to byte-to-unpadded-lowercase encoding; removes decoding, normalization, generic codec composition, and all unrelated bases; renames helpers and errors for the local capability

Gitplane-specific framing, hashing, artifact validation, and revision/event identity composition remain outside this directory.

## MIT license — `ulid`

Copyright (c) 2017 Alizain Feerasta

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

## MIT license — `@scure/base`

Copyright (c) 2022 Paul Miller (<https://paulmillr.com>)

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
