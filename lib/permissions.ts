export function hasAdminAll(session: unknown): boolean {
  const accessToken = (session as { tokenSet?: { accessToken?: string } } | null)
    ?.tokenSet?.accessToken;
  if (!accessToken) return false;
  try {
    const payload = JSON.parse(
      Buffer.from(accessToken.split(".")[1], "base64url").toString()
    );
    const permissions = (payload.permissions as string[] | undefined) ?? [];
    return permissions.includes("admin:all");
  } catch {
    return false;
  }
}
