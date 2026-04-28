import { NextResponse } from "next/server"

export async function GET() {
  const envVars = [
    { key: "NEXT_PUBLIC_APP_URL", value: process.env.NEXT_PUBLIC_APP_URL || "", isSecret: false },
    { key: "UAS_API_URL", value: process.env.UAS_API_URL || "", isSecret: false },
    { key: "UAS_API_KEY", value: process.env.UAS_API_KEY || "", isSecret: true },
    { key: "VSCODE_API_URL", value: process.env.VSCODE_API_URL || "", isSecret: false },
    { key: "MEMORY_AGENT_ENABLED", value: process.env.MEMORY_AGENT_ENABLED || "false", isSecret: false },
    { key: "LOAD_BALANCER_ENABLED", value: process.env.LOAD_BALANCER_ENABLED || "false", isSecret: false },
  ].filter((env) => env.value)

  return NextResponse.json(envVars)
}
