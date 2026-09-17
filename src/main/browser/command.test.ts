/* eslint-disable no-script-url -- Regression test for rejecting script URLs. */
import { normalizeBrowserUrl, parseBrowserCommands } from './command';

describe('managed browser commands', () => {
  it('parses sequential commands and preserves literal page text', () => {
    expect(
      parseBrowserCommands(
        'agent-browser fill "#name" "hello world" && snapshot -i',
      ),
    ).toEqual([
      ['fill', '#name', 'hello world'],
      ['snapshot', '-i'],
    ]);
    expect(parseBrowserCommands("eval 'document.title = `$HOME`'")).toEqual([
      ['eval', 'document.title = `$HOME`'],
    ]);
    expect(parseBrowserCommands('agent-browser --json tab list')).toEqual([
      ['tab', 'list', '--json'],
    ]);
  });

  it.each([
    'agent-browser --session other open example.com',
    'open example.com --cdp=9222',
    'open example.com --config /tmp/other.json',
    'connect 9222',
    '--json connect 9222',
    'close --all',
    'batch "connect 9222"',
    'snapshot | cat',
    'snapshot; rm -rf /tmp/x',
    'snapshot > /tmp/out',
    'snapshot &&',
    '--json',
  ])('rejects connection escape or shell execution: %s', (command) => {
    expect(() => parseBrowserCommands(command)).toThrow();
  });

  it.each([
    ['localhost:3000', 'http://localhost:3000/'],
    ['127.0.0.1:8080/a', 'http://127.0.0.1:8080/a'],
    ['example.com', 'https://example.com/'],
    ['about:blank', 'about:blank'],
  ])('normalizes %s', (input, expected) =>
    expect(normalizeBrowserUrl(input)).toBe(expected),
  );

  it.each(['javascript:alert(1)', 'devtools://inspect', 'chrome://settings'])(
    'rejects application/internal URL %s',
    (url) => {
      expect(() => normalizeBrowserUrl(url)).toThrow();
    },
  );
});
