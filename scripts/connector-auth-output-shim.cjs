const active = process.env.CODEXPRO_CONNECTOR_AUTH_OUTPUT_SHIM === '1';
const previousNodeOptions = process.env.CODEXPRO_CONNECTOR_AUTH_PREVIOUS_NODE_OPTIONS;

if (previousNodeOptions) process.env.NODE_OPTIONS = previousNodeOptions;
else delete process.env.NODE_OPTIONS;
delete process.env.CODEXPRO_CONNECTOR_AUTH_OUTPUT_SHIM;
delete process.env.CODEXPRO_CONNECTOR_AUTH_PREVIOUS_NODE_OPTIONS;

if (active) {
  const originalSet = URLSearchParams.prototype.set;
  let connectorToken = '';

  URLSearchParams.prototype.set = function set(name, value) {
    if (String(name) === 'codexpro_token') {
      connectorToken = String(value);
      return undefined;
    }
    return originalSet.call(this, name, value);
  };

  const originalLog = console.log.bind(console);
  console.log = (...args) => {
    const rewritten = args.map((arg) => {
      if (typeof arg !== 'string') return arg;
      return arg
        .replace('  Authentication: No Authentication / None', '  Authentication: Bearer header (compatible MCP clients only; not ChatGPT Web)')
        .replace('If your ChatGPT UI supports custom headers instead, you can use:', 'For a compatible MCP client (not ChatGPT Web), use this authorization header:')
        .replace(
          '  2. Paste the Server URL above and choose Authentication: No Authentication.',
          '  2. Use the token-free Server URL above in a compatible MCP client and configure Authorization: Bearer with the token shown below.'
        )
        .replace(
          '  POST /mcp -> 401 The full Server URL, including codexpro_token, was not used.',
          '  POST /mcp -> 401 The Authorization: Bearer header was missing or invalid.'
        )
        .replace(
          'Next: press Enter to open ChatGPT, paste the copied Server URL, choose Authentication: None.',
          'Next: use the token-free Server URL only with a compatible MCP client that can send Authorization: Bearer; not ChatGPT Web.'
        )
        .replace(
          'Keys: Enter open | c copy | o status | h help | q quit',
          'Keys: c copy | h help | q quit'
        );
    });

    if (
      connectorToken &&
      rewritten.some((arg) => typeof arg === 'string' && arg.startsWith('Next: use the token-free Server URL'))
    ) {
      originalLog(`  Authorization: Bearer ${connectorToken}`);
    }
    originalLog(...rewritten);
  };
}
