import { auth0 } from "@/lib/auth";
import { redirect } from "next/navigation";

export default async function UnauthorizedPage() {
  const session = await auth0.getSession();

  // Not logged in — send to login
  if (!session) redirect("/auth/login");

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-6">
      <div className="max-w-md w-full text-center space-y-6">
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold text-foreground">Access Restricted</h1>
          <p className="text-muted-foreground">
            Your account doesn&apos;t have permission to use this application.
          </p>
        </div>

        <div className="rounded-lg border bg-card p-6 text-left space-y-3">
          <p className="text-sm text-card-foreground">
            To request access, contact:
          </p>
          <a
            href="mailto:grega@time-4-action.com"
            className="block text-sm font-medium text-primary hover:underline"
          >
            grega@time-4-action.com
          </a>
        </div>

        <a
          href="/auth/logout"
          className="inline-block text-sm text-muted-foreground hover:text-foreground underline"
        >
          Sign out
        </a>
      </div>
    </div>
  );
}
