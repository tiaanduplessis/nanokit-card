'use strict'

const assert = require('assert')
const fs = require('fs')
const path = require('path')
const vm = require('vm')
const childProcess = require('child_process')

// Fresh processes select the actual development/production package entrypoints.
if (!process.env.CARD_TEST_MODE) {
  for (const mode of ['development', 'production']) {
    const result = childProcess.spawnSync(process.execPath, [__filename], {
      env: Object.assign({}, process.env, { NODE_ENV: mode, CARD_TEST_MODE: mode }),
      stdio: 'inherit'
    })
    if (result.error) throw result.error
    assert.strictEqual(result.status, 0, mode + ' tests failed')
  }
} else {
  run()
}

function run () {
  const React = require('react')
  const renderer = require('react-test-renderer')
  const runtime = process.env.CARD_TEST_RUNTIME
    ? path.resolve(process.env.CARD_TEST_RUNTIME)
    : __dirname
  const PropTypes = require(require.resolve('prop-types', { paths: [runtime] }))
  const propTypesVersion = require(require.resolve('prop-types/package.json', { paths: [runtime] })).version
  const babel = require('@babel/standalone')
  const filename = path.resolve(process.env.CARD_TEST_SOURCE || path.join(__dirname, '..', 'index.js'))
  const source = fs.readFileSync(filename, 'utf8')
  const compiled = babel.transform(source, {
    filename: filename,
    presets: ['react'],
    plugins: ['transform-modules-commonjs']
  }).code
  const expectedStyle = {
    borderRadius: 2,
    backgroundColor: '#fff',
    shadowColor: 'rgba(0, 0, 0, 0.4)',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.9,
    shadowRadius: 2,
    elevation: 2
  }
  let passed = 0
  let validationId = 0
  function warnings (check) {
    const messages = []
    const original = console.error
    console.error = function () { messages.push(Array.from(arguments).join(' ')) }
    try { check() } finally { console.error = original }
    return messages
  }
  function freeze (value) {
    if (value && typeof value === 'object' && !Object.isFrozen(value)) {
      Object.keys(value).forEach(function (key) { freeze(value[key]) })
      Object.freeze(value)
    }
    return value
  }

  for (const inherited of [false, true]) {
    const styleCalls = []
    // Real React rendering with JavaScript host doubles, not native device tests.
    function View (props) { return React.createElement('NativeView', props) }
    if (inherited) {
      View.propTypes = {
        nativeFlag: PropTypes.bool,
        style: PropTypes.any,
        margin: PropTypes.any,
        width: PropTypes.any,
        height: PropTypes.any
      }
    }
    const native = {
      View: View,
      StyleSheet: {
        create: function (styles) {
          styleCalls.push(styles)
          return freeze(styles)
        }
      }
    }
    const exports = {}
    const imports = { react: React, 'react-native': native, 'prop-types': PropTypes }
    const wrapper = vm.runInThisContext('(function(require, exports) {\n' + compiled + '\n})', { filename: filename })
    wrapper(function (name) {
      assert(Object.prototype.hasOwnProperty.call(imports, name), 'Unexpected import: ' + name)
      return imports[name]
    }, exports)
    const Card = exports.default
    function test (name, check) {
      check()
      passed++
      console.log('ok - ' + process.env.NODE_ENV + ' - View.propTypes=' + inherited + ' - ' + name)
    }
    function render (props, check) {
      const messages = warnings(function () {
        const tree = renderer.create(React.createElement(Card, props))
        try { check(tree.root.findByType('NativeView'), tree) } finally { tree.unmount() }
      })
      // React 16 may diagnose the existing uppercase declaration. Preserve it.
      assert(messages.every(function (message) {
        return message.includes('PropTypes') && message.includes('propTypes')
      }), messages.join('\n'))
    }
    function validate (props) {
      return warnings(function () {
        // Unique names also avoid the old 15.6.0 warning cache (no reset API).
        PropTypes.checkPropTypes(Card.PropTypes, props, 'prop', 'CardFixture' + (++validationId))
      })
    }

    test('default export, defaults and declared validator identities are unchanged', function () {
      assert.deepStrictEqual(Object.keys(exports), ['default'])
      assert.strictEqual(typeof Card, 'function')
      assert.deepStrictEqual(Card.defaultProps, { margin: 10 })
      assert.strictEqual(Object.prototype.hasOwnProperty.call(Card, 'propTypes'), false)
      const keys = ['style', 'margin', 'width', 'height'].concat(inherited ? ['nativeFlag'] : [])
      assert.deepStrictEqual(Object.keys(Card.PropTypes).sort(), keys.sort())
      assert.strictEqual(Card.PropTypes.style, PropTypes.object)
      for (const key of ['margin', 'width', 'height']) assert.strictEqual(Card.PropTypes[key], PropTypes.number)
      if (inherited) assert.strictEqual(Card.PropTypes.nativeFlag, View.propTypes.nativeFlag)
    })

    test('React applies margin defaults only to omitted and undefined values', function () {
      for (const props of [{}, { margin: undefined }, { margin: 0 }, { margin: 7 }, { margin: null }]) {
        render(freeze(props), function (view) {
          assert.deepStrictEqual(view.props.style[1], {
            width: undefined, height: undefined,
            margin: props.margin === undefined ? 10 : props.margin
          })
        })
      }
    })

    test('dimensions preserve omitted, undefined, zero, positive and null values', function () {
      for (const dimensions of [{}, { width: undefined, height: undefined }, { width: 0, height: 0 }, { width: 250, height: 100 }, { width: null, height: null }]) {
        render(freeze(dimensions), function (view) {
          assert.deepStrictEqual(view.props.style[1], { width: dimensions.width, height: dimensions.height, margin: 10 })
          for (const key of ['width', 'height', 'margin']) assert(!Object.prototype.hasOwnProperty.call(view.props, key))
        })
      }
    })

    test('style layers keep caller objects and arrays last without mutation', function () {
      const styles = [undefined, null, freeze({ margin: 0, elevation: 9 }), freeze([{ width: 400 }, { borderRadius: 8 }])]
      for (const style of styles) {
        const props = freeze({ style: style, width: 100, height: 50, margin: 5 })
        render(props, function (view) {
          assert.strictEqual(view.props.style.length, 3)
          assert.strictEqual(view.props.style[0], styleCalls[0].card)
          assert.deepStrictEqual(view.props.style[0], expectedStyle)
          assert.deepStrictEqual(view.props.style[1], { width: 100, height: 50, margin: 5 })
          assert.strictEqual(view.props.style[2], style)
        })
      }
    })

    test('children identity, multiplicity and empty children are preserved', function () {
      const first = React.createElement('Text', { key: 'first' }, 'one')
      const second = React.createElement('Text', { key: 'second' }, 'two')
      for (const children of [undefined, null, first, freeze([first, second]), 'text']) {
        render(freeze({ children: children }), function (view) {
          assert.strictEqual(view.props.children, children)
          const expected = children === first ? 1 : Array.isArray(children) ? 2 : 0
          assert.strictEqual(view.findAllByType('Text').length, expected)
        })
      }
    })

    test('rest props and callbacks retain identity and invocation behavior', function () {
      const calls = []
      const event = freeze({ nativeEvent: { layout: { width: 50 } } })
      const onLayout = function (value) { calls.push(value) }
      const arbitrary = freeze({ nested: ['a'] })
      const props = freeze({ testID: 'card', accessibilityLabel: 'Card label', onLayout: onLayout, arbitrary: arbitrary, nativeFlag: true })
      render(props, function (view) {
        for (const key of Object.keys(props)) assert.strictEqual(view.props[key], props[key])
        assert.deepStrictEqual(Object.keys(view.props).sort(), Object.keys(props).concat(['style', 'children']).sort())
        assert.deepStrictEqual(calls, [])
        view.props.onLayout(event)
        assert.deepStrictEqual(calls, [event])
      })
    })

    test('explicit declared checks accept numeric dimensions and object style', function () {
      assert.deepStrictEqual(validate(freeze({ width: 0, height: 200, margin: 4, style: { opacity: 0.5 }, nativeFlag: true })), [])
      for (const value of [undefined, null]) {
        assert.deepStrictEqual(validate({ width: value, height: value, margin: value, style: value, nativeFlag: value }), [])
      }
    })

    test('explicit invalid declared checks warn only in development without crashing', function () {
      const invalid = { width: 'wide', height: 'tall', margin: 'small', style: 'wrong' }
      if (inherited) invalid.nativeFlag = 'yes'
      for (const key of Object.keys(invalid)) {
        const messages = validate({ [key]: invalid[key] })
        if (process.env.NODE_ENV === 'development') {
          assert.strictEqual(messages.length, 1, key)
          assert(messages[0].includes('`' + key + '`'), messages[0])
        } else assert.deepStrictEqual(messages, [])
      }
      // Array styles render unchanged above but the existing object declaration warns.
      const arrayWarnings = validate({ style: [] })
      assert.strictEqual(arrayWarnings.length, process.env.NODE_ENV === 'development' ? 1 : 0)
      if (arrayWarnings.length) assert(arrayWarnings[0].includes('`style`'))
    })

    test('uppercase declarations do not silently enable automatic React validation', function () {
      const messages = warnings(function () {
        const tree = renderer.create(React.createElement(Card, { width: 'unchanged-invalid-value' }))
        try { assert.strictEqual(tree.root.findByType('NativeView').props.style[1].width, 'unchanged-invalid-value') } finally { tree.unmount() }
      })
      assert(!messages.some(function (message) { return message.includes('Failed prop type') }))
    })

    test('updates preserve style ordering and create base styles only at module load', function () {
      render({}, function (view, tree) {
        for (const props of [{ width: 0, margin: 0 }, { style: { margin: 9 } }, { height: null, children: 'updated' }, {}]) {
          tree.update(React.createElement(Card, freeze(props)))
          const updated = tree.root.findByType('NativeView')
          assert.strictEqual(updated.props.style[0], styleCalls[0].card)
          assert.strictEqual(updated.props.style[2], props.style)
          assert.strictEqual(updated.props.children, props.children)
          assert.strictEqual(updated.props.style[1].margin, props.margin === undefined ? 10 : props.margin)
        }
      })
      assert.strictEqual(styleCalls.length, 1)
      assert.deepStrictEqual(styleCalls[0], { card: expectedStyle })
    })
  }
  console.log(passed + ' checks passed (' + process.env.NODE_ENV + ', React ' + React.version + ', prop-types ' + propTypesVersion + ')')
}
