"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/utils/supabase/server";

export async function addAsset(formData: FormData) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "You must be signed in to add an asset." };
  }

  const name = formData.get("name") as string;
  const categoryId = formData.get("category_id") as string;
  const quantity = formData.get("quantity") as string;
  const currentValue = formData.get("current_value") as string;
  const currency = (formData.get("currency") as string) || "USD";

  const { error } = await supabase.from("assets").insert({
    profile_id: user.id,
    category_id: categoryId,
    name,
    quantity: quantity ? Number(quantity) : 1,
    current_value: Number(currentValue),
    currency,
  });

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/dashboard");
}
