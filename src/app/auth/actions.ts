"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/utils/supabase/server";

export async function login(formData: FormData) {
  const supabase = await createClient();

  const email = formData.get("email") as string;
  const password = formData.get("password") as string;

  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    return { error: error.message };
  }

  const { data, error: aalError } =
    await supabase.auth.mfa.getAuthenticatorAssuranceLevel();

  if (aalError) {
    return { error: aalError.message };
  }

  revalidatePath("/", "layout");

  if (data.nextLevel === "aal2" && data.nextLevel !== data.currentLevel) {
    redirect("/login/mfa");
  }

  redirect("/dashboard");
}

export async function signup(formData: FormData) {
  const supabase = await createClient();

  const email = formData.get("email") as string;
  const password = formData.get("password") as string;

  const { error } = await supabase.auth.signUp({
    email,
    password,
  });

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/", "layout");
  redirect("/dashboard");
}

export async function verifyMfaLogin(code: string) {
  const supabase = await createClient();

  const { data: factorsData, error: factorsError } =
    await supabase.auth.mfa.listFactors();

  if (factorsError) {
    return { error: factorsError.message };
  }

  const totpFactor = factorsData.totp[0];

  if (!totpFactor) {
    return { error: "No TOTP factor found for this account." };
  }

  const factorId = totpFactor.id;

  const { data: challengeData, error: challengeError } =
    await supabase.auth.mfa.challenge({ factorId });

  if (challengeError) {
    return { error: challengeError.message };
  }

  const { error: verifyError } = await supabase.auth.mfa.verify({
    factorId,
    challengeId: challengeData.id,
    code,
  });

  if (verifyError) {
    return { error: verifyError.message };
  }

  revalidatePath("/", "layout");
  redirect("/dashboard");
}

export async function logout() {
  const supabase = await createClient();

  await supabase.auth.signOut();

  revalidatePath("/", "layout");
  redirect("/login");
}
