/* eslint-env node, es2022 */
const assert = require('node:assert/strict');
const {test} = require('node:test');
const path = require('node:path');
const vm = require('node:vm');
const babel = require('@babel/core');

// Execute the actual production-generated worklet code with its captured
// closure. Calling the original JS function misses initialization-order bugs.
function fixture() {
  const jsQueue = [];
  const uiQueue = [];
  const handlers = {};
  const manual = {};
  for (const name of [
    'shouldCancelWhenOutside',
    'cancelsTouchesInView',
    'simultaneousWithExternalGesture',
  ]) {
    manual[name] = () => manual;
  }
  for (const name of [
    'onTouchesDown',
    'onTouchesMove',
    'onTouchesUp',
    'onTouchesCancelled',
    'onFinalize',
  ]) {
    manual[name] = callback => {
      handlers[name] = callback;
      return manual;
    };
  }
  const execute = (worklet, ...args) => {
    assert(
      worklet.__initData?.code,
      'Native gesture callback must compile as a worklet',
    );
    const copy = vm.runInNewContext(`(${worklet.__initData.code})`, {
      _WORKLET: true,
    });
    copy.call({__closure: worklet.__closure}, ...args);
  };
  const reanimated = {
    makeMutable: value => ({value}),
    runOnJS: callback => {
      assert.equal(
        typeof callback,
        'function',
        'Compiled worklet must capture an initialized JS receiver',
      );
      return (...args) => jsQueue.push(() => callback(...args));
    },
    runOnUI:
      callback =>
      (...args) =>
        uiQueue.push(() => execute(callback, ...args)),
  };
  const output = babel.transformFileSync(
    path.resolve(
      __dirname,
      '../../src/components/charts/interaction/nativeChartTouchGesture.ts',
    ),
    {
      envName: 'production',
      compact: false,
    },
  );
  const exports = {};
  vm.runInNewContext(output.code, {
    exports,
    global: {Error},
    require: name => {
      if (name === 'react-native-reanimated') {return reanimated;}
      if (name === 'react-native-gesture-handler')
        {return {Gesture: {Manual: () => manual}};}
      return require(name);
    },
  });
  const moves = [];
  let releases = 0;
  let nativeEnds = 0;
  exports.createNativeChartTouchGesture({}, () => ({
    onTouchMove: event => moves.push(event.nativeEvent.pageX),
    onTouchEnd: () => releases++,
  }));
  const manager = {end: () => nativeEnds++, fail: () => {}};
  const event = (x, count = 1) => {
    const point = {id: 1, x: x - 20, y: 50, absoluteX: x, absoluteY: 100};
    return {
      handlerTag: 42,
      numberOfTouches: count,
      allTouches: [point],
      changedTouches: [point],
    };
  };
  const drain = () => {
    let count = 0;
    while (jsQueue.length || uiQueue.length) {
      assert(++count < 100, 'Move delivery must drain rather than loop');
      jsQueue.shift()?.();
      uiQueue.shift()?.();
    }
  };
  return {
    execute,
    handlers,
    manager,
    event,
    jsQueue,
    drain,
    moves,
    releases: () => releases,
    nativeEnds: () => nativeEnds,
  };
}

test('compiled native worklets retain one latest move while JS is busy', () => {
  const f = fixture();
  f.execute(f.handlers.onTouchesDown, f.event(100), f.manager);
  f.drain();
  for (let x = 101; x <= 220; x++)
    {f.execute(f.handlers.onTouchesMove, f.event(x), f.manager);}
  assert.equal(f.jsQueue.length, 1);
  f.drain();
  assert.deepEqual(f.moves, [101, 220]);
});

test('compiled release commits the final position without waiting on JS', () => {
  const f = fixture();
  f.execute(f.handlers.onTouchesDown, f.event(100), f.manager);
  f.execute(f.handlers.onTouchesMove, f.event(150), f.manager);
  f.execute(f.handlers.onTouchesMove, f.event(200), f.manager);
  f.execute(f.handlers.onTouchesUp, f.event(240, 0), f.manager);
  assert.equal(f.nativeEnds(), 1);
  assert.equal(f.releases(), 0);
  f.drain();
  assert.equal(f.moves.at(-1), 240);
  assert.equal(f.releases(), 1);
});
