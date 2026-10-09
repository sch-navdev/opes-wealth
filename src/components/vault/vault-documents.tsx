"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { Download, Eye, FileText, Lock, Pencil, Trash2, Upload, Users } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useLanguage } from "@/context/language-context";
import { cn } from "@/lib/utils";
import { deleteDocument, getDocumentUrl, listDocuments, updateDocument, uploadDocument } from "@/app/dashboard/vault-actions";
import { DOC_TYPES, VAULT_MAX_BYTES, expiryStatus, formatBytes, sanitizeFileStem, todayUtc, type DocType, type VaultDocument } from "@/lib/vault";
import type { VaultKey } from "@/lib/vault-labels";
import { useVaultText } from "@/components/vault/vault-text";

type Load = { state: "loading" } | { state: "unavailable" } | { state: "error"; error: VaultKey } | { state: "ready"; documents: VaultDocument[] };

const selectCls =
  "h-9 w-full border border-input bg-background px-2 text-sm text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

/**
 * Documents tab of an asset (Professional tier and up; the tier switch lives in the asset page). A dense
 * Chronograph list: hairline rules, tabular figures, one row per document. The browser never sees a
 * storage path: viewing / downloading asks the server for a 60-second signed link and opens it in a new tab.
 * Pattern source: 21st.dev "File Upload" (accepted-type drop surface + compact file list), adapted.
 */
export function VaultDocuments({ assetId }: { assetId: string }) {
  const vt = useVaultText();
  const { intlLocale } = useLanguage();
  const [load, setLoad] = useState<Load>({ state: "loading" });
  const [uploading, setUploading] = useState(false);
  const [editing, setEditing] = useState<VaultDocument | null>(null);
  const [deleting, setDeleting] = useState<VaultDocument | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rowError, setRowError] = useState<VaultKey | null>(null);
  const [deleteError, setDeleteError] = useState<VaultKey | null>(null);
  const [pending, startTransition] = useTransition();

  const refresh = useCallback(async () => {
    const r = await listDocuments(assetId);
    if (!r.ok) return setLoad({ state: "error", error: r.error });
    setLoad(r.available ? { state: "ready", documents: r.documents } : { state: "unavailable" });
  }, [assetId]);

  useEffect(() => {
    let cancelled = false;
    void listDocuments(assetId).then((r) => {
      if (cancelled) return;
      if (!r.ok) setLoad({ state: "error", error: r.error });
      else setLoad(r.available ? { state: "ready", documents: r.documents } : { state: "unavailable" });
    });
    return () => {
      cancelled = true;
    };
  }, [assetId]);

  const rel = useMemo(() => new Intl.RelativeTimeFormat(intlLocale, { numeric: "auto" }), [intlLocale]);

  async function open(doc: VaultDocument, mode: "view" | "download") {
    setRowError(null);
    setBusyId(doc.id);
    try {
      const r = await getDocumentUrl(doc.id, mode);
      if (!r.ok) return setRowError(r.error);
      // A real anchor with rel=noopener: the new tab gets no handle on this page.
      const a = document.createElement("a");
      a.href = r.url;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      document.body.appendChild(a);
      a.click();
      a.remove();
    } finally {
      setBusyId(null);
    }
  }

  function confirmDelete() {
    if (!deleting) return;
    const doc = deleting;
    setDeleteError(null);
    startTransition(async () => {
      const r = await deleteDocument(doc.id);
      if (!r.ok) return setDeleteError(r.error);
      setDeleting(null);
      await refresh();
    });
  }

  const today = todayUtc();

  function expiryBadge(doc: VaultDocument) {
    const { status, days } = expiryStatus(doc.expiresOn, today);
    if (status === "none" || days === null) return <span className="text-muted-foreground">{vt("vault_expiry_none")}</span>;
    const when = rel.format(days, "day");
    const text = status === "expired" ? vt("vault_expired_rel", { when }) : vt("vault_expires_rel", { when });
    const tone =
      status === "expired" || status === "urgent"
        ? "border-destructive/60 text-destructive"
        : status === "soon"
          ? "border-primary/60 text-primary"
          : "border-border text-muted-foreground";
    return (
      <span data-status={status} className={cn("inline-block border px-1.5 py-0.5 text-xs tabular-nums", tone)}>
        {text}
      </span>
    );
  }

  return (
    <section aria-labelledby="vault-heading" className="space-y-4 border-t border-border pt-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h2 id="vault-heading" className="text-base font-medium text-foreground">
            {vt("vault_title")}
          </h2>
          <p className="max-w-prose text-sm text-muted-foreground">{vt("vault_subtitle")}</p>
        </div>
        {load.state === "ready" && (
          <Button type="button" size="sm" onClick={() => setUploading(true)}>
            <Upload className="size-4" aria-hidden="true" />
            {vt("vault_upload")}
          </Button>
        )}
      </div>

      {load.state === "loading" && (
        <p role="status" className="text-sm text-muted-foreground">
          {vt("vault_loading")}
        </p>
      )}
      {load.state === "unavailable" && <p className="text-sm text-muted-foreground">{vt("vault_unavailable")}</p>}
      {load.state === "error" && (
        <p role="alert" className="text-sm text-destructive">
          {vt(load.error)}
        </p>
      )}
      {rowError && (
        <p role="alert" className="text-sm text-destructive">
          {vt(rowError)}
        </p>
      )}

      {load.state === "ready" &&
        (load.documents.length === 0 ? (
          <div className="flex items-start gap-3 border border-dashed border-border p-4 text-sm text-muted-foreground">
            <FileText className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <p>{vt("vault_empty")}</p>
          </div>
        ) : (
          <ul className="divide-y divide-border border-y border-border">
            {load.documents.map((doc) => (
              <li key={doc.id} className="grid grid-cols-1 items-center gap-x-4 gap-y-1 py-2 text-sm md:grid-cols-[minmax(0,2fr)_8rem_11rem_5rem_auto]">
                <span className="flex min-w-0 items-center gap-2">
                  {doc.ownerOnly ? (
                    <Lock className="size-3.5 shrink-0 text-primary" aria-hidden="true" />
                  ) : (
                    <Users className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                  )}
                  <span className="sr-only">{doc.ownerOnly ? vt("vault_owner_only") : vt("vault_shared")}</span>
                  <span className="truncate text-foreground" title={doc.title}>
                    {doc.title}
                  </span>
                </span>
                <span className="text-muted-foreground">{vt(`vault_type_${doc.docType}` as VaultKey)}</span>
                <span>{expiryBadge(doc)}</span>
                <span className="tabular-nums text-muted-foreground">{formatBytes(doc.sizeBytes)}</span>
                <span className="flex items-center gap-1 md:justify-end">
                  <Button type="button" variant="ghost" size="icon-sm" disabled={busyId === doc.id} aria-label={`${vt("vault_view")}: ${doc.title}`} onClick={() => void open(doc, "view")}>
                    <Eye className="size-4" aria-hidden="true" />
                  </Button>
                  <Button type="button" variant="ghost" size="icon-sm" disabled={busyId === doc.id} aria-label={`${vt("vault_download")}: ${doc.title}`} onClick={() => void open(doc, "download")}>
                    <Download className="size-4" aria-hidden="true" />
                  </Button>
                  {doc.isMine && (
                    <>
                      <Button type="button" variant="ghost" size="icon-sm" aria-label={`${vt("vault_edit")}: ${doc.title}`} onClick={() => setEditing(doc)}>
                        <Pencil className="size-4" aria-hidden="true" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`${vt("vault_delete")}: ${doc.title}`}
                        onClick={() => {
                          setDeleteError(null);
                          setDeleting(doc);
                        }}
                      >
                        <Trash2 className="size-4" aria-hidden="true" />
                      </Button>
                    </>
                  )}
                </span>
              </li>
            ))}
          </ul>
        ))}

      <p className="text-xs text-muted-foreground">{vt("vault_field_file")}</p>

      {uploading && (
        <DocumentDialog
          assetId={assetId}
          doc={null}
          onClose={() => setUploading(false)}
          onDone={async () => {
            setUploading(false);
            await refresh();
          }}
        />
      )}
      {editing && (
        <DocumentDialog
          assetId={assetId}
          doc={editing}
          onClose={() => setEditing(null)}
          onDone={async () => {
            setEditing(null);
            await refresh();
          }}
        />
      )}

      <AlertDialog open={deleting !== null} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent className="border-border bg-card">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-foreground">{vt("vault_delete_title")}</AlertDialogTitle>
            <AlertDialogDescription className="text-muted-foreground">
              {vt("vault_delete_body", { title: deleting?.title ?? "" })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {deleteError && (
            <p role="alert" className="text-sm text-destructive">
              {vt(deleteError)}
            </p>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>{vt("vault_cancel")}</AlertDialogCancel>
            <AlertDialogAction
              disabled={pending}
              onClick={(e) => {
                e.preventDefault();
                confirmDelete();
              }}
            >
              {vt("vault_delete_confirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}

/** Upload (doc = null) or edit (doc = the document) dialog. */
function DocumentDialog({
  assetId,
  doc,
  onClose,
  onDone,
}: {
  assetId: string;
  doc: VaultDocument | null;
  onClose: () => void;
  onDone: () => Promise<void>;
}) {
  const vt = useVaultText();
  const fileRef = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState(doc?.title ?? "");
  const [docType, setDocType] = useState<DocType>(doc?.docType ?? "other");
  const [expiresOn, setExpiresOn] = useState(doc?.expiresOn ?? "");
  const [ownerOnly, setOwnerOnly] = useState(doc?.ownerOnly ?? false);
  const [error, setError] = useState<VaultKey | null>(null);
  const [pending, startTransition] = useTransition();

  function onFile(file: File | undefined) {
    setError(null);
    if (!file) return;
    if (file.size > VAULT_MAX_BYTES) return setError("vault_err_file_size");
    if (!title.trim()) setTitle(sanitizeFileStem(file.name).replace(/-/g, " ").slice(0, 120));
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      if (doc) {
        const r = await updateDocument(doc.id, { title, docType, expiresOn, ownerOnly });
        if (!r.ok) return setError(r.error);
        return onDone();
      }
      const file = fileRef.current?.files?.[0];
      if (!file) return setError("vault_err_file_missing");
      const fd = new FormData();
      fd.set("assetId", assetId);
      fd.set("file", file);
      fd.set("title", title);
      fd.set("docType", docType);
      fd.set("expiresOn", expiresOn);
      fd.set("ownerOnly", String(ownerOnly));
      const r = await uploadDocument(fd);
      if (!r.ok) return setError(r.error);
      return onDone();
    });
  }

  return (
    <Dialog open onOpenChange={(o) => !o && !pending && onClose()}>
      <DialogContent className="border-border bg-card sm:max-w-md">
        <form onSubmit={submit} className="space-y-4">
          <DialogHeader>
            <DialogTitle className="text-foreground">{doc ? vt("vault_edit_title") : vt("vault_upload_title")}</DialogTitle>
            <DialogDescription className="sr-only">{vt("vault_subtitle")}</DialogDescription>
          </DialogHeader>

          {!doc && (
            <div className="space-y-1.5">
              <Label htmlFor="vault-file">{vt("vault_field_file")}</Label>
              <Input
                id="vault-file"
                ref={fileRef}
                type="file"
                accept="application/pdf,image/png,image/jpeg,.pdf,.png,.jpg,.jpeg"
                onChange={(e) => onFile(e.target.files?.[0])}
              />
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="vault-title">{vt("vault_field_title")}</Label>
            <Input id="vault-title" value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} required />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="vault-type">{vt("vault_field_type")}</Label>
              <select id="vault-type" className={selectCls} value={docType} onChange={(e) => setDocType(e.target.value as DocType)}>
                {DOC_TYPES.map((d) => (
                  <option key={d} value={d}>
                    {vt(`vault_type_${d}` as VaultKey)}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="vault-expiry">{vt("vault_field_expiry")}</Label>
              <Input id="vault-expiry" type="date" value={expiresOn} onChange={(e) => setExpiresOn(e.target.value)} />
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm text-foreground">
            <input type="checkbox" className="size-4 accent-[var(--primary)]" checked={ownerOnly} onChange={(e) => setOwnerOnly(e.target.checked)} />
            {vt("vault_field_owner_only")}
          </label>

          {error && (
            <p role="alert" className="text-sm text-destructive">
              {vt(error)}
            </p>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" disabled={pending} onClick={onClose}>
              {vt("vault_cancel")}
            </Button>
            <Button type="submit" disabled={pending}>
              {pending && !doc ? vt("vault_uploading") : vt("vault_save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
