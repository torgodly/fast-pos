import { AdminNav } from "@/components/AdminNav";
import { getSession } from "@/lib/auth/session";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();

  if (!session || session.role !== "admin") {
    return <>{children}</>;
  }

  return (
    <div className="flex min-h-dvh flex-1 flex-col lg:flex-row">
      <AdminNav name={session.name} />
      <main className="min-w-0 flex-1 p-4 sm:p-6 lg:p-8 xl:p-10">
        <div className="page-shell">{children}</div>
      </main>
    </div>
  );
}
