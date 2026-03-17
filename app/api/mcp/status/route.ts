import { NextResponse } from "next/server";

export async function GET() {
  const connected = !!(process.env.MCP_SERVER_URL && process.env.MCP_SERVER_URL.trim());
  return NextResponse.json({ connected });
}
