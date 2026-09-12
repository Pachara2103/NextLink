import { LoginPage } from "@/components/auth/LoginPage";

export default async function Login({ searchParams }: PageProps<"/login">) {
  const { next } = await searchParams;
  // Only known app routes can be a post-login destination.
  const returnTo = typeof next === "string" && (/^\/elective-plan(?:[/?]|$)/.test(next) || /^\/(?:\?|$)/.test(next)) && !next.includes("\\") ? next : "/";
  return <LoginPage returnTo={returnTo} />;
}
