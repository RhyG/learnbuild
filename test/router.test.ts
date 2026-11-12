import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { routeMessage } from '../src/router/router.js';

describe('router', () => {
  for (const text of [
    'what is a token?',
    'why?',
    'how is that different?',
    'show me an example',
    'ok go ahead and build it',
    'sessions',
    'yes',
  ]) {
    test(`free text "${text}" falls back to a non-mutating question`, () => {
      const route = routeMessage(text);
      assert.equal(route.intent, 'question');
      assert.equal(route.source, 'fallback');
      assert.equal(route.mutatesWorkflow, false);
    });
  }

  test('slash commands map to their intent and keep the argument', () => {
    assert.equal(routeMessage('/learn-resume').intent, 'resume');
    assert.equal(routeMessage('/learn-progress').intent, 'progress');
    const explain = routeMessage('/learn-explain src/auth');
    assert.equal(explain.intent, 'explain_code');
    assert.equal(explain.argument, 'src/auth');
    assert.equal(explain.mutatesWorkflow, false);
  });

  test('/learn-build and /learn-decide are the only mutating slash commands', () => {
    const build = routeMessage('/learn-build');
    assert.equal(build.mutatesWorkflow, true);
    assert.deepEqual(build.permittedOperations, ['start_task']);
    const decide = routeMessage('/learn-decide sessions');
    assert.equal(decide.mutatesWorkflow, true);
    assert.deepEqual(decide.permittedOperations, ['resolve_decision']);
    assert.equal(decide.argument, 'sessions');
    for (const command of ['/learn-resume', '/learn-progress', '/learn-ask why', '/learn-explain src']) {
      assert.equal(routeMessage(command).mutatesWorkflow, false, command);
    }
  });

  test('unknown slash commands are treated as questions', () => {
    assert.equal(routeMessage('/learn-hack --force').mutatesWorkflow, false);
  });

  test('confident non-mutating classifications are honoured; low confidence falls back', () => {
    assert.equal(routeMessage('where is the login handler?', { intent: 'explain_code', confidence: 0.9 }).intent, 'explain_code');
    assert.equal(routeMessage('hmm', { intent: 'progress', confidence: 0.3 }).intent, 'question');
  });

  test('classifier-proposed side effects need explicit confirmation', () => {
    const route = routeMessage('build the login page', { intent: 'implementation_request', confidence: 1 });
    assert.equal(route.mutatesWorkflow, false);
    assert.equal(route.confirmationNeededFor, 'implementation_request');
  });
});
