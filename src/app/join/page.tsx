import { redirect } from "next/navigation";
import { getUser } from "@/lib/auth";
import JoinForm from "./JoinForm";
import { FreshOnBack } from "@/components/FreshOnBack";

export const dynamic = "force-dynamic";

/** Already signed in? Never show this form again: go straight to the app. */
export default async function Page() {
  const me = await getUser();
  if (me) redirect(me.has_face ? "/" : "/scan");
  return (
    <>
      <FreshOnBack />
      <JoinForm />
    </>
  );
}
