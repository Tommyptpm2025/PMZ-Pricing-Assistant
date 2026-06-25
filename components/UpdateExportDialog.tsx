"use client";

import * as React from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getAllTerms, type TermsBlock } from "@/lib/terms";

/**
 * Update Export dialog — the single shared "what appears on the customer document" control,
 * reused by BOTH preview paths (Project Pricer "Preview & Export Quote" and the Quotes-page
 * "Preview"). Presentational only: the parent owns all toggle state and the confirm action
 * (onNext), so each surface keeps its own behavior. Do not fork this — both paths share it.
 */
export interface UpdateExportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onNext: () => void;
  exportType: "quote" | "estimate";
  setExportType: (v: "quote" | "estimate") => void;
  selectedTermsId: string | null;
  setSelectedTermsId: (v: string | null) => void;
  logoDataUrl: string | null;
  setLogoDataUrl: (v: string | null) => void;
  showBillTo: boolean;
  setShowBillTo: (v: boolean) => void;
  showJobSite: boolean;
  setShowJobSite: (v: boolean) => void;
  showPrimaryContact: boolean;
  setShowPrimaryContact: (v: boolean) => void;
  showAccessNotes: boolean;
  setShowAccessNotes: (v: boolean) => void;
  showGPS: boolean;
  setShowGPS: (v: boolean) => void;
  showQuantities: boolean;
  setShowQuantities: (v: boolean) => void;
  showUnits: boolean;
  setShowUnits: (v: boolean) => void;
  showPerUnitPrice: boolean;
  setShowPerUnitPrice: (v: boolean) => void;
  showLineItemPrices: boolean;
  setShowLineItemPrices: (v: boolean) => void;
  showLemDetail: boolean;
  setShowLemDetail: (v: boolean) => void;
}

export default function UpdateExportDialog({
  open,
  onOpenChange,
  onNext,
  exportType,
  setExportType,
  selectedTermsId,
  setSelectedTermsId,
  logoDataUrl,
  setLogoDataUrl,
  showBillTo,
  setShowBillTo,
  showJobSite,
  setShowJobSite,
  showPrimaryContact,
  setShowPrimaryContact,
  showAccessNotes,
  setShowAccessNotes,
  showGPS,
  setShowGPS,
  showQuantities,
  setShowQuantities,
  showUnits,
  setShowUnits,
  showPerUnitPrice,
  setShowPerUnitPrice,
  showLineItemPrices,
  setShowLineItemPrices,
  showLemDetail,
  setShowLemDetail,
}: UpdateExportDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-lg">Update Export</DialogTitle>
          <DialogDescription>Choose what appears on the customer quote and PDF.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          {/* Logo upload (simple, for PDF) */}
          <div>
            <Label className="text-xs font-medium tracking-wider text-muted-foreground mb-1.5 block">Company Logo (optional, PNG/JPG)</Label>
            <div className="flex items-center gap-3">
              <input
                type="file"
                accept="image/png,image/jpeg"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    const reader = new FileReader();
                    reader.onload = (ev) => {
                      const dataUrl = ev.target?.result as string;
                      setLogoDataUrl(dataUrl);
                      try {
                        localStorage.setItem('pmz_quote_logo', dataUrl);
                      } catch {}
                    };
                    reader.readAsDataURL(file);
                  }
                }}
                className="text-xs"
              />
              {logoDataUrl && (
                <div className="flex items-center gap-2">
                  <img src={logoDataUrl} alt="logo preview" className="h-8 w-auto border" />
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2 text-xs"
                    onClick={() => {
                      setLogoDataUrl(null);
                      try { localStorage.removeItem('pmz_quote_logo'); } catch {}
                    }}
                  >
                    Remove
                  </Button>
                </div>
              )}
            </div>
          </div>

          {/* Type section */}
          <div>
            <Label className="text-xs font-medium tracking-wider text-muted-foreground mb-1.5 block">Type</Label>
            <div className="flex flex-col gap-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="exportType"
                  value="quote"
                  checked={exportType === 'quote'}
                  onChange={() => setExportType('quote')}
                  className="accent-red-600"
                />
                <span className="text-sm">Quote</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="exportType"
                  value="estimate"
                  checked={exportType === 'estimate'}
                  onChange={() => setExportType('estimate')}
                  className="accent-red-600"
                />
                <span className="text-sm">Estimate</span>
              </label>
            </div>
          </div>

          {/* Terms & Conditions selector (Stage 2) */}
          <div>
            <Label className="text-xs font-medium tracking-wider text-muted-foreground mb-1.5 block">Terms &amp; Conditions</Label>
            <Select
              value={selectedTermsId || "none"}
              onValueChange={(val) => setSelectedTermsId(val === "none" ? null : val)}
            >
              <SelectTrigger className="h-8 text-sm">
                <SelectValue placeholder="Select terms" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None</SelectItem>
                {getAllTerms().map((t: TermsBlock) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name}{t.isDefault ? " (default)" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Customer & Location Information (Phase 1) */}
          <div>
            <Label className="text-xs font-medium tracking-wider text-muted-foreground mb-1.5 block">Customer &amp; Location Information</Label>
            <div className="space-y-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showBillTo}
                  onChange={(e) => setShowBillTo(e.target.checked)}
                  className="accent-red-600"
                />
                <span className="text-sm">Show Bill To address</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showJobSite}
                  onChange={(e) => setShowJobSite(e.target.checked)}
                  className="accent-red-600"
                />
                <span className="text-sm">Show Job Site address</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showPrimaryContact}
                  onChange={(e) => setShowPrimaryContact(e.target.checked)}
                  className="accent-red-600"
                />
                <span className="text-sm">Show Primary Contact name + phone/email</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showAccessNotes}
                  onChange={(e) => setShowAccessNotes(e.target.checked)}
                  className="accent-red-600"
                />
                <span className="text-sm">Show Access Notes / Delivery Instructions</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showGPS}
                  onChange={(e) => setShowGPS(e.target.checked)}
                  className="accent-red-600"
                />
                <span className="text-sm">Show GPS Coordinates</span>
              </label>
            </div>
          </div>

          {/* Checkboxes */}
          <div>
            <Label className="text-xs font-medium tracking-wider text-muted-foreground mb-1.5 block">Options</Label>
            <div className="space-y-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showQuantities}
                  onChange={(e) => setShowQuantities(e.target.checked)}
                  className="accent-red-600"
                />
                <span className="text-sm">Show Quantities</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showUnits}
                  onChange={(e) => setShowUnits(e.target.checked)}
                  className="accent-red-600"
                />
                <span className="text-sm">Show Units of Measure</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showPerUnitPrice}
                  onChange={(e) => setShowPerUnitPrice(e.target.checked)}
                  className="accent-red-600"
                />
                <span className="text-sm">Show Per Unit Price</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showLineItemPrices}
                  onChange={(e) => setShowLineItemPrices(e.target.checked)}
                  className="accent-red-600"
                />
                <span className="text-sm">Show Line Item Prices</span>
              </label>
            </div>
          </div>

          {/* Detail Level */}
          <div>
            <Label className="text-xs font-medium tracking-wider text-muted-foreground mb-1.5 block">Detail Level</Label>
            <div className="space-y-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showLemDetail}
                  onChange={(e) => setShowLemDetail(e.target.checked)}
                  className="accent-red-600"
                />
                <span className="text-sm">Show LEM Detail (Labor, Equipment, Material, Misc)</span>
              </label>
            </div>
          </div>
        </div>
        <div className="flex justify-between pt-2">
          <Button
            variant="destructive"
            size="default"
            onClick={onNext}
            className="font-semibold"
          >
            Next
          </Button>
          <Button
            variant="outline"
            size="default"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
