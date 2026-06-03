"use client";

import * as React from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { BarChart3, Edit2, Save, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface SalesData {
  workType: string;
  goalsSales: number;
  goalsGpPercent: number;
  goalsGpDollar: number;
  allEstimatesSales: number;
  allEstimatesGpPercent: number;
  allEstimatesGpDollar: number;
  acceptedSales: number;
  acceptedGpPercent: number;
  acceptedGpDollar: number;
}

interface SalespersonData extends SalesData {
  name: string;
}

// Demo 2026 placeholder data
const initialOverallData: SalesData[] = [
  {
    workType: "Highway & Heavy",
    goalsSales: 1250000,
    goalsGpPercent: 22.0,
    goalsGpDollar: 275000,
    allEstimatesSales: 1480000,
    allEstimatesGpPercent: 21.5,
    allEstimatesGpDollar: 318200,
    acceptedSales: 980000,
    acceptedGpPercent: 21.8,
    acceptedGpDollar: 213640,
  },
  {
    workType: "Commercial",
    goalsSales: 850000,
    goalsGpPercent: 19.5,
    goalsGpDollar: 165750,
    allEstimatesSales: 920000,
    allEstimatesGpPercent: 18.2,
    allEstimatesGpDollar: 167440,
    acceptedSales: 620000,
    acceptedGpPercent: 18.9,
    acceptedGpDollar: 117180,
  },
  {
    workType: "Residential",
    goalsSales: 420000,
    goalsGpPercent: 24.0,
    goalsGpDollar: 100800,
    allEstimatesSales: 385000,
    allEstimatesGpPercent: 23.1,
    allEstimatesGpDollar: 88935,
    acceptedSales: 295000,
    acceptedGpPercent: 23.5,
    acceptedGpDollar: 69325,
  },
  {
    workType: "Service & Maintenance",
    goalsSales: 380000,
    goalsGpPercent: 28.0,
    goalsGpDollar: 106400,
    allEstimatesSales: 410000,
    allEstimatesGpPercent: 26.8,
    allEstimatesGpDollar: 109880,
    acceptedSales: 315000,
    acceptedGpPercent: 27.2,
    acceptedGpDollar: 85680,
  },
];

const initialSalespersonData: SalespersonData[] = [
  {
    name: "Scott Sinnott",
    workType: "Highway & Heavy",
    goalsSales: 680000,
    goalsGpPercent: 21.5,
    goalsGpDollar: 146200,
    allEstimatesSales: 720000,
    allEstimatesGpPercent: 20.9,
    allEstimatesGpDollar: 150480,
    acceptedSales: 485000,
    acceptedGpPercent: 21.2,
    acceptedGpDollar: 102820,
  },
  // Add more rows for Scott if needed, but simplified for one row example per person
];

const workTypes = ["Highway & Heavy", "Commercial", "Residential", "Service & Maintenance"];

export default function SalesTrackerPage() {
  const [year, setYear] = React.useState(2026);
  const [showBudgetGoals, setShowBudgetGoals] = React.useState(true);
  const [isEditing, setIsEditing] = React.useState(false);
  const [overallData, setOverallData] = React.useState<SalesData[]>(initialOverallData);
  const [salespersonData, setSalespersonData] = React.useState<SalespersonData[]>(initialSalespersonData);
  const [sortConfig, setSortConfig] = React.useState<{ key: keyof SalesData; direction: 'asc' | 'desc' } | null>(null);

  // Calculate totals
  const calculateTotals = (data: SalesData[]) => {
    return data.reduce((acc, row) => ({
      goalsSales: acc.goalsSales + row.goalsSales,
      goalsGpDollar: acc.goalsGpDollar + row.goalsGpDollar,
      allEstimatesSales: acc.allEstimatesSales + row.allEstimatesSales,
      allEstimatesGpDollar: acc.allEstimatesGpDollar + row.allEstimatesGpDollar,
      acceptedSales: acc.acceptedSales + row.acceptedSales,
      acceptedGpDollar: acc.acceptedGpDollar + row.acceptedGpDollar,
    }), {
      goalsSales: 0, goalsGpDollar: 0,
      allEstimatesSales: 0, allEstimatesGpDollar: 0,
      acceptedSales: 0, acceptedGpDollar: 0,
    });
  };

  const overallTotals = calculateTotals(overallData);

  // Bid acceptance rates (demo)
  const totalBids = 87;
  const bidsAccepted = 52;
  const bidAcceptanceRate = ((bidsAccepted / totalBids) * 100).toFixed(1);

  // Sorting
  const sortedOverallData = React.useMemo(() => {
    if (!sortConfig) return overallData;
    return [...overallData].sort((a, b) => {
      const aVal = a[sortConfig.key];
      const bVal = b[sortConfig.key];
      if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });
  }, [overallData, sortConfig]);

  const requestSort = (key: keyof SalesData) => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  // Edit mode handlers
  const handleEditChange = (index: number, field: keyof SalesData, value: string | number) => {
    const newData = [...overallData];
    const numValue = typeof value === 'string' ? parseFloat(value) || 0 : value;

    // Update the field
    (newData[index] as any)[field] = numValue;

    // Recalculate dependent fields (simple demo logic)
    if (field.includes('Sales')) {
      // Recalculate GP $ if needed, but for demo we keep manual for now
    }

    setOverallData(newData);
  };

  const toggleEdit = () => {
    if (isEditing) {
      // Save logic could go here (localStorage etc.)
      console.log("Saving sales data (demo)");
    }
    setIsEditing(!isEditing);
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const formatPercent = (percent: number) => `${percent.toFixed(1)}%`;

  const getVarianceColor = (value: number) => {
    if (value > 0) return "text-emerald-600";
    if (value < 0) return "text-red-600";
    return "text-muted-foreground";
  };

  return (
    <div className="max-w-7xl space-y-8 pb-12">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-4">
          <div className="rounded-2xl bg-primary/10 p-3 text-primary mt-0.5">
            <BarChart3 className="h-7 w-7" />
          </div>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-semibold tracking-[-0.02em]">2026 Sales Tracking</h1>
              <select 
                value={year} 
                onChange={(e) => setYear(Number(e.target.value))}
                className="text-sm border border-input rounded-md px-2 py-1 bg-background"
              >
                <option value={2026}>2026</option>
                <option value={2025}>2025</option>
                <option value={2027}>2027</option>
              </select>
              <Badge variant="outline" className="font-mono text-[10px] tracking-wider">LIVE DEMO</Badge>
            </div>
            <p className="mt-1 text-muted-foreground">
              Track sales performance against goals. Real data will sync from Project Pricer.
            </p>
          </div>
        </div>

        <div className="flex gap-2">
          <Button 
            variant="outline" 
            size="sm" 
            onClick={() => setShowBudgetGoals(!showBudgetGoals)}
          >
            {showBudgetGoals ? "Hide Budget Goals" : "Show Budget Goals"}
          </Button>
          <Button 
            variant={isEditing ? "default" : "outline"} 
            size="sm" 
            onClick={toggleEdit}
          >
            {isEditing ? (
              <><Save className="mr-2 h-4 w-4" /> Save Changes</>
            ) : (
              <><Edit2 className="mr-2 h-4 w-4" /> Edit</>
            )}
          </Button>
        </div>
      </div>

      {/* Overall Sales Totals */}
      <Card className="card">
        <CardHeader className="pb-4">
          <CardTitle className="text-xl">Overall Sales Totals</CardTitle>
          <CardDescription>
            2026 performance vs. goals across all work types. Click column headers to sort.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead 
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => requestSort('workType')}
                  >
                    Work Type
                  </TableHead>
                  {showBudgetGoals && (
                    <>
                      <TableHead className="text-right cursor-pointer hover:bg-muted/50" onClick={() => requestSort('goalsSales')}>
                        Goals<br />Sales
                      </TableHead>
                      <TableHead className="text-right cursor-pointer hover:bg-muted/50" onClick={() => requestSort('goalsGpPercent')}>
                        Goals<br />GP %
                      </TableHead>
                      <TableHead className="text-right cursor-pointer hover:bg-muted/50" onClick={() => requestSort('goalsGpDollar')}>
                        Goals<br />GP $
                      </TableHead>
                    </>
                  )}
                  <TableHead className="text-right cursor-pointer hover:bg-muted/50" onClick={() => requestSort('allEstimatesSales')}>
                    All Estimates<br />Sales
                  </TableHead>
                  <TableHead className="text-right cursor-pointer hover:bg-muted/50" onClick={() => requestSort('allEstimatesGpPercent')}>
                    All Estimates<br />GP %
                  </TableHead>
                  <TableHead className="text-right cursor-pointer hover:bg-muted/50" onClick={() => requestSort('allEstimatesGpDollar')}>
                    All Estimates<br />GP $
                  </TableHead>
                  <TableHead className="text-right cursor-pointer hover:bg-muted/50" onClick={() => requestSort('acceptedSales')}>
                    Accepted<br />Sales
                  </TableHead>
                  <TableHead className="text-right cursor-pointer hover:bg-muted/50" onClick={() => requestSort('acceptedGpPercent')}>
                    Accepted<br />GP %
                  </TableHead>
                  <TableHead className="text-right cursor-pointer hover:bg-muted/50" onClick={() => requestSort('acceptedGpDollar')}>
                    Accepted<br />GP $
                  </TableHead>
                  <TableHead className="text-right font-semibold cursor-pointer hover:bg-muted/50" onClick={() => requestSort('acceptedSales')}>
                    Sales To Goal<br />Sales
                  </TableHead>
                  <TableHead className="text-right font-semibold cursor-pointer hover:bg-muted/50" onClick={() => requestSort('acceptedGpDollar')}>
                    Sales To Goal<br />GP $
                  </TableHead>
                  <TableHead className="text-right font-semibold cursor-pointer hover:bg-muted/50">
                    % To Goal<br />Sales
                  </TableHead>
                  <TableHead className="text-right font-semibold cursor-pointer hover:bg-muted/50">
                    % To Goal<br />GP %
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedOverallData.map((row, index) => {
                  const salesToGoal = row.acceptedSales - row.goalsSales;
                  const gpToGoal = row.acceptedGpDollar - row.goalsGpDollar;
                  const salesPercentToGoal = row.goalsSales > 0 ? ((row.acceptedSales / row.goalsSales) * 100) : 0;
                  const gpPercentToGoal = row.goalsGpDollar > 0 ? ((row.acceptedGpDollar / row.goalsGpDollar) * 100) : 0;

                  return (
                    <TableRow key={index}>
                      <TableCell className="font-medium">{row.workType}</TableCell>
                      
                      {showBudgetGoals && (
                        <>
                          <TableCell className="text-right tabular-nums">
                            {isEditing ? (
                              <Input type="number" value={row.goalsSales} className="w-28 h-8 text-right" onChange={(e) => {
                                const newData = [...overallData];
                                newData[index].goalsSales = parseInt(e.target.value) || 0;
                                setOverallData(newData);
                              }} />
                            ) : formatCurrency(row.goalsSales)}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">{row.goalsGpPercent.toFixed(1)}%</TableCell>
                          <TableCell className="text-right tabular-nums">{formatCurrency(row.goalsGpDollar)}</TableCell>
                        </>
                      )}

                      <TableCell className="text-right tabular-nums">
                        {isEditing ? (
                          <Input type="number" value={row.allEstimatesSales} className="w-28 h-8 text-right" onChange={(e) => {
                            const newData = [...overallData];
                            newData[index].allEstimatesSales = parseInt(e.target.value) || 0;
                            setOverallData(newData);
                          }} />
                        ) : formatCurrency(row.allEstimatesSales)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{row.allEstimatesGpPercent.toFixed(1)}%</TableCell>
                      <TableCell className="text-right tabular-nums">{formatCurrency(row.allEstimatesGpDollar)}</TableCell>

                      <TableCell className="text-right tabular-nums">
                        {isEditing ? (
                          <Input type="number" value={row.acceptedSales} className="w-28 h-8 text-right" onChange={(e) => {
                            const newData = [...overallData];
                            newData[index].acceptedSales = parseInt(e.target.value) || 0;
                            setOverallData(newData);
                          }} />
                        ) : formatCurrency(row.acceptedSales)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{row.acceptedGpPercent.toFixed(1)}%</TableCell>
                      <TableCell className="text-right tabular-nums">{formatCurrency(row.acceptedGpDollar)}</TableCell>

                      <TableCell className={cn("text-right tabular-nums font-medium", getVarianceColor(salesToGoal))}>
                        {formatCurrency(salesToGoal)}
                      </TableCell>
                      <TableCell className={cn("text-right tabular-nums font-medium", getVarianceColor(gpToGoal))}>
                        {formatCurrency(gpToGoal)}
                      </TableCell>
                      <TableCell className={cn("text-right tabular-nums font-medium", getVarianceColor(salesPercentToGoal - 100))}>
                        {salesPercentToGoal.toFixed(1)}%
                      </TableCell>
                      <TableCell className={cn("text-right tabular-nums font-medium", getVarianceColor(gpPercentToGoal - 100))}>
                        {gpPercentToGoal.toFixed(1)}%
                      </TableCell>
                    </TableRow>
                  );
                })}

                {/* Totals Row */}
                <TableRow className="bg-muted/50 font-semibold border-t-2">
                  <TableCell>TOTAL</TableCell>
                  {showBudgetGoals && (
                    <>
                      <TableCell className="text-right tabular-nums">{formatCurrency(overallTotals.goalsSales)}</TableCell>
                      <TableCell className="text-right tabular-nums">—</TableCell>
                      <TableCell className="text-right tabular-nums">{formatCurrency(overallTotals.goalsGpDollar)}</TableCell>
                    </>
                  )}
                  <TableCell className="text-right tabular-nums">{formatCurrency(overallTotals.allEstimatesSales)}</TableCell>
                  <TableCell className="text-right tabular-nums">—</TableCell>
                  <TableCell className="text-right tabular-nums">{formatCurrency(overallTotals.allEstimatesGpDollar)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatCurrency(overallTotals.acceptedSales)}</TableCell>
                  <TableCell className="text-right tabular-nums">—</TableCell>
                  <TableCell className="text-right tabular-nums">{formatCurrency(overallTotals.acceptedGpDollar)}</TableCell>
                  <TableCell className={cn("text-right tabular-nums", getVarianceColor(overallTotals.acceptedSales - overallTotals.goalsSales))}>
                    {formatCurrency(overallTotals.acceptedSales - overallTotals.goalsSales)}
                  </TableCell>
                  <TableCell className={cn("text-right tabular-nums", getVarianceColor(overallTotals.acceptedGpDollar - overallTotals.goalsGpDollar))}>
                    {formatCurrency(overallTotals.acceptedGpDollar - overallTotals.goalsGpDollar)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">—</TableCell>
                  <TableCell className="text-right tabular-nums">—</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Bid Acceptance Rates */}
      <Card className="card">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Bid Acceptance Rates</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-center">
            <div className="rounded-xl border p-4">
              <div className="text-3xl font-semibold tabular-nums">{totalBids}</div>
              <div className="text-sm text-muted-foreground mt-1">Total Bids Submitted</div>
            </div>
            <div className="rounded-xl border p-4">
              <div className="text-3xl font-semibold tabular-nums text-emerald-600">{bidsAccepted}</div>
              <div className="text-sm text-muted-foreground mt-1">Bids Accepted</div>
            </div>
            <div className="rounded-xl border p-4">
              <div className="text-3xl font-semibold tabular-nums text-primary">{bidAcceptanceRate}%</div>
              <div className="text-sm text-muted-foreground mt-1">Bid Acceptance Rate</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Per-Salesperson View */}
      <Card className="card">
        <CardHeader>
          <CardTitle className="text-xl">Per-Salesperson Performance</CardTitle>
          <CardDescription>Example: Scott Sinnott (more salespeople can be added in full version)</CardDescription>
        </CardHeader>
        <CardContent>
          {salespersonData.map((person, idx) => (
            <div key={idx} className="mb-8 last:mb-0">
              <h3 className="font-semibold text-lg mb-3">{person.name}</h3>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Work Type</TableHead>
                      <TableHead className="text-right">Goals Sales</TableHead>
                      <TableHead className="text-right">Accepted Sales</TableHead>
                      <TableHead className="text-right font-semibold">Sales To Goal</TableHead>
                      <TableHead className="text-right font-semibold">% To Goal</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    <TableRow>
                      <TableCell className="font-medium">{person.workType}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatCurrency(person.goalsSales)}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatCurrency(person.acceptedSales)}</TableCell>
                      <TableCell className={cn("text-right tabular-nums font-medium", getVarianceColor(person.acceptedSales - person.goalsSales))}>
                        {formatCurrency(person.acceptedSales - person.goalsSales)}
                      </TableCell>
                      <TableCell className={cn("text-right tabular-nums font-medium", getVarianceColor(((person.acceptedSales / person.goalsSales) * 100) - 100))}>
                        {((person.acceptedSales / person.goalsSales) * 100).toFixed(1)}%
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <p className="text-center text-xs text-muted-foreground">
        Demo data for 2026. This page will pull live estimates and accepted jobs from the Project Pricer.
      </p>
    </div>
  );
}
