import { getUser } from "@/lib/auth";
import { publicUserById } from "@/lib/users";
import Settings from "./Settings";

export default async function MePage() {
  const me = (await getUser())!;
  const user = (await publicUserById(me.id))!;
  return <Settings user={user} catchable={me.catchable} hasFace={me.has_face} />;
}
