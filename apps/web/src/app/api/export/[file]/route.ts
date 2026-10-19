import { exportDiaryCsv, exportLibraryCsv } from "@booktrakd/api";
import { services } from "@/server/services";

const EXPORTS = { "library.csv": exportLibraryCsv, "diary.csv": exportDiaryCsv } as const;

export async function GET(req: Request, ctx: RouteContext<"/api/export/[file]">) {
  const { file } = await ctx.params;
  const build = EXPORTS[file as keyof typeof EXPORTS];
  if (!build) return new Response("Not found", { status: 404 });
  const session = await services.auth.api.getSession({ headers: req.headers });
  if (!session) return new Response("Sign in to export your data", { status: 401 });

  const csv = await build(services.db, session.user.id);
  const stamp = new Date().toISOString().slice(0, 10);
  return new Response(`﻿${csv}`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="booktrakd-${file.replace(".csv", "")}-${stamp}.csv"`,
      "Cache-Control": "private, no-store",
    },
  });
}
