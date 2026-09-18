"use client";

import { useRef, useState, useTransition } from "react";
import Cropper, { type Area } from "react-easy-crop";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CountryCombobox } from "@/components/country-combobox";
import { countries } from "@/lib/countries";
import { getCroppedImage } from "@/lib/crop-image";
import { resendEmailVerification, updateProfile } from "@/app/dashboard/settings/actions";

type Profile = {
  first_name: string | null;
  last_name: string | null;
  phone_number: string | null;
  address_street: string | null;
  address_po_box: string | null;
  address_city: string | null;
  address_postal_code: string | null;
  address_landmark: string | null;
  address_country: string | null;
  avatar_base64: string | null;
} | null;

function splitPhoneNumber(phone: string | null): {
  dialCode: string;
  rest: string;
} {
  if (!phone) return { dialCode: "", rest: "" };

  const match = countries
    .map((country) => country.dialCode)
    .filter((dialCode) => phone.startsWith(dialCode))
    .sort((a, b) => b.length - a.length)[0];

  if (!match) return { dialCode: "", rest: phone };

  return { dialCode: match, rest: phone.slice(match.length).trim() };
}

export function ProfileForm({
  profile,
  email,
  isEmailVerified,
}: {
  profile: Profile;
  email: string;
  isEmailVerified: boolean;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [avatarBase64, setAvatarBase64] = useState(
    profile?.avatar_base64 ?? "",
  );
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [isPending, startTransition] = useTransition();

  const [verificationStatus, setVerificationStatus] = useState<
    string | null
  >(null);
  const [isVerificationPending, startVerificationTransition] =
    useTransition();

  const initialPhone = splitPhoneNumber(profile?.phone_number ?? null);
  const [dialCode, setDialCode] = useState(initialPhone.dialCode);
  const [phoneLocal, setPhoneLocal] = useState(initialPhone.rest);

  const [addressCountry, setAddressCountry] = useState(
    profile?.address_country ?? "",
  );

  // Avatar cropper state
  const [rawImageSrc, setRawImageSrc] = useState<string | null>(null);
  const [cropDialogOpen, setCropDialogOpen] = useState(false);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(
    null,
  );

  const initials =
    `${profile?.first_name?.[0] ?? ""}${profile?.last_name?.[0] ?? ""}`.trim() ||
    email[0]?.toUpperCase() ||
    "?";

  function handleAvatarFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      setRawImageSrc(reader.result as string);
      setCrop({ x: 0, y: 0 });
      setZoom(1);
      setCroppedAreaPixels(null);
      setCropDialogOpen(true);
    };
    reader.readAsDataURL(file);
  }

  async function handleConfirmCrop() {
    if (!rawImageSrc || !croppedAreaPixels) return;

    const cropped = await getCroppedImage(rawImageSrc, croppedAreaPixels);
    setAvatarBase64(cropped);
    setCropDialogOpen(false);
    setRawImageSrc(null);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(false);

    const form = formRef.current;
    if (!form) return;

    const formData = new FormData(form);

    startTransition(async () => {
      const result = await updateProfile(formData);
      if (result?.error) {
        setError(result.error);
        return;
      }
      setSuccess(true);
    });
  }

  function handleSendVerification() {
    setVerificationStatus(null);

    startVerificationTransition(async () => {
      const result = await resendEmailVerification(email);
      if (result?.error) {
        setVerificationStatus(result.error);
        return;
      }
      setVerificationStatus("Verification email sent.");
    });
  }

  function handleVerifyPhone() {
    alert("SMS verification integration coming soon.");
  }

  const fullPhoneNumber = [dialCode, phoneLocal].filter(Boolean).join(" ");

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between border border-border bg-card px-4 py-3">
        <div>
          <p className="text-xs text-muted-foreground">Email</p>
          <p className="text-sm text-foreground">{email}</p>
        </div>
        {isEmailVerified ? (
          <Badge className="bg-success text-success-foreground">
            Verified
          </Badge>
        ) : (
          <div className="flex flex-col items-end gap-1">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={isVerificationPending}
              onClick={handleSendVerification}
              className="border-primary text-primary hover:bg-primary/10 hover:text-primary"
            >
              {isVerificationPending
                ? "Sending…"
                : "Send Verification Link"}
            </Button>
            {verificationStatus && (
              <p className="text-xs text-muted-foreground">
                {verificationStatus}
              </p>
            )}
          </div>
        )}
      </div>

      <form ref={formRef} onSubmit={handleSubmit} className="space-y-8">
        <input type="hidden" name="avatar_base64" value={avatarBase64} />
        <input type="hidden" name="phone_number" value={fullPhoneNumber} />
        <input type="hidden" name="address_country" value={addressCountry} />

        <div className="flex items-center gap-4">
          <Avatar size="lg">
            <AvatarImage src={avatarBase64 || undefined} alt="" />
            <AvatarFallback>{initials}</AvatarFallback>
          </Avatar>
          <div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              className="border-primary text-primary hover:bg-primary/10 hover:text-primary"
            >
              Change photo
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleAvatarFileSelected}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="first_name">First Name</Label>
            <Input
              id="first_name"
              name="first_name"
              defaultValue={profile?.first_name ?? ""}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="last_name">Last Name</Label>
            <Input
              id="last_name"
              name="last_name"
              defaultValue={profile?.last_name ?? ""}
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="phone_local">Phone Number</Label>
          <div className="flex gap-2">
            <CountryCombobox
              field="dialCode"
              value={dialCode}
              onChange={setDialCode}
              placeholder="Code"
              className="w-28 shrink-0"
            />
            <Input
              id="phone_local"
              type="tel"
              value={phoneLocal}
              onChange={(e) => setPhoneLocal(e.target.value)}
              className="flex-1"
            />
            <Button
              type="button"
              variant="outline"
              onClick={handleVerifyPhone}
              className="border-primary text-primary hover:bg-primary/10 hover:text-primary"
            >
              Verify Phone
            </Button>
          </div>
        </div>

        <div className="space-y-4">
          <h3 className="text-sm font-medium text-foreground">
            Residential Address
          </h3>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="address_street">Street Name</Label>
              <Input
                id="address_street"
                name="address_street"
                defaultValue={profile?.address_street ?? ""}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="address_po_box">PO Box</Label>
              <Input
                id="address_po_box"
                name="address_po_box"
                defaultValue={profile?.address_po_box ?? ""}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="address_city">City</Label>
              <Input
                id="address_city"
                name="address_city"
                defaultValue={profile?.address_city ?? ""}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="address_postal_code">Postal Code</Label>
              <Input
                id="address_postal_code"
                name="address_postal_code"
                defaultValue={profile?.address_postal_code ?? ""}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="address_landmark">Landmark</Label>
              <Input
                id="address_landmark"
                name="address_landmark"
                defaultValue={profile?.address_landmark ?? ""}
              />
            </div>
            <div className="space-y-2">
              <Label>Country</Label>
              <CountryCombobox
                field="name"
                value={addressCountry}
                onChange={setAddressCountry}
                placeholder="Select country…"
                className="w-full"
              />
            </div>
          </div>
        </div>

        {error && (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        )}
        {success && (
          <p className="text-sm text-success">Profile saved.</p>
        )}

        <Button type="submit" disabled={isPending}>
          {isPending ? "Saving…" : "Save Changes"}
        </Button>
      </form>

      <Dialog open={cropDialogOpen} onOpenChange={setCropDialogOpen}>
        <DialogContent className="border-border bg-card">
          <DialogHeader>
            <DialogTitle className="text-foreground">
              Crop Profile Photo
            </DialogTitle>
            <DialogDescription className="text-muted-foreground">
              Drag to reposition and scroll to zoom.
            </DialogDescription>
          </DialogHeader>

          <div className="relative h-72 w-full bg-black">
            {rawImageSrc && (
              <Cropper
                image={rawImageSrc}
                crop={crop}
                zoom={zoom}
                aspect={1}
                cropShape="round"
                showGrid={false}
                onCropChange={setCrop}
                onZoomChange={setZoom}
                onCropComplete={(_, areaPixels) =>
                  setCroppedAreaPixels(areaPixels)
                }
              />
            )}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setCropDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button type="button" onClick={handleConfirmCrop}>
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
