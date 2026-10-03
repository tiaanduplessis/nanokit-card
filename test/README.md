# JavaScript regression tests

This opt-in fixture uses Node.js 16 or newer, React and react-test-renderer
16.14.0, prop-types 15.8.1, and Babel standalone 7.29.9. It avoids installing
the legacy root development tools or the wildcard React Native peer.

From the repository root:

```sh
npm ci --prefix test --ignore-scripts --no-audit --no-fund
npm run test:regression
```

Separate development and production processes transform the actual JSX source,
render with real React, and supply in-memory React Native View/StyleSheet host
doubles. They cover default margin, dimensions including zero/null, style
layering, frozen props, children identity, forwarded props/callbacks, updates,
base styles, and both populated and missing View.propTypes.

The existing capitalized `Card.PropTypes` is deliberately unchanged. Tests call
the real `PropTypes.checkPropTypes` explicitly against these declarations;
React does not automatically validate them. In particular, array styles remain
renderable but fail the existing object-only declaration in development.

For a package installed in a separate consumer, use that package's source and
its resolved runtime (point inside the package to handle nested dependencies):

```sh
CARD_TEST_SOURCE=/absolute/path/to/consumer/node_modules/nanokit-card/index.js \
CARD_TEST_RUNTIME=/absolute/path/to/consumer/node_modules/nanokit-card \
npm run test:regression
```

The same runtime override can compare an independently audited installation of
the former locked prop-types 15.6.0. The runner supports its older warning-cache
API by using unique names for explicit validation checks.

These are JavaScript contract tests, not native Android/iOS device tests or a
guarantee for every wildcard peer version. The published entry still contains
JSX/ES modules and requires a compatible React Native bundler. The root
`npm test` remains a legacy mutating formatter, separate from this suite.
The test directory is excluded by the unchanged published `files` whitelist.
