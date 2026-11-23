import { useCallback, useEffect, useState, type FormEvent } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";

type Invite = {
  id: string;
  invitation_id: string;
  invited_email: string;
  role: "editor" | "viewer";
  status: string;
  expires_at: string;
  created_at: string;
};
type Collaborator = {
  id: string;
  user_id: string;
  role: "editor" | "viewer";
  status: string;
  created_at: string;
};
type Invitation = { id: string; title: string; owner_user_id: string };

export default function CollaborationPage({
  client,
  invitationId,
  userId,
  email,
}: {
  client: SupabaseClient;
  invitationId: string;
  userId: string;
  email: string;
}) {
  const [invitation, setInvitation] = useState<Invitation | null>(null);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [collaborators, setCollaborators] = useState<Collaborator[]>([]);
  const [incoming, setIncoming] = useState<Invite[]>([]);
  const [limit, setLimit] = useState(2);
  const [inviteEmail, setInviteEmail] = useState("");
  const [role, setRole] = useState<"editor" | "viewer">("editor");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    const [invitationResult, inviteResult, collaboratorResult, incomingResult] = await Promise.all([
      client.from("invitations").select("id,title,owner_user_id").eq("id", invitationId).maybeSingle(),
      client.from("collaborator_invites").select("*").eq("invitation_id", invitationId).order("created_at", { ascending: false }),
      client.from("invitation_collaborators").select("id,user_id,role,status,created_at").eq("invitation_id", invitationId).order("created_at"),
      client.from("collaborator_invites").select("*").eq("invited_email", email.toLowerCase()).eq("status", "pending").order("created_at", { ascending: false }),
    ]);
    const firstError = invitationResult.error || inviteResult.error || collaboratorResult.error || incomingResult.error;
    if (firstError) setError(firstError.message);
    const nextInvitation = invitationResult.data as Invitation | null;
    setInvitation(nextInvitation);
    setInvites((inviteResult.data || []) as Invite[]);
    setCollaborators((collaboratorResult.data || []) as Collaborator[]);
    setIncoming((incomingResult.data || []) as Invite[]);
    if (nextInvitation) {
      const { data } = await client.from("entitlements").select("value,valid_until")
        .eq("user_id", nextInvitation.owner_user_id).eq("entitlement_key", "collaborator_limit")
        .eq("status", "active").order("valid_from", { ascending: false }).limit(1);
      const value = data?.[0]?.value as { collaborator_limit?: number } | undefined;
      setLimit(Math.max(2, Number(value?.collaborator_limit || 2)));
    }
    setLoading(false);
  }, [client, invitationId, email]);

  useEffect(() => { void refresh(); }, [refresh]);

  async function sendInvite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setNotice("");
    const { error: rpcError } = await client.rpc("invite_collaborator", {
      p_invitation_id: invitationId,
      p_email: inviteEmail.trim(),
      p_role: role,
    });
    if (rpcError) setError(rpcError.message);
    else {
      setInviteEmail("");
      setNotice("Undangan kolaborasi tercatat untuk akun dengan alamat email tersebut.");
      await refresh();
    }
    setSaving(false);
  }

  async function acceptInvite(inviteId: string) {
    setSaving(true);
    setError("");
    const { error: rpcError } = await client.rpc("accept_collaborator_invite", { p_invite_id: inviteId });
    if (rpcError) setError(rpcError.message);
    else {
      setNotice("Undangan kolaborasi berhasil diterima.");
      await refresh();
    }
    setSaving(false);
  }

  async function revoke(id: string) {
    setSaving(true);
    setError("");
    const { error: rpcError } = await client.rpc("revoke_collaborator", { p_collaborator_id: id });
    if (rpcError) setError(rpcError.message);
    else {
      setNotice("Akses kolaborator dicabut.");
      await refresh();
    }
    setSaving(false);
  }

  const isOwner = invitation?.owner_user_id === userId;
  const activeEditors = collaborators.filter((item) => item.status === "accepted" && item.role === "editor").length;
  const pendingInvites = invites.filter((item) => item.status === "pending" && new Date(item.expires_at) > new Date());

  return (
    <main className="min-h-screen bg-[#fffaf6] px-4 py-8 text-[#30251f] sm:px-6">
      <div className="mx-auto max-w-5xl space-y-6">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#a36d55]">Janji Kita · Kolaborasi</p>
            <h1 className="mt-2 text-2xl font-semibold">{invitation?.title || "Kolaborasi undangan"}</h1>
            <p className="mt-1 text-sm text-[#76675f]">Pemilik dihitung sebagai satu orang dalam batas editor.</p>
          </div>
          <a href="/" className="rounded-xl border border-[#ddcec3] bg-white px-4 py-2 text-sm font-semibold">Ruang kerja</a>
        </header>

        {(error || notice) && <p role={error ? "alert" : "status"} className={`rounded-xl px-4 py-3 text-sm ${error ? "bg-red-50 text-red-700" : "bg-green-50 text-green-800"}`}>{error || notice}</p>}

        {incoming.length > 0 && (
          <section className="rounded-2xl border border-[#eaded5] bg-white p-5">
            <h2 className="font-semibold">Undangan untuk akun ini</h2>
            <div className="mt-3 space-y-3">
              {incoming.map((item) => (
                <div key={item.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-[#fffaf6] p-3">
                  <div><p className="font-medium">{item.role === "editor" ? "Akses editor" : "Akses pembaca"}</p><p className="text-xs text-[#887970]">Berlaku sampai {new Date(item.expires_at).toLocaleDateString("id-ID")}</p></div>
                  <button disabled={saving} onClick={() => void acceptInvite(item.id)} className="rounded-lg bg-[#754b3b] px-4 py-2 text-sm font-semibold text-white">Terima</button>
                </div>
              ))}
            </div>
          </section>
        )}

        {loading ? <p className="py-10 text-center text-sm text-[#76675f]">Memuat kolaborasi...</p> : !invitation ? (
          <p className="rounded-2xl border border-[#eaded5] bg-white p-5 text-sm">Undangan tidak ditemukan atau akun ini tidak memiliki akses.</p>
        ) : (
          <>
            <section className="grid gap-3 sm:grid-cols-3">
              <article className="rounded-2xl border border-[#eaded5] bg-white p-5"><p className="text-sm text-[#76675f]">Batas editor</p><p className="mt-2 text-2xl font-semibold">{limit} orang</p><p className="mt-1 text-xs text-[#887970]">Termasuk pemilik undangan</p></article>
              <article className="rounded-2xl border border-[#eaded5] bg-white p-5"><p className="text-sm text-[#76675f]">Editor aktif</p><p className="mt-2 text-2xl font-semibold">{activeEditors + 1}/{limit}</p><p className="mt-1 text-xs text-[#887970]">Pemilik + editor yang diterima</p></article>
              <article className="rounded-2xl border border-[#eaded5] bg-white p-5"><p className="text-sm text-[#76675f]">Undangan menunggu</p><p className="mt-2 text-2xl font-semibold">{pendingInvites.length}</p><p className="mt-1 text-xs text-[#887970]">Kedaluwarsa otomatis setelah 14 hari</p></article>
            </section>

            {isOwner && (
              <section className="rounded-2xl border border-[#eaded5] bg-white p-5 sm:p-6">
                <h2 className="text-lg font-semibold">Undang kolaborator</h2>
                <form onSubmit={sendInvite} className="mt-4 grid gap-3 sm:grid-cols-[1fr_180px_auto]">
                  <label className="text-sm font-medium">Alamat email
                    <input type="email" required maxLength={254} value={inviteEmail} onChange={(event) => setInviteEmail(event.target.value)} className="mt-2 w-full rounded-xl border border-[#ddcec3] px-4 py-3" placeholder="nama@email.com" />
                  </label>
                  <label className="text-sm font-medium">Akses
                    <select value={role} onChange={(event) => setRole(event.target.value as "editor" | "viewer")} className="mt-2 w-full rounded-xl border border-[#ddcec3] px-4 py-3"><option value="editor">Editor</option><option value="viewer">Pembaca</option></select>
                  </label>
                  <button disabled={saving} className="self-end rounded-xl bg-[#754b3b] px-5 py-3 text-sm font-semibold text-white disabled:opacity-60">{saving ? "Memproses..." : "Kirim undangan"}</button>
                </form>
                <p className="mt-3 text-xs leading-5 text-[#887970]">Undangan terikat pada email akun penerima. Notifikasi email otomatis belum diaktifkan; penerima dapat melihat undangan setelah masuk ke akun yang sama.</p>
              </section>
            )}

            <section className="rounded-2xl border border-[#eaded5] bg-white p-5 sm:p-6">
              <h2 className="text-lg font-semibold">Anggota undangan</h2>
              {collaborators.length === 0 ? <p className="mt-3 text-sm text-[#76675f]">Belum ada kolaborator yang menerima undangan.</p> : (
                <div className="mt-4 divide-y divide-[#f0e7e0]">
                  {collaborators.map((item) => (
                    <div key={item.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                      <div><p className="font-medium">{item.role === "editor" ? "Editor" : "Pembaca"} · {item.user_id.slice(0, 8)}</p><p className="text-xs text-[#887970]">{item.status === "accepted" ? "Aktif" : item.status === "revoked" ? "Dicabut" : "Menunggu"} · {new Date(item.created_at).toLocaleDateString("id-ID")}</p></div>
                      {isOwner && item.status === "accepted" && <button disabled={saving} onClick={() => void revoke(item.id)} className="rounded-lg border border-[#ddcec3] px-3 py-2 text-sm font-semibold">Cabut akses</button>}
                    </div>
                  ))}
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </main>
  );
}
