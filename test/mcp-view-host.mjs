// The stand-in host for test/mcp-view.js: opens the view in a frame and
// joins it with an AppBridge, as an MCP Apps host does. window.host (the
// test's preload) runs the tool calls against the real server.
import { AppBridge, PostMessageTransport } from '@modelcontextprotocol/ext-apps/app-bridge';
window.openView = async (tool, args) => {
  document.body.replaceChildren();
  const frame = document.createElement('iframe');
  frame.style.cssText = 'width:900px;height:900px;border:0';
  document.body.append(frame);
  const bridge = new AppBridge(null, { name: 'Host', version: '1.0.0' }, { serverTools: {} }, { hostContext: { theme: window.hostTheme || 'dark' } });
  bridge.oncalltool = (params) => window.host.call(params.name, params.arguments);
  const ready = new Promise((r) => { bridge.oninitialized = r; });
  // Listen before the view loads: it says hello as soon as it starts.
  await bridge.connect(new PostMessageTransport(frame.contentWindow, frame.contentWindow));
  frame.srcdoc = await window.host.view();
  await ready;
  bridge.sendToolInput({ arguments: args });
  bridge.sendToolResult(await window.host.call(tool, args));
  window.bridge = bridge;
};
