import { useEffect, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import InvitationDocumentView from "./InvitationDocumentView";
import GuestPublicForms from "../guests/GuestPublicForms";
import { isInvitationDocument, type InvitationDocument } from "./document";

type PublicInvitationData = {
  slug: string;
  title: string;
  locale: string;
  timezone: string;
  document: unknown;
};

export default function PublicInvitation({
  client,
  slug,
}: {
  client: SupabaseClient | null;
  slug: string;
}) {
  const guestToken = new URLSearchParams(window.location.search).get("guest");
  const [invitation, setInvitation] = useState<PublicInvitationData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    async function load() {
      if (!client) {
        setError("Layanan undangan belum dikonfigurasi.");
        setLoading(false);
        return;
      }
      const { data, error: queryError } = await client.rpc("get_public_invitation", {
        p_slug: slug,
      });
      if (!active) return;
      if (queryError) setError("Undangan belum dapat ditampilkan.");
      else if (
        data &&
        typeof data === "object" &&
        isInvitationDocument((data as PublicInvitationData).document)
      ) {
        setInvitation(data as PublicInvitationData);
      }
      setLoading(false);
    }
    void load();
    return () => {
      active = false;
    };
  }, [client, slug]);

  if (loading)
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#fffaf6] text-sm text-[#76675f]">
        Memuat undangan...
      </main>
    );
  if (error || !invitation)
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#fffaf6] px-5 py-10 text-[#30251f]">
        <section className="w-full max-w-md rounded-3xl border border-[#eaded5] bg-white p-8 text-center">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#a36d55]">Janji Kita</p>
          <h1 className="mt-4 text-2xl font-semibold">Undangan tidak tersedia</h1>
          <p className="mt-2 text-sm leading-6 text-[#76675f]">
            {error || "Undangan ini belum dipublikasikan atau masa aktifnya telah berakhir."}
          </p>
        </section>
      </main>
    );
  return (
    <main className="min-h-screen bg-[#fffaf6] px-4 py-8 text-[#30251f] sm:px-8">
      <div className="mx-auto max-w-4xl">
        <header className="mb-6 text-center">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#a36d55]">Janji Kita</p>
          <h1 className="mt-3 text-3xl font-semibold">{invitation.title}</h1>
        </header>
        <InvitationDocumentView
          document={invitation.document as InvitationDocument}
          client={client}
        />
        <GuestPublicForms client={client} guestToken={guestToken} slug={slug} />
      </div>
    </main>
  );
}
