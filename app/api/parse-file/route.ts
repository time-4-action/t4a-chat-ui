import { auth0 } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const session = await auth0.getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "No file" }, { status: 400 });

  const name = file.name.toLowerCase();
  const buffer = Buffer.from(await file.arrayBuffer());

  try {
    if (name.endsWith(".docx")) {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const mammoth = require("mammoth");
      const result = await mammoth.extractRawText({ buffer });
      return NextResponse.json({ text: result.value });
    }

    if (name.endsWith(".xlsx") || name.endsWith(".xls") || name.endsWith(".ods")) {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const XLSX = require("xlsx");
      const workbook = XLSX.read(buffer, { type: "buffer" });
      const parts: string[] = [];
      for (const sheetName of workbook.SheetNames) {
        const csv = XLSX.utils.sheet_to_csv(workbook.Sheets[sheetName]);
        if (csv.trim()) parts.push(`Sheet: ${sheetName}\n${csv}`);
      }
      return NextResponse.json({ text: parts.join("\n\n") });
    }

    return NextResponse.json({ error: "Unsupported file type" }, { status: 400 });
  } catch (err) {
    console.error("[parse-file]", err);
    return NextResponse.json({ error: "Parse failed" }, { status: 500 });
  }
}
