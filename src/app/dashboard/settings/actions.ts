"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/utils/supabase/server";

export async function updateProfile(formData: FormData) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "You must be signed in to update your profile." };
  }

  const firstName = formData.get("first_name") as string;
  const lastName = formData.get("last_name") as string;
  const phoneNumber = formData.get("phone_number") as string;
  const addressStreet = formData.get("address_street") as string;
  const addressPoBox = formData.get("address_po_box") as string;
  const addressCity = formData.get("address_city") as string;
  const addressPostalCode = formData.get("address_postal_code") as string;
  const addressLandmark = formData.get("address_landmark") as string;
  const addressCountry = formData.get("address_country") as string;
  const avatarBase64 = formData.get("avatar_base64") as string;

  const { error } = await supabase
    .from("profiles")
    .update({
      first_name: firstName,
      last_name: lastName,
      phone_number: phoneNumber,
      address_street: addressStreet,
      address_po_box: addressPoBox,
      address_city: addressCity,
      address_postal_code: addressPostalCode,
      address_landmark: addressLandmark,
      address_country: addressCountry,
      avatar_base64: avatarBase64,
    })
    .eq("id", user.id);

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/", "layout");
}

export async function resendEmailVerification(email: string) {
  const supabase = await createClient();

  const { error } = await supabase.auth.resend({
    type: "signup",
    email,
  });

  if (error) {
    return { error: error.message };
  }

  return { success: true };
}
