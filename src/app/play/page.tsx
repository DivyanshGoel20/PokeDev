import { redirect } from "next/navigation";
import { getUser } from "@/lib/auth";
import { q } from "@/lib/db";
import CatchGame from "./CatchGame";

export const dynamic = "force-dynamic";

export default async function PlayPage() {
  const me = await getUser();
  if (!me) redirect("/login");
  if (!me.has_face) redirect("/scan");
  const [{ n }] = await q<{ n: number }>("SELECT count(*)::int AS n FROM catches WHERE catcher_id = $1", [me.id]);
  return <CatchGame initialCount={Number(n)} />;
}
