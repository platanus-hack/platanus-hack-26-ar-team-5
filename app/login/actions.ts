"use server";

import { redirect } from "next/navigation";
import { createSupabaseServer } from "../../lib/auth/supabase-server";
import { promoteByEnv } from "../../lib/auth/promote";

function backToLogin(opts: {
  mode?: "signin" | "signup";
  error?: string;
  info?: string;
  email?: string;
}): never {
  const params = new URLSearchParams();
  if (opts.mode) params.set("mode", opts.mode);
  if (opts.error) params.set("error", opts.error);
  if (opts.info) params.set("info", opts.info);
  if (opts.email) params.set("email", opts.email);
  redirect(`/login?${params.toString()}`);
}

export async function signInAction(formData: FormData): Promise<void> {
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    backToLogin({ error: "Email and password are required.", email });
  }

  const supabase = await createSupabaseServer();
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    backToLogin({ error: error.message, email });
  }

  if (data.user) {
    await promoteByEnv(data.user.id, email);
  }

  redirect("/dashboard");
}

export async function signUpAction(formData: FormData): Promise<void> {
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  const password = String(formData.get("password") ?? "");
  const fullName = String(formData.get("full_name") ?? "").trim();

  if (!email || !password) {
    backToLogin({
      mode: "signup",
      error: "Email and password are required.",
      email,
    });
  }

  if (password.length < 8) {
    backToLogin({
      mode: "signup",
      error: "Password must be at least 8 characters.",
      email,
    });
  }

  const supabase = await createSupabaseServer();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: fullName ? { full_name: fullName } : undefined,
    },
  });

  if (error) {
    backToLogin({ mode: "signup", error: error.message, email });
  }

  // If email confirmation is OFF in Supabase, signUp returns a live session
  // and the cookie is set. Otherwise data.session is null and the user has
  // to click the confirmation email link → /auth/callback.
  if (data.session && data.user) {
    await promoteByEnv(data.user.id, email);
    redirect("/dashboard");
  }

  backToLogin({
    mode: "signin",
    info: "Account created. Check your email to confirm, then sign in.",
    email,
  });
}
