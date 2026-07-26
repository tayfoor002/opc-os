import { NextResponse } from "next/server";

export function GET() {
  return NextResponse.json({
    status: "ok",
    app: "OPC OS",
    version: "2.0.0"
  });
}
