export type Row = Record<string, string | number | boolean | null>;

export type ColumnType = "string" | "number" | "date" | "boolean";

export type ColumnMeta = {
  name: string;
  type: ColumnType;
  nullCount: number;
  distinctCount: number;
  min?: number | string;
  max?: number | string;
  sampleValues: unknown[];
};

export type DatasetProfile = {
  rowCount: number;
  columns: ColumnMeta[];
  nulls: Record<string, number>;
};

export type FilterOperator = "equals" | "contains" | "gt" | "lt" | "between";

export type Filter = {
  column: string;
  operator: FilterOperator;
  value: unknown;
  value2?: unknown;
};

export type Metrics = {
  totalSales: number;
  avgSales: number;
  totalUnits: number;
  totalCustomers: number;
  rowCount: number;
};

export type ChartConfig = {
  chartType: "line" | "bar" | "area" | "pie" | "scatter";
  x: string;
  y: string;
  title?: string;
};
