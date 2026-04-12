import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

// Path to the auslaw-mcp server entry point
const SERVER_PATH = process.env.AUSLAW_MCP_PATH || "/var/www/auslaw-mcp/dist/index.js";

let client: Client | null = null;
let connecting: Promise<Client> | null = null;

async function getClient(): Promise<Client> {
  if (client) return client;
  if (connecting) return connecting;

  connecting = (async () => {
    const transport = new StdioClientTransport({
      command: "node",
      args: [SERVER_PATH],
    });

    const c = new Client({ name: "auslaw-test", version: "1.0.0" });
    await c.connect(transport);
    client = c;
    connecting = null;
    return c;
  })();

  return connecting;
}

export async function listTools() {
  const c = await getClient();
  const result = await c.listTools();
  return result.tools;
}

export async function callTool(name: string, args: Record<string, unknown>) {
  const c = await getClient();
  const result = await c.callTool({ name, arguments: args });
  return result.content;
}
