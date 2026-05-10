import { requireUser } from "../../../lib/auth/supabase-server";
import { ApiKeysManager } from "../../../components/dashboard/api-keys-manager";

export const metadata = {
  title: "Pacta — Settings",
};

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const { profile } = await requireUser();

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-10 px-6 py-12">
      <header className="flex flex-col gap-2">
        <h1 className="text-[28px] font-medium leading-tight text-polar-white">
          API keys
        </h1>
        <p className="text-body text-ash-gray">
          Mint and revoke keys for the Pacta MCP and REST endpoints. Keys are
          shown once at creation. Pacta hashes them on the server and never
          displays them again.
        </p>
      </header>

      <ApiKeysManager allowed={profile.allowed} />
    </main>
  );
}
