"use client";

import * as React from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Calculator, Plus, RotateCcw, ArrowUp, ArrowDown, Trash2, Upload, Save } from "lucide-react";
import { CurrencyInput } from "@/components/ui/currency-input";
import { cn } from "@/lib/utils";

const STORAGE_KEY = "pmz_overhead_chart";

function createId() {
  return Math.random().toString(36).slice(2, 11);
}

interface OverheadItem {
  id: string;
  category: string;
  amount: number;
}

interface OverheadChart {
  items: OverheadItem[];
  monthlyRevenue: number;
  monthlyCogs: number;
  billableHours: number;
  notes: string;
}

// Standard construction contractor overhead categories
const DEFAULT_CATEGORIES: Omit<OverheadItem, "id" | "amount">[] = [
  { category: "Office Salaries & Wages" },
  { category: "Rent / Lease (Office)" },
  { category: "Utilities (Office)" },
  { category: "Insurance (General & Admin)" },
  { category: "Office Supplies & Equipment" },
  { category: "Marketing & Advertising" },
  { category: "Professional Fees (Legal, Accounting)" },
  { category: "Vehicle Expenses (Admin)" },
  { category: "Depreciation (Office Assets)" },
  { category: "Software & Subscriptions" },
  { category: "Training & Education" },
  { category: "Miscellaneous Overhead" },
];

const DEFAULT_CHART: OverheadChart = {
  items: DEFAULT_CATEGORIES.map((cat, index) => ({
    id: createId(),
    category: cat.category,
    amount: [12500, 4200, 1850, 3100, 950, 2800, 1650, 1450, 980, 1250, 650, 1200][index] || 1000,
  })),
  monthlyRevenue: 185000,
  monthlyCogs: 112000,
  billableHours: 1420,
  notes: "Q1 2026 assumptions. Fuel costs trending +8%. Review insurance renewal in June.",
};

export default function OverheadProfitPage() {
  const [chart, setChart] = React.useState<OverheadChart>({ ...DEFAULT_CHART });
  const [newCategoryName, setNewCategoryName] = React.useState("");
  const [activeTab, setActiveTab] = React.useState<'manual' | 'import'>('manual');
  const [justSaved, setJustSaved] = React.useState(false);

  // Load from localStorage
  React.useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed: OverheadChart = JSON.parse(raw);
        if (parsed.items && parsed.items.length > 0) {
          setChart(parsed);
        }
      }
    } catch {}
  }, []);

  // Persist
  React.useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(chart));
    } catch {}
  }, [chart]);

  // Live calculations
  const totalOverhead = React.useMemo(() => {
    return chart.items.reduce((sum, item) => sum + (item.amount || 0), 0);
  }, [chart.items]);

  const overheadPercentOfRevenue = React.useMemo(() => {
    if (!chart.monthlyRevenue || chart.monthlyRevenue === 0) return 0;
    return Math.round((totalOverhead / chart.monthlyRevenue) * 1000) / 10;
  }, [totalOverhead, chart.monthlyRevenue]);

  const overheadPerBillableHour = React.useMemo(() => {
    if (!chart.billableHours || chart.billableHours === 0) return 0;
    return Math.round((totalOverhead / chart.billableHours) * 100) / 100;
  }, [totalOverhead, chart.billableHours]);

  // ==================== ACTIONS ====================
  function updateItemAmount(id: string, newAmount: number) {
    setChart((prev) => ({
      ...prev,
      items: prev.items.map((item) =>
        item.id === id ? { ...item, amount: Math.max(0, Math.round(newAmount * 100) / 100) } : item
      ),
    }));
  }

  function updateItemCategory(id: string, newCategory: string) {
    setChart((prev) => ({
      ...prev,
      items: prev.items.map((item) =>
        item.id === id ? { ...item, category: newCategory } : item
      ),
    }));
  }

  function addCategory() {
    const name = newCategoryName.trim();
    if (!name) return;

    const newItem: OverheadItem = {
      id: createId(),
      category: name,
      amount: 0,
    };

    setChart((prev) => ({
      ...prev,
      items: [...prev.items, newItem],
    }));
    setNewCategoryName("");
  }

  function removeCategory(id: string) {
    setChart((prev) => ({
      ...prev,
      items: prev.items.filter((item) => item.id !== id),
    }));
  }

  function moveItem(index: number, direction: number) {
    const newIndex = index + direction;
    if (newIndex < 0 || newIndex >= chart.items.length) return;

    const newItems = [...chart.items];
    [newItems[index], newItems[newIndex]] = [newItems[newIndex], newItems[index]];

    setChart((prev) => ({
      ...prev,
      items: newItems,
    }));
  }

  function saveChart() {
    setJustSaved(true);
    setTimeout(() => setJustSaved(false), 2200);
  }

  function resetToDefaults() {
    setChart({ ...DEFAULT_CHART });
    setNewCategoryName("");
    setJustSaved(false);
  }

  function updateAssumption(field: "monthlyRevenue" | "monthlyCogs" | "billableHours", value: number) {
    setChart((prev) => ({
      ...prev,
      [field]: Math.max(0, value),
    }));
  }

  function updateNotes(newNotes: string) {
    setChart((prev) => ({
      ...prev,
      notes: newNotes,
    }));
  }

  // ==================== RENDER ====================
  return (
    <div className="max-w-6xl space-y-8 pb-12">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-4">
          <div className="rounded-2xl bg-primary/10 p-3 text-primary mt-0.5">
            <Calculator className="h-7 w-7" />
          </div>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-semibold tracking-[-0.02em]">Overhead &amp; Profit</h1>
              <Badge variant="outline" className="font-mono text-[10px] tracking-wider border-primary/40 text-primary">PILLAR 1</Badge>
            </div>
            <p className="mt-1 max-w-2xl text-muted-foreground">
              The detailed engine for true fixed overhead. High-level dashboard lives on the Overview.
            </p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={resetToDefaults} className="self-start sm:self-auto">
          <RotateCcw className="mr-2 h-4 w-4" /> Reset to Standard
        </Button>
      </div>

      {/* Tabs - exact same style */}
      <div className="flex items-center">
        <div className="inline-flex rounded-lg border border-border bg-muted/30 p-1 text-sm">
          <button
            onClick={() => setActiveTab('manual')}
            className={cn(
              "flex items-center gap-2 rounded-md px-5 py-2 font-medium transition-all",
              activeTab === 'manual'
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
            )}
          >
            Manual Overhead
          </button>
          <button
            onClick={() => setActiveTab('import')}
            className={cn(
              "flex items-center gap-2 rounded-md px-5 py-2 font-medium transition-all",
              activeTab === 'import'
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
            )}
          >
            P&amp;L Import
          </button>
        </div>
      </div>

      {/* Manual Overhead tab - Focused on Detailed Drill-Down Only */}
      <div className={activeTab === 'manual' ? '' : 'hidden'}>

        {/* Detailed Chart of Accounts - The core editor (Pillar 1) */}
        <Card className="card">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-xl">Detailed Chart of Accounts</CardTitle>
                <CardDescription>
                  Enter your actual fixed overhead costs. Add, remove, or reorder categories as needed. This powers the Boss View on the Overview.
                </CardDescription>
              </div>
              <div className="flex gap-2">
                <Button onClick={saveChart} size="sm" variant="default">
                  <Save className="mr-2 h-4 w-4" /> Save Chart of Accounts
                </Button>
                <Button onClick={resetToDefaults} size="sm" variant="outline">
                  <RotateCcw className="mr-2 h-4 w-4" /> Reset
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {/* Assumptions (kept for the detailed view) */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
              <div>
                <Label className="text-sm font-medium">Monthly Revenue</Label>
                <CurrencyInput
                  value={chart.monthlyRevenue}
                  onChange={(v) => updateAssumption("monthlyRevenue", v)}
                  className="mt-1.5 font-semibold"
                />
              </div>
              <div>
                <Label className="text-sm font-medium">Monthly COGS (Direct)</Label>
                <CurrencyInput
                  value={chart.monthlyCogs}
                  onChange={(v) => updateAssumption("monthlyCogs", v)}
                  className="mt-1.5 font-semibold"
                />
              </div>
              <div>
                <Label className="text-sm font-medium">Billable Hours (from Rate Builders)</Label>
                <Input
                  type="number"
                  value={chart.billableHours}
                  onChange={(e) => updateAssumption("billableHours", parseFloat(e.target.value) || 0)}
                  className="mt-1.5 font-semibold text-lg text-center"
                />
              </div>
            </div>

            {/* The Editable Table */}
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[42%]">Category</TableHead>
                    <TableHead className="text-right">Monthly Amount</TableHead>
                    <TableHead className="text-right">% of Total</TableHead>
                    <TableHead className="w-px" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {chart.items.map((item, index) => {
                    const percent = totalOverhead > 0 ? Math.round((item.amount / totalOverhead) * 1000) / 10 : 0;
                    return (
                      <TableRow key={item.id}>
                        <TableCell>
                          <Input
                            value={item.category}
                            onChange={(e) => updateItemCategory(item.id, e.target.value)}
                            className="border-0 bg-transparent p-0 h-auto font-medium focus-visible:ring-1"
                          />
                        </TableCell>
                        <TableCell>
                          <CurrencyInput
                            value={item.amount}
                            onChange={(v) => updateItemAmount(item.id, v)}
                            wrapperClassName="h-9"
                            className="font-medium text-sm"
                          />
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-muted-foreground">
                          {percent.toFixed(1)}%
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center justify-end gap-1">
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => moveItem(index, -1)} disabled={index === 0}>
                              <ArrowUp className="h-3.5 w-3.5" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => moveItem(index, 1)} disabled={index === chart.items.length - 1}>
                              <ArrowDown className="h-3.5 w-3.5" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => removeCategory(item.id)}>
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>

            {/* Add new */}
            <div className="flex gap-2 mt-4">
              <Input
                placeholder="New overhead category (e.g. Recruiting)"
                value={newCategoryName}
                onChange={(e) => setNewCategoryName(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") addCategory(); }}
                className="flex-1"
              />
              <Button onClick={addCategory} disabled={!newCategoryName.trim()}>
                <Plus className="mr-2 h-4 w-4" /> Add Category
              </Button>
            </div>

            {/* Live Summary (kept inside detailed for context) */}
            <div className="mt-8 rounded-xl border bg-surface-2 p-5">
              <div className="text-sm font-semibold tracking-wider text-muted-foreground mb-3">OVERHEAD SUMMARY</div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <div className="text-xs text-muted-foreground">Total Monthly Overhead</div>
                  <div className="text-3xl font-semibold tabular-nums tracking-tight mt-1">
                    {new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(totalOverhead)}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Overhead % of Revenue</div>
                  <div className="text-3xl font-semibold tabular-nums tracking-tight mt-1 text-primary">
                    {overheadPercentOfRevenue.toFixed(1)}%
                  </div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Overhead per Billable Hour</div>
                  <div className="text-3xl font-semibold tabular-nums tracking-tight mt-1 text-primary">
                    {new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(overheadPerBillableHour)}
                  </div>
                </div>
              </div>
            </div>

            {/* Notes */}
            <div className="mt-4">
              <Label className="text-sm font-medium">Monthly Notes &amp; Trends</Label>
              <textarea
                value={chart.notes}
                onChange={(e) => updateNotes(e.target.value)}
                className="mt-1.5 w-full min-h-[82px] rounded-md border border-input bg-background p-3 text-sm resize-y focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                placeholder="Notes for this month’s overhead (one-time items, seasonal changes, etc.)"
              />
              <p className="text-[11px] text-muted-foreground mt-1">
                Saved with your chart for future monthly comparisons.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* P&L Import tab (unchanged placeholder) */}
      <div className={activeTab === 'import' ? '' : 'hidden'}>
        <Card className="card">
          <CardHeader>
            <CardTitle>P&amp;L Import</CardTitle>
            <CardDescription>
              Automatically extract and categorize overhead from your financial statements.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="border-2 border-dashed border-muted-foreground/30 rounded-xl p-12 text-center bg-muted/20">
              <div className="mx-auto w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
                <Upload className="h-8 w-8 text-muted-foreground" />
              </div>
              <div className="font-medium mb-1">Drag &amp; drop your P&amp;L statement here</div>
              <div className="text-sm text-muted-foreground mb-4">PDF • Excel (.xlsx) • CSV</div>
              <Button variant="outline" disabled>Browse Files (Coming Soon)</Button>
            </div>
            <div className="text-sm text-muted-foreground">
              This feature will connect directly to the existing Python AI parsing tool. Upload your Profit &amp; Loss and it will automatically map line items to your Chart of Accounts.
            </div>
          </CardContent>
        </Card>
      </div>

      <p className="text-center text-xs text-muted-foreground max-w-prose mx-auto">
        True overhead separation only. These values feed directly into accurate job costing in the Project Pricer.
      </p>
    </div>
  );
}
